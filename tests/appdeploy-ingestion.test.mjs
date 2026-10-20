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
const retentionCode=code('../integrations/appdeploy/offer-retention.ts');
const ingestionCode = code('../integrations/appdeploy/radar-ingestion.ts');
const cmpcCode=code('../integrations/appdeploy/cmpc-evidence.ts');
const adapterCode = code('../integrations/appdeploy/public-source-adapters.ts');
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
  vm.runInContext(adapterCode,ctx);
  vm.runInContext(feedCode,ctx);
  vm.runInContext(cmpcCode,ctx);
  vm.runInContext(retentionCode,ctx);
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

function cmpcOffer() {
  const fixture=JSON.parse(readFileSync(new URL('fixtures/cmpc-public-18859.json',import.meta.url),'utf8'));
  const page=fixture.page,checked='2026-10-19T23:45:00.000Z',candidate=digest(page.url).slice(0,24);
  return offer({source_url:page.url,application:page.url,title:'Ingeniero/a Procesos y Excelencia Sr',company:'CMPC',work_commune:'Collipulli',work_site:'Ubicación: Planta Pacífico - Mininco.',source_published_at:'2026-10-13T03:00:00.000Z',valid_through:'2027-01-09T03:00:00.000Z',verified_at:checked,candidate_id:candidate,idempotency_key:'radar:'+candidate,
    verification_method:'CMPC · portal de empleo public career page + official requisition response',
    source_evidence:{source_url:page.url,sha256:digest(page.text),text:page.text,complete_document:true},
    cmpc_evidence:{schema:'trabajo-cerca.cmpc-public-review.v1',requisition_id:18859,api_url:'https://us.api.csod.com/rec-job-search/external/jobs',api_json:fixture.api_raw,api_sha256:digest(fixture.api_raw),workplace_literal:'Ubicación: Planta Pacífico - Mininco.',employer_literal:'En CMPC',application_label:'Apply Now',reviewed_at:checked,date_precision:'day',deadline_policy:'start_of_local_date'}});
}
test('the receiver requires CMPC primary evidence and cannot accept a search page or forged JobPosting method',()=>{
  const h=harness(),item=cmpcOffer(),checked=Date.parse(item.verified_at);
  assert.equal(h.ctx.validateOffer(item,checked),digest(item.source_url));
  assert.throws(()=>h.ctx.validateOffer({...item,cmpc_evidence:undefined},checked),/Invalid CMPC/);
  assert.throws(()=>h.ctx.validateOffer({...item,verification_method:'CMPC · portal de empleo individual page + matching JobPosting'},checked),/Unsupported/);
  assert.throws(()=>h.ctx.validateOffer({...item,source_url:'https://cmpc.csod.com/ux/ats/careersite/4/home?c=cmpc'},checked));
});
test('accepted CMPC records keep the original public proof in durable storage on idempotent retries',async()=>{
  const h=harness(),item=cmpcOffer(),checked=Date.parse(item.verified_at),batch=body({records:[item]});
  await h.ctx.storeVerifiedBatch(batch,'proof-cmpc',h.mapper,checked);
  await h.ctx.storeVerifiedBatch(batch,'proof-cmpc',h.mapper,checked);
  const rows=[...h.table('radar_external_'+digest(item.source_url).slice(0,32)).values()];
  assert.equal(rows.length,1);assert.equal(rows[0].cmpcPrimaryReview.api_sha256,item.cmpc_evidence.api_sha256);
  assert.equal(rows[0].primarySourceEvidence.text,item.source_evidence.text);
});

test('The scheduled producer can use main only with the matching workflow, branch, subject and signed body',()=>{
  const h=harness(),batch=body({ref:'refs/heads/main'});
  assert.equal(h.ctx.verifySignedBatch(signed(batch),jwks,now).batch.ref,'refs/heads/main');
  assert.throws(()=>h.ctx.verifySignedBatch(signed(batch,{ref:'refs/heads/other'}),jwks,now),/Untrusted/);
  assert.throws(()=>h.ctx.verifySignedBatch(signed(batch,{workflow_ref:batch.repository+'/.github/workflows/other.yml@'+batch.ref}),jwks,now),/Untrusted/);
});

