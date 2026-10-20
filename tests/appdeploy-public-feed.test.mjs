import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../integrations/appdeploy/public-feed.ts', import.meta.url), 'utf8');
const code = stripTypeScriptTypes(source, { mode:'strip' }).replace(/^import .*;$/gm, '').replace(/^export /gm, '');
const adapterCode = stripTypeScriptTypes(readFileSync(new URL('../integrations/appdeploy/public-source-adapters.ts',import.meta.url),'utf8'),{ mode:'strip' }).replace(/^export /gm,'');
const patch = JSON.parse(readFileSync(new URL('../integrations/appdeploy/public-feed-repair.json', import.meta.url), 'utf8'));
const startTime = Date.parse('2026-10-12T10:00:00Z');

function record(id, extra = {}) {
  return { id, kind:'job_offer', title:'Operador ' + id, active:true, verified:true, review:false,
    workCommunes:['Angol'], createdAt:new Date(startTime - Number(id.replace(/\D/g, '') || 0) * 1000).toISOString(), ...extra };
}

function database() {
  const tables = new Map();
  const calls = [];
  let sequence = 0;
  let fault;
  function table(name) {
    if (!tables.has(name)) tables.set(name, new Map());
    return tables.get(name);
  }
  function result(method, name, count) {
    if (!fault || fault.method !== method || fault.table !== name) return undefined;
    const value = fault.value;
    fault = undefined;
    if (value instanceof Error) throw value;
    return typeof value === 'function' ? value(count) : value;
  }
  const db = {
    async list(name, options = {}) {
      calls.push({ method:'list', table:name, options:structuredClone(options) });
      const injected = result('list', name, 0);
      if (injected !== undefined) return injected;
      const rows = [...table(name)].map(([id, item]) => ({ ...structuredClone(item), id }));
      const offset = Number(options.nextToken || '0');
      const limit = options.limit ?? 50;
      return { items:rows.slice(offset, offset + limit), nextToken:offset + limit < rows.length ? String(offset + limit) : undefined };
    },
    async get(name, ids) {
      calls.push({ method:'get', table:name, ids:[...ids] });
      const injected = result('get', name, ids.length);
      if (injected !== undefined) return injected;
      return ids.map(id => table(name).has(id) ? structuredClone(table(name).get(id)) : null);
    },
    async add(name, records) {
      calls.push({ method:'add', table:name, records:structuredClone(records) });
      const injected = result('add', name, records.length);
      return records.map((item, i) => {
        const id = injected === undefined ? 'db-' + ++sequence : injected[i];
        if (id) table(name).set(id, structuredClone(item));
        return id ?? null;
      });
    },
    async update(name, updates) {
      calls.push({ method:'update', table:name, updates:structuredClone(updates) });
      const injected = result('update', name, updates.length);
      return updates.map(({ id, record }, i) => {
        const ok = table(name).has(id) && (injected === undefined || injected[i]);
        if (ok) table(name).set(id, structuredClone(record));
        return Boolean(ok);
      });
    },
    async delete(name, ids) {
      calls.push({ method:'delete', table:name, ids:[...ids] });
      const injected = result('delete', name, ids.length);
      return ids.map((id, i) => (injected === undefined || injected[i]) ? table(name).delete(id) : false);
    },
  };
  return { db, calls, tables, table, fail(method, name, value) { fault = { method, table:name, value }; },
    seed(name, rows) { for (const { id, ...item } of rows) table(name).set(id, structuredClone(item)); } };
}

function harness(data = database()) {
  let time = startTime;
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [time])); }
    static now() { return time; }
  }
  const context = { db:data.db, Buffer, Date:Clock, console, URL, createHash };
  vm.createContext(context);
  vm.runInContext(adapterCode,context);
  vm.runInContext(code, context);
  const projector = {
    project:item => item.active && !item.review && item.verified && (!item.expiresAt || Date.parse(item.expiresAt) >= time) ? item : null,
    refreshAt:item => {
      const expires = Date.parse(item.expiresAt) + 1;
      const age = Date.parse(item.createdAt) + 86400000 + 1;
      const due = [expires, age].filter(value => Number.isFinite(value) && value > time);
      return due.length ? Math.min(...due) : null;
    },
  };
  return { ...data, context, projector, advance:() => context.advancePublicFeed(projector),
    page:cursor => context.readPublicFeedPage(cursor), now(value) { time = value; } };
}

