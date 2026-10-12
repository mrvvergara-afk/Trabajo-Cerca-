import { db } from '@appdeploy/sdk';
import { createHash } from 'node:crypto';

type FeedSource = string;
type Stored = Record<string, unknown>;
type Entry = { key:string; source:FeedSource; sourceId:string; item:Stored };
type Order = { time:number; key:string };
type Counts = { jobs:number; newJobs24h:number; people:number; needs:number; services:number };
type Summary = {
  itemCount:number; totalJobOffers:number; totalVerifiedJobOffers:number;
  totalProvisionalJobOffers:number; communeStats:Record<string, Counts>;
  kindStats:Omit<Counts, 'newJobs24h'>;
};
type PageRef = { id:string; keys:string[]; identities?:Array<string | null>; first:Order; last:Order; refreshAt:number | null; summary:Summary };
type Manifest = Summary & { schema:2; updatedAt:string; pages:PageRef[]; pageCount:number };
type Build = Manifest & { source:FeedSource | 'complete'; nextToken?:string };
type Change = { source:FeedSource; sourceId:string; queuedAt:string };
type Control = Stored & { manifestId?:string };
type Projector = {
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
  try {
    const parsed = new URL(item.url);
    if (!['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.port ||
        !['chiletrabajos.cl','www.chiletrabajos.cl'].includes(parsed.hostname) || !/^\/trabajo\/[^/]+\/?$/.test(parsed.pathname)) return null;
    return createHash('sha256').update('https://www.chiletrabajos.cl' + parsed.pathname.replace(/\/$/, '')).digest('hex');
  } catch { return null; }
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
    }
    const places = Array.isArray(item.workCommunes) ? [...new Set(item.workCommunes.map(String))] : [];
    for (const place of places) {
      const stat = summary.communeStats[place] ??= { jobs:0, newJobs24h:0, people:0, needs:0, services:0 };
      stat[kind]++;
      if (kind === 'jobs' && Date.parse(String(item.createdAt)) >= now - 86400000) stat.newJobs24h++;
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
    for (const kind of ['jobs', 'people', 'needs', 'services'] as const) result.kindStats[kind] += summary.kindStats[kind];
    for (const [place, counts] of Object.entries(summary.communeStats)) {
      const current = result.communeStats[place] ??= { jobs:0, newJobs24h:0, people:0, needs:0, services:0 };
      for (const kind of ['jobs', 'newJobs24h', 'people', 'needs', 'services'] as const) current[kind] += counts[kind];
    }
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
      const [page] = await db.get<{ entries:Entry[] }>('public_feed_versions', [ref.id]);
      if (!page) throw new Error('Public feed page missing; previous feed retained');
      entries = page.entries;
      this.cache.set(ref, entries);
    }
    return entries;
  }

  private set(ref:PageRef, entries:Entry[]) {
    ref.keys = entries.map(entry => entry.key);
    ref.identities = entries.map(entry => identity(entry.item));
    if (entries.length) {
      ref.first = order(entries[0]);
      ref.last = order(entries[entries.length - 1]);
    }
    this.cache.set(ref, entries);
    this.changed.add(ref);
  }

  async put(source:FeedSource, sourceId:string, record:Stored | null) {
    const key = source + ':' + sourceId;
    const old = this.pages.find(ref => ref.keys.includes(key));
    if (old) {
      const remaining = (await this.entries(old)).filter(entry => entry.key !== key);
      this.set(old, remaining);
      if (!remaining.length) this.pages.splice(this.pages.indexOf(old), 1);
    }
    const item = record ? this.projector.project({ ...record, id:sourceId }) : null;
    if (!item) return;
    const incomingIdentity = identity(item);
    if (incomingIdentity) {
      const duplicates = this.pages.filter(page => page.identities?.includes(incomingIdentity));
      for (const page of duplicates) {
        const existing = await this.entries(page);
        const duplicate = existing.find(entry => identity(entry.item) === incomingIdentity);
        if (!duplicate) throw new Error('Feed identity metadata mismatch');
        const checked = (value:Stored) => {
          const stamp = Date.parse(String(value.externalVerifiedAt || value.verificationCheckedAt || value.verifiedAt || ''));
          return Number.isFinite(stamp) && stamp <= this.now ? stamp : 0;
        };
        if (checked(duplicate.item) > checked(item)) return;
      }
      for (const page of duplicates) {
        const remaining = (await this.entries(page)).filter(entry => identity(entry.item) !== incomingIdentity);
        this.set(page, remaining);
        if (!remaining.length) this.pages.splice(this.pages.indexOf(page), 1);
      }
    }
    const entry:Entry = { key, source, sourceId, item };
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
      ref.id = id;
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

async function publish(record:Manifest) {
  checkSize(record);
  const [manifestId] = await db.add('public_feed_manifests', [record]);
  if (!manifestId) throw new Error('Public feed manifest insertion failed; previous feed retained');
  const previous = await single<Control>('public_feed_control');
  const { id:_id, ...fields } = previous ?? {};
  const { pages:_pages, ...summary } = record;
  await replaceSingle('public_feed_control', { ...fields, ...summary, manifestId });
  return { ...summary, manifestId, rebuilding:false };
}

export async function readPublicFeedSummary() {
  const current = await single<Control>('public_feed_control');
  return { ...emptySummary(), ...current, rebuilding:!current?.manifestId };
}

export async function currentPublicFeedManifest() {
  const current = await single<Control>('public_feed_control');
  if (!current?.manifestId) return null;
  const [record] = await db.get<Manifest>('public_feed_manifests', [current.manifestId]);
  if (!record) throw new Error('Public feed manifest missing');
  return { manifestId:current.manifestId, manifest:record };
}

// Single scheduled writer: the existing verify-publish cron. Other handlers only read the summary.
export async function advancePublicFeed(projector:Projector) {
  const now = Date.now();
  const control = await single<Control>('public_feed_control');
  if (!control?.manifestId) {
    const saved = await single<Build>('public_feed_build_state');
    const build:Build = saved ?? { ...manifest([], now), source:'radar_jobs' };
    const legacy = build.pages.find(page => !Array.isArray(page.identities));
    if (legacy) {
      const editor = new Editor(build.pages, projector, now);
      await editor.upgrade(legacy);
      await replaceSingle('public_feed_build_state', { ...build, ...manifest(await editor.persist(), now) });
      return { ...await readPublicFeedSummary(), rebuilding:true, buildSource:build.source };
    }
    if (build.source === 'complete') return publish(manifest(build.pages, now));
    const rows = await db.list<Stored>(build.source, { limit:STEP_SIZE, ...(build.nextToken ? { nextToken:build.nextToken } : {}) });
    const editor = new Editor(build.pages, projector, now);
    for (const { id, ...record } of rows.items) await editor.put(build.source, id, record);
    const pages = await editor.persist();
    const source = rows.nextToken ? build.source : build.source === 'radar_jobs' ? 'community_posts' : 'complete';
    const next:Build = { ...manifest(pages, now), source, ...(rows.nextToken ? { nextToken:rows.nextToken } : {}) };
    await replaceSingle('public_feed_build_state', next as unknown as Stored);
    return source === 'complete' ? publish(manifest(pages, now)) : { ...await readPublicFeedSummary(), rebuilding:true, buildSource:source };
  }

  const [current] = await db.get<Manifest>('public_feed_manifests', [control.manifestId]);
  if (!current) throw new Error('Public feed manifest missing; previous feed retained');
  const legacy = current.pages.find(page => !Array.isArray(page.identities));
  if (legacy) {
    const editor = new Editor(current.pages, projector, now);
    await editor.upgrade(legacy);
    return publish(manifest(await editor.persist(), now));
  }
  const changes = await db.list<Change>('public_feed_changes', { limit:STEP_SIZE });
  const due = current.pages.filter(page => page.refreshAt !== null && page.refreshAt <= now).sort((a,b) => a.refreshAt! - b.refreshAt!)[0];
  if (!changes.items.length && !due) return readPublicFeedSummary();
  const wanted = new Map<string, { source:FeedSource; sourceId:string }>();
  for (const change of changes.items) {
    if (!allowedSource(change.source) || !change.sourceId) throw new Error('Invalid public feed change; reconciliation required');
    wanted.set(change.source + ':' + change.sourceId, change);
  }
  if (due) for (const key of due.keys) {
    const colon = key.indexOf(':');
    wanted.set(key, { source:key.slice(0, colon) as FeedSource, sourceId:key.slice(colon + 1) });
  }
  const editor = new Editor(current.pages, projector, now);
  for (const source of new Set([...wanted.values()].map(item => item.source))) {
    const ids = [...wanted.values()].filter(item => item.source === source).map(item => item.sourceId);
    if (!ids.length) continue;
    const records = await db.get<Stored>(source, ids);
    if (records.length !== ids.length) throw new Error('Source read result count mismatch');
    for (let i = 0; i < ids.length; i++) await editor.put(source, ids[i], records[i]);
  }
  const result = await publish(manifest(await editor.persist(), now));
  // Acknowledge only after the complete immutable manifest and visible pointer are durable.
  if (changes.items.length) {
    const removed = await db.delete('public_feed_changes', changes.items.map(change => change.id));
    if (removed.length !== changes.items.length || removed.some(ok => !ok)) throw new Error('Public feed change acknowledgement failed; retry remains idempotent');
  }
  return result;
}

export async function readPublicFeedPage(cursor?:string) {
  let manifestId:string | undefined;
  let page = 0;
  if (cursor?.startsWith('v2:')) {
    const match = /^v2:([A-Za-z0-9_-]{1,128}):(\d+)$/.exec(cursor);
    if (!match) throw new Error('Feed cursor invalid');
    manifestId = match[1];
    page = Number(match[2]);
  } else {
    if (cursor && !/^\d+$/.test(cursor)) throw new Error('Feed cursor invalid');
    page = Number(cursor || '0');
    manifestId = (await single<Control>('public_feed_control'))?.manifestId;
  }
  if (!Number.isSafeInteger(page) || page < 0 || page > 10000) throw new Error('Feed cursor invalid');
  if (!manifestId) return (await single<Stored>('public_feed_page_' + page)) ?? null;
  const [current] = await db.get<Manifest>('public_feed_manifests', [manifestId]);
  if (!current) throw new Error('Public feed manifest missing');
  if (page >= Math.max(1, current.pages.length)) throw new Error('Feed cursor invalid');
  const ref = current.pages[page];
  const [leaf] = ref ? await db.get<{ entries:Entry[] }>('public_feed_versions', [ref.id]) : [null];
  if (ref && !leaf) throw new Error('Public feed page missing');
  const { pages:_pages, schema:_schema, itemCount, ...summary } = current;
  const hasMore = page + 1 < current.pages.length;
  return { ...summary, items:leaf?.entries.map(entry => entry.item) ?? [], totalItems:itemCount,
    pageSize:PAGE_SIZE, hasMore, nextCursor:hasMore ? 'v2:' + manifestId + ':' + (page + 1) : undefined };
}
