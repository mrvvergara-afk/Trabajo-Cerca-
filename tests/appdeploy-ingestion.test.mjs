import assert from 'node:assert/strict';
import { createHash, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const now = Date.parse('2026-10-12T13:00:00Z');
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength:2048 });
const jwks = { keys:[{ ...publicKey.export({ format:'jwk' }), kid:'test-only', alg:'RS256' }] };
const code = path => stripTypeScriptTypes(readFileSync(new URL(path, import.meta.url),'utf8'), { mode:'strip' })
  .replace(/^import .*;$/gm,'').replace(/^export /gm,'');
const feedCode = code('../integrations/appdeploy/public-feed.ts');
const ingestionCode = code('../integrations/appdeploy/radar-ingestion.ts');
const digest = value => createHash('sha256').update(value).digest('hex');
const offer = (changes = {}) => ({ source_url:'https://www.chiletrabajos.cl/trabajo/operador-1',source:'Chiletrabajos',
  title:'Operador',company:'Empresa de prueba',work_commune:'Angol',source_published_at:new Date(now - 10000).toISOString(),
  valid_through:new Date(now + 86400000).toISOString(),application:'https://www.chiletrabajos.cl/postular/operador-1',
  verified_at:new Date(now).toISOString(),verification_method:'Chiletrabajos individual page + matching JobPosting',
  candidate_id:'a'.repeat(24),idempotency_key:'radar:' + 'a'.repeat(24), ...changes });
const body = (changes = {}) => ({ schema:'trabajo-cerca.exchange.v1',environment:'laboratory',
  repository:'mrvvergara-afk/Trabajo-Cerca-',repository_id:'1411752840',ref:'refs/heads/repair/radar-audit-2026-10-11',
  sha:'a'.repeat(40),run_id:'123',generated_at:new Date(now).toISOString(),records:[offer()],...changes });

function signed(batch = body(), claimsExtra = {}, headerExtra = {}) {
  const raw = Buffer.from(JSON.stringify(batch));
  const header = Buffer.from(JSON.stringify({ alg:'RS256',typ:'JWT',kid:'test-only',...headerExtra })).toString('base64url');
  const claims = Buffer.from(JSON.stringify({ iss:'https://token.actions.githubusercontent.com',
    aud:'urn:trabajo-cerca:lab:1411752840:' + digest(raw),repository:batch.repository,
    repository_id:'1411752840',repository_owner_id:'291955988',ref:batch.ref,
    workflow_ref:batch.repository + '/.github/workflows/radar.yml@' + batch.ref,
    sub:'repo:' + batch.repository + ':ref:' + batch.ref,sha:batch.sha,run_id:batch.run_id,
    iat:now/1000,exp:now/1000 + 300,...claimsExtra })).toString('base64url');
  return { schema:'trabajo-cerca.signed-exchange.v1',body_base64:raw.toString('base64'),
    proof:{ header, claims, signature:sign('RSA-SHA256',Buffer.from(header + '.' + claims),privateKey).toString('base64url') } };
}

