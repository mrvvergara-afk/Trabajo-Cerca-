import { db } from '@appdeploy/sdk';
import { createHash } from 'node:crypto';
import { publicOfferIdentity, publicFeedIdentity } from './public-source-adapters';

type FeedSource = string;
type Stored = Record<string, unknown>;
type Entry = { key:string; source:FeedSource; sourceId:string; item:Stored; projectionRevision?:string };
type Order = { time:number; key:string };
type Counts = { jobs:number; newJobs24h:number; newJobs7d:number; people:number; needs:number; services:number };
type Summary = {
  itemCount:number; totalJobOffers:number; totalVerifiedJobOffers:number;
  recentJobOffers24h:number; recentJobOffers7d:number;
  totalProvisionalJobOffers:number; communeStats:Record<string, Counts>;
  kindStats:Omit<Counts, 'newJobs24h' | 'newJobs7d'>;
};
type PageRef = { id:string; keys:string[]; identities?:Array<string | null>; first:Order; last:Order; refreshAt:number | null; summary:Summary; projectionRevision?:string };
type Manifest = Summary & { schema:2; updatedAt:string; pages:PageRef[]; pageCount:number };
type Build = Manifest & { source:FeedSource | 'complete'; nextToken?:string };
type Change = { source:FeedSource; sourceId:string; queuedAt:string };
type Control = Stored & { manifestId?:string };
type Projector = {
  revision?:string;
  reconcileManifestId?:string;
  project:(item:Stored & { id:string }) => Stored | null;
  refreshAt:(item:Stored) => number | null;
};

const PAGE_SIZE = 40;
const STEP_SIZE = 40;
const ITEM_BYTES = 230 * 1024;
const INPUT_BYTES = 900 * 1024;
const SOURCES:FeedSource[] = ['radar_jobs', 'community_posts'];

function allowedSource(source:string) {
  return SOURCES.includes(source) || /^radar_external_[a-f0-9]{32}$/.test(source);
}

function identity(item:Stored) {
  if (item.kind !== 'job_offer' || typeof item.url !== 'string') return null;
  if (typeof item.documentUnitKey==='string' && item.documentUnitVerified===true) {
    const unit=publicOfferIdentity(item.url,item.documentUnitKey);
    return unit ? createHash('sha256').update(unit).digest('hex') : null;
  }
  const equivalent = publicFeedIdentity(item.url);
  return equivalent ? createHash('sha256').update(equivalent).digest('hex') : null;
}

function bytes(value:unknown) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function checkSize(value:unknown) {
  if (bytes(value) > ITEM_BYTES) throw new Error('Public feed record exceeds safe byte limit; previous feed retained');
}

function chunks<T>(values:T[], envelope:(items:T[]) => unknown) {
  const result:T[][] = [];
  let batch:T[] = [];
  for (const value of values) {
    if (bytes(envelope([value])) > INPUT_BYTES) throw new Error('Public feed request exceeds safe byte limit');
    const next = [...batch, value];
    if (batch.length && (next.length > 500 || bytes(envelope(next)) > INPUT_BYTES)) {
      result.push(batch);
      batch = [];
    }
    batch.push(value);
  }
  if (batch.length) result.push(batch);
  return result;
}

async function single<T>(table:string) {
  return (await db.list<T>(table, { limit:1 })).items[0];
}

async function replaceSingle(table:string, record:Stored) {
  checkSize(record);
  const current = await single<Stored>(table);
  if (current) {
    const [ok] = await db.update(table, [{ id:current.id, record }]);
    if (!ok) throw new Error('Public feed pointer/checkpoint write failed: ' + table);
  } else {
    const [id] = await db.add(table, [record]);
    if (!id) throw new Error('Public feed pointer/checkpoint insert failed: ' + table);
  }
}

async function queueChanges(source:string, ids:string[]) {
  if (!allowedSource(source) || !ids.length) return;
  const records = ids.map(sourceId => ({ source, sourceId, queuedAt:new Date().toISOString() }));
  for (const batch of chunks(records, records => ({ table:'public_feed_changes', records }))) {
    const saved = await db.add('public_feed_changes', batch);
    if (saved.length !== batch.length || saved.some(id => !id)) {
      throw new Error('Source saved but public feed change registration failed; reconciliation required');
    }
  }
}

export async function registerPublicFeedChange(source:string, id:string) {
  if (!allowedSource(source) || !id) throw new Error('Invalid external feed source');
  await queueChanges(source, [id]);
}

