import { db } from '@appdeploy/sdk';
import { createHash, createPublicKey, verify, type JsonWebKey } from 'node:crypto';
import { currentPublicFeedManifest, registerPublicFeedChange } from './public-feed';
import { publicSourceAdapter, safePublicUrl, samePublicJob, publicOfferIdentity, publicFeedIdentity } from './public-source-adapters';
import { validateCmpcEvidence, type CmpcEvidence } from './cmpc-evidence';
import { validateLocalContactEvidence, localContactDescription, localContactIndexStatus, type LocalContactEvidence } from './local-contact-evidence';
import { fetchPublicPage } from './public-source-http';
import { offerRetentionReason } from './offer-retention';

type Stored = Record<string, unknown>;
type DocumentField = { page:number; text_object_sha256:string; reading?:string; literal:string };
type DocumentUnit = {
  schema:string; key:string; publisher_url:string; html_sha256:string; document_url:string; document_sha256:string;
  page_count:number; pages:Array<{ page:number; text_object_sha256:string }>;
  fields:Record<string,DocumentField>; review_method:string; reviewed_at:string;
};
export type VerifiedOffer = {
  idempotency_key:string; candidate_id:string; source_url:string; source:string;
  title:string; company:string; work_commune:string; source_published_at:string;
  valid_through:string; application:string; verified_at:string; verification_method:string;
  validity_method?:'explicit_deadline' | 'live_application' | 'dated_in_person';
  local_contact_evidence?:LocalContactEvidence;
  vacancies?:number;
  validity_evidence?:{ form_url:string; form_action:string; checked_at:string; source_sha256:string };
  source_evidence?:{ sha256:string; source_url:string; complete_document:boolean; text:string };
  document_unit?:DocumentUnit;
  cmpc_evidence?:CmpcEvidence;
  work_site?:string;
  application_details?:{ method:'in_person'; instructions:string };
};
type Receipt = { table:string; id:string; identity:string; candidateId:string };
type PullState = {
  dataCommit?:string; digest?:string; receipts?:Receipt[]; storedCount?:number; publishedCount?:number;
  status?:string; runId?:string; checkedAt?:string; publicationCheckedAt?:string; feedManifestId?:string;
  rejection?:string | null; transportError?:string | null; rejectedCommit?:string;
};
type Envelope = { schema:string; body_base64:string; proof:{ header:string; claims:string; signature:string } };
type Batch = { schema:string; environment:string; repository:string; repository_id:string; ref:string;
  sha:string; run_id:string; generated_at:string; records:VerifiedOffer[] };
type Jwks = { keys:Array<JsonWebKey & { kid?:string; alg?:string }> };

const REPOSITORY = 'mrvvergara-afk/Trabajo-Cerca-';
const REPOSITORY_ID = '1411752840';
const OWNER_ID = '291955988';
const PRODUCER_REFS = new Set(['refs/heads/repair/radar-audit-2026-10-11','refs/heads/repair/mulchen-captura-2026-10-17','refs/heads/main']);
const AUDIENCE = 'urn:trabajo-cerca:lab:' + REPOSITORY_ID + ':';
const STATE_TABLE = 'radar_external_pull_state';
const MAX_AGE = 86400000;
const PLACES = ['Angol','Collipulli','Ercilla','Renaico','Mininco','Los Sauces','Purén','Traiguén','Lumaco','Nacimiento','Negrete','Mulchén','Victoria'];

class BatchRejected extends Error {}
class GitHubTransportError extends Error {}

function reject(message:string):never {
  throw new BatchRejected(message);
}

function sha(value:string | Buffer) {
  return createHash('sha256').update(value).digest('hex');
}

function jsonPart(part:string) {
  if (typeof part !== 'string' || !/^[A-Za-z0-9_-]+$/.test(part) || part.length > 16000) reject('Malformed proof');
  try { return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Stored; }
  catch { return reject('Malformed proof JSON'); }
}

export function jobIdentity(url:string, documentKey?:string) {
  const identity=publicOfferIdentity(url,documentKey);
  if (!identity) reject('Unsupported individual source URL');
  return sha(identity);
}