function seedLegacy(h) {
  h.seed('public_feed_control', [{ id:'old-control', pageCount:1, totalJobOffers:1, itemCount:1 }]);
  h.seed('public_feed_page_0', [{ id:'old-page', items:[record('historic')], totalJobOffers:1, hasMore:false }]);
}

async function finish(h) {
  for (let i = 0; i < 100; i++) {
    await h.advance();
    if ([...h.table('public_feed_control').values()][0]?.manifestId) return;
  }
  assert.fail('The bounded build did not finish');
}

async function items(h, first) {
  first ??= await h.page();
  const result = [...first.items];
  let cursor = first.nextCursor;
  for (let i = 0; cursor && i < 100; i++) {
    const page = await h.page(cursor);
    result.push(...page.items);
    cursor = page.nextCursor;
  }
  assert.equal(cursor, undefined);
  return result;
}

async function rejectedDuplicateWinner() {
  const h=harness(),equivalent=h.context.publicFeedIdentity;
  h.context.publicFeedIdentity=value=>h.context.publicOfferIdentity(value);
  const base='https://www.chiletrabajos.cl/trabajo/';
  h.seed('radar_jobs',[record('bad',{url:base+'social-3902639',verifiedAt:new Date(startTime-1000).toISOString()}),record('good',{url:base+'3902639',verifiedAt:new Date(startTime-2000).toISOString()})]);
  await finish(h);
  const baseline=(await h.context.currentPublicFeedManifest()).manifestId;
  h.context.publicFeedIdentity=equivalent;
  h.projector.revision='dedupe-first';await h.advance();
  assert.deepEqual((await items(h)).map(item=>item.id),['bad']);
  h.projector.revision='exclude-bad';h.projector.project=item=>item.id==='bad'?null:item;
  await h.advance();assert.equal((await items(h)).length,0);
  h.projector.reconcileManifestId=baseline;h.projector.revision='recover-current-equivalents';
  return {h,baseline};
}

test('a rejected duplicate winner recovers its eligible current original from an immutable baseline',async()=>{
  const {h,baseline}=await rejectedDuplicateWinner();
  const sourceBefore=JSON.stringify([...h.table('radar_jobs')]);
  await h.advance();
  assert.deepEqual((await items(h)).map(item=>item.id),['good']);
  assert.equal(JSON.stringify([...h.table('radar_jobs')]),sourceBefore);
  assert.equal((await h.page('v2:'+baseline+':0')).items.length,2);
  const checkpoint=(await h.context.publicFeedProgress()).identityReconciliation;
  assert.equal(checkpoint.queuedReferences,2);
  const writes=h.calls.filter(call=>call.method==='add'&&call.table==='public_feed_changes').length;
  await h.advance();
  assert.equal(h.calls.filter(call=>call.method==='add'&&call.table==='public_feed_changes').length,writes);
});

test('failed duplicate requeue preserves the visible pointer and retries without a false checkpoint',async()=>{
  const {h}=await rejectedDuplicateWinner(),before=await h.context.currentPublicFeedManifest();
  h.fail('add','public_feed_changes',[null,null]);
  await assert.rejects(h.advance(),/registration failed/);
  assert.equal((await h.context.currentPublicFeedManifest()).manifestId,before.manifestId);
  assert.equal(h.table('public_feed_identity_policy').size,0);
  await h.advance();assert.deepEqual((await items(h)).map(item=>item.id),['good']);
});