function harness() {
  const tables = new Map();
  const calls = [];
  let serial = 0, fault;
  const table = name => { if (!tables.has(name)) tables.set(name,new Map()); return tables.get(name); };
  function failure(method,name) {
    if (!fault || fault.method !== method || fault.table !== name) return undefined;
    const value = fault.value; fault = undefined;
    if (value instanceof Error) throw value;
    return value;
  }
  const db = {
    async list(name,options = {}) {
      calls.push({ method:'list',table:name,options });
      const value = failure('list',name); if (value !== undefined) return value;
      const rows = [...table(name)].map(([id,row]) => ({ ...structuredClone(row),id }));
      const start = Number(options.nextToken || 0), limit = options.limit || 50;
      return { items:rows.slice(start,start + limit),nextToken:start + limit < rows.length ? String(start + limit) : undefined };
    },
    async get(name,ids) {
      calls.push({ method:'get',table:name,ids });
      const value = failure('get',name); if (value !== undefined) return value;
      return ids.map(id => table(name).has(id) ? structuredClone(table(name).get(id)) : null);
    },
    async add(name,rows) {
      calls.push({ method:'add',table:name,rows });
      const value = failure('add',name);
      return rows.map((row,i) => { const id = value === undefined ? 'id-' + ++serial : value[i]; if (id) table(name).set(id,structuredClone(row)); return id || null; });
    },
    async update(name,updates) {
      calls.push({ method:'update',table:name,updates });
      const value = failure('update',name);
      return updates.map(({ id,record },i) => { const ok = table(name).has(id) && (value === undefined || value[i]); if (ok) table(name).set(id,structuredClone(record)); return Boolean(ok); });
    },
    async delete(name,ids) {
      calls.push({ method:'delete',table:name,ids });
      const value = failure('delete',name);
      return ids.map((id,i) => (value === undefined || value[i]) ? table(name).delete(id) : false);
    },
  };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const ctx = { db,Buffer,URL,Date:Clock,console,AbortSignal,createHash,createPublicKey,verify };
  vm.createContext(ctx);
  vm.runInContext(feedCode,ctx);
  vm.runInContext(ingestionCode,ctx);
  const mapper = item => ({ kind:'job_offer',active:true,verified:true,review:false,title:item.title,company:item.company,
    url:item.source_url,workCommunes:[item.work_commune],createdAt:new Date(now).toISOString(),
    externalVerifiedAt:item.verified_at,verificationCheckedAt:item.verified_at,expiresAt:item.valid_through });
  const projector = { project:item => item.active && item.verified && !item.review ? item : null,refreshAt:() => null };
  return { ctx,db,tables,table,calls,mapper,projector,fail(method,name,value) { fault = { method,table:name,value }; },
    async build() { for (let i=0;i<30;i++) { await ctx.advancePublicFeed(projector); if (await ctx.currentPublicFeedManifest()) return; } assert.fail('Incomplete build'); } };
}

test('Digest-bound GitHub proof accepts the exact authorized laboratory producer', () => {
  const h = harness();
  const result = h.ctx.verifySignedBatch(signed(),jwks,now);
  assert.equal(result.batch.records.length,1);
  assert.equal(result.batch.run_id,'123');
});

test('Changed batch bytes fail the signed audience binding', () => {
  const h = harness(), envelope = signed();
  envelope.body_base64 = Buffer.from(JSON.stringify(body({ records:[] }))).toString('base64');
  assert.throws(() => h.ctx.verifySignedBatch(envelope,jwks,now), /Untrusted/);
});

test('Proof rejects forks, main, another workflow and another deployment audience', () => {
  const h = harness();
  for (const change of [{ repository_id:'999' },{ repository_owner_id:'999' },{ ref:'refs/heads/main' },
    { workflow_ref:'other-workflow' },{ aud:'different-app' },{ iss:'https://attacker.test' },{ sub:'repo:fork/repo:ref:any' }]) {
    assert.throws(() => h.ctx.verifySignedBatch(signed(body(),change),jwks,now),/Untrusted/);
  }
});

test('Proof rejects invalid signatures, ambiguous keys and unsupported algorithms', () => {
  const h = harness(), value = signed();
  value.proof.signature = 'a'.repeat(340);
  assert.throws(() => h.ctx.verifySignedBatch(value,jwks,now),/signature/);
  assert.throws(() => h.ctx.verifySignedBatch(signed(),{ keys:[...jwks.keys,...jwks.keys] },now),/ambiguous/);
  assert.throws(() => h.ctx.verifySignedBatch(signed(body(),{}, { alg:'none' }),jwks,now),/algorithm/);
});

test('Historical proof is bounded to 24 hours and never accepted as an unbound bearer request', () => {
  const h = harness();
  assert.equal(h.ctx.verifySignedBatch(signed(),jwks,now + 3600000).batch.run_id,'123');
  assert.throws(() => h.ctx.verifySignedBatch(signed(),jwks,now + 86400001),/issuance/);
  assert.throws(() => h.ctx.verifySignedBatch(signed(body(),{ iat:now/1000 + 120, exp:now/1000 + 420 }),jwks,now),/issuance/);
});

test('Evidence rejects stale checks, future dates, missing deadlines, unconfirmed places and unsafe URLs', () => {
  const h = harness();
  for (const changes of [{ verified_at:new Date(now - 86400001).toISOString() },{ source_published_at:new Date(now + 1000).toISOString() },
    { valid_through:'' },{ valid_through:new Date(now - 1).toISOString() },{ work_commune:'Santiago' },
    { source_url:'https://attacker.test/job' },{ source_url:'https://user:password@www.chiletrabajos.cl/trabajo/job' },
    { application:'javascript:alert(1)' },{ verification_method:'AI guessed worksite' }]) {
    assert.throws(() => h.ctx.validateOffer(offer(changes),now));
  }
});