function documentFlat(value:string) {
  return value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/\s+/g,' ').trim();
}

function validateDocumentUnit(item:VerifiedOffer, now:number) {
  const unit=item.document_unit, application=item.application_details;
  if (!unit || unit.schema!=='trabajo-cerca.document-unit.v1' || unit.review_method!=='page_bound_review' ||
      unit.publisher_url!==item.source_url || !safePublicUrl(unit.document_url) ||
      new URL(unit.document_url).hostname.replace(/^www\./,'')!==new URL(item.source_url).hostname.replace(/^www\./,'') ||
      !/\.pdf$/i.test(new URL(unit.document_url).pathname) || unit.key!==sha(documentFlat(item.title)) ||
      !/^[a-f0-9]{64}$/.test(unit.html_sha256) || !/^[a-f0-9]{64}$/.test(unit.document_sha256) || item.source_evidence ||
      !Number.isInteger(unit.page_count) || unit.page_count<1 || unit.page_count>40 || !Array.isArray(unit.pages) ||
      unit.pages.length!==unit.page_count) reject('Invalid page-bound document proof');
  const reviewed=Date.parse(unit.reviewed_at);
  if (!Number.isFinite(reviewed) || reviewed>now || now-reviewed>MAX_AGE || reviewed<Date.parse(item.verified_at)) reject('Stale document review');
  const pages=new Map<number,string>();
  unit.pages.forEach(page=>{
    if (!Number.isInteger(page.page) || page.page<1 || page.page>unit.page_count || pages.has(page.page) ||
        !/^[a-f0-9]{64}$/.test(page.text_object_sha256)) reject('Incomplete document pages');
    pages.set(page.page,page.text_object_sha256);
  });
  const required=['title','company','workplace','deadline','deadline_time','application','scope'];
  if (!unit.fields || Object.keys(unit.fields).length!==required.length) reject('Missing document field proof');
  let size=0;
  for (const name of required) {
    const field=unit.fields[name];
    if (!field || pages.get(field.page)!==field.text_object_sha256 || typeof field.literal!=='string' ||
        !field.literal.length || field.literal.length>4000 || field.reading!==undefined && field.reading!=='primary' &&
        !/^alternate_readings:\d+$/.test(field.reading)) reject('Invalid document field proof');
    size+=field.literal.length;
  }
  if (size>18000 || !documentFlat(unit.fields.title.literal).includes(documentFlat(item.title)) ||
      !documentFlat(unit.fields.company.literal).includes(documentFlat(item.company)) ||
      !documentFlat(unit.fields.workplace.literal).includes(documentFlat(item.work_commune)) ||
      !/lugar de trabajo|establecimiento|departamento de salud|red de salud|\bDSM\b/i.test(unit.fields.workplace.literal) ||
      !/\d+\s+CARGOS/i.test(unit.fields.scope.literal)) reject('Unbound document field value');
  const close=documentFlat(unit.fields.deadline.literal).match(/cierre\s+de\s+periodo\s+de\s+recepcion\s+de\s+postulaciones\s*\|?\s*(\d{1,2})\s+de\s+([a-z]+)\s+(?:de\s+)?(20\d{2})/);
  const clock=unit.fields.deadline_time.literal.match(/a\s+las\s+(\d{1,2})(?::(\d{2}))?\s*(?:hrs|horas)/i);
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Santiago',day:'numeric',month:'numeric',year:'numeric',
    hour:'numeric',minute:'numeric',hourCycle:'h23'}).formatToParts(new Date(item.valid_through));
  const part=(type:string)=>Number(parts.find(p=>p.type===type)?.value);
  const months=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  if (!close || !clock || part('day')!==Number(close[1]) || part('month')!==months.indexOf(close[2])+1 ||
      part('year')!==Number(close[3]) || part('hour')!==Number(clock[1]) || part('minute')!==Number(clock[2] || 0)) reject('Document deadline differs from literal');
  const literal=unit.fields.application.literal;
  if (!application || application.method!=='in_person' || application.instructions!==literal ||
      !/Oficina[\s\S]{0,30}de Partes/i.test(literal) || !/ubicad[oa] en|\bcalle\b/i.test(literal) ||
      !/#?\d{2,5}/.test(literal) || !/postulante|postulaci[oó]n|sobre/i.test(literal) ||
      item.application!==unit.document_url+'#page='+unit.fields.application.page) reject('Invalid in-person application proof');
}

