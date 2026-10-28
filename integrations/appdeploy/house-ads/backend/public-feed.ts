import { db } from '@appdeploy/sdk';
import { createHash, randomUUID } from 'node:crypto';
import { publicOfferIdentity, publicFeedIdentity } from './public-source-adapters';
import { recordCandidate } from './radar-trace';
import { listingFingerprints } from './offer-identity';

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
type PageRef = { id:string; keys:string[]; identities?:Array<string | null>; semanticKeys?:string[]; first:Order; last:Order; refreshAt:number | null; summary:Summary; projectionRevision?:string };
type Manifest = Summary & { schema:2; updatedAt:string; pages:PageRef[]; pageCount:number };
type Build = Manifest & { source:FeedSource | 'complete'; nextToken?:string };
type Change = { source:FeedSource; sourceId:string; queuedAt:string };
type Control = Stored & { manifestId?:string; previousManifestId?:string };
type Lease = { owner:string; expiresAt:number };
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

async function single<T>(table:string):Promise<(T & {id:string})|undefined> {
  if (table==='public_feed_control') {
    const [fixed]=await db.get<Stored>(table,['current'],{consistent:true});
    if (fixed) return {...fixed,id:'current'} as unknown as T & {id:string};
    const rows=await db.list<Stored>(table,{limit:2});
    if (rows.items.length>1) throw new Error('Conflicting public feed pointers; reconciliation required');
    const legacy=rows.items[0];
    if (!legacy) return undefined;
    const [record]=await db.get<Stored>(table,[legacy.id],{consistent:true});
    return record ? {...record,id:legacy.id} as unknown as T & {id:string} : undefined;
  }
  return (await db.list<T>(table, { limit:1 })).items[0] as (T & {id:string})|undefined;
}

async function acquireFeedLease():Promise<Lease|null> {
  const owner=randomUUID(),expiresAt=Date.now()+90000;
  const [existing]=await db.get<Lease>('public_feed_writer',['writer'],{consistent:true});
  if (!existing) {
    const [id]=await db.tx.add('public_feed_writer',[{id:'writer',owner,expiresAt}]);
    return id?{owner,expiresAt}:null;
  }
  if (existing.expiresAt>Date.now()) return null;
  const [ok]=await db.tx.update('public_feed_writer',[{id:'writer',
    if:{owner:existing.owner,expiresAt:existing.expiresAt},record:{owner,expiresAt}}],{patch:true});
  return ok?{owner,expiresAt}:null;
}

async function assertFeedLease(lease:Lease) {
  const [current]=await db.get<Lease>('public_feed_writer',['writer'],{consistent:true});
  if (!current || current.owner!==lease.owner || current.expiresAt<=Date.now()) throw new Error('Public feed writer lease lost; checkpoint retained');
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

async function persistBuild(record:Stored,lease:Lease) {
  checkSize(record);
  await assertFeedLease(lease);
  const current=await single<Stored>('public_feed_build_state');
  const gate=db.tx.update('public_feed_writer',[{id:'writer',
    if:{owner:lease.owner,expiresAt:lease.expiresAt},record:{expiresAt:lease.expiresAt}}],{patch:true});
  const write=current
    ? db.tx.update('public_feed_build_state',[{id:current.id,record}])
    : db.tx.add('public_feed_build_state',[{id:'current',...record}]);
  await db.transact([gate,write]);
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
  const [baseline]=await db.get<Manifest>('public_feed_manifests',[projector.reconcileManifestId],{consistent:true});
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
      stat[kind]++;
      const first=Date.parse(String(item.firstPublishedAt || item.createdAt || ''));
      if (kind === 'jobs' && first<=now && first>=now-86400000) stat.newJobs24h++;
      if (kind === 'jobs' && first<=now && first>=now-7*86400000) stat.newJobs7d++;
    }
  }
  return summary;
}

