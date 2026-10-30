import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const mod=await import('../qa-output/mulchen/test-runtime.mjs');
const archived=JSON.parse(readFileSync('qa/archived-official-evidence.json','utf8'));
const live=JSON.parse(readFileSync('qa-output/mulchen/official-live.json','utf8'));
const sourceUrl='https://www.munimulchen.cl/oferta-laboral-02-operarios-agrarios-cosecha-de-arandanos/';
const indexUrl='https://www.munimulchen.cl/pagina-central-ofertas-laborales/';
const metadataUrl='https://www.munimulchen.cl/wp-json/wp/v2/pages/17979';
const source=live.sources.source?.raw||archived.source_html;
const index=live.sources.index?.raw||archived.index_html;
const metadata=live.sources.metadata?.raw||archived.metadata_json;
const checked=()=>new Date().toISOString();
function context(){return {index:{url:indexUrl,status:200,raw:index},metadata:{url:metadataUrl,status:200,raw:metadata},checkedAt:checked()};}
function evaluate(raw=source,ctx=context(),now=Date.now()){return mod.evaluateMunicipalOffer(sourceUrl,raw,ctx,now);}
const report={syntheticOperationalOffers:0,productionWrites:0,engineTests:{},liveEvidence:!!(live.sources.source?.raw&&live.sources.index?.raw&&live.sources.metadata?.raw)};

