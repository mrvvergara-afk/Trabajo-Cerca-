import { db } from '@appdeploy/sdk';
import { PRIMARY_PLACES } from '../shared/territories';
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
const PLACES:string[] = [...PRIMARY_PLACES];

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
    if (!localMethod || !/^tel:\+56(?:9\d{8}|(?:43|45)\d{7})$/.test(item.application)) reject('Invalid application contact');
  } else if (item.application.startsWith('mailto:')) {
    if (!/^mailto:[^@\s?]+@[^@\s?]+\.[^@\s?]+(?:\?.*)?$/.test(item.application)) reject('Invalid application contact');
  } else {
    let application:URL;
    try { application = new URL(item.application); } catch { return reject('Invalid application URL'); }
    if (application.protocol !== 'https:' || application.username || application.password) reject('Invalid application URL');
    if (!unitMethod && publicSourceAdapter(item.application) && !samePublicJob(item.source_url,item.application)) reject('Application belongs to another job');
  }
  return identity;
}

async function fetchJson(url:string, maxBytes:number, missing=false) {
  let response:Response;
  try {
    response = await fetch(url, { headers:{ 'accept':'application/json','user-agent':'TrabajoCercaLaboratory/1.0' },
      redirect:'error', signal:AbortSignal.timeout(6500) });
  } catch { throw new GitHubTransportError('GitHub request unavailable'); }
  if (missing && response.status === 404) return null;
  if (!response.ok) throw new GitHubTransportError('GitHub transport HTTP ' + response.status);
  if (Number(response.headers.get('content-length') || 0) > maxBytes) reject('Transport response too large');
  const reader = response.body?.getReader();
  const parts:Buffer[] = [];
  let size = 0;
  if (reader) {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) { await reader.cancel(); reject('Transport response too large'); }
      parts.push(Buffer.from(chunk.value));
    }
  } else {
    const raw = Buffer.from(await response.arrayBuffer());
    if (raw.length > maxBytes) reject('Transport response too large');
    parts.push(raw);
  }
  return JSON.parse(Buffer.concat(parts).toString('utf8')) as Stored;
}

async function state() {
  return (await db.list<PullState>(STATE_TABLE, { limit:1 })).items[0];
}

async function saveState(fields:Stored) {
  const current = await state();
  const { id:_id, ...previous } = current ?? {};
  const record = { ...previous, ...fields };
  if (Buffer.byteLength(JSON.stringify(record)) > 230 * 1024) throw new Error('External state byte budget exceeded');
  if (current) {
    const [ok] = await db.update(STATE_TABLE, [{ id:current.id, record }]);
    if (!ok) throw new Error('External state write failed');
  } else {
    const [id] = await db.add(STATE_TABLE, [record]);
    if (!id) throw new Error('External state insertion failed');
  }
}