test('Real GitHub subject with immutable owner and repository IDs is accepted', () => {
  const h = harness();
  const sub = 'repo:mrvvergara-afk@291955988/Trabajo-Cerca-@1411752840:ref:refs/heads/repair/radar-audit-2026-10-11';
  const result = h.ctx.verifySignedBatch(signed(body(),{ sub }),jwks,now);
  assert.equal(result.batch.run_id,'123');
});

test('The isolated document branch requires the same signed repository, workflow and exact branch', () => {
  const h=harness(), batch=body({ref:'refs/heads/repair/mulchen-captura-2026-10-17'});
  assert.equal(h.ctx.verifySignedBatch(signed(batch),jwks,now).batch.ref,batch.ref);
  assert.throws(()=>h.ctx.verifySignedBatch(signed(body({ref:batch.ref+'-other'})),jwks,now),/Untrusted/);
  assert.throws(()=>h.ctx.verifySignedBatch(signed(batch,{workflow_ref:batch.repository+'/.github/workflows/other.yml@'+batch.ref}),jwks,now),/Untrusted/);
  assert.throws(()=>h.ctx.verifySignedBatch(signed(batch,{repository_owner_id:'999'}),jwks,now),/Untrusted/);
});

test('Immutable subjects from other IDs, owners, repository names or branches are rejected', () => {
  const h = harness();
  const valid = 'repo:mrvvergara-afk@291955988/Trabajo-Cerca-@1411752840:ref:refs/heads/repair/radar-audit-2026-10-11';
  for (const sub of [valid.replace('@291955988','@999'),valid.replace('@1411752840','@999'),
    valid.replace('mrvvergara-afk@','fork-owner@'),valid.replace('/Trabajo-Cerca-@','/other-repo@'),
    valid.replace('refs/heads/repair/radar-audit-2026-10-11','refs/heads/main')]) {
    assert.throws(() => h.ctx.verifySignedBatch(signed(body(),{ sub }),jwks,now),/Untrusted GitHub subject/);
  }
});

test('Changed batch bytes fail the signed audience binding', () => {
  const h = harness(), envelope = signed();
  envelope.body_base64 = Buffer.from(JSON.stringify(body({ records:[] }))).toString('base64');
  assert.throws(() => h.ctx.verifySignedBatch(envelope,jwks,now), /Untrusted/);
});

