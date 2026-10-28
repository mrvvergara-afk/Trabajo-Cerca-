import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const core=await import('../qa-output/radar/core.mjs');
const inventory=JSON.parse(readFileSync('qa/radar-source-inventory.json','utf8'));
const out='qa-output/radar';mkdirSync(out,{recursive:true});
let baseline={};try{baseline=JSON.parse(readFileSync('qa-output/radar-live/baseline.json','utf8'));}catch{}
let previous;
if(process.env.RADAR_PREVIOUS){previous=JSON.parse(readFileSync(process.env.RADAR_PREVIOUS,'utf8'));}
const existing=new Set((baseline.proofs?.['radar-proof']?.visibleItems||[]).map(x=>core.publicFeedIdentity(x.url||'')).filter(Boolean));
const seeds=new Map();
for(const source of inventory.sources){const prior=seeds.get(source.url);if(prior)prior.references.push(source.key);else seeds.set(source.url,{...source,references:[source.key]});}
for(const doc of baseline.proofs?.['radar-public-proof']?.state?.documentWork?.items||[])if(!seeds.has(doc.url))seeds.set(doc.url,{...doc,name:doc.source,inventory:'live-document-queue',references:['live-document-queue']});
const report={startedAt:new Date().toISOString(),paidCalls:0,platformWrites:0,syntheticRecords:0,inventoryEntries:inventory.sources.length,
  uniqueSeedUrls:seeds.size,primaryTowns:inventory.primaryTowns,sources:[],candidates:[],documents:[],pending:[],engines:{}};