// A rejected winner must not permanently hide its formerly deduplicated copies.
// Read immutable baseline references; requeue current originals, never old copies.
async function reconcileFeedEquivalents(projector:Projector) {
  if (!projector.reconcileManifestId || !projector.revision) return;
  const saved=await single<Stored>('public_feed_identity_policy');
  if (saved?.revision===projector.revision && saved?.baselineManifestId===projector.reconcileManifestId) return;
  const [baseline]=await db.get<Manifest>('public_feed_manifests',[projector.reconcileManifestId]);
  if (!baseline || baseline.pages.length>20 || baseline.pages.reduce((count,page)=>count+page.keys.length,0)>800) throw new Error('Identity reconciliation baseline unavailable or oversized');
  const groups=new Map<string,Entry[]>();
  for (const ref of baseline.pages) {
    const [leaf]=await db.get<{entries:Entry[]}>('public_feed_versions',[ref.id]);
    if (!leaf || leaf.entries.length>40) throw new Error('Identity reconciliation page unavailable');
    for (const entry of leaf.entries) {
      if (!allowedSource(entry.source) || !entry.sourceId || entry.key!==entry.source+':'+entry.sourceId) throw new Error('Identity reconciliation reference invalid');
      const key=identity(entry.item);
      if (key) groups.set(key,[...(groups.get(key)??[]),entry]);
    }
  }
  const wanted=new Map<string,Entry>();
  for (const members of groups.values()) if (members.length>1) for (const entry of members) wanted.set(entry.key,entry);
  for (const source of new Set([...wanted.values()].map(entry=>entry.source))) {
    await queueChanges(source,[...wanted.values()].filter(entry=>entry.source===source).map(entry=>entry.sourceId));
  }
  // A partial queue failure leaves this unset; retries are safe and idempotent.
  await replaceSingle('public_feed_identity_policy',{revision:projector.revision,baselineManifestId:projector.reconcileManifestId,
    queuedReferences:wanted.size,completedAt:new Date().toISOString()});
}

// Return the original per-item results. Never treat an array length as success.
export async function trackedFeedAdd(table:string, records:Stored[]) {
  const ids:Array<string | null> = [];
  for (const batch of chunks(records, records => ({ table, records }))) {
    batch.forEach(checkSize);
    const saved = await db.add(table, batch);
    if (saved.length !== batch.length) throw new Error('Source insertion result count mismatch');
    ids.push(...saved);
    await queueChanges(table, saved.filter((id):id is string => Boolean(id)));
  }
  return ids;
}

export async function trackedFeedUpdate(table:string, updates:Array<{ id:string; record:Stored }>) {
  const results:boolean[] = [];
  for (const batch of chunks(updates, items => ({ table, items }))) {
    batch.forEach(item => checkSize(item.record));
    const saved = await db.update(table, batch);
    if (saved.length !== batch.length) throw new Error('Source update result count mismatch');
    results.push(...saved);
    await queueChanges(table, batch.filter((_, i) => saved[i]).map(item => item.id));
  }
  return results;
}

export async function trackedFeedDelete(table:string, ids:string[]) {
  const results:boolean[] = [];
  for (const batch of chunks(ids, ids => ({ table, ids }))) {
    const saved = await db.delete(table, batch);
    if (saved.length !== batch.length) throw new Error('Source deletion result count mismatch');
    results.push(...saved);
    await queueChanges(table, batch.filter((_, i) => saved[i]));
  }
  return results;
}

function order(entry:Entry):Order {
  const time = Date.parse(String(entry.item.createdAt || ''));
  return { time:Number.isFinite(time) ? time : 0, key:entry.key };
}

function compare(a:Order, b:Order) {
  return b.time - a.time || a.key.localeCompare(b.key);
}

function emptySummary():Summary {
  return { itemCount:0, totalJobOffers:0, totalVerifiedJobOffers:0, totalProvisionalJobOffers:0,
    recentJobOffers24h:0,recentJobOffers7d:0,
    communeStats:{}, kindStats:{ jobs:0, people:0, needs:0, services:0 } };
}

function summarize(entries:Entry[], now:number):Summary {
  const summary = emptySummary();
  summary.itemCount = entries.length;
  for (const { item } of entries) {
    const kind = item.kind === 'job_offer' ? 'jobs' : item.kind === 'worker_available' ? 'people'
      : item.kind === 'worker_need' ? 'needs' : item.kind === 'service_request' ? 'services' : null;
    if (!kind) continue;
    summary.kindStats[kind]++;
    if (kind === 'jobs') {
      summary.totalJobOffers++;
      if (item.verified && !item.review) summary.totalVerifiedJobOffers++;
      const first=Date.parse(String(item.firstPublishedAt || item.createdAt || ''));
      if (first<=now && first>=now-86400000) summary.recentJobOffers24h++;
      if (first<=now && first>=now-7*86400000) summary.recentJobOffers7d++;
    }
    const places = Array.isArray(item.workCommunes) ? [...new Set(item.workCommunes.map(String))] : [];
    for (const place of places) {
      const stat = summary.communeStats[place] ??= { jobs:0, newJobs24h:0, newJobs7d:0, people:0, needs:0, services:0 };