test('A 45-day policy reprojects existing feed pages in bounded steps and keeps source and historical snapshots', async () => {
  const h = harness();
  const jobs = Array.from({ length:86 }, (_, i) => record('age'+i, {
    sourcePublishedAt:new Date(startTime-(i%2===0?50:21)*86400000).toISOString(),
  }));
  h.seed('radar_jobs', jobs);
  await finish(h);
  const original = await h.page();
  const oldCursor = original.nextCursor;
  const historicalPage = await h.page(oldCursor);
  assert.equal((await items(h)).length, 86);
  h.projector.revision = 'original-source-45-days-v1';
  h.projector.project = item => startTime-Date.parse(item.sourcePublishedAt)<=45*86400000 ? item : null;
  const beginning = h.calls.length;
  let steps = 0;
  while (steps++<8) {
    await h.advance();
    const current = [...h.table('public_feed_control').values()][0];
    const manifest = h.table('public_feed_manifests').get(current.manifestId);
    if (manifest.pages.every(page => page.projectionRevision === h.projector.revision)) break;
  }
  assert.ok(steps<=original.pageCount, 'One existing page is reprojected per step');
  assert.equal((await items(h)).length, 43);
  assert.equal(h.table('radar_jobs').size, 86);
  assert.deepEqual(await h.page(oldCursor), historicalPage, 'Historical version remains readable');
  const reads = h.calls.slice(beginning).filter(call => call.method==='get' && call.table==='radar_jobs');
  assert.ok(reads.every(call => call.ids.length<=40));
  assert.equal(new Set(reads.flatMap(call => call.ids)).size, 86);
  assert.ok(h.calls.every(call => call.method!=='delete' || call.table!=='radar_jobs'));
});

test('A failed policy reprojection keeps the visible manifest and retries without deleting source records', async () => {
  const h = harness();
  h.seed('radar_jobs', [record('old')]);
  await finish(h);
  const before = (await h.page()).items;
  const manifestId = [...h.table('public_feed_control').values()][0].manifestId;
  h.projector.revision = 'changed-age-policy';
  h.projector.project = () => null;
  h.fail('get','radar_jobs',[]);
  await assert.rejects(h.advance(), /count mismatch/);
  assert.equal([...h.table('public_feed_control').values()][0].manifestId, manifestId);
  assert.deepEqual((await h.page()).items, before);
  await h.advance();
  assert.equal((await h.page()).items.length, 0);
  assert.equal(h.table('radar_jobs').size, 1);
});

test('Quality migration hides search pages, joins company aliases and preserves every source record and reviewed role',async()=>{
  const h=harness();
  const jobs=[
    record('alias1',{url:'https://portal.chiletrabajos.cl/empresa/layner/trabajo/tens-3902931',title:'TENS',workCommunes:['Lumaco']}),
    record('alias2',{url:'https://www.chiletrabajos.cl/trabajo/tens-3902931',title:'TENS',workCommunes:['Lumaco']}),
    record('search',{url:'https://www.chiletrabajos.cl/encuentra-un-empleo/?2=CMPC',title:'Trabajos CMPC'}),
    ...['Farmacéutico','Prevencionista','Nutricionista'].map((title,i)=>record('unit'+i,{url:'https://mtraiguen.cl/municipalidad/bases-para-llamado-a-concurso-publico-de-3-cargos/',title,workCommunes:['Traiguén'],documentUnitVerified:true,documentUnitKey:String(i).repeat(64)})),
  ];
  h.seed('radar_jobs',jobs);await finish(h);
  h.projector.revision='quality-v3';
  h.projector.project=item=>h.context.publicJobExclusion(item)?null:item;
  for(let i=0;i<4;i++)await h.advance();
  const visible=await items(h);
  assert.equal(visible.length,4);
  assert.equal(visible.filter(x=>x.documentUnitVerified).length,3);
  assert.equal(visible.filter(x=>x.title==='TENS').length,1);
  assert.equal(visible.some(x=>x.id==='search'),false);
  assert.equal(h.table('radar_jobs').size,6);
  for (const original of jobs)assert.deepEqual({...h.table('radar_jobs').get(original.id),id:original.id},original);
  assert.ok(h.calls.every(call=>call.method!=='delete'||call.table!=='radar_jobs'));
});

