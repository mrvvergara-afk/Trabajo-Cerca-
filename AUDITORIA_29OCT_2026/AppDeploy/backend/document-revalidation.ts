import { db, isAppDatabaseError } from '@appdeploy/sdk';
import { createHash, randomUUID } from 'node:crypto';
import { currentPublicFeedManifest, registerPublicFeedChange } from './public-feed';
import { publicOfferIdentity } from './public-source-adapters';
import { validateOffer, type VerifiedOffer } from './radar-ingestion';

type Stored = Record<string, unknown>;
type Unit = { candidateId:string; publishedId:string; title:string };
type ApprovedDocument = {
  key:string; sourceUrl:string; documentUrl:string; documentSha256:string;
  sourcePublishedAt:string; units:Unit[];
};
type RecheckState = Stored & {
  id:string; nextCheckAt?:string; leaseToken?:string | null; leaseUntil?:string | null;
  pendingReceiptId?:string | null; lastReceiptId?:string; lastSuccessAt?:string;
};
type Reference = { table:string; id:string; identity:string; record:Stored };
type Receipt = Stored & {
  documentKey:string; documentSha256:string; status:string; checkedAt:string;
  refs:Array<{ table:string; id:string }>; registeredAt?:string;
};

const STATES = 'radar_document_revalidation_state';
const RECEIPTS = 'radar_document_revalidation_receipts';
const DAY = 86400000;
const USER_AGENT = 'TrabajoCercaDocument/1.0';

// Only previously reviewed and actually published records can be renewed.
// Adding a source here requires its original review and publication receipts.
export const REVIEWED_DOCUMENTS:ApprovedDocument[] = [{
  key:'traiguen-salud-2026-10',
  sourceUrl:'https://mtraiguen.cl/municipalidad/bases-para-llamado-a-concurso-publico-de-3-cargos/',
  documentUrl:'https://mtraiguen.cl/wp-content/uploads/2026/10/DAEX-BASES-Y-CALENDARIO.pdf',
  documentSha256:'a1a889d657913e233cb2ba50aa44e6bd55b42dc1e669078f0bee00693d19318f',
  sourcePublishedAt:'2026-10-01T12:04:54+00:00',
  units:[
    { candidateId:'39515f1faa2264b877e35a61', publishedId:'de9067f5-59f2-4e0c-ba02-fc9584debe0f', title:'QUÍMICO FARMACÉUTICO (A)' },
    { candidateId:'5e1b494fc86fe4b7a3c9df68', publishedId:'8b75b282-d838-45bc-9309-d10874aae023', title:'Ingeniero(a) en Prevención de Riesgos' },
    { candidateId:'dfe66c57250c29b5efab22fb', publishedId:'3c875b30-eec8-4d2a-9410-797e9ad37c07', title:'Nutricionista' },
  ],
}];

const fingerprint = (value:string | Buffer) => createHash('sha256').update(value).digest('hex');
const stateId = (document:ApprovedDocument) => fingerprint(document.key);

class SourceBlocked extends Error {
  reason:string;
  quarantine:boolean;
  constructor(reason:string, quarantine=false) {
    super(reason);
    this.reason=reason;
    this.quarantine=quarantine;
  }
}

export function documentRobotsAllow(raw:string, url:string) {
  const groups:Array<{ agents:string[]; rules:Array<{ allow:boolean; path:string }> }> = [];
  let current:{ agents:string[]; rules:Array<{ allow:boolean; path:string }> } | undefined;
  let hasRules = false;
  for (const line of raw.split(/\r?\n/)) {
    const match = line.replace(/#.*/, '').trim().match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!match) continue;
    const key = match[1].toLowerCase(), value = match[2].trim();
    if (key === 'user-agent') {
      if (!current || hasRules) {
        current = { agents:[], rules:[] }; groups.push(current); hasRules = false;
      }
      current.agents.push(value.toLowerCase());
    } else if (current && (key === 'allow' || key === 'disallow')) {
      hasRules = true;
      if (value) current.rules.push({ allow:key === 'allow', path:value });
    }
  }
  const scores = groups.map(group => Math.max(-1, ...group.agents.map(agent =>
    agent === '*' ? 0 : USER_AGENT.toLowerCase().startsWith(agent) ? agent.length : -1)));
  const best = Math.max(-1, ...scores);
  const path = new URL(url).pathname + new URL(url).search;
  const matches:Array<{ allow:boolean; size:number }> = [];
  groups.forEach((group, index) => {
    if (best < 0 || scores[index] !== best) return;
    for (const rule of group.rules) {
      const anchored = rule.path.endsWith('$');
      const pattern = (anchored ? rule.path.slice(0, -1) : rule.path)
        .split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
      if (new RegExp('^' + pattern + (anchored ? '$' : '')).test(path)) {
        matches.push({ allow:rule.allow, size:rule.path.replace(/[*$]/g, '').length });
      }
    }
  });
  matches.sort((left, right) => right.size - left.size || Number(right.allow) - Number(left.allow));
  return !matches.length || matches[0].allow;
}

async function readOriginal(url:string, maximum:number, kind:'robots' | 'html' | 'pdf', fetcher:typeof fetch) {
  let response:Response;
  try {
    response = await fetcher(url, { redirect:'manual', signal:AbortSignal.timeout(12000),
      headers:{ 'user-agent':USER_AGENT, 'accept':kind === 'pdf' ? 'application/pdf' : 'text/plain,text/html' } });
  } catch { throw new SourceBlocked('source_unavailable'); }
  if (kind === 'robots' && response.status === 404) {
    await response.body?.cancel(); return Buffer.alloc(0);
  }
  if (response.status !== 200) {
    await response.body?.cancel();
    throw new SourceBlocked('source_http_' + response.status, kind !== 'robots' && [404, 410].includes(response.status));
  }
  const mime = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
  const supported = kind === 'pdf' ? mime === 'application/pdf' : kind === 'robots'
    ? mime === 'text/plain' : ['text/html', 'application/xhtml+xml'].includes(mime);
  if (!supported) { await response.body?.cancel(); throw new SourceBlocked('source_unexpected_content'); }
  if (Number(response.headers.get('content-length') || 0) > maximum) {
    await response.body?.cancel(); throw new SourceBlocked('source_byte_budget_exceeded');
  }
  const reader = response.body?.getReader(), parts:Uint8Array[] = [];
  let bytes = 0;
  try {
    if (reader) {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > maximum) { await reader.cancel(); throw new SourceBlocked('source_byte_budget_exceeded'); }
        parts.push(chunk.value);
      }
    } else {
      const value = new Uint8Array(await response.arrayBuffer());
      if (value.length > maximum) throw new SourceBlocked('source_byte_budget_exceeded');
      parts.push(value);
    }
  } catch (cause) {
    if (cause instanceof SourceBlocked) throw cause;
    throw new SourceBlocked('source_body_unavailable');
  }
  return Buffer.concat(parts);
}

