import { db } from '@appdeploy/sdk';
import { createHash, createPublicKey, verify, type JsonWebKey } from 'node:crypto';
import { currentPublicFeedManifest, registerPublicFeedChange } from './public-feed';

type Stored = Record<string, unknown>;
export type VerifiedOffer = {
  idempotency_key:string; candidate_id:string; source_url:string; source:string;
  title:string; company:string; work_commune:string; source_published_at:string;
  valid_through:string; application:string; verified_at:string; verification_method:string;
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
const PRODUCER_REF = 'refs/heads/repair/radar-audit-2026-10-11';
const WORKFLOW_REF = REPOSITORY + '/.github/workflows/radar.yml@' + PRODUCER_REF;
const SUBJECTS = [
  'repo:' + REPOSITORY + ':ref:' + PRODUCER_REF,
  'repo:mrvvergara-afk@' + OWNER_ID + '/Trabajo-Cerca-@' + REPOSITORY_ID + ':ref:' + PRODUCER_REF,
];
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

export function jobIdentity(url:string) {
  let parsed:URL;
  try { parsed = new URL(url); } catch { return reject('Invalid source URL'); }
  if (!['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.port ||
      !['chiletrabajos.cl','www.chiletrabajos.cl'].includes(parsed.hostname) || !/^\/trabajo\/[^/]+\/?$/.test(parsed.pathname)) reject('Unsupported individual source URL');
  return sha('https://www.chiletrabajos.cl' + parsed.pathname.replace(/\/$/, ''));
}

// A historical, digest-bound proof of a GitHub job; it never authorizes a new HTTP request.
export function verifySignedBatch(envelope:Envelope, jwks:Jwks, now=Date.now()) {
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
      String(claims.repository_owner_id) !== OWNER_ID || claims.ref !== PRODUCER_REF ||
      claims.workflow_ref !== WORKFLOW_REF) reject('Untrusted GitHub producer');
  if (typeof claims.sub !== 'string' || !SUBJECTS.includes(claims.sub)) reject('Untrusted GitHub subject');
  const issued = Number(claims.iat) * 1000;
  const expires = Number(claims.exp) * 1000;
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || issued > now + 60000 || now - issued > MAX_AGE ||
      expires <= issued || expires - issued > 600000 || (claims.nbf !== undefined && Number(claims.nbf) * 1000 > now + 60000)) reject('Invalid proof issuance window');
  let batch:Batch;
  try { batch = JSON.parse(raw.toString('utf8')) as Batch; } catch { return reject('Invalid batch JSON'); }
  if (batch.schema !== 'trabajo-cerca.exchange.v1' || batch.environment !== 'laboratory' ||
      batch.repository !== REPOSITORY || batch.repository_id !== REPOSITORY_ID || batch.ref !== PRODUCER_REF ||
      batch.sha !== claims.sha || batch.run_id !== String(claims.run_id) || !/^[a-f0-9]{40}$/.test(batch.sha) ||
      !/^\d+$/.test(batch.run_id) || !Array.isArray(batch.records) || batch.records.length > 3) reject('Batch provenance mismatch');
  const generated = Date.parse(batch.generated_at);
  if (!Number.isFinite(generated) || generated > now + 60000 || generated > issued + 60000 || issued - generated > 1800000) reject('Batch time mismatch');
  return { batch, digest };
}

export function validateOffer(item:VerifiedOffer, now=Date.now()) {
  for (const field of ['source_url','title','company','work_commune','source_published_at','valid_through','application','verified_at','verification_method','candidate_id','idempotency_key'] as const) {
    if (typeof item[field] !== 'string' || !item[field].trim() || item[field].length > 2000) reject('Missing or oversized offer evidence');
  }
  const identity = jobIdentity(item.source_url);
  if (!/^[a-f0-9]{24}$/.test(item.candidate_id) || item.idempotency_key !== 'radar:' + item.candidate_id ||
      !PLACES.includes(item.work_commune) || item.verification_method !== 'Chiletrabajos individual page + matching JobPosting') reject('Unsupported verification evidence');
  const checked = Date.parse(item.verified_at), published = Date.parse(item.source_published_at), deadline = Date.parse(item.valid_through);
  if (![checked,published,deadline].every(Number.isFinite) || checked > now || now - checked > MAX_AGE ||
      published > now || now - published > 60 * MAX_AGE || deadline <= now || deadline <= published) reject('Stale or invalid source evidence');
  if (item.application.startsWith('mailto:')) {
    if (!/^mailto:[^@\s?]+@[^@\s?]+\.[^@\s?]+(?:\?.*)?$/.test(item.application)) reject('Invalid application contact');
  } else {
    let application:URL;
    try { application = new URL(item.application); } catch { return reject('Invalid application URL'); }
    if (application.protocol !== 'https:' || application.username || application.password) reject('Invalid application URL');
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
  const receipts:Receipt[] = [];
  for (const offer of batch.records) {
    const identity = validateOffer(offer, now);
    const table = 'radar_external_' + identity.slice(0, 32);
    const rows = await db.list<Stored>(table, { limit:2 });
    if (rows.items.length > 1) throw new Error('Conflicting identity rows; preserve history and reconcile');
    const previous = rows.items[0];
    if (previous && previous.externalIdentity !== identity) throw new Error('Identity collision; preserve history');
    const { id:_id, ...fields } = previous ?? {};
    const record:Stored = { ...fields, ...mapRecord(offer), createdAt:previous?.createdAt ?? new Date(now).toISOString(),
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
    const { batch, digest } = verifySignedBatch(envelope as unknown as Envelope, jwks as unknown as Jwks);
    // Validate the whole batch before writing any offer.
    batch.records.forEach(item => validateOffer(item));
    if (previous && previous.digest === digest) {
      // A backup commit may retain the already accepted exchange. Preserve its IDs and receipts.
      const published = Number(previous.publishedCount || 0);
      const count = previous.receipts?.length ?? 0;
      const status = !count ? 'no_verified_offers' : published === count ? 'published' : 'stored_waiting_for_feed';
      await saveState({ dataCommit:commit, status, rejection:null, transportError:null, checkedAt:new Date().toISOString() });
      return { stored:0, published, status:'unchanged_batch' };
    }
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
    const page = snapshot.manifest.pages.find(ref => ref.identities?.includes(receipt.identity));
    const at = page?.identities?.indexOf(receipt.identity) ?? -1;
    const visibleKey = at >= 0 ? page?.keys[at] : undefined;
    const [record] = await db.get<Stored>(receipt.table, [receipt.id]);
    if (!record) throw new Error('External receipt source missing');
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
  const receipts:Array<{ candidateId:string; publishedId:string | null; state:string; sourceUrl:string | null }> = [];
  for (const receipt of current?.receipts?.slice(0, 3) ?? []) {
    const [record] = await db.get<Stored>(receipt.table, [receipt.id]);
    receipts.push({ candidateId:receipt.candidateId,
      publishedId:typeof record?.externalPublishedId === 'string' ? record.externalPublishedId : null,
      state:String(record?.externalPublicationState || 'not_confirmed'),
      sourceUrl:typeof record?.url === 'string' ? record.url : null });
  }
  return { status:current?.status || 'awaiting_signed_batch', stored:Number(current?.storedCount || 0),
    published:Number(current?.publishedCount || 0), checkedAt:current?.checkedAt ?? null,
    feedManifestId:current?.feedManifestId ?? null, dataCommit:current?.dataCommit ?? null,
    rejection:current?.rejection ?? null, runId:current?.runId ?? null, receipts };
}
