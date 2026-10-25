import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

const patch=JSON.parse(readFileSync(new URL('../integrations/appdeploy/social-publication-simplification-2026-10-20.json',import.meta.url),'utf8'));
const pure=readFileSync(new URL('../integrations/appdeploy/social-evidence.ts',import.meta.url),'utf8').replace(/^export /gm,'');
const application=readFileSync(new URL('../integrations/appdeploy/social-application.ts',import.meta.url),'utf8').replace(/^import .*;\n/,'').replace(/^export /gm,'');
let verifier=patch.baseline_verifier;
for (const diff of patch.diffs) if(verifier.includes(diff.from)) verifier=verifier.replace(diff.from,diff.to);
const now=Date.parse('2026-10-20T10:00:00Z');
class Clock extends Date {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const places=text=>['Angol'].filter(place=>text.includes(place));
function harness(applicationPage={status:200,raw:'<h1>Postulación</h1>'}) {
 const calls=[];
 const h=vm.createContext({Date:Clock,URL,Intl,console,AbortSignal,
  publicJobExclusion:()=>'',unsafeContentReason:()=>'',isLikelyJobOpportunity:()=>true,publicSourceAdapter:()=>null,
  parseDiscoveryDate:value=>Date.parse(value)||undefined,staleDiscoveryDate:value=>now-Date.parse(value)>45*86400000,
  verificationTargets:item=>item.workCommunes,extractCommunes:places,sourceDateLabel:value=>value,
  offerRetentionReason:()=>null,VERIFICATION_VERSION:'test',
  fetchPublicPage:async url=>{calls.push(url);return applicationPage;},
  fetch:async()=>{throw new Error('The social original must not be fetched twice');},
  ai:{scrape:async()=>{throw new Error('Paid scrape must not run');}},
 });
 vm.runInContext(stripTypeScriptTypes(pure+'\n'+application+'\n'+verifier,{mode:'strip'}),h);
 return {h,calls};
}
function record(h,postulation='Enviar CV a empleo@empresa.cl',extra='') {
 const text='Oferta laboral Operador forestal\nEmpresa: Forestal de prueba\nLugar de trabajo: Angol\n'+postulation+'\n'+extra;
 const {evidence}=h.prepareSocialEvidence({postUrl:'https://www.instagram.com/p/aviso123/',postDate:'2026-10-19',
  title:'Operador forestal',company:'Forestal de prueba',text},'2026-10-19T12:00:00Z',places,now);
 return {id:'candidate-test',kind:'job_offer',title:evidence.title,company:evidence.company,note:text,url:evidence.postUrl,
  socialEvidence:evidence,sourcePublishedAt:evidence.postDate,workCommunes:['Angol'],discoveredBy:'radar-social-visual',
  createdAt:'2026-10-19T12:00:00Z',review:true,verified:false};
}

test('the actual verifier admits complete caption/poster evidence without a closing date or second social fetch',async()=>{
 const {h,calls}=harness();const result=await h.verifyPendingOffer(record(h));
 assert.equal(result.record.verified,true);assert.equal(result.record.review,false);assert.equal(calls.length,0);
 assert.equal(result.record.expiresAt,undefined);assert.equal(result.record.sourcePublishedAt,'2026-10-19T03:00:00.000Z');
});
test('presential postulation uses the stated address without contacting the institution',async()=>{
 const {h,calls}=harness();const result=await h.verifyPendingOffer(record(h,'Postulación presencial\nAndrés Bello N° 146, Primer Piso'));
 assert.equal(result.record.verified,true);assert.match(result.record.verificationReason,/dirección presencial/);assert.equal(calls.length,0);
});
test('an application URL is checked once with the existing public reader',async()=>{
 const {h,calls}=harness();const result=await h.verifyPendingOffer(record(h,'Postula en: https://wof-chile.com/postular'));
 assert.equal(result.record.verified,true);assert.deepEqual(calls,['https://wof-chile.com/postular']);
});
test('robots errors and login/challenge pages at the destination never approve a new offer',async()=>{
 for (const page of [{status:0,raw:'',error:'robots_disallowed'}, {status:200,raw:'<h1>Iniciar sesión</h1>'},
  {status:429,raw:''}, {status:200,raw:'Verify you are human'}]) {
 const {h}=harness(page);const result=await h.verifyPendingOffer(record(h,'Postular: https://wof-chile.com/postular'));
 assert.equal(result.record.verified,false);assert.equal(result.record.review,true);
 }
});
test('an explicit destination closure rejects the vacancy',async()=>{
 const {h}=harness({status:200,raw:'<h1>Postulaciones cerradas</h1>'});
 const result=await h.verifyPendingOffer(record(h,'Postula en: https://wof-chile.com/postular'));
 assert.equal(result.record.active,false);assert.equal(result.record.verified,false);
});
test('a caption close or past stated deadline cannot pass the simplified route',async()=>{
 for (const suffix of ['Postulaciones cerradas','Plazo de postulación: 18 de octubre de 2026']) {
 const {h,calls}=harness();const result=await h.verifyPendingOffer(record(h,undefined,suffix));
 assert.equal(result.record.verified,false);assert.equal(calls.length,0);
 }
});
test('missing original date or missing literal employer still cannot become verified',async()=>{
 for (const field of ['postDate','company']) {
 const {h,calls}=harness();const item=record(h);item.socialEvidence[field]='';
 const result=await h.verifyPendingOffer(item);assert.equal(result.record.verified,false);assert.equal(calls.length,0);
 }
});
test('a temporary destination problem preserves a previously approved offer without refreshing its approval date',async()=>{
 const {h}=harness({status:429,raw:''});const item=record(h,'Postular: https://wof-chile.com/postular');
 Object.assign(item,{verified:true,review:false,verifiedAt:'2026-10-19T13:00:00Z'});
 const result=await h.verifyPendingOffer(item);assert.equal(result.record.verified,true);assert.equal(result.record.active,true);
 assert.equal(result.record.verifiedAt,item.verifiedAt);assert.equal(result.record.lastVerifiedAt,undefined);
});

test('a previously verified offer is closed when its own caption explicitly says closed',async()=>{
 const {h,calls}=harness();const item=record(h,undefined,'Postulaciones cerradas');
 Object.assign(item,{verified:true,review:false,verifiedAt:'2026-10-19T13:00:00Z'});
 const result=await h.verifyPendingOffer(item);assert.equal(result.record.active,false);assert.equal(result.record.verified,false);assert.equal(calls.length,0);
});