test('missing JobPosting was the original blocker; official evidence now verifies one offer with 100 positions',()=>{
 assert.equal(mod.evaluatePublicJob(sourceUrl,source).reason,'structured_jobposting_missing');
 const v=evaluate();assert.equal(v.status,'verified');assert.equal(v.vacancies,100);
 assert.equal(v.source_published_at,new Date(JSON.parse(metadata).date_gmt+'Z').toISOString());
});
test('original date is official date_gmt, not modified_gmt, the upload path or observation time',()=>{
 const v=evaluate();assert.equal(v.source_published_at,new Date(JSON.parse(metadata).date_gmt+'Z').toISOString());
 assert.equal(v.valid_through,'');assert.equal(v.validity_method,'official_open_status');
 assert.notEqual(v.source_published_at,new Date(JSON.parse(metadata).modified_gmt+'Z').toISOString());
 assert.equal(v.company,'Empresa del rubro agrícola');assert.equal(v.official_evidence.employerIdentity,'not_named_by_publisher');
});
test('officially open does not invent a missing publication date',()=>{
 const c=context(),m=JSON.parse(metadata);delete m.date_gmt;c.metadata.raw=JSON.stringify(m);
 assert.equal(evaluate(source,c).reason,'official_original_date_missing_or_future');
});
test('modified_gmt is not accepted as original date even when recent',()=>{
 const c=context(),m=JSON.parse(metadata);m.date_gmt=null;m.modified_gmt=new Date().toISOString().slice(0,19);c.metadata.raw=JSON.stringify(m);
 assert.equal(evaluate(source,c).status,'pending');
});
test('metadata belonging to another official page cannot verify this job',()=>{
 const c=context(),m=JSON.parse(metadata);m.id=8192;m.link=indexUrl;c.metadata.raw=JSON.stringify(m);
 assert.equal(evaluate(source,c).reason,'official_metadata_identity_mismatch');
});
test('a closed exact card wins while neighboring cards never imply closure of the open one',()=>{
 const c=context();c.index.raw=index.replace(/Postulación<strong>\s*Abierta/,'Postulación<strong> Cerrada');
 assert.equal(evaluate(source,c).reason,'official_application_closed');
 assert.equal(evaluate().status,'verified');
});
test('an inaccessible index or stale evidence stays pending and never becomes verified',()=>{
 const c=context();c.index.status=500;assert.equal(evaluate(source,c).reason,'official_index_unavailable');
 const stale=context();stale.checkedAt=new Date(Date.now()-86400001).toISOString();assert.equal(evaluate(source,stale).reason,'official_evidence_stale');
});
test('open status is independent of publication age; original date remains unchanged',()=>{
 const c=context(),m=JSON.parse(metadata);m.date_gmt='2026-07-01T12:00:00';c.metadata.raw=JSON.stringify(m);
 const v=evaluate(source,c);assert.equal(v.status,'verified');assert.equal(v.source_published_at,'2026-07-01T12:00:00.000Z');
 const record={kind:'job_offer',active:true,verified:true,review:false,url:sourceUrl,sourcePublishedAt:v.source_published_at,validityMethod:v.validity_method,officialOpenEvidence:v.official_evidence};
 assert.equal(mod.offerRetentionReason(record),null);
 assert.equal(mod.offerRetentionReason(record,Date.now()+86400001),'official_status_recheck_required');
 record.sourceValidThrough='2026-01-01T00:00:00Z';assert.ok(mod.offerRetentionReason(record));
});
test('workplace must come from the notice, never the OMIL address in the footer',()=>{
 const raw=source.replace(/de la comuna de Mulchén iniciará/g,'de la comuna de Santa Bárbara iniciará');
 assert.equal(evaluate(raw).reason,'official_workplace_requires_review');
});
test('presential application instructions are required and the 100 positions are not 100 different offers',()=>{
 const raw=source.replace(/Interesados deben presentar/g,'No hay instrucciones disponibles para');
 assert.equal(evaluate(raw).reason,'official_application_instructions_missing');
 assert.equal(mod.publicFeedIdentity(sourceUrl+'?utm_source=B'),mod.publicFeedIdentity(sourceUrl));
});
function memory(){
 const tables=new Map();let seq=0;
 const table=t=>{if(!tables.has(t))tables.set(t,new Map());return tables.get(t);};
 const clone=x=>x==null?x:structuredClone(x);
 const add=(t,rows,chosen)=>rows.map(r=>{const id=chosen&&r.id?r.id:'generated-'+(++seq);if(table(t).has(id))return null;table(t).set(id,clone(r));return id;});
 const update=(t,rows,patch=false)=>rows.map(({id,record,if:condition})=>{
  const old=table(t).get(id);if(condition&&Object.entries(condition).some(([k,v])=>old?.[k]!==v))return false;
  if(patch&&!old)return false;const next=patch?{...old}:{};for(const[k,v]of Object.entries(record)){if(v===undefined)delete next[k];else next[k]=clone(v);}table(t).set(id,next);return true;
 });
 const op=fn=>{let promise;return {then:(resolve,reject)=>(promise??=Promise.resolve().then(fn)).then(resolve,reject),run:()=>fn()};};
 const db={get:async(t,ids)=>ids.map(id=>clone(table(t).get(id)||null)),list:async(t,o={})=>{
  const rows=[...table(t)].map(([id,r])=>({...clone(r),id})),start=Number(o.nextToken||0),end=start+(o.limit||20);
  return {items:rows.slice(start,end),nextToken:end<rows.length?String(end):undefined};},
  add:async(t,r)=>add(t,r,false),update:async(t,r)=>update(t,r),delete:async(t,ids)=>ids.map(id=>table(t).delete(id)),
  tx:{add:(t,r)=>op(()=>add(t,r,true)),update:(t,r,o={})=>op(()=>update(t,r,o.patch)),delete:(t,ids)=>op(()=>ids.map(id=>table(t).delete(id)))},
  transact:async ops=>ops.map(o=>o.run())};
 const existing={id:'existing-mulchen',kind:'job_offer',url:sourceUrl,title:'OPERARIOS AGRÍCOLAS – COSECHA DE ARÁNDANOS',company:'Empresa del rubro agrícola',workCommunes:['Mulchén'],active:true,verified:true,review:false,createdAt:'2026-10-20T12:00:00Z'};
 const identity=createHash('sha256').update(mod.publicFeedIdentity(sourceUrl)).digest('hex');
 table('radar_jobs').set(existing.id,existing);
 table('public_feed_control').set('legacy-control',{manifestId:'manifest',itemCount:1});
 table('public_feed_manifests').set('manifest',{schema:2,pages:[{id:'leaf',keys:['radar_jobs:'+existing.id],identities:[identity]}]});
 table('public_feed_versions').set('leaf',{entries:[{source:'radar_jobs',sourceId:existing.id,item:existing}]});
 globalThis.__mulchenDb=db;
 globalThis.fetch=async address=>{
  const u=String(address);
  const raw=u.endsWith('/robots.txt')?'User-agent: *\nAllow: /':u===sourceUrl?source:u===indexUrl?index:u===metadataUrl?metadata:null;
  return new Response(raw||'',{status:raw?200:404,headers:{'content-type':u===metadataUrl?'application/json':'text/html; charset=utf-8'}});
 };
 return {table,db};
}
test('Motor A runs the actual free-source verifier with official HTML and date metadata',async()=>{
 const mem=memory();
 const result=await mod.runFreePublicSources([{key:'mulchen-case',name:'Municipalidad de Mulchén',url:sourceUrl,territory:'Mulchén',bootstrap:true}],'mulchen-independent-A');
 const jobs=[...mem.table('public_feed_changes').values()];
 assert.ok(result.verified>=1);assert.ok(jobs.length>=1);
 const stored=[...mem.table(jobs[0].source).values()][0];
 assert.equal(stored.sourcePublishedAt,new Date(JSON.parse(metadata).date_gmt+'Z').toISOString());
 assert.equal(stored.officialOpenEvidence.status,'open');
 report.engineTests.A={verified:result.verified,published:0,originalDate:stored.sourcePublishedAt};
});
test('Motor B recovers missing date and application through its real parser and auxiliary, then recognizes the existing publication',async()=>{
 const mem=memory();
 const parsed=await mod.analyzeMotorBPage(sourceUrl,'Municipalidad de Mulchén',source);
 assert.equal(parsed.status,'ready');assert.ok(parsed.publishedAt);
 mem.table('motor_b_offers').set('legacy-b',{id:'legacy-b',url:sourceUrl,title:parsed.title,commune:'Mulchén',status:'review_date'});
 await mod.triageMotorBQueue();
 const saved=mem.table('motor_b_offers').get('legacy-b');assert.equal(saved.status,'ready');assert.equal(saved.publishedAt,parsed.publishedAt);
 const review=[...mem.table('radar_review_inbox').values()].find(x=>x.kind==='review_candidate');
 assert.equal(review.lastCheck.reason,'already_in_public_catalog');
 assert.equal(mem.table('radar_jobs').size,1);
 report.engineTests.B={status:saved.status,reason:review.lastCheck.reason,newPublications:0};
});
test('Motor C independently discovers the official card and reaches the shared verifier without duplicating the published job',async()=>{
 const mem=memory();mem.table('motor_c_local_cursor').set('current',{position:11});
 await mod.motorCIndependentHandler();
 const review=[...mem.table('radar_review_inbox').values()].find(x=>x.url===sourceUrl);
 assert.ok(review);assert.equal(review.lastCheck.reason,'already_in_public_catalog');assert.equal(mem.table('radar_jobs').size,1);
 report.engineTests.C={reason:review.lastCheck.reason,newPublications:0};
});
test('repeated administrative submission cannot bypass duplicate verification',async()=>{
 const mem=memory();
 const id='tc_'+'a'.repeat(22);mem.table('radar_review_inbox').set(id,{kind:'review_candidate',url:sourceUrl,status:'ready_for_final_check',territories:['Mulchén']});
 for(let n=0;n<2;n++){const receipt=await mod.enqueueAdminReviewedOffer({id});assert.equal(receipt.queued,false);assert.equal(receipt.reason,'already_in_public_catalog');}
 assert.equal(mem.table('radar_jobs').size,1);
});
process.on('exit',()=>{writeFileSync('qa-output/mulchen/verification-results.json',JSON.stringify(report,null,2));console.log('MULCHEN_VERIFICATION_RESULTS '+JSON.stringify(report));});
