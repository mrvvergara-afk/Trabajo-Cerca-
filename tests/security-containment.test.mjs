import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { createHash, randomBytes } from 'node:crypto';
import test from 'node:test';
const root='integrations/appdeploy';
const read=name=>fs.readFileSync(root+'/'+(name==='index.ts'?'security-containment-index.ts':name),'utf8');
function load(name,exports,deps={}) {
  const code=stripTypeScriptTypes(read(name),{mode:'strip'}).replace(/^import .*;$/gm,'').replace(/^export /gm,'');
  return vm.runInNewContext('(function(){'+code+';return {'+exports+'};})()',
    {URL,Request,Response,AbortSignal,Buffer,Intl,Date,Map,Set,Promise,console,createHash,randomBytes,...deps});
}
function database() {
  const rows=new Map();
  return {rows,get:async(_table,[key])=>[rows.has(key)?{...rows.get(key)}:null],tx:{
    add:async(_table,[row])=>{if(rows.has(row.id))return [null];rows.set(row.id,{...row});return [row.id];},
    update:async(_table,[item])=>{const old=rows.get(item.id);if(!old || old.count!==item.if.count)return [false];rows.set(item.id,{...old,...item.record});return [true];},
  }};
}
const error=(message,status)=>({statusCode:status,body:JSON.stringify({error:message})});
const isAppDatabaseError=e=>Boolean(e?.code?.startsWith('AppDatabase'));
test('remote AI is denied before touching the real capability; owner tokens are cryptographically random',async()=>{
  let calls=0;
  const policy=load('security-policy.ts','SECURITY_POLICY,denyRemoteCapabilities,opaqueOwnerToken',{fetchPublicPage:async()=>{throw Error('unexpected fetch');},publicSourceAdapter:()=>null});
  const ai=policy.denyRemoteCapabilities({ocr:async()=>{calls++;},scrape:async()=>{calls++;}});
  await assert.rejects(ai.ocr({}),/remote_capability_disabled/);
  await assert.rejects(ai.scrape({}),/remote_capability_disabled/);
  assert.equal(calls,0);assert.equal(policy.SECURITY_POLICY.paidProviders,false);
  const values=new Set(Array.from({length:100},()=>policy.opaqueOwnerToken()));
  assert.equal(values.size,100);assert([...values].every(v=>/^[A-Za-z0-9_-]{43}$/.test(v)));
});
test('legacy requests cannot bypass publisher/robots limits or forward POST bodies',async()=>{
  let reads=0;
  const policy=load('security-policy.ts','checkedLegacyFetch',{publicSourceAdapter:()=>({}),
    fetchPublicPage:async()=>{reads++;return {error:'robots_disallowed',status:0,raw:'must not leak'};}});
  await assert.rejects(policy.checkedLegacyFetch('https://api.exa.ai/search',{method:'POST',body:'secret'}));
  await assert.rejects(policy.checkedLegacyFetch(new Request('https://example.org/',{method:'POST'})));
  assert.equal(reads,0);
  const response=await policy.checkedLegacyFetch('https://munimulchen.cl/oferta/');
  assert.equal(response.status,503);assert.equal(await response.text(),'');assert.equal(reads,1);
});
test('literal and normalized IPs, local hosts, credential URLs and deceptive publishers are rejected before network',()=>{
  const adapter=load('public-source-adapters.ts','safePublicUrl,publicPublisher');
  for(const url of ['http://127.0.0.1/oferta','http://2130706433/oferta','http://0x7f000001/oferta','https://[::1]/','https://localhost/oferta','https://device.local/oferta','https://user:secret@munimulchen.cl/oferta/'])assert.equal(adapter.safePublicUrl(url),null,url);
  assert.equal(adapter.publicPublisher('https://munimulchen.cl.attacker.example/oferta/'),null);
  assert(adapter.publicPublisher('https://munimulchen.cl/oferta/'));
});
test('rotating body tokens does not reset durable quota, including a fresh middleware instance',async()=>{
  const db=database();const quota=load('security-quota.ts','publicQuota',{db,error,isAppDatabaseError});
  const ctx=token=>({body:{clientToken:token},event:{requestContext:{http:{sourceIp:'198.51.100.4'}}}});
  assert.equal(await quota.publicQuota('test',2,3600000,20)(ctx('first-token')),undefined);
  assert.equal(await quota.publicQuota('test',2,3600000,20)(ctx('other-token')),undefined);
  assert.equal((await quota.publicQuota('test',2,3600000,20)(ctx('rotated-again'))).statusCode,429);
});
test('concurrent global admissions never exceed the durable cap and unknown writes fail closed',async()=>{
  const db=database();const quota=load('security-quota.ts','publicQuota',{db,error,isAppDatabaseError});
  const guard=quota.publicQuota('parallel',100,3600000,4);
  const results=await Promise.all(Array.from({length:30},(_,i)=>guard({body:{},event:{requestContext:{http:{sourceIp:'198.51.100.'+i}}}})));
  assert(results.filter(r=>r===undefined).length<=4);assert(results.some(r=>r?.statusCode===429));
  const failing=load('security-quota.ts','publicQuota',{db:{get:async()=>{throw {code:'AppDatabaseUnknownOutcome'};}},error,isAppDatabaseError});
  assert.equal((await failing.publicQuota('failed',1,1000,2)({event:{}})).statusCode,503);
});
test('missing source address uses a shared conservative bucket instead of disabling protection',async()=>{
  const quota=load('security-quota.ts','publicQuota',{db:database(),error,isAppDatabaseError});
  const guard=quota.publicQuota('missing-address',1,3600000,20);
  assert.equal(await guard({event:{},body:{clientToken:'one'}}),undefined);
  assert.equal((await guard({event:{headers:{'x-forwarded-for':'198.51.100.8'}},body:{clientToken:'two'}})).statusCode,429);
});
test('manual routes deny anonymous and ordinary authenticated users without running collectors',async()=>{
  let effects=0;let quotaCalls=0;
  const routes=load('index.ts','handler',{
    confirmRadarPublications:()=>{effects++;},ai:{},denyRemoteCapabilities:()=>({}),checkedLegacyFetch:()=>{effects++;},
    SECURITY_POLICY:{paidProviders:false,remoteAi:false,externalAnalytics:false,manualOperations:false},
    publicQuota:()=>()=>{quotaCalls++;},opaqueOwnerToken:()=>'',reviewedReceiver:()=>()=>{effects++;},
    router:r=>r,json:(data,status=200)=>({statusCode:status,body:JSON.stringify(data)}),error,
    requireAuth:()=>ctx=>ctx.user?undefined:error('Unauthorized',401),
  }).handler;
  for(const key of ['POST /api/ops/radar-external/consume','POST /api/ops/free-public-sources/run','POST /api/radar/social-run','POST /api/radar/social-collect','GET /api/radar/run-territorial-now']){
    for(const [user,status] of [[undefined,401],[{userId:'ordinary-user'},403]]){
      let response;for(const middleware of routes[key]){response=await middleware({user});if(response)break;}
      assert.equal(response.statusCode,status,key);
    }
  }
  assert.equal((await routes['POST /api/radar/photo-tip'][0]({body:{}})).statusCode,503);
  assert.equal(JSON.parse((await routes['POST /api/analytics'][0]({body:{}})).body).disabled,true);
  let denied;for(const middleware of routes['POST /api/notifications/test']){denied=await middleware({});if(denied)break;}
  assert.equal(denied.statusCode,401);assert.equal(quotaCalls,0);
  assert.equal(effects,0);
});
test('original source date is immutable on rediscovery; new impression events have a backend contract',()=>{
  const source=read('index.ts');
  assert(source.includes('sourcePublishedAt:base.sourcePublishedAt || freshIncoming,'));
  assert(!source.includes('Date.parse(freshIncoming) > Date.parse(base.sourcePublishedAt)'));
  assert(source.includes("'tc_sponsor_viewable_impression'"));assert(source.includes("'visible_ms'"));
});