test('More than 200 records from both sources form a complete, globally ordered feed', async () => {
  const h = harness();
  const jobs = Array.from({ length:257 }, (_, i) => record('r' + (i * 2)));
  const community = Array.from({ length:73 }, (_, i) => record('c' + (i * 2 + 1)));
  h.seed('radar_jobs', jobs.reverse());
  h.seed('community_posts', community.reverse());
  await finish(h);
  const actual = await items(h);
  assert.equal(actual.length, 330);
  assert.equal(new Set(actual.map(item => item.id)).size, 330);
  assert.equal((await h.page()).totalJobOffers, 330);
  assert.ok(actual.every((item, i) => i === 0 || Date.parse(actual[i - 1].createdAt) >= Date.parse(item.createdAt)));
  assert.equal(h.table('radar_jobs').size, 257);
  assert.equal(h.table('community_posts').size, 73);
});

test('A build reads at most one small source page and retains the old visible feed', async () => {
  const h = harness();
  seedLegacy(h);
  h.seed('radar_jobs', Array.from({ length:241 }, (_, i) => record('r' + i)));
  await h.advance();
  const sourceReads = h.calls.filter(call => call.method === 'list' && call.table === 'radar_jobs');
  assert.equal(sourceReads.length, 1);
  assert.equal(sourceReads[0].options.limit, 40);
  assert.equal((await h.page()).items[0].id, 'historic');
  assert.equal(h.calls.filter(call => call.method === 'delete').length, 0);
});

test('A fresh process resumes the source cursor and does not lose historic offers', async () => {
  const original = harness();
  original.seed('radar_jobs', Array.from({ length:211 }, (_, i) => record('r' + i)));
  await original.advance();
  await original.advance();
  const restarted = harness(original);
  original.calls.length = 0;
  await restarted.advance();
  assert.equal(original.calls.find(call => call.method === 'list' && call.table === 'radar_jobs').options.nextToken, '80');
  await finish(restarted);
  assert.equal((await items(restarted)).length, 211);
});

test('A failed page insert does not advance the checkpoint or replace the visible feed', async () => {
  const h = harness();
  seedLegacy(h);
  h.seed('radar_jobs', [record('one')]);
  h.fail('add', 'public_feed_versions', [null]);
  await assert.rejects(h.advance(), /page insertion failed/);
  assert.equal(h.table('public_feed_build_state').size, 0);
  assert.equal((await h.page()).items[0].id, 'historic');
  await finish(h);
  assert.equal((await items(h)).length, 1);
});

test('A failed checkpoint write leaves the saved cursor unchanged and retry deduplicates', async () => {
  const h = harness();
  h.seed('radar_jobs', Array.from({ length:81 }, (_, i) => record('r' + i)));
  await h.advance();
  h.fail('update', 'public_feed_build_state', [false]);
  await assert.rejects(h.advance(), /checkpoint write failed/);
  assert.equal([...h.table('public_feed_build_state').values()][0].nextToken, '40');
  await finish(h);
  assert.equal((await items(h)).length, 81);
});

test('A failed manifest insert preserves the old feed and the completed build can retry', async () => {
  const h = harness();
  seedLegacy(h);
  h.seed('radar_jobs', [record('one')]);
  await h.advance();
  h.fail('add', 'public_feed_manifests', [null]);
  await assert.rejects(h.advance(), /manifest insertion failed/);
  assert.equal((await h.page()).items[0].id, 'historic');
  await finish(h);
  assert.equal((await h.page()).items[0].id, 'one');
});

test('A failed pointer update publishes nothing and retry never rereads the complete source', async () => {
  const h = harness();
  seedLegacy(h);
  h.seed('radar_jobs', [record('one')]);
  await h.advance();
  h.fail('update', 'public_feed_control', [false]);
  await assert.rejects(h.advance(), /pointer\/checkpoint write failed/);
  assert.equal((await h.page()).items[0].id, 'historic');
  h.calls.length = 0;
  await h.advance();
  assert.equal((await h.page()).items[0].id, 'one');
  assert.equal(h.calls.filter(call => call.method === 'list' && ['radar_jobs','community_posts'].includes(call.table)).length, 0);
});