export async function storeVerifiedBatch(batch:Batch, digest:string, mapRecord:(item:VerifiedOffer) => Stored, now=Date.now()) {
  if (!Array.isArray(batch.records) || batch.records.length>3) reject('Batch size exceeded');
  const identities=batch.records.map(offer=>validateOffer(offer,now));
  if (new Set(identities).size!==identities.length) reject('Duplicate offer identity in batch');
  const receipts:Receipt[] = [];
  for (const offer of batch.records) {
    const identity = validateOffer(offer, now);
    const table = 'radar_external_' + identity.slice(0, 32);
    const rows = await db.list<Stored>(table, { limit:2 });
    if (rows.items.length > 1) throw new Error('Conflicting identity rows; preserve history and reconcile');
    const previous = rows.items[0];
    if (previous && previous.externalIdentity !== identity) throw new Error('Identity collision; preserve history');
    const { id:_id, ...fields } = previous ?? {};
    const documentFields:Stored=offer.document_unit ? {documentUnitKey:offer.document_unit.key,documentUnitVerified:true,
      documentUnitProof:offer.document_unit,applicationMethod:'in_person',applicationInstructions:offer.application_details!.instructions,
      applicationUrl:offer.application,sourceValidThrough:offer.valid_through,expiresAt:offer.valid_through,
      note:'Postulación presencial. '+offer.application_details!.instructions.replace(/\s+/g,' ')+' · Bases: '+offer.application} : {};
    const primaryFields:Stored=offer.cmpc_evidence ? {cmpcPrimaryReview:offer.cmpc_evidence,primarySourceEvidence:offer.source_evidence} : {};
    const contactFields:Stored=offer.local_contact_evidence ? {localContactEvidence:offer.local_contact_evidence,
      applicationMethod:'in_person',applicationInstructions:offer.application_details!.instructions,applicationUrl:offer.application,
      vacancies:offer.vacancies,workLocation:offer.work_commune+' · '+offer.local_contact_evidence.workplace_literal,
      note:'Postulación presencial. '+offer.application_details!.instructions+' · '+localContactDescription(offer.local_contact_evidence)+' · La fuente no informa fecha de cierre.'+
        (offer.local_contact_evidence.employer_identity==='not_named_by_publisher' ? ' El municipio no publica la razón social del empleador.' : '')} : {};
    const record:Stored = { ...fields, ...mapRecord(offer), ...documentFields, ...primaryFields, ...contactFields, createdAt:previous?.createdAt ?? new Date(now).toISOString(),
      externalIdentity:identity, externalCandidateId:offer.candidate_id, externalBatchDigest:digest,
      externalRunId:batch.run_id, externalVerifiedAt:offer.verified_at, feedRegistered:false };
    if (Buffer.byteLength(JSON.stringify(record)) > 230 * 1024) throw new Error('External offer byte budget exceeded');
    let id:string | null | undefined = previous?.id;
    if (id) {
      const [ok] = await db.update(table, [{ id, record }]);
      if (!ok) throw new Error('External offer update failed');
    } else {
      [id] = await db.add(table, [record]);
      if (!id) throw new Error('External offer insertion failed');
    }
    // The identity and full offer are one durable record: retries can find an unregistered insert.
    if (offer.local_contact_evidence) {
      const checks=await db.list<Stored>('radar_local_contact_rechecks',{limit:20});
      if (!checks.items.some(row=>row.identity===identity)) {
        const [key]=await db.add('radar_local_contact_rechecks',[{identity,table,sourceId:id}]);
        if (!key) throw new Error('Local contact recheck registration failed');
      }
    }
    await registerPublicFeedChange(table, id);
    const [registered] = await db.update(table, [{ id, record:{ ...record, feedRegistered:true } }]);
    if (!registered) throw new Error('External feed registration checkpoint failed');
    receipts.push({ table, id, identity, candidateId:offer.candidate_id });
  }
  const status = receipts.length ? 'stored_waiting_for_feed' : 'no_verified_offers';
  await saveState({ digest, receipts, storedCount:receipts.length, publishedCount:0, status, runId:batch.run_id,
    rejection:null, transportError:null, checkedAt:new Date(now).toISOString() });
  return { stored:receipts.length, published:0, status };
}