function total(pages:PageRef[]):Summary {
  const result = emptySummary();
  for (const { summary } of pages) {
    result.itemCount += summary.itemCount;
    result.totalJobOffers += summary.totalJobOffers;
    result.totalVerifiedJobOffers += summary.totalVerifiedJobOffers;
    result.recentJobOffers24h += summary.recentJobOffers24h || 0;
    result.recentJobOffers7d += summary.recentJobOffers7d || 0;
    for (const kind of ['jobs', 'people', 'needs', 'services'] as const) result.kindStats[kind] += summary.kindStats[kind];
    for (const [place, counts] of Object.entries(summary.communeStats)) {
      const current = result.communeStats[place] ??= { jobs:0, newJobs24h:0, newJobs7d:0, people:0, needs:0, services:0 };
      for (const kind of ['jobs', 'newJobs24h', 'newJobs7d', 'people', 'needs', 'services'] as const) current[kind] += counts[kind] || 0;
    }
  }
  if (pages.some(page=>typeof page.summary.recentJobOffers7d!=='number')) {
    delete (result as Partial<Summary>).recentJobOffers7d;
    delete (result as Partial<Summary>).recentJobOffers24h;
    for (const stat of Object.values(result.communeStats)) delete (stat as Partial<Counts>).newJobs7d;
  }
  return result;
}

class Editor {
  private cache = new Map<PageRef, Entry[]>();
  private changed = new Set<PageRef>();
  public pages:PageRef[];
  private projector:Projector;
  private now:number;

  constructor(pages:PageRef[], projector:Projector, now:number) {
    this.pages = pages;
    this.projector = projector;
    this.now = now;
  }

  private async entries(ref:PageRef) {
    let entries = this.cache.get(ref);
    if (!entries) {
      const [page] = await db.get<{ entries:Entry[] }>('public_feed_versions', [ref.id],{consistent:true});
      if (!page) throw new Error('Public feed page missing; previous feed retained');
      entries = page.entries.map(entry => ({ ...entry, projectionRevision:entry.projectionRevision ?? ref.projectionRevision }));
      this.cache.set(ref, entries);
    }
    return entries;
  }

  private set(ref:PageRef, entries:Entry[]) {
    ref.keys = entries.map(entry => entry.key);
    ref.identities = entries.map(entry => identity(entry.item));
    ref.semanticKeys = [...new Set(entries.flatMap(entry=>listingFingerprints(entry.item)))];
    if (entries.length) {
      ref.first = order(entries[0]);
      ref.last = order(entries[entries.length - 1]);
    }
    this.cache.set(ref, entries);
    this.changed.add(ref);
  }