test('After bootstrap a tick with no changes never rescans the growing source tables', async () => {
  const h = harness();
  h.seed('radar_jobs', [record('one')]);
  await finish(h);
  h.calls.length = 0;
  await h.advance();
  assert.equal(h.calls.filter(call => call.method === 'list' && ['radar_jobs','community_posts'].includes(call.table)).length, 0);
  assert.equal(h.calls.filter(call => ['add','update','delete'].includes(call.method)).length, 0);
});

test('Partial insertion queues only real IDs and preserves the SDK result per item', async () => {
  const h = harness();
  h.fail('add', 'radar_jobs', [null, 'saved-two']);
  const saved = await h.context.trackedFeedAdd('radar_jobs', [record('one'), record('two')]);
  assert.deepEqual([...saved], [null, 'saved-two']);
  assert.deepEqual([...h.table('public_feed_changes').values()].map(row => row.sourceId), ['saved-two']);
});

test('Partial update queues only successful writes and keeps false results visible', async () => {
  const h = harness();
  h.seed('radar_jobs', [record('one'), record('two')]);
  h.fail('update', 'radar_jobs', [false, true]);
  const result = await h.context.trackedFeedUpdate('radar_jobs', ['one','two'].map(id => ({ id, record:record(id, { title:'Changed' }) })));
  assert.deepEqual([...result], [false,true]);
  assert.equal(h.table('radar_jobs').get('one').title, 'Operador one');
  assert.deepEqual([...h.table('public_feed_changes').values()].map(row => row.sourceId), ['two']);
});

test('A persisted closure leaves the historic source and removes only the public projection', async () => {
  const h = harness();
  h.seed('radar_jobs', [record('one')]);
  await finish(h);
  await h.context.trackedFeedUpdate('radar_jobs', [{ id:'one', record:record('one', { active:false }) }]);
  h.calls.length = 0;
  await h.advance();
  assert.equal((await h.page()).totalJobOffers, 0);
  assert.equal(h.table('radar_jobs').has('one'), true);
  assert.ok(h.calls.filter(call => call.method === 'delete').every(call => call.table === 'public_feed_changes'));
  assert.ok(h.calls.some(call => call.method === 'get' && call.table === 'radar_jobs' && call.ids[0] === 'one'));
});

test('Failed change acknowledgement is replayed without double publication', async () => {
  const h = harness();
  await finish(h);
  await h.context.trackedFeedAdd('radar_jobs', [record('one')]);
  h.fail('delete', 'public_feed_changes', [false]);
  await assert.rejects(h.advance(), /acknowledgement failed/);
  assert.equal((await h.page()).totalJobOffers, 1);
  assert.equal(h.table('public_feed_changes').size, 1);
  await h.advance();
  assert.equal((await h.page()).totalJobOffers, 1);
  assert.equal((await items(h)).length, 1);
  assert.equal(h.table('public_feed_changes').size, 0);
});

test('Repeated changes reread the latest record and replace the same source ID', async () => {
  const h = harness();
  h.seed('radar_jobs', [record('one')]);
  await finish(h);
  for (const title of ['Version A','Version B','Version C']) await h.context.trackedFeedUpdate('radar_jobs', [{ id:'one', record:record('one', { title }) }]);
  await h.advance();
  assert.equal((await h.page()).items[0].title, 'Version C');
  assert.equal((await h.page()).totalJobOffers, 1);
});

test('Pagination stays on the immutable version despite a concurrent later publication', async () => {
  const h = harness();
  h.seed('radar_jobs', Array.from({ length:80 }, (_, i) => record('r' + i)));
  await finish(h);
  const first = await h.page();
  const expected = (await items(h, first)).map(item => item.id);
  await h.context.trackedFeedAdd('radar_jobs', [record('new', { createdAt:new Date(startTime + 1000).toISOString() })]);
  await h.advance();
  const pinned = await items(h, first);
  assert.deepEqual(pinned.map(item => item.id), expected);
  assert.equal((await h.page()).totalJobOffers, 81);
});