export async function pullRadarBatch(mapRecord:(item:VerifiedOffer) => Stored) {
  const previous = await state();
  let commit:string | undefined;
  try {
    const head = await fetchJson('https://api.github.com/repos/' + REPOSITORY + '/git/ref/heads/radar-state-laboratorio', 16000, true);
    if (!head) return { stored:0, published:0, status:'awaiting_signed_batch' };
    const value = (head.object as Stored | undefined)?.sha;
    if (typeof value !== 'string' || !/^[a-f0-9]{40}$/.test(value)) reject('Invalid data head');
    commit = value;
    if (previous?.dataCommit === commit) return { stored:0, published:Number(previous.publishedCount || 0), status:'unchanged' };
    const envelope = await fetchJson('https://raw.githubusercontent.com/' + REPOSITORY + '/' + commit + '/exchange/latest.json', 210000);
    const jwks = await fetchJson('https://token.actions.githubusercontent.com/.well-known/jwks', 64000);
    const { batch, digest } = verifySignedBatch(envelope as unknown as Envelope, jwks as unknown as Jwks,Date.now(),previous?.digest);
    if (previous && previous.digest===digest) {
      // A backup commit may retain the already accepted exchange. Preserve its IDs and receipts.
      const published = Number(previous.publishedCount || 0);
      const count = previous.receipts?.length ?? 0;
      const status = !count ? 'no_verified_offers' : published === count ? 'published' : 'stored_waiting_for_feed';
      await saveState({ dataCommit:commit, status, rejection:null, transportError:null, checkedAt:new Date().toISOString() });
      return { stored:0, published, status:'unchanged_batch' };
    }
    // Signatures always verify. A known payload is a historical copy, never a fresh publication.
    batch.records.forEach(item => validateOffer(item));
    const result = await storeVerifiedBatch(batch, digest, mapRecord);
    await saveState({ dataCommit:commit });
    return result;
  } catch (cause) {
    if (cause instanceof GitHubTransportError) {
      await saveState({ status:'transport_unavailable', transportError:cause.message, checkedAt:new Date().toISOString() });
      return { stored:0, published:0, status:'transport_unavailable' };
    }
    if (!(cause instanceof BatchRejected)) throw cause;
    await saveState({ status:'batch_rejected', rejection:cause.message, checkedAt:new Date().toISOString(), rejectedCommit:commit });
    return { stored:0, published:0, status:'batch_rejected' };
  }
}

export async function confirmRadarPublications() {
  const current = await state();
  if (!current?.receipts?.length) return { published:0, status:String(current?.status || 'awaiting_signed_batch') };
  const snapshot = await currentPublicFeedManifest();
  if (!snapshot) return { published:0, status:'waiting_for_complete_feed' };
  if (current.feedManifestId === snapshot.manifestId && current.status === 'published') {
    return { published:Number(current.publishedCount || 0), status:'published' };
  }
  let published = 0;
  for (const receipt of current.receipts) {
    const [record] = await db.get<Stored>(receipt.table, [receipt.id]);
    if (!record) throw new Error('External receipt source missing');
    const equivalent=typeof record.url==='string' ? publicFeedIdentity(record.url) : null;
    const visibleIdentity=record.documentUnitVerified===true ? receipt.identity : equivalent ? sha(equivalent) : receipt.identity;
    const page = snapshot.manifest.pages.find(ref => ref.identities?.includes(visibleIdentity));
    const at = page?.identities?.indexOf(visibleIdentity) ?? -1;
    const visibleKey = at >= 0 ? page?.keys[at] : undefined;
    const visible = Boolean(visibleKey);
    const [ok] = await db.update(receipt.table, [{ id:receipt.id, record:{ ...record,
      externalPublicationState:visible ? 'published' : 'not_visible',
      externalPublishedId:visibleKey ? visibleKey.slice(visibleKey.indexOf(':') + 1) : null,
      externalPublishedSource:visibleKey ? visibleKey.slice(0, visibleKey.indexOf(':')) : null,
      externalFeedManifest:snapshot.manifestId, externalPublicationCheckedAt:new Date().toISOString() } }]);
    if (!ok) throw new Error('Publication receipt write failed');
    if (visible) published++;
  }
  await saveState({ publishedCount:published, status:published === current.receipts.length ? 'published' : 'stored_waiting_for_feed',
    publicationCheckedAt:new Date().toISOString(), feedManifestId:snapshot.manifestId });
  return { published, status:published === current.receipts.length ? 'published' : 'stored_waiting_for_feed' };
}