  async put(source:FeedSource, sourceId:string, record:Stored | null) {
    const key = source + ':' + sourceId;
    const firstTimes:number[]=[];
    const remember=(value:Stored)=>{
      const time=Date.parse(String(value.firstPublishedAt || value.createdAt || ''));
      if (Number.isFinite(time) && time<=this.now) firstTimes.push(time);
    };
    const old = this.pages.find(ref => ref.keys.includes(key));
    if (old) {
      const current=await this.entries(old);
      const previous=current.find(entry=>entry.key===key);if (previous) remember(previous.item);
      const remaining = current.filter(entry => entry.key !== key);
      this.set(old, remaining);
      if (!remaining.length) this.pages.splice(this.pages.indexOf(old), 1);
    }
    const item = record ? this.projector.project({ ...record, id:sourceId }) : null;
    if (!item) return;
    remember(item);
    const incomingIdentity = identity(item);
    if (incomingIdentity) {
      const duplicates = this.pages.filter(page => page.identities?.includes(incomingIdentity));
      for (const page of duplicates) for (const entry of await this.entries(page)) if (identity(entry.item)===incomingIdentity) remember(entry.item);
      for (const page of duplicates) {
        const existing = await this.entries(page);
        const duplicate = existing.find(entry => identity(entry.item) === incomingIdentity);
        if (!duplicate) throw new Error('Feed identity metadata mismatch');
        const checked = (value:Stored) => {
          const stamp = Date.parse(String(value.externalVerifiedAt || value.verificationCheckedAt || value.verifiedAt || ''));
          return Number.isFinite(stamp) && stamp <= this.now ? stamp : 0;
        };
        if (checked(duplicate.item) > checked(item)) {
          if (firstTimes.length) {duplicate.item={...duplicate.item,firstPublishedAt:new Date(Math.min(...firstTimes)).toISOString()};this.set(page,existing);}
          return;
        }
      }
      for (const page of duplicates) {
        const remaining = (await this.entries(page)).filter(entry => identity(entry.item) !== incomingIdentity);
        this.set(page, remaining);
        if (!remaining.length) this.pages.splice(this.pages.indexOf(page), 1);
      }
    }
    if (firstTimes.length) item.firstPublishedAt=new Date(Math.min(...firstTimes)).toISOString();
    const entry:Entry = { key, source, sourceId, item, ...(this.projector.revision ? { projectionRevision:this.projector.revision } : {}) };
    checkSize({ entries:[entry] });
    let ref = this.pages.find(page => compare(order(entry), page.last) <= 0) ?? this.pages[this.pages.length - 1];
    if (!ref) {
      ref = { id:'', keys:[], first:order(entry), last:order(entry), refreshAt:null, summary:emptySummary() };
      this.pages.push(ref);
      this.cache.set(ref, []);
    }
    const sorted = [...await this.entries(ref), entry].sort((a,b) => compare(order(a), order(b)));
    const groups:Entry[][] = [];
    const groupSize = sorted.length > PAGE_SIZE || bytes({ entries:sorted }) > ITEM_BYTES ? Math.ceil(sorted.length / 2) : PAGE_SIZE;
    let group:Entry[] = [];
    for (const value of sorted) {
      if (group.length && (group.length >= groupSize || bytes({ entries:[...group, value] }) > ITEM_BYTES)) {
        groups.push(group);
        group = [];
      }
      group.push(value);
    }
    if (group.length) groups.push(group);
    const index = this.pages.indexOf(ref);
    const replacements = groups.map((values, i) => {
      const next = i === 0 ? ref : { ...ref, id:'' };
      this.set(next, values);
      return next;
    });
    this.pages.splice(index, 1, ...replacements);
  }

  async upgrade(ref:PageRef) {
    this.set(ref, await this.entries(ref));
  }

  async persist() {
    for (const ref of this.pages.filter(page => this.changed.has(page))) {
      const entries = await this.entries(ref);
      const record = { entries };
      checkSize(record);
      const [id] = await db.add('public_feed_versions', [record]);
      if (!id) throw new Error('Public feed page insertion failed; previous feed retained');
      const [durable]=await db.get<{entries:Entry[]}>('public_feed_versions',[id],{consistent:true});
      if (!durable || durable.entries.length!==entries.length) throw new Error('Public feed page not durable; previous feed retained');
      ref.id = id;
      if (this.projector.revision) {
        if (entries.every(entry => entry.projectionRevision === this.projector.revision)) ref.projectionRevision = this.projector.revision;
        else delete ref.projectionRevision;
      }
      ref.summary = summarize(entries, this.now);
      const times = entries.map(entry => this.projector.refreshAt(entry.item)).filter((value):value is number => value !== null && value > this.now);
      ref.refreshAt = times.length ? Math.min(...times) : null;
    }
    return this.pages;
  }
}

function manifest(pages:PageRef[], now:number):Manifest {
  const record:Manifest = { ...total(pages), schema:2, updatedAt:new Date(now).toISOString(),
    pages, pageCount:Math.max(1, pages.length) };
  checkSize(record);
  return record;
}

