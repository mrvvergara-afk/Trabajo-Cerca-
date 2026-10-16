import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
const delivery=JSON.parse(readFileSync(new URL('../integrations/appdeploy/public-adapters-controller-excerpts.json',import.meta.url),'utf8'));
const code=stripTypeScriptTypes(delivery.verifier+'\n'+delivery.bridge,{ mode:'strip' });
const source='https://cl.indeed.com/viewjob?jk=0123456789abcdef';
function harness(status) {
  let paid=0;
  const context={ Date,URL,unsafeContentReason:()=>'',isLikelyJobOpportunity:()=>true,
    publicSourceAdapter:()=>({ name:'Indeed' }),fetchPublicPage:async()=>({ url:source,status,raw:'',error:status===0?'source_unavailable':undefined }),
    evaluatePublicJob:()=>({ status:'verified',reason:'literal-source',url:source,title:'Operador real',company:'Empresa real',work_commune:'Angol',source_published_at:'2026-10-12T12:00:00Z' }),
    verifiedPublicRecord:row=>({ title:row.title,company:row.company,workCommunes:[row.work_commune],review:false,verified:true,active:true }),
    sourceDateLabel:row=>row,VERIFICATION_VERSION:'test',ai:{scrape:async()=>{paid++;throw new Error('Paid fallback forbidden');}} };
  if (status!==200)context.evaluatePublicJob=()=>({status:'pending',reason:'HTTP '+status});
  vm.createContext(context);vm.runInContext(code,context);return {context,paid:()=>paid};
}
test('The actual native portal verifier uses source fields rather than the search town or publisher as employer',async()=>{
  const h=harness(200);const result=await h.context.verifyPendingOffer({ id:'one',url:source,title:'Pista',company:'Portal',workCommunes:['Renaico'],createdAt:'2026-10-10',area:'Pendiente' });
  assert.equal(result.record.company,'Empresa real');assert.deepEqual([...result.record.workCommunes],['Angol']);assert.equal(h.paid(),0);
});
test('The actual native verifier cannot use indexed or paid fallback evidence when a supported portal is blocked',async()=>{
  const h=harness(403);const result=await h.context.verifyPendingOffer({ id:'one',url:source,title:'Pista',company:'Portal',verified:true,review:false });
  assert.equal(result.record.verified,false);assert.equal(result.record.review,true);assert.equal(h.paid(),0);
});
test('The actual external mapper labels the portal and keeps an absent employer deadline distinct from visibility expiry',()=>{
  const h=harness(200);const row=h.context.externalOfferRecord({ source_url:source,title:'Operador',company:'Empresa',work_commune:'Angol',source_published_at:'2026-10-12T12:00:00Z',valid_through:'',application:'https://cl.indeed.com/postular/123',validity_method:'live_application' });
  assert.equal(row.source,'Indeed');assert.equal(row.sourceValidThrough,null);assert.equal(row.until,undefined);assert.match(row.note,/no informa cierre/);
});