const priorSources=new Set((previous?.sources||[]).filter(x=>!['publisher_not_yet_approved_in_existing_adapter','document_requires_local_reader'].includes(x.reason)).map(x=>x.url));
const queue=[],seen=new Set(),sourceTasks=[...seeds.values()].filter(x=>!priorSources.has(x.url));
const add=(url,source,publisherPage)=>{const clean=core.safePublicUrl(url);if(clean&&!seen.has(clean)){seen.add(clean);queue.push({url:clean,source,publisherPage});}};
const digest=x=>createHash('sha256').update(x).digest('hex');
const start=Date.now(),deadline=start+11*60000;
async function parallel(items,fn,n=4){let index=0;await Promise.all(Array.from({length:n},async()=>{while(index<items.length&&Date.now()<deadline){const item=items[index++];try{await fn(item);}catch(e){report.pending.push({...item,reason:String(e)});}}}));return index;}
async function inspectSource(source) {
 const row={url:source.url,name:source.name||source.id,inventory:source.inventory,references:source.references,territory:source.territory};
 if(source.manualOnly){report.sources.push({...row,state:'manual_or_authorized_api_only',reason:'social_access_not_automated'});return;}
 if(!core.publicPublisher(source.url)){report.sources.push({...row,state:'inaccessible',reason:'publisher_not_yet_approved_in_existing_adapter'});return;}
 if(/\.pdf(?:[?#]|$)/i.test(source.url)){add(source.url,row.name,source.publisher_page||source.url);report.sources.push({...row,state:'document_queued'});return;}
 const page=await core.fetchPublicPage(source.url);
 if(page.error==='document_requires_local_reader'&&/pdf/i.test(page.mime)) {add(source.url,row.name,source.publisher_page||source.url);report.sources.push({...row,state:'document_queued',reason:'pdf_requires_reader'});return;}
 report.sources.push({...row,http:page.status,state:page.error||page.status!==200?'inaccessible':'accessible',reason:page.error||null,sha256:page.raw?digest(page.raw):null});
 if(page.status!==200||page.error)return;
 const links=core.publicPageLinks(page.raw,page.url);
 if(core.publicSourceAdapter(page.url))add(page.url,row.name,page.url);
 for(const item of links.candidates)add(item.url,row.name,page.url);
 // Pagination is queued explicitly, never silently counted as already read.
 for(const url of links.archives)add(url,row.name,page.url);
}
const rootsRead=await parallel(sourceTasks,inspectSource);
for(const source of sourceTasks.slice(rootsRead))report.pending.push({...source,reason:'run_time_budget_before_source_read'});
if(previous){
 const refreshed=new Set(report.sources.map(x=>x.url));
 report.sources=[...previous.sources.filter(x=>!refreshed.has(x.url)),...report.sources];report.candidates=previous.candidates;report.documents=previous.documents;
 report.continuedFrom=previous.completedAt;
 for(const x of [...previous.candidates,...previous.documents])seen.add(x.url);
 queue.length=0;
 for(const x of previous.pending||[])if(!seen.has(x.url)){seen.add(x.url);queue.push(x);}
}
let processed=0;
while(queue.length&&Date.now()<deadline&&processed<4000) {
 const batch=queue.splice(0,4);processed+=batch.length;
 await parallel(batch,async candidate=>{
  if(/\.pdf(?:[?#]|$)/i.test(candidate.url)){
   try{report.documents.push({...candidate,...await core.extractPublicPdf(candidate.url)});}
   catch(e){report.documents.push({...candidate,stage:'inaccessible',reason:String(e)});}
   return;
  }
  if(/\.(png|jpe?g|webp)(?:[?#]|$)/i.test(candidate.url)){report.documents.push({...candidate,stage:'recoverable',reason:'image_ocr_requires_local_reader'});return;}
  const page=await core.fetchPublicPage(candidate.url,candidate.url);
  if(page.error==='document_requires_local_reader' && /pdf/i.test(page.mime)) {
   try{report.documents.push({...candidate,...await core.extractPublicPdf(candidate.url)});}catch(e){report.documents.push({...candidate,stage:'inaccessible',reason:String(e)});}return;
  }
  const A=page.error?{status:'pending',reason:page.error}:core.evaluatePublicJob(candidate.url,page.raw,page.url,page.status);
  const B=page.error?A:core.evaluateWithEvidence(candidate.url,page.raw,page.url,page.status);
  const identity=core.publicFeedIdentity(candidate.url);
  report.candidates.push({...candidate,id:'candidate-'+digest(candidate.url).slice(0,48),identity,http:page.status,
   sha256:page.raw?digest(page.raw):null,A,B,alreadyPublic:Boolean(identity&&existing.has(identity)),
   publicFeedPresent:Boolean(identity&&existing.has(identity)),territorialViewConfirmed:false});
  if(page.status===200&&!page.error) {
   const links=core.publicPageLinks(page.raw,page.url);
   for(const archive of links.archives)add(archive,candidate.source,page.url);
   for(const found of links.candidates)add(found.url,candidate.source,page.url);
  }
 });
}
report.pending.push(...queue.map(x=>({...x,reason:'run_budget_pending'})));
if(previous) {
 await parallel(report.candidates.filter(x=>x.A.status==='verified'||x.B.status==='verified'),async row=>{
   const page=await core.fetchPublicPage(row.url,row.url);
   row.previousMeasurement={A:row.A,B:row.B,sha256:row.sha256};
   row.A=page.error?{status:'pending',reason:page.error}:core.evaluatePublicJob(row.url,page.raw,page.url,page.status);
   row.B=page.error?row.A:core.evaluateWithEvidence(row.url,page.raw,page.url,page.status);
   row.sha256=page.raw?digest(page.raw):null;row.recheckedAt=new Date().toISOString();
 });
}
const publicItems=baseline.publicItems||baseline.proofs?.['radar-proof']?.visibleItems||[];
for(const row of report.candidates) {
 row.possibleExistingPublicationIds={};
 for(const engine of ['A','B']) {
  const offer=row[engine],fingerprint=core.offerFingerprint(offer.title,offer.company,offer.work_commune);
  row.possibleExistingPublicationIds[engine]=fingerprint?publicItems.filter(item=>core.publicFeedIdentity(item.url||'')!==row.identity&&core.listingFingerprints(item).includes(fingerprint)).map(item=>item.id):[];
 }
}
for(const engine of ['A','B']) {
 const values=report.candidates,verified=values.filter(x=>x[engine].status==='verified');
 const unique=new Map(verified.filter(x=>x.identity&&!x.possibleExistingPublicationIds[engine].length).map(x=>[x.identity,x]));
 report.engines[engine]={accessibleSources:report.sources.filter(x=>x.state==='accessible').length,
  candidates:values.length,identifiedOpportunities:values.filter(x=>x[engine].title).length,verified:verified.length,
  uniquePublishable:unique.size,possibleRepublications:verified.filter(x=>x.possibleExistingPublicationIds[engine].length).length,alreadyExisting:[...unique.values()].filter(x=>x.alreadyPublic).length,
  additionalReady:[...unique.values()].filter(x=>!x.alreadyPublic&&inventory.primaryTowns.includes(x[engine].work_commune)).length,
  newPublished:0,newVisibleIn13:0,readingErrors:values.filter(x=>x.http!==200).length,
  documentsProcessed:engine==='B'?report.documents.filter(x=>x.complete&&!(x.ocrPages?.length)&&x.reason!=='ocr_required').length:0};
}
report.completedAt=new Date().toISOString();
report.checkpointVersion=1;
report.measurementNotes=previous?'Earlier candidate receipts retain their original engine version/time; targeted probes validate changed rules separately.':'Common URLs evaluated by both engines at read time.';report.allInventoryEntriesAttempted=rootsRead===sourceTasks.length;
report.fullTraversalComplete=report.allInventoryEntriesAttempted&&report.pending.length===0;
writeFileSync(out+'/crawl.json',JSON.stringify(report,null,2));
console.log('RADAR_CRAWL_SUMMARY '+JSON.stringify({...report,sources:undefined,candidates:undefined,documents:undefined,pending:report.pending.length}));
for(const row of report.sources)console.log('RADAR_SOURCE '+JSON.stringify(row));
for(const row of report.candidates)console.log('RADAR_CANDIDATE '+JSON.stringify(row));
for(const row of report.documents)console.log('RADAR_DOCUMENT '+JSON.stringify(row));