async function publish(record:Manifest, lease:Lease) {
  checkSize(record);
  await assertFeedLease(lease);
  const previous=await single<Control>('public_feed_control');
  const lastGood=await currentPublicFeedManifest();
  const [manifestId]=await db.add('public_feed_manifests',[record]);
  if (!manifestId) throw new Error('Public feed manifest insertion failed; previous feed retained');
  const [durable]=await db.get<Manifest>('public_feed_manifests',[manifestId],{consistent:true});
  if (!durable || durable.itemCount!==record.itemCount || durable.pages.length!==record.pages.length) throw new Error('Public feed manifest not durable; previous feed retained');
  const {id:_id,...fields}=previous??{};
  const {pages:_pages,...summary}=record;
  const pointer={...fields,...summary,manifestId,...(lastGood?{previousManifestId:lastGood.manifestId}:{})};
  const gate=db.tx.update('public_feed_writer',[{id:'writer',if:{owner:lease.owner,expiresAt:lease.expiresAt},record:{expiresAt:lease.expiresAt}}],{patch:true});
  const write=previous
    ? db.tx.update('public_feed_control',[{id:previous.id,if:{manifestId:previous.manifestId},record:pointer}])
    : db.tx.add('public_feed_control',[{id:'current',...pointer}]);
  await db.transact([gate,write]);
  const current=await single<Control>('public_feed_control');
  if (current?.manifestId!==manifestId) throw new Error('Public feed pointer not durable; changes remain pending');
  return {...summary,manifestId,rebuilding:false};
}

export async function readPublicFeedSummary() {
  const snapshot=await currentPublicFeedManifest();
  if (!snapshot) return {...emptySummary(),rebuilding:true};
  const {pages:_pages,...summary}=snapshot.manifest;
  return {...summary,manifestId:snapshot.manifestId,rebuilding:false,usingLastGood:snapshot.degraded};
}

export async function currentPublicFeedManifest() {
  const current=await single<Control>('public_feed_control');
  if (!current?.manifestId) return null;
  for (const manifestId of [current.manifestId,current.previousManifestId].filter((x):x is string=>Boolean(x))) {
    const [record]=await db.get<Manifest>('public_feed_manifests',[manifestId],{consistent:true});
    if (record) return {manifestId,manifest:record,degraded:manifestId!==current.manifestId};
  }
  throw new Error('Public feed manifest and last good snapshot unavailable');
}

export async function publicFeedProgress() {
  const current = await single<Control>('public_feed_control');
  const build = await single<Build>('public_feed_build_state');
  const identityPolicy=await single<Stored>('public_feed_identity_policy');
  return { complete:Boolean(current?.manifestId), manifestId:current?.manifestId ?? null,
    visibleItemCount:Number(current?.itemCount || 0), buildSource:build?.source ?? null,
    stagedPages:build?.pages?.length ?? 0, stagedPublicItems:build?.itemCount ?? 0,
    hasNextSourcePage:Boolean(build?.nextToken), updatedAt:current?.updatedAt ?? null,
    identityReconciliation:identityPolicy ? {revision:identityPolicy.revision,baselineManifestId:identityPolicy.baselineManifestId,
      queuedReferences:identityPolicy.queuedReferences,completedAt:identityPolicy.completedAt} : null };
}

// Read-only partial public projection during the initial multi-step feed build.
// Never expose private source rows or administrative candidates.
export async function readStagedPublicFeedPage() {
  const staged=await single<Build>('public_feed_build_state');
  const first=staged?.pages?.[0];
  if(!first)return null;
  const [leaf]=await db.get<{entries:Entry[]}>('public_feed_versions',[first.id]);
  if(!leaf)return null;
  const items=leaf.entries.map(entry=>entry.item);
  return {...emptySummary(),...staged,totalItems:items.length,items,
    hasMore:false,complete:false,feedState:'initial_partial',feedRebuilding:true,degraded:true,pages:undefined,
    nextToken:undefined,pageCount:undefined};
}