test('Reading pages performs no writes and an absent feed stays distinguishable from empty', async () => {
  const h = harness();
  assert.equal(await h.page(), null);
  await finish(h);
  h.calls.length = 0;
  assert.equal((await h.page()).totalJobOffers, 0);
  assert.equal(h.calls.filter(call => ['add','update','delete'].includes(call.method)).length, 0);
});

test('Missing stored pages fail visibly instead of returning a confirmed empty feed', async () => {
  const h = harness();
  h.seed('radar_jobs', [record('one')]);
  await finish(h);
  h.table('public_feed_versions').clear();
  await assert.rejects(h.page(), /page missing/);
});

test('Malformed and out-of-range cursors are rejected strictly', async () => {
  const h = harness();
  await finish(h);
  for (const cursor of ['1garbage','-1','v2:a:NaN','v2:../bad:1','1','9007199254740993']) await assert.rejects(h.page(cursor), /cursor invalid/);
});

test('UTF-8 bytes split large pages even when their record count is below 40', async () => {
  const h = harness();
  h.seed('radar_jobs', [record('one', { note:'ñ'.repeat(55000) }), record('two', { note:'ñ'.repeat(55000) }), record('three', { note:'ñ'.repeat(55000) })]);
  await finish(h);
  const writes = h.calls.filter(call => call.method === 'add' && call.table === 'public_feed_versions');
  assert.ok(writes.every(call => Buffer.byteLength(JSON.stringify(call.records[0])) <= 230 * 1024));
  assert.ok((await h.page()).hasMore);
  assert.equal((await items(h)).length, 3);
});

test('An oversized item blocks the build without modifying the visible historic feed', async () => {
  const h = harness();
  seedLegacy(h);
  h.seed('radar_jobs', [record('large', { note:'ñ'.repeat(130000) })]);
  await assert.rejects(h.advance(), /safe byte limit/);
  assert.equal((await h.page()).items[0].id, 'historic');
});

test('Expiry refresh reads saved source IDs and never deletes the expired historic offer', async () => {
  const h = harness();
  h.seed('radar_jobs', [record('one', { expiresAt:new Date(startTime + 1000).toISOString() })]);
  await finish(h);
  h.now(startTime + 2000);
  h.calls.length = 0;
  await h.advance();
  assert.equal((await h.page()).totalJobOffers, 0);
  assert.equal(h.table('radar_jobs').size, 1);
  assert.equal(h.calls.filter(call => call.method === 'list' && call.table === 'radar_jobs').length, 0);
});

test('Failure to register a source change is explicit and cannot count as publication', async () => {
  const h = harness();
  h.seed('radar_jobs', [record('one')]);
  await finish(h);
  h.fail('add', 'public_feed_changes', [null]);
  await assert.rejects(h.context.trackedFeedUpdate('radar_jobs', [{ id:'one', record:record('one', { title:'Changed' }) }]), /reconciliation required/);
  assert.equal(h.table('radar_jobs').get('one').title, 'Changed');
  assert.equal((await h.page()).items[0].title, 'Operador one');
});

test('Database quota errors propagate without a hidden retry', async () => {
  const h = harness();
  h.fail('list', 'radar_jobs', new Error('429 AppDatabaseQuotaExceeded'));
  await assert.rejects(h.advance(), /429 AppDatabaseQuotaExceeded/);
  assert.equal(h.calls.filter(call => call.method === 'list' && call.table === 'radar_jobs').length, 1);
});

test('A failed incremental page insert retains the prior snapshot and its unacknowledged change', async () => {
  const h = harness();
  h.seed('radar_jobs', [record('one')]);
  await finish(h);
  await h.context.trackedFeedUpdate('radar_jobs', [{ id:'one', record:record('one', { title:'Latest' }) }]);
  h.fail('add', 'public_feed_versions', [null]);
  await assert.rejects(h.advance(), /page insertion failed/);
  assert.equal((await h.page()).items[0].title, 'Operador one');
  assert.equal(h.table('public_feed_changes').size, 1);
  await h.advance();
  assert.equal((await h.page()).items[0].title, 'Latest');
});