// A historical, digest-bound proof of a GitHub job; it never authorizes a new HTTP request.
export function verifySignedBatch(envelope:Envelope, jwks:Jwks, now=Date.now(), acceptedDigest?:string) {
  if (envelope.schema !== 'trabajo-cerca.signed-exchange.v1' || typeof envelope.body_base64 !== 'string' ||
      envelope.body_base64.length > 180000 || !envelope.proof) reject('Invalid exchange envelope');
  const raw = Buffer.from(envelope.body_base64, 'base64');
  if (raw.length > 128 * 1024 || raw.toString('base64') !== envelope.body_base64) reject('Invalid batch bytes');
  const header = jsonPart(envelope.proof.header);
  const claims = jsonPart(envelope.proof.claims);
  if (header.alg !== 'RS256' || header.typ !== 'JWT' || typeof header.kid !== 'string') reject('Unsupported proof algorithm');
  const keys = jwks.keys?.filter(key => key.kid === header.kid && key.kty === 'RSA' && (!key.alg || key.alg === 'RS256')) ?? [];
  if (keys.length !== 1 || typeof envelope.proof.signature !== 'string' || envelope.proof.signature.length > 16000 || !/^[A-Za-z0-9_-]+$/.test(envelope.proof.signature)) reject('Missing or ambiguous GitHub signing key');
  const key = createPublicKey({ key:keys[0], format:'jwk' });
  if ((key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048 ||
      !verify('RSA-SHA256', Buffer.from(envelope.proof.header + '.' + envelope.proof.claims), key, Buffer.from(envelope.proof.signature, 'base64url'))) reject('Invalid GitHub signature');
  const digest = sha(raw);
  if (claims.iss !== 'https://token.actions.githubusercontent.com' || claims.aud !== AUDIENCE + digest ||
      claims.repository !== REPOSITORY || String(claims.repository_id) !== REPOSITORY_ID ||
      String(claims.repository_owner_id) !== OWNER_ID || typeof claims.ref!=='string' || !PRODUCER_REFS.has(claims.ref) ||
      claims.workflow_ref !== REPOSITORY+'/.github/workflows/radar.yml@'+claims.ref) reject('Untrusted GitHub producer');
  const subjects=['repo:'+REPOSITORY+':ref:'+claims.ref,
    'repo:mrvvergara-afk@'+OWNER_ID+'/Trabajo-Cerca-@'+REPOSITORY_ID+':ref:'+claims.ref];
  if (typeof claims.sub !== 'string' || !subjects.includes(claims.sub)) reject('Untrusted GitHub subject');
  const issued = Number(claims.iat) * 1000;
  const expires = Number(claims.exp) * 1000;
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || issued > now + 60000 || (now - issued > MAX_AGE && digest!==acceptedDigest) ||
      expires <= issued || expires - issued > 600000 || (claims.nbf !== undefined && Number(claims.nbf) * 1000 > now + 60000)) reject('Invalid proof issuance window');
  let batch:Batch;
  try { batch = JSON.parse(raw.toString('utf8')) as Batch; } catch { return reject('Invalid batch JSON'); }
  if (batch.schema !== 'trabajo-cerca.exchange.v1' || batch.environment !== 'laboratory' ||
      batch.repository !== REPOSITORY || batch.repository_id !== REPOSITORY_ID || batch.ref !== claims.ref ||
      batch.sha !== claims.sha || batch.run_id !== String(claims.run_id) || !/^[a-f0-9]{40}$/.test(batch.sha) ||
      !/^\d+$/.test(batch.run_id) || !Array.isArray(batch.records) || batch.records.length > 3) reject('Batch provenance mismatch');
  const generated = Date.parse(batch.generated_at);
  if (!Number.isFinite(generated) || generated > now + 60000 || generated > issued + 60000 || issued - generated > 1800000) reject('Batch time mismatch');
  return { batch, digest };
}