// All callers share the same fenced lease, including overlapping scheduled handlers.
export async function advancePublicFeed(projector:Projector) {
  const lease=await acquireFeedLease();
  if (!lease) return {...await readPublicFeedSummary(),writerBusy:true};
  try {
    return await advancePublicFeedLocked(projector,lease);
  } finally {
    // Preserve the fencing record. A previous invocation cannot release a new owner.
    await db.tx.update('public_feed_writer',[{id:'writer',if:{owner:lease.owner},record:{expiresAt:0}}],{patch:true});
  }
}
async function advancePublicFeedLocked(projector:Projector,lease:Lease) {
  const now = Date.now();
  const control = await single<Control>('public_feed_control');
  if (!control?.manifestId) {
    const saved = await single<Build>('public_feed_build_state');
    const build:Build = saved ?? { ...manifest([], now), source:'radar_jobs' };
    const legacy = build.pages.find(page => !Array.isArray(page.identities));
    if (legacy) {
      const editor = new Editor(build.pages, projector, now);
      await editor.upgrade(legacy);
      await assertFeedLease(lease);
      await persistBuild({ ...build, ...manifest(await editor.persist(), now) },lease);
      return { ...await readPublicFeedSummary(), rebuilding:true, buildSource:build.source };
    }
    if (build.source === 'complete') return publish(manifest(build.pages, now),lease);
    const rows = await db.list<Stored>(build.source, { limit:STEP_SIZE, ...(build.nextToken ? { nextToken:build.nextToken } : {}) });
    const editor = new Editor(build.pages, projector, now);
    for (const { id, ...record } of rows.items) await editor.put(build.source, id, record);
    const pages = await editor.persist();
    const source = rows.nextToken ? build.source : build.source === 'radar_jobs' ? 'community_posts' : 'complete';
    const next:Build = { ...manifest(pages, now), source, ...(rows.nextToken ? { nextToken:rows.nextToken } : {}) };
    await assertFeedLease(lease);
    await persistBuild(next as unknown as Stored,lease);
    return source === 'complete' ? publish(manifest(pages, now),lease) : { ...await readPublicFeedSummary(), rebuilding:true, buildSource:source };
  }

  const snapshot=await currentPublicFeedManifest();
  if (!snapshot) throw new Error('Public feed snapshot unavailable; changes retained');
  if (snapshot.degraded) return publish(manifest(snapshot.manifest.pages,now),lease);
  const current=snapshot.manifest;
  await reconcileFeedEquivalents(projector);
  const legacy = current.pages.find(page => !Array.isArray(page.identities));
  if (legacy) {
    const editor = new Editor(current.pages, projector, now);
    await editor.upgrade(legacy);
    return publish(manifest(await editor.persist(), now),lease);
  }
  const changes = await db.list<Change>('public_feed_changes', { limit:STEP_SIZE });
  // Reproject whole pages up to forty existing records; the cron cadence is unchanged.
  const due:PageRef[] = [];
  let policyKeys=0;
  if (projector.revision) for (const page of current.pages) {
    if (page.projectionRevision===projector.revision) continue;
    if (due.length && policyKeys+page.keys.length>STEP_SIZE) break;
    due.push(page);policyKeys+=page.keys.length;
  }
  if (!due.length) {
    const expired=current.pages.filter(page => page.refreshAt !== null && page.refreshAt <= now).sort((a,b) => a.refreshAt! - b.refreshAt!)[0];
    if (expired) due.push(expired);
  }
  if (!changes.items.length && !due.length) return readPublicFeedSummary();
  const wanted = new Map<string, { source:FeedSource; sourceId:string }>();
  for (const change of changes.items) {
    if (!allowedSource(change.source) || !change.sourceId) throw new Error('Invalid public feed change; reconciliation required');
    wanted.set(change.source + ':' + change.sourceId, change);
  }
  for (const page of due) for (const key of page.keys) {
    const colon = key.indexOf(':');
    wanted.set(key, { source:key.slice(0, colon) as FeedSource, sourceId:key.slice(colon + 1) });
  }
  const editor = new Editor(current.pages, projector, now);
  const publicationChecks:Array<{url:string;key:string;unit?:string}>=[];
  for (const source of new Set([...wanted.values()].map(item => item.source))) {
    const ids = [...wanted.values()].filter(item => item.source === source).map(item => item.sourceId);
    if (!ids.length) continue;
    const records = await db.get<Stored>(source, ids);
    if (records.length !== ids.length) throw new Error('Source read result count mismatch');
    for (let i = 0; i < ids.length; i++) {
      await editor.put(source, ids[i], records[i]);
      const url=records[i]?.url;
      if (typeof url==='string' && records[i]?.kind==='job_offer') publicationChecks.push({url,key:source+':'+ids[i],...(typeof records[i]?.documentUnitKey==='string'?{unit:records[i]!.documentUnitKey as string}:{})});
    }
  }
  const result = await publish(manifest(await editor.persist(), now),lease);
  for (const check of publicationChecks) {
    const present=editor.pages.some(page=>page.keys.includes(check.key));
    await recordCandidate(check.url,{...(check.unit?{documentUnitKey:check.unit}:{}),publication:present?'published':'not_in_current_feed',feedPresent:present,feedManifestId:result.manifestId});
  }
  // Acknowledge only after the complete immutable manifest and visible pointer are durable.
  if (changes.items.length) {
    const removed = await db.delete('public_feed_changes', changes.items.map(change => change.id));
    if (removed.length !== changes.items.length || removed.some(ok => !ok)) throw new Error('Public feed change acknowledgement failed; retry remains idempotent');
  }
  return result;
}