test('New-job counters refresh by saved IDs after the 24-hour boundary', async () => {
  const h = harness();
  h.seed('radar_jobs', [record('one')]);
  await finish(h);
  assert.equal((await h.page()).communeStats.Angol.newJobs24h, 1);
  h.now(startTime + 86400001);
  h.calls.length = 0;
  await h.advance();
  assert.equal((await h.page()).communeStats.Angol.newJobs24h, 0);
  assert.equal(h.calls.filter(call => call.method === 'list' && call.table === 'radar_jobs').length, 0);
});

test('Bulk source writes obey byte limits as well as the SDK array cap', async () => {
  const h = harness();
  const records = Array.from({ length:6 }, (_, i) => record('r' + i, { note:'ñ'.repeat(100000) }));
  await h.context.trackedFeedAdd('radar_jobs', records);
  const writes = h.calls.filter(call => call.method === 'add' && call.table === 'radar_jobs');
  assert.ok(writes.length > 1);
  assert.ok(writes.every(call => call.records.length <= 500 && Buffer.byteLength(JSON.stringify({ table:call.table, records:call.records })) <= 900 * 1024));
  assert.equal(h.table('public_feed_changes').size, 6);
});

function api(h) {
  h.context.json = (body, statusCode = 200) => ({ statusCode, body });
  h.context.error = (error, statusCode) => ({ statusCode, body:{ error } });
  h.context.cacheable = body => ({ statusCode:200, body });
  const route = patch.files[0].diffs.find(diff => diff.to.includes("'GET /api/listings':")).to;
  vm.runInContext(stripTypeScriptTypes('globalThis.routes = {' + route + '}', { mode:'strip' }), h.context);
  return query => h.context.routes['GET /api/listings'][0]({ query });
}

test('The actual listings route reports an unavailable feed as HTTP 503 without bootstrap writes', async () => {
  const h = harness();
  const response = await api(h)({});
  assert.equal(response.statusCode, 503);
  assert.equal(h.calls.filter(call => ['add','update','delete'].includes(call.method)).length, 0);
});

test('The actual listings route returns HTTP 400 for a strict invalid cursor', async () => {
  const h = harness();
  const response = await api(h)({ cursor:'1garbage' });
  assert.equal(response.statusCode, 400);
});

test('The actual listings route exposes complete immutable pagination and preserves read failures', async () => {
  const h = harness();
  h.seed('radar_jobs', Array.from({ length:81 }, (_, i) => record('r' + i)));
  await finish(h);
  const read = api(h);
  const first = await read({ fresh:'1' });
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.totalItems, 81);
  assert.ok(first.body.nextCursor.startsWith('v2:'));
  assert.equal((await read({ cursor:first.body.nextCursor })).statusCode, 200);
  h.fail('get', 'public_feed_manifests', new Error('429 AppDatabaseQuotaExceeded'));
  await assert.rejects(read({}), /429 AppDatabaseQuotaExceeded/);
});

test('recent counters use unique feed entries and incomplete old-page counters stay unknown',()=>{
 const h=harness(),rows=[{key:'a',source:'radar_jobs',sourceId:'a',item:record('a',{workCommunes:['Angol','Lumaco'],createdAt:new Date(startTime-3*86400000).toISOString()})}];
 const summary=h.context.summarize(rows,startTime);assert.equal(summary.totalJobOffers,1);assert.equal(summary.recentJobOffers7d,1);assert.equal(summary.recentJobOffers24h,0);assert.equal(summary.communeStats.Angol.newJobs7d,1);assert.equal(summary.communeStats.Lumaco.newJobs7d,1);
 const old={...summary};delete old.recentJobOffers7d;assert.equal(h.context.total([{summary},{summary:old}]).recentJobOffers7d,undefined);
});