export async function externalRadarStatus() {
  const current = await state();
  const receipts:Array<Record<string,unknown>> = [];
  for (const receipt of current?.receipts?.slice(0, 3) ?? []) {
    const [record] = await db.get<Stored>(receipt.table, [receipt.id]);
    receipts.push({ candidateId:receipt.candidateId,sourceId:receipt.id,
      publishedId:typeof record?.externalPublishedId === 'string' ? record.externalPublishedId : null,
      state:String(record?.externalPublicationState || 'not_confirmed'),
      sourceUrl:typeof record?.url === 'string' ? record.url : null,
      projection:record ? {kind:record.kind,active:record.active,verified:record.verified,review:record.review,
        sourcePublishedAt:record.sourcePublishedAt,sourceValidThrough:record.sourceValidThrough,expiresAt:record.expiresAt,
        workCommunes:record.workCommunes,title:record.title,note:record.note,
        retentionReason:offerRetentionReason(record)} : null });
  }
  return { status:current?.status || 'awaiting_signed_batch', stored:Number(current?.storedCount || 0),
    published:Number(current?.publishedCount || 0), checkedAt:current?.checkedAt ?? null,
    feedManifestId:current?.feedManifestId ?? null, dataCommit:current?.dataCommit ?? null,
    rejection:current?.rejection ?? null, runId:current?.runId ?? null, receipts };
}

// Runs in the existing verification slot; no new schedule or paid fallback.
export async function revalidateLocalContactOffers(now=Date.now()) {
  const rows=await db.list<Stored>('radar_local_contact_rechecks',{limit:20});
  let checked=0,closed=0,inconclusive=0;
  for (const ref of rows.items) {
    if (typeof ref.table!=='string' || !/^radar_external_[a-f0-9]{32}$/.test(ref.table) || typeof ref.sourceId!=='string') throw new Error('Invalid local recheck reference');
    const [record]=await db.get<Stored>(ref.table,[ref.sourceId]);
    if (!record || record.externalIdentity!==ref.identity || !record.localContactEvidence) throw new Error('Missing local primary proof');
    const stamp=Date.parse(String(record.localContactCheckedAt || record.lastVerifiedAt || ''));
    if (Number.isFinite(stamp) && now-stamp<86400000 || record.active===false) continue;
    const proof=record.localContactEvidence as LocalContactEvidence;
    const index=await fetchPublicPage(proof.index_url,proof.index_url);
    const state=index.error || index.status!==200 ? 'unknown' : localContactIndexStatus(index.raw,String(record.url),String(record.title));
    let reason='Fuente temporalmente limitada; se conserva la aprobación anterior.',update:Stored={};
    if (state==='closed') {update={active:false,verified:false,review:false,status:'Cerrada',sourceUnavailableConfirmed:true};reason='El índice oficial marca esta oferta como cerrada.';closed++;}
    else if (state==='open') {
      const page=await fetchPublicPage(String(record.url),String(record.url));
      if ([404,410].includes(page.status)) {update={active:false,verified:false,review:false,status:'Cerrada',sourceUnavailableConfirmed:true};reason='El aviso individual dejó de estar disponible.';closed++;}
      else if (!page.error && page.status===200 && localContactDescription({...proof,source_html:page.raw})===localContactDescription(proof) &&
          page.raw.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').includes(String(record.applicationInstructions))) {
        update={lastVerifiedAt:new Date(now).toISOString()};reason='Índice oficial abierto, cargo y postulación presencial sin cambios.';
      } else inconclusive++;
    } else inconclusive++;
    const next={...record,...update,localContactCheckedAt:new Date(now).toISOString(),verificationReason:reason};
    const [ok]=await db.update(ref.table,[{id:ref.sourceId,record:next}]);
    if (!ok) throw new Error('Local revalidation write failed');
    await registerPublicFeedChange(ref.table,ref.sourceId);checked++;
  }
  return {checked,closed,inconclusive,hasMore:Boolean(rows.nextToken),paidCalls:0};
}