export async function checkReviewedOriginal(document:ApprovedDocument, fetcher:typeof fetch = fetch) {
  if (new URL(document.sourceUrl).origin !== new URL(document.documentUrl).origin) {
    throw new Error('Reviewed source origin mismatch');
  }
  const robots = await readOriginal(new URL('/robots.txt', document.sourceUrl).href, 50000, 'robots', fetcher);
  if (![document.sourceUrl, document.documentUrl].every(url => documentRobotsAllow(robots.toString('utf8'), url))) {
    throw new SourceBlocked('robots_disallowed');
  }
  const html = await readOriginal(document.sourceUrl, 900000, 'html', fetcher);
  const raw = html.toString('utf8');
  const dates = [...raw.matchAll(/<meta\b[^>]*(?:property|name)=["']article:published_time["'][^>]*>/gi)]
    .map(match => match[0].match(/\bcontent=["']([^"']+)["']/i)?.[1]);
  if (dates.length !== 1 || Date.parse(dates[0] || '') !== Date.parse(document.sourcePublishedAt)
      || !raw.replace(/&amp;/g, '&').includes(document.documentUrl)) {
    throw new SourceBlocked('publisher_metadata_changed', true);
  }
  const body = raw.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]
    ?? raw.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? raw;
  const text = body.replace(/<(script|style|aside|nav|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  if (/postulaci[oó]n\s+cerrada|concurso\s+(?:cerrado|finalizado|anulado)/i.test(text)) {
    throw new SourceBlocked('publisher_marks_closed', true);
  }
  const pdf = await readOriginal(document.documentUrl, 16 * 1024 * 1024, 'pdf', fetcher);
  if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new SourceBlocked('source_unexpected_content');
  if (fingerprint(pdf) !== document.documentSha256) throw new SourceBlocked('reviewed_pdf_changed', true);
  return { documentSha256:document.documentSha256, htmlSha256:fingerprint(html), bytes:pdf.length };
}

async function references(document:ApprovedDocument):Promise<Reference[]> {
  if (document.units.length < 1 || document.units.length > 3) throw new Error('Reviewed unit bound exceeded');
  const result:Reference[] = [];
  for (const unit of document.units) {
    const key = fingerprint(unit.title.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim());
    const raw = publicOfferIdentity(document.sourceUrl, key);
    const identity = raw ? fingerprint(raw) : '';
    if (identity.slice(0, 24) !== unit.candidateId) throw new Error('Reviewed registry identity mismatch');
    const table = 'radar_external_' + identity.slice(0, 32);
    const [record] = await db.get<Stored>(table, [unit.publishedId], { consistent:true });
    if (!record || record.externalIdentity !== identity || record.documentUnitVerified !== true
        || record.externalCandidateId !== unit.candidateId || record.title !== unit.title
        || record.discoveredBy !== 'github-signed-laboratory' || record.documentUnitKey !== key) {
      throw new SourceBlocked('previously_published_review_missing');
    }
    const proof = record.documentUnitProof as NonNullable<VerifiedOffer['document_unit']>;
    if (!proof || proof.document_sha256 !== document.documentSha256
        || proof.document_url !== document.documentUrl || record.url !== document.sourceUrl
        || Date.parse(String(record.sourcePublishedAt)) !== Date.parse(document.sourcePublishedAt)) {
      throw new SourceBlocked('stored_approval_changed');
    }
    const original:VerifiedOffer = {
      idempotency_key:'radar:' + unit.candidateId, candidate_id:unit.candidateId,
      source_url:document.sourceUrl, source:String(record.source), title:String(record.title),
      company:String(record.company), work_commune:String(record.workLocation),
      source_published_at:String(record.sourcePublishedAt), valid_through:String(record.sourceValidThrough),
      application:String(record.applicationUrl), verified_at:proof.reviewed_at,
      verification_method:String(record.verificationMethod), document_unit:proof,
      application_details:{ method:'in_person', instructions:String(record.applicationInstructions) },
    };
    try { validateOffer(original, Date.parse(proof.reviewed_at)); }
    catch { throw new SourceBlocked('stored_approval_invalid'); }
    result.push({ table, id:unit.publishedId, identity, record });
  }
  return result;