test('Proof rejects forks, mismatched branch claims, another workflow and another deployment audience', () => {
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

test('Ingestion accepts original dates exactly 45 days old and blocks older dates before any database write', () => {
  const h = harness();
  const edge = now-45*86400000;
  h.ctx.validateOffer(offer({ source_published_at:new Date(edge).toISOString() }), now);
  for (const stamp of [edge-1, now-50*86400000]) {
    assert.throws(() => h.ctx.validateOffer(offer({ source_published_at:new Date(stamp).toISOString() }), now), /Stale/);
  }
  assert.equal(h.calls.length, 0);
});

test('Every primary portal requires its matching verification method and its individual identity', () => {
  const h=harness();
  for (const [source_url,source] of [['https://cl.indeed.com/viewjob?jk=0123456789abcdef','Indeed'],
    ['https://cl.computrabajo.com/ofertas-de-trabajo/oferta-de-trabajo-de-operador-AB12','Computrabajo'],
    ['https://cl.linkedin.com/jobs/view/operador-4456391320/','LinkedIn'],
    ['https://www.laborum.cl/empleos/operador-123456789.html','Laborum']]) {
    h.ctx.validateOffer(offer({ source_url,source,verification_method:source+' individual page + matching JobPosting' }),now);
    assert.throws(()=>h.ctx.validateOffer(offer({ source_url,verification_method:'AI guessed worksite' }),now));
  }
  assert.throws(()=>h.ctx.validateOffer(offer({ source_url:'https://www.opcionempleo.cl/jobad/cl0123456789abcdef' }),now));
});

test('A missing closing date requires fresh form proof and cannot be substituted by a contact', () => {
  const h=harness(),source_url='https://cl.indeed.com/viewjob?jk=0123456789abcdef';
  const row=offer({ source_url,source:'Indeed',valid_through:'',application:'https://cl.indeed.com/postular/123',
    verification_method:'Indeed individual page + matching JobPosting',validity_method:'live_application',
    validity_evidence:{ form_url:source_url,form_action:'https://cl.indeed.com/postular/123',checked_at:new Date(now).toISOString(),source_sha256:'a'.repeat(64) } });
  h.ctx.validateOffer(row,now);
  for (const change of [{ validity_evidence:undefined },{ application:'mailto:empleo@example.cl' },
    { validity_evidence:{ ...row.validity_evidence,form_url:source_url.replace('0123456789abcdef','abcdef0123456789') } },
    { validity_evidence:{ ...row.validity_evidence,checked_at:new Date(now-1000).toISOString() } }]) assert.throws(()=>h.ctx.validateOffer({ ...row,...change },now));
});

test('A local document proof must be complete, hashed and tied to the literal source', () => {
  const h=harness(),source_url='https://www.munilumaco.cl/afiches/oferta-laboral.png';
  const row=offer({ source_url,source:'Municipalidad de Lumaco',verification_method:'Municipalidad de Lumaco individual notice + local document text',
    source_evidence:{ sha256:'a'.repeat(64),source_url,complete_document:true,text:'Cargo: Operador\nEmpresa: Empresa de prueba\nLugar de trabajo: Angol\nEnviar CV a empleo@example.cl' } });
  h.ctx.validateOffer(row,now);
  h.ctx.validateOffer({...row,application:'tel:+56912345678'},now);
  assert.throws(()=>h.ctx.validateOffer({...row,application:'tel:+54912345678'},now));
  assert.throws(()=>h.ctx.validateOffer(offer({application:'tel:+56912345678'}),now));
  assert.throws(()=>h.ctx.validateOffer({ ...row,source_evidence:{ ...row.source_evidence,complete_document:false } },now));
  assert.throws(()=>h.ctx.validateOffer({ ...row,source_evidence:undefined },now));
});

test('A historical exact payload keeps its valid signature and receipts; it never refreshes source evidence',async()=>{
  const h=harness(),old=now-2*86400000;
  const batch=body({generated_at:new Date(old).toISOString()});
  const envelope=signed(batch,{iat:old/1000,exp:old/1000+300});
  const accepted=digest(Buffer.from(envelope.body_base64,'base64'));
  assert.throws(()=>h.ctx.verifySignedBatch(envelope,jwks,now),/issuance/);
  h.ctx.verifySignedBatch(envelope,jwks,now,accepted);
  const tampered={...envelope,proof:{...envelope.proof,signature:'a'.repeat(340)}};
  assert.throws(()=>h.ctx.verifySignedBatch(tampered,jwks,now,accepted),/signature/);
  const name='radar_external_pull_state';
  h.table(name).set('accepted',{digest:accepted,dataCommit:'b'.repeat(40),status:'published',publishedCount:1,
    storedCount:1,receipts:[{table:'old',id:'source-id',identity:'d'.repeat(64),candidateId:'a'.repeat(24)}]});
  const response=value=>({status:200,ok:true,headers:new Headers(),arrayBuffer:async()=>Buffer.from(JSON.stringify(value))});
  h.ctx.fetch=async url=>response(url.includes('/git/ref/')?{object:{sha:'c'.repeat(40)}}:url.includes('/jwks')?jwks:envelope);
  assert.equal((await h.ctx.pullRadarBatch(h.mapper)).status,'unchanged_batch');
  assert.equal(h.calls.filter(call=>/^radar_external_[a-f0-9]{32}$/.test(call.table||'')).length,0);
  assert.equal(h.table(name).get('accepted').publishedCount,1);
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

test('A backup-only Git commit preserves confirmed receipts without requeuing the same signed batch', async () => {
  const h = harness(); await h.build();
  const envelope = signed();
  let head = 'b'.repeat(40);
  const response = value => ({ status:200,ok:true,headers:new Headers(),arrayBuffer:async () => Buffer.from(JSON.stringify(value)) });
  h.ctx.fetch = async url => response(url.includes('/git/ref/') ? { object:{ sha:head } } : url.includes('/jwks') ? jwks : envelope);
  await h.ctx.pullRadarBatch(h.mapper);
  await h.ctx.advancePublicFeed(h.projector);
  await h.ctx.confirmRadarPublications();
  const before = await h.ctx.externalRadarStatus();
  h.calls.length = 0;
  head = 'c'.repeat(40);
  const result = await h.ctx.pullRadarBatch(h.mapper);
  const after = await h.ctx.externalRadarStatus();
  assert.equal(after.published,1);
  assert.equal(after.status,'published');
  assert.equal(after.dataCommit,head);
  assert.deepEqual(after.receipts,before.receipts);
  assert.equal(after.feedManifestId,before.feedManifestId);
  assert.equal(h.calls.filter(call => call.method === 'add' && call.table === 'public_feed_changes').length,0);
  assert.equal(h.calls.filter(call => call.method === 'update' && /^radar_external_[a-f0-9]{32}$/.test(call.table)).length,0);
  assert.equal(result.stored,0);
  assert.equal(result.status,'unchanged_batch');
});

test('A failed data-head checkpoint recovers the complete persisted batch without duplicate change events', async () => {
  const h = harness(), envelope = signed();
  const head = 'b'.repeat(40);
  const response = value => ({ status:200,ok:true,headers:new Headers(),arrayBuffer:async () => Buffer.from(JSON.stringify(value)) });
  h.ctx.fetch = async url => response(url.includes('/git/ref/') ? { object:{ sha:head } } : url.includes('/jwks') ? jwks : envelope);
  h.fail('update','radar_external_pull_state',[false]);
  await assert.rejects(h.ctx.pullRadarBatch(h.mapper),/state write failed/);
  assert.equal(h.table('public_feed_changes').size,1);
  const result = await h.ctx.pullRadarBatch(h.mapper);
  assert.equal(h.table('public_feed_changes').size,1);
  const name = 'radar_external_' + h.ctx.jobIdentity(offer().source_url).slice(0,32);
  assert.equal(h.table(name).size,1);
  assert.equal((await h.ctx.externalRadarStatus()).dataCommit,head);
  assert.equal((await h.ctx.externalRadarStatus()).published,0);
  assert.equal(result.status,'unchanged_batch');
});

test('A cached batch digest does not bypass signature verification for a new data commit', async () => {
  const h = harness();
  let envelope = signed(), head = 'b'.repeat(40);
  const response = value => ({ status:200,ok:true,headers:new Headers(),arrayBuffer:async () => Buffer.from(JSON.stringify(value)) });
  h.ctx.fetch = async url => response(url.includes('/git/ref/') ? { object:{ sha:head } } : url.includes('/jwks') ? jwks : envelope);
  await h.ctx.pullRadarBatch(h.mapper);
  const acceptedHead = head;
  h.calls.length = 0;
  head = 'c'.repeat(40);
  envelope = { ...envelope,proof:{ ...envelope.proof,signature:'a'.repeat(340) } };
  assert.equal((await h.ctx.pullRadarBatch(h.mapper)).status,'batch_rejected');
  assert.equal((await h.ctx.externalRadarStatus()).dataCommit,acceptedHead);
  assert.equal(h.calls.filter(call => call.method === 'add' && call.table === 'public_feed_changes').length,0);
  assert.equal(h.calls.filter(call => call.method === 'update' && /^radar_external_[a-f0-9]{32}$/.test(call.table)).length,0);
});

test('A different signed batch still updates the same canonical offer with its original ID', async () => {
  const h = harness();
  let envelope = signed(), head = 'b'.repeat(40);
  const response = value => ({ status:200,ok:true,headers:new Headers(),arrayBuffer:async () => Buffer.from(JSON.stringify(value)) });
  h.ctx.fetch = async url => response(url.includes('/git/ref/') ? { object:{ sha:head } } : url.includes('/jwks') ? jwks : envelope);
  await h.ctx.pullRadarBatch(h.mapper);
  const name = 'radar_external_' + h.ctx.jobIdentity(offer().source_url).slice(0,32);
  const id = [...h.table(name).keys()][0];
  head = 'c'.repeat(40);
  envelope = signed(body({ run_id:'124',records:[offer({ title:'Operador actualizado' })] }));
  assert.equal((await h.ctx.pullRadarBatch(h.mapper)).stored,1);
  assert.deepEqual([...h.table(name).keys()],[id]);
  assert.equal(h.table(name).get(id).title,'Operador actualizado');
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
test('signed receiver refuses an application belonging to a different individual job',()=>{
 const h=harness();assert.throws(()=>h.ctx.validateOffer(offer({application:'https://www.chiletrabajos.cl/trabajo/otro-cargo-2'}),now),/Application belongs to another job/);
});
