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
}

async function completeRegistration(document:ApprovedDocument, state:RecheckState, now:number) {
  if (!state.pendingReceiptId) return;
  const [receipt] = await db.get<Receipt>(RECEIPTS, [state.pendingReceiptId], { consistent:true });
  if (!receipt || receipt.documentKey !== document.key || receipt.documentSha256 !== document.documentSha256
      || !Array.isArray(receipt.refs) || receipt.refs.length > 3) throw new Error('Document receipt mismatch');
  for (const ref of receipt.refs) {
    if (!document.units.some(unit => unit.publishedId === ref.id) || !/^radar_external_[a-f0-9]{32}$/.test(ref.table)) {
      throw new Error('Document receipt target mismatch');
    }
    await registerPublicFeedChange(ref.table, ref.id);
  }
  await db.transact([
    db.tx.update(RECEIPTS, [{ id:state.pendingReceiptId, record:{ registeredAt:new Date(now).toISOString() } }], { patch:true }),
    db.tx.update(STATES, [{ id:state.id, record:{ pendingReceiptId:null }, if:{ pendingReceiptId:state.pendingReceiptId } }], { patch:true }),
  ]);
}

export async function revalidateReviewedDocuments(invocationId:string, now=Date.now(), fetcher:typeof fetch=fetch) {
  const document = REVIEWED_DOCUMENTS[0], id = stateId(document);
  let [state] = await db.get<RecheckState>(STATES, [id], { consistent:true });
  if (!state) {
    await db.tx.add(STATES, [{ id, status:'pending', documentKey:document.key }]);
    [state] = await db.get<RecheckState>(STATES, [id], { consistent:true });
  }
  if (!state) throw new Error('Document state unavailable');
  state = { ...state, id };
  if (state.pendingReceiptId) {
    await completeRegistration(document, state, now);
    return { status:'feed_registration_recovered', updated:0, providerCalls:0 };
  }
  if (Date.parse(String(state.nextCheckAt)) > now || Date.parse(String(state.leaseUntil)) > now) {
    return { status:'not_due', updated:0, providerCalls:0 };
  }
  const token = randomUUID(), checkedAt = new Date(now).toISOString();
  const [claimed] = await db.tx.update(STATES, [{ id, record:{ leaseToken:token, leaseUntil:new Date(now + 300000).toISOString() },
    if:{ leaseToken:state.leaseToken, leaseUntil:state.leaseUntil, nextCheckAt:state.nextCheckAt } }], { patch:true });
  if (!claimed) return { status:'concurrent_check', updated:0, providerCalls:0 };
  let refs:Reference[] = [], evidence:Stored = {}, status='revalidated', reason:string | null=null;
  let update=false, quarantine=false;
  try {
    refs = await references(document);
    const dates = refs.map(ref => Date.parse(String(ref.record.sourceValidThrough)));
    const published = Date.parse(document.sourcePublishedAt);
    if (dates.some(deadline => !Number.isFinite(deadline) || deadline <= now)
        || !Number.isFinite(published) || published > now) {
      status='expired'; reason='source_deadline_elapsed_or_original_date_invalid';
    } else if (refs.some(ref => ref.record.active !== true || ref.record.verified !== true || ref.record.review !== false)) {
      status='requires_review'; reason='existing_record_requires_review';
    } else {
      evidence = await checkReviewedOriginal(document, fetcher);
      update = true;
    }
  } catch (cause) {
    if (!(cause instanceof SourceBlocked)) throw cause;
    reason=cause.reason; quarantine=cause.quarantine && refs.length === document.units.length;
    status=quarantine ? 'requires_review' : 'source_unavailable';
  }
  const changed = update || quarantine ? refs : [];
  const receiptId = fingerprint(document.key + '\0' + invocationId);
  const receipt:Receipt = { documentKey:document.key, documentSha256:document.documentSha256,
    status, checkedAt, reason, evidence, originalDate:document.sourcePublishedAt,
    refs:changed.map(ref => ({ table:ref.table, id:ref.id })),
    reviewDates:refs.map(ref => (ref.record.documentUnitProof as { reviewed_at:string }).reviewed_at),
    providerCalls:0, updated:update ? changed.length : 0, quarantined:quarantine ? changed.length : 0 };
  const delay = status === 'source_unavailable' ? 3600000 : 12 * 3600000;
  const nextCheckAt = new Date(now + delay).toISOString();
  const writes = changed.map(ref => db.tx.update(ref.table, [{ id:ref.id,
    record:update ? { externalVerifiedAt:checkedAt, verificationCheckedAt:checkedAt, lastVerifiedAt:checkedAt,
      lastSeenAt:checkedAt, documentRevalidatedAt:checkedAt, documentRevalidationReceipt:receiptId,
      documentRevalidationState:'revalidated', feedRegistered:false }
      : { active:false, verified:false, review:true, documentRevalidationState:'requires_review',
          documentRevalidationReason:reason, documentRevalidationReceipt:receiptId, feedRegistered:false },
    if:{ externalIdentity:ref.identity, externalBatchDigest:ref.record.externalBatchDigest,
      sourceValidThrough:ref.record.sourceValidThrough, documentUnitKey:ref.record.documentUnitKey,
      active:ref.record.active, verified:ref.record.verified, review:ref.record.review } }], { patch:true }));
  try {
    await db.transact([
      ...writes, db.tx.add(RECEIPTS, [{ ...receipt, id:receiptId }]),
      db.tx.update(STATES, [{ id, record:{ status, reason, nextCheckAt, lastCheckAt:checkedAt,
        lastReceiptId:receiptId, pendingReceiptId:receiptId, leaseToken:null, leaseUntil:null,
        ...(update ? { lastSuccessAt:checkedAt } : {}) }, if:{ leaseToken:token } }], { patch:true }),
    ]);
  } catch (cause) {
    if (!isAppDatabaseError(cause) || !['AppDatabaseUnknownOutcome', 'AppDatabaseDuplicateId'].includes(cause.code)) throw cause;
    const [saved] = await db.get<Receipt>(RECEIPTS, [receiptId], { consistent:true });
    if (!saved || saved.documentKey !== document.key || saved.checkedAt !== checkedAt
        || saved.documentSha256 !== document.documentSha256) throw cause;
  }
  await completeRegistration(document, { ...state, id, pendingReceiptId:receiptId }, now);
  return { status, updated:update ? changed.length : 0, quarantined:quarantine ? changed.length : 0,
    checkedAt, nextCheckAt, reason, providerCalls:0 };
}