test('Canonical individual-job identity folds host, protocol, trailing slash and tracking parameters', () => {
  const h = harness();
  assert.equal(h.ctx.jobIdentity('http://chiletrabajos.cl/trabajo/operador-1/?utm_source=x'),h.ctx.jobIdentity(offer().source_url));
});

test('Storing a verified offer confirms a real SDK ID but does not claim publication before the feed', async () => {
  const h = harness();
  const result = await h.ctx.storeVerifiedBatch(body(),'batch-1',h.mapper,now);
  assert.equal(result.stored,1);
  assert.equal(result.published,0);
  assert.equal((await h.ctx.confirmRadarPublications()).published,0);
  assert.equal((await h.ctx.externalRadarStatus()).published,0);
});

test('A null insertion ID never creates a success receipt', async () => {
  const h = harness(), name = 'radar_external_' + h.ctx.jobIdentity(offer().source_url).slice(0,32);
  h.fail('add',name,[null]);
  await assert.rejects(h.ctx.storeVerifiedBatch(body(),'batch-1',h.mapper,now),/insertion failed/);
  assert.equal(h.table('radar_external_pull_state').size,0);
});

test('Failed change registration recovers the already persisted offer without an orphan duplicate', async () => {
  const h = harness();
  h.fail('add','public_feed_changes',[null]);
  await assert.rejects(h.ctx.storeVerifiedBatch(body(),'batch-1',h.mapper,now),/registration failed/);
  await h.ctx.storeVerifiedBatch(body(),'batch-1',h.mapper,now);
  const name = 'radar_external_' + h.ctx.jobIdentity(offer().source_url).slice(0,32);
  assert.equal(h.table(name).size,1);
  assert.equal(h.table('public_feed_changes').size,1);
});

test('Complete feed promotion yields a confirmed publication ID and repeating a batch creates no duplicate', async () => {
  const h = harness();
  await h.build();
  await h.ctx.storeVerifiedBatch(body(),'batch-1',h.mapper,now);
  await h.ctx.advancePublicFeed(h.projector);
  assert.equal((await h.ctx.confirmRadarPublications()).published,1);
  const name = 'radar_external_' + h.ctx.jobIdentity(offer().source_url).slice(0,32);
  const record = [...h.table(name).values()][0];
  assert.ok(record.externalPublishedId);
  assert.ok(record.externalFeedManifest);
  await h.ctx.storeVerifiedBatch(body(),'batch-1',h.mapper,now);
  await h.ctx.advancePublicFeed(h.projector);
  assert.equal((await h.ctx.confirmRadarPublications()).published,1);
  assert.equal((await h.ctx.readPublicFeedPage()).totalJobOffers,1);
  assert.equal(h.table(name).size,1);
});

test('Canonical deduplication prevents the same Chiletrabajos job appearing from the legacy and external sources', async () => {
  const h = harness();
  const old = h.mapper(offer());
  old.url = 'http://chiletrabajos.cl/trabajo/operador-1/?utm_source=old';
  old.verificationCheckedAt = new Date(now - 10000).toISOString();
  delete old.externalVerifiedAt;
  h.table('radar_jobs').set('legacy-job',old);
  await h.build();
  await h.ctx.storeVerifiedBatch(body(),'batch-1',h.mapper,now);
  await h.ctx.advancePublicFeed(h.projector);
  assert.equal((await h.ctx.readPublicFeedPage()).totalJobOffers,1);
  assert.equal(h.table('radar_jobs').size,1,'Legacy source record remains intact');
  assert.equal((await h.ctx.confirmRadarPublications()).published,1);
});

test('Identity conflicts fail visibly instead of deleting duplicate historical rows', async () => {
  const h = harness(), name = 'radar_external_' + h.ctx.jobIdentity(offer().source_url).slice(0,32);
  h.table(name).set('one',{}); h.table(name).set('two',{});
  await assert.rejects(h.ctx.storeVerifiedBatch(body(),'batch-1',h.mapper,now),/Conflicting identity/);
  assert.equal(h.table(name).size,2);
  assert.equal(h.calls.filter(call => call.method === 'delete').length,0);
});