export function validateOffer(item:VerifiedOffer, now=Date.now()) {
  for (const field of ['source_url','title','company','work_commune','source_published_at','application','verified_at','verification_method','candidate_id','idempotency_key'] as const) {
    if (typeof item[field] !== 'string' || !item[field].trim() || item[field].length > 2000) reject('Missing or oversized offer evidence');
  }
  const identity = jobIdentity(item.source_url,item.document_unit?.key);
  const adapter = publicSourceAdapter(item.source_url)!;
  const localMethod = adapter.family==='local' && item.verification_method===adapter.name+' individual notice + local document text';
  const unitMethod = adapter.family==='local' && item.verification_method===adapter.name+' individual notice + page-bound document review';
  const contactMethod=adapter.family==='local' && item.verification_method===adapter.name+' individual notice + dated public in-person application';
  if (contactMethod) { try { validateLocalContactEvidence(item,now); } catch { reject('Invalid dated in-person primary evidence'); } }
  if ((item.local_contact_evidence || item.validity_method==='dated_in_person') && !contactMethod) reject('Unsupported local contact evidence');
  const cmpcMethod=new URL(item.source_url).hostname==='cmpc.csod.com';
  if (cmpcMethod) { try { validateCmpcEvidence(item,now); } catch { reject('Invalid CMPC primary evidence'); } }
  if ((item.cmpc_evidence || item.work_site) && !cmpcMethod) reject('Unsupported CMPC evidence');
  if (!/^[a-f0-9]{24}$/.test(item.candidate_id) || item.idempotency_key !== 'radar:' + item.candidate_id ||
      !PLACES.includes(item.work_commune) || (item.verification_method !== adapter.verificationMethod && !localMethod && !unitMethod && !contactMethod)) reject('Unsupported verification evidence');
  if (item.document_unit && !unitMethod || item.application_details && !unitMethod && !contactMethod) reject('Unsupported document unit evidence');
  if (typeof item.valid_through !== 'string' || item.valid_through.length>2000) reject('Invalid source deadline');
  if (localMethod && (!item.source_evidence || item.source_evidence.source_url!==item.source_url ||
      !item.source_evidence.complete_document || !/^[a-f0-9]{64}$/.test(item.source_evidence.sha256) ||
      typeof item.source_evidence.text!=='string' || item.source_evidence.text.length>18000)) reject('Missing local document proof');
  const checked = Date.parse(item.verified_at), published = Date.parse(item.source_published_at), deadline = Date.parse(item.valid_through);
  if (![checked,published].every(Number.isFinite) || checked > now || now - checked > MAX_AGE ||
      published > now || now - published > 45 * MAX_AGE) reject('Stale or invalid source evidence');
  if (unitMethod) {
    if (!Number.isFinite(deadline) || deadline<=now || deadline<=published || item.validity_method==='live_application') reject('Stale or invalid source evidence');
    validateDocumentUnit(item,now);
    if (item.candidate_id!==identity.slice(0,24)) reject('Document candidate identity mismatch');
  }
  if (contactMethod) {
    if (item.validity_method!=='dated_in_person' || item.candidate_id!==identity.slice(0,24)) reject('Local contact identity mismatch');
  } else if (item.validity_method==='live_application') {
    const evidence = item.validity_evidence;
    if (localMethod || item.valid_through || !evidence || !samePublicJob(item.source_url,evidence.form_url) ||
        evidence.form_action!==item.application || Date.parse(evidence.checked_at)!==checked ||
        !/^[a-f0-9]{64}$/.test(evidence.source_sha256) || !safePublicUrl(evidence.form_action) ||
        new URL(evidence.form_action).hostname.replace(/^www\./,'')!==new URL(item.source_url).hostname.replace(/^www\./,'')) reject('Missing current application form proof');
  } else if (!Number.isFinite(deadline) || deadline<=now || deadline<=published) reject('Stale or invalid source evidence');
  if (item.application.startsWith('tel:')) {