export async function documentRevalidationStatus() {
  const rows = await db.get<RecheckState>(STATES, REVIEWED_DOCUMENTS.map(stateId), { consistent:true });
  const feed = await currentPublicFeedManifest();
  const documents = REVIEWED_DOCUMENTS.map((document, index) => ({
    key:document.key, sourceUrl:document.sourceUrl, originalPublishedAt:document.sourcePublishedAt,
    approvedJobs:document.units.length, publishedIds:document.units.map(unit => unit.publishedId),
    visibleIds:document.units.filter(unit => {
      const key=fingerprint(unit.title.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim());
      const identity=publicOfferIdentity(document.sourceUrl,key);
      if (!identity) return false;
      const target='radar_external_'+fingerprint(identity).slice(0,32)+':'+unit.publishedId;
      return feed?.manifest.pages.some(page=>page.keys.includes(target));
    }).map(unit=>unit.publishedId),
    status:rows[index]?.status || 'pending', lastCheckAt:rows[index]?.lastCheckAt || null,
    lastSuccessAt:rows[index]?.lastSuccessAt || null, nextCheckAt:rows[index]?.nextCheckAt || null,
    reason:rows[index]?.reason || null, registrationPending:Boolean(rows[index]?.pendingReceiptId),
  }));
  return { schema:'trabajo-cerca.document-revalidation-status.v1', readOnly:true, providerCalls:0,
    intervalHours:12, documents, feedManifestId:feed?.manifestId || null,
    newOffersDiscovered:0, socialCaptureProven:false };
}