test('Failed receipt write cannot report a successful publication', async () => {
  const h = harness(); await h.build();
  await h.ctx.storeVerifiedBatch(body(),'batch-1',h.mapper,now);
  await h.ctx.advancePublicFeed(h.projector);
  const name = 'radar_external_' + h.ctx.jobIdentity(offer().source_url).slice(0,32);
  h.fail('update',name,[false]);
  await assert.rejects(h.ctx.confirmRadarPublications(),/receipt write failed/);
  assert.equal((await h.ctx.externalRadarStatus()).published,0);
});

test('External processing uses bounded identity tables and saved IDs without a growing-table scan', async () => {
  const h = harness(); await h.build(); h.calls.length = 0;
  await h.ctx.storeVerifiedBatch(body(),'batch-1',h.mapper,now);
  await h.ctx.advancePublicFeed(h.projector);
  await h.ctx.confirmRadarPublications();
  assert.ok(h.calls.filter(call => call.method === 'list').every(call => !['radar_jobs','community_posts'].includes(call.table)));
  assert.ok(h.calls.filter(call => call.method === 'list' && call.table.startsWith('radar_external_')).every(call => call.options.limit <= 2));
});

test('Fixed-source pull rejects corrupted signatures without storing offers and propagates quota errors', async () => {
  const h = harness();
  const response = value => ({ status:200,ok:true,headers:new Headers(),arrayBuffer:async () => Buffer.from(JSON.stringify(value)) });
  const value = signed(); value.proof.signature = 'a'.repeat(340);
  const requested = [];
  h.ctx.fetch = async (url,options) => {
    requested.push({ url,options });
    return response(url.includes('/git/ref/') ? { object:{ sha:'b'.repeat(40) } } : url.includes('/jwks') ? jwks : value);
  };
  const result = await h.ctx.pullRadarBatch(h.mapper);
  assert.equal(result.status,'batch_rejected');
  assert.equal([...h.tables.keys()].filter(key => /^radar_external_[a-f0-9]{32}$/.test(key)).length,0);
  assert.ok(requested.every(request => request.options.redirect === 'error'));
  h.fail('list','radar_external_pull_state',new Error('429 AppDatabaseQuotaExceeded'));
  await assert.rejects(h.ctx.pullRadarBatch(h.mapper),/429/);
});

test('A GitHub transport outage is explicit and leaves the existing feed available', async () => {
  const h = harness(); await h.build();
  h.ctx.fetch = async () => { throw new Error('DNS failure'); };
  assert.equal((await h.ctx.pullRadarBatch(h.mapper)).status,'transport_unavailable');
  assert.equal((await h.ctx.externalRadarStatus()).published,0);
  assert.equal((await h.ctx.readPublicFeedPage()).totalJobOffers,0);
});

test('A valid signed empty pilot is reported as no verified offers, with zero publications', async () => {
  const h = harness(), envelope = signed(body({ records:[] }));
  const response = value => ({ status:200,ok:true,headers:new Headers(),arrayBuffer:async () => Buffer.from(JSON.stringify(value)) });
  h.ctx.fetch = async url => response(url.includes('/git/ref/') ? { object:{ sha:'b'.repeat(40) } } : url.includes('/jwks') ? jwks : envelope);
  assert.equal((await h.ctx.pullRadarBatch(h.mapper)).status,'no_verified_offers');
  assert.equal((await h.ctx.externalRadarStatus()).published,0);
});

test('Operator diagnostics return public counts and never return proofs or backup payloads', async () => {
  const h = harness();
  const patch = JSON.parse(readFileSync(new URL('../integrations/appdeploy/ingestion-repair.json',import.meta.url),'utf8'));
  const route = patch.files[0].diffs.find(diff => diff.to.includes("'GET /api/ops/radar-external':")).to;
  h.ctx.json = body => ({ statusCode:200,body });
  vm.runInContext(stripTypeScriptTypes('globalThis.routes = {' + route + '}',{ mode:'strip' }),h.ctx);
  const response = await h.ctx.routes['GET /api/ops/radar-external'][0]({});
  assert.equal(response.body.published,0);
  assert.ok(!JSON.stringify(response.body).includes('proof'));
  assert.ok(!JSON.stringify(response.body).includes('body_base64'));
  assert.equal(h.calls.filter(call => ['add','update','delete'].includes(call.method)).length,0);
});