export async function readPublicFeedPage(cursor?:string) {
  let manifestId:string | undefined;
  let usingLastGood=false;
  let page = 0;
  if (cursor?.startsWith('v2:')) {
    const match = /^v2:([A-Za-z0-9_-]{1,128}):(\d+)$/.exec(cursor);
    if (!match) throw new Error('Feed cursor invalid');
    manifestId = match[1];
    page = Number(match[2]);
  } else {
    if (cursor && !/^\d+$/.test(cursor)) throw new Error('Feed cursor invalid');
    page = Number(cursor || '0');
    const snapshot=await currentPublicFeedManifest();
    manifestId=snapshot?.manifestId;
    usingLastGood=snapshot?.degraded===true;
  }
  if (!Number.isSafeInteger(page) || page < 0 || page > 10000) throw new Error('Feed cursor invalid');
  if (!manifestId) return (await single<Stored>('public_feed_page_' + page)) ?? null;
  const [current] = await db.get<Manifest>('public_feed_manifests', [manifestId],{consistent:true});
  if (!current) throw new Error('Public feed manifest missing');
  if (page >= Math.max(1, current.pages.length)) throw new Error('Feed cursor invalid');
  const ref = current.pages[page];
  const [leaf] = ref ? await db.get<{ entries:Entry[] }>('public_feed_versions', [ref.id],{consistent:true}) : [null];
  if (ref && !leaf) throw new Error('Public feed page missing');
  const { pages:_pages, schema:_schema, itemCount, ...summary } = current;
  const hasMore = page + 1 < current.pages.length;
  return { ...summary, items:leaf?.entries.map(entry => entry.item) ?? [], totalItems:itemCount,
    manifestId, feedState:usingLastGood?'degraded_last_good':'fresh', complete:true, pageSize:PAGE_SIZE, hasMore, nextCursor:hasMore ? 'v2:' + manifestId + ':' + (page + 1) : undefined };
}


// Lookups must use the current public projection, never private source records.
export async function readPublicFeedEntry(id:string) {
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(id))return null;
  const current=await currentPublicFeedManifest();
  if(!current)return null;
  const ref=current.manifest.pages.find(page=>page.keys.some(key=>key.endsWith(':'+id)));
  if(!ref)return null;
  const [leaf]=await db.get<{entries:Entry[]}>('public_feed_versions',[ref.id],{consistent:true});
  if(!leaf)throw Error('Public feed page missing');
  const entry=leaf.entries.find(entry=>entry.sourceId===id);
  return entry&&allowedSource(entry.source)&&entry.key===entry.source+':'+entry.sourceId?entry:null;
}
export async function readPublicFeedItem(id:string) {
  return (await readPublicFeedEntry(id))?.item??null;
}
