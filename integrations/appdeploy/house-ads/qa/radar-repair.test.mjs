import {createHash} from 'node:crypto';
import {resumeWork} from './radar-work-checkpoint.mjs';
// All records in this file are synthetic unit fixtures; they are never crawl/publication evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

function database() {
 const tables=new Map();let seq=0;
 const table=n=>{if(!tables.has(n))tables.set(n,new Map());return tables.get(n);};
 const clone=x=>structuredClone(x);
 const writes=(method,n,records,options={})=>({
   check(){return records.every(r=>{const old=table(n).get(r.id);return method==='add'?!old:(!options.patch||old)&&Object.entries(r.if||{}).every(([k,v])=>old?.[k]===v);});},
   run(){return records.map(r=>{const old=table(n).get(r.id);if(method==='add'){if(old)return null;table(n).set(r.id,clone(r));return r.id;}if((options.patch&&!old)||!Object.entries(r.if||{}).every(([k,v])=>old?.[k]===v))return false;const next=options.patch?{...old,...clone(r.record)}:clone(r.record);table(n).set(r.id,next);return true;});},
   then(resolve,reject){return Promise.resolve().then(()=>this.run()).then(resolve,reject);}
 });
 const db={
  tx:{add:(n,rows)=>writes('add',n,rows),update:(n,rows,o)=>writes('update',n,rows,o)},
  async transact(ops){if(!ops.every(o=>o.check()))throw new Error('transaction aborted');return ops.map(o=>o.run());},
  async get(n,ids){return ids.map(id=>clone(table(n).get(id)||null));},
  async list(n,o={}){const all=[...table(n)].map(([id,v])=>({...clone(v),id})),start=Number(o.nextToken||0),end=start+(o.limit||50);return {items:all.slice(start,end),nextToken:end<all.length?String(end):undefined};},
  async add(n,rows){return rows.map(r=>{const id='generated-'+(++seq);table(n).set(id,clone(r));return id;});},
  async update(n,rows){return rows.map(r=>{if(!table(n).has(r.id))return false;table(n).set(r.id,clone(r.record));return true;});},
  async delete(n,ids){return ids.map(id=>table(n).delete(id));},
 };
 return {db,table};
}
const mem=database();globalThis.__radarDB=mem.db;
const core=await import(pathToFileURL(process.cwd()+'/qa-output/radar/core.mjs'));
const now=Date.parse('2026-10-28T10:00:00Z');
const html=(place='Angol')=>'<html><head><meta content="2026-10-27" property="article:published_time"></head><body><h1>Se requiere operador de maquinaria</h1><p>Oferta laboral</p><p>Empresa: Empresa de prueba</p><p>Lugar de trabajo: '+place+'</p><a href="mailto:fixtures@example.invalid">Enviar CV</a></body></html>';
const url='https://www.malleco7.cl/convocatoria-operador/';
test('HTML without JSON-LD is verified only with dated employer, explicit worksite and application evidence',()=>{
 assert.equal(core.evaluatePublicJob(url,html(),url,200,now).reason,'structured_jobposting_missing');
 assert.equal(core.evaluateWithEvidence(url,html(),url,200,now).status,'verified');
 assert.equal(core.evaluateWithEvidence(url,html().replace('Lugar de trabajo: Angol','OMIL Angol'),url,200,now).status,'pending');
 assert.equal(core.evaluateWithEvidence(url,html('Temuco'),url,200,now).status,'pending');
 assert.notEqual(core.evaluateWithEvidence(url,html().replace('2026-10-27','2027-10-27'),url,200,now).status,'verified');
 assert.notEqual(core.evaluateWithEvidence(url,html().replace('Empresa: Empresa de prueba','Información'),url,200,now).status,'verified');
 assert.equal(core.evaluateWithEvidence(url,html()+'<p>Postulaciones cerradas</p>',url,200,now).status,'rejected');
});
test('inaccessible is distinct from rejected and a recoverable format failure remains traceable',async()=>{
 assert.equal(core.candidateState({status:'pending',reason:'HTTP 403'},403),'inaccessible');
 assert.equal(core.candidateState({status:'pending',reason:'structured_jobposting_missing'},200),'recoverable');
 await core.rememberCandidates([{url,source:'Unit fixture'}]);
 await core.recordCandidate(url,{state:'verified',publication:'queued_for_feed',sourceId:'test-id'});
 await core.rememberCandidates([{url,source:'Second discovery'}]);
 const row=[...mem.table('radar_candidate_trace').values()][0];
 assert.equal(row.state,'verified');assert.equal(row.sourceId,'test-id');
 assert.equal(mem.table('radar_candidate_trace').size,1);
});
const projector={revision:'unit-v1',project:r=>r.active===false?null:r,refreshAt:()=>null};
test('feed retains a durable public snapshot and serializes overlapping writers',async()=>{
 mem.table('radar_jobs').set('job-one',{kind:'job_offer',title:'Fixture 1',verified:true,workCommunes:['Angol'],createdAt:new Date(now).toISOString()});
 mem.table('radar_jobs').set('job-two',{kind:'job_offer',title:'Fixture 2',verified:true,workCommunes:['Victoria'],createdAt:new Date(now).toISOString()});
 await Promise.all([core.advancePublicFeed(projector),core.advancePublicFeed(projector)]);
 for(let i=0;i<4;i++)await core.advancePublicFeed(projector);
 const before=await core.readPublicFeedPage();assert.equal(before.totalItems,2);assert.equal(before.complete,true);
 const pointer=[...mem.table('public_feed_control').values()][0],original=pointer.manifestId;
 mem.table('radar_jobs').set('job-three',{kind:'job_offer',title:'Fixture 3',verified:true,workCommunes:['Lumaco'],createdAt:new Date(now).toISOString()});
 await core.registerPublicFeedChange('radar_jobs','job-three');await core.advancePublicFeed(projector);
 assert.equal((await core.readPublicFeedPage()).totalItems,3);
 assert.equal([...mem.table('public_feed_control').values()][0].previousManifestId,original);
 const current=[...mem.table('public_feed_control').values()][0];
 const saved=mem.table('public_feed_manifests').get(current.manifestId);
 mem.table('public_feed_manifests').delete(current.manifestId);
 assert.equal((await core.readPublicFeedPage()).totalItems,2);
 await core.advancePublicFeed(projector);
 const restored=[...mem.table('public_feed_control').values()][0];
 assert(mem.table('public_feed_manifests').has(restored.previousManifestId));
 assert.equal((await core.readPublicFeedPage()).totalItems,2);
 mem.table('public_feed_manifests').set(current.manifestId,saved);
});
test('document unit identities keep distinct roles and normalize URL equivalents',()=>{
 const first=core.publicOfferIdentity('https://www.malleco7.cl/bases.pdf','a'.repeat(64));
 const second=core.publicOfferIdentity('https://www.malleco7.cl/bases.pdf','b'.repeat(64));
 assert(first&&second&&first!==second);
});

test('a stolen writer cannot acknowledge changes or overwrite the public pointer',async()=>{
 const original=[...mem.table('public_feed_control').values()][0].manifestId;
 mem.table('radar_jobs').set('job-four',{kind:'job_offer',title:'Unit fixture 4',verified:true,workCommunes:['Angol']});
 await core.registerPublicFeedChange('radar_jobs','job-four');
 const transact=mem.db.transact;
 mem.db.transact=async ops=>{
   const lease=mem.table('public_feed_writer').get('writer');
   mem.table('public_feed_writer').set('writer',{...lease,owner:'replacement-writer'});
   return transact(ops);
 };
 try {await assert.rejects(core.advancePublicFeed(projector),/transaction aborted/);}
 finally {mem.db.transact=transact;}
 assert.equal([...mem.table('public_feed_control').values()][0].manifestId,original);
 assert.equal(mem.table('public_feed_changes').size,1);
 assert.equal(mem.table('public_feed_writer').get('writer').owner,'replacement-writer');
});

test('a portal title and structured city conflict is review, never verified in the wrong commune',()=>{
 const u='https://www.chiletrabajos.cl/trabajo/operador-renaico-1234567';
 const job={'@type':'JobPosting',url:u,title:'Operador en Renaico',description:'Oferta laboral para operador',
  hiringOrganization:{name:'Empresa de prueba'},datePosted:'2026-10-27',validThrough:'2026-11-10',
  jobLocation:{'@type':'Place',address:{addressCountry:'CL',addressLocality:'Angol'}}};
 const raw='<title>Operador en Renaico</title><script type="application/ld+json">'+JSON.stringify(job)+'</script><p>Oferta laboral, requisitos y postulación</p>';
 assert.equal(core.evaluatePublicJob(u,raw,u,200,now).reason,'title_worksite_conflict');
});

test('individual portal recommendations do not masquerade as new discovery sources',()=>{
 const one='https://www.chiletrabajos.cl/trabajo/operador-angol-1234567';
 const other='https://www.chiletrabajos.cl/trabajo/vendedor-santiago-7654321';
 const raw='<a href="'+one+'">Postular</a><a href="'+other+'">Oferta recomendada</a>';
 assert(core.publicPageLinks(raw,one).candidates.every(x=>core.publicFeedIdentity(x.url)===core.publicFeedIdentity(one)));
 assert(core.publicPageLinks(raw,'https://www.chiletrabajos.cl/encuentra-un-empleo/?2=Angol').candidates.some(x=>x.url===other));
});

test('PDF reader really extracts text and checkpoints under the chosen physical identity',async()=>{
 const objects=[
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
  '',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
 ];
 const content='BT /F1 12 Tf 10 50 Td (Oferta laboral. Cargo: Operador. Lugar de trabajo: Angol.) Tj ET';
 objects[3]='<< /Length '+Buffer.byteLength(content)+' >>\nstream\n'+content+'\nendstream';
 let pdf='%PDF-1.4\n',offsets=[0];
 for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(pdf));pdf+=(i+1)+' 0 obj\n'+objects[i]+'\nendobj\n';}
 const xref=Buffer.byteLength(pdf);
 pdf+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+
  'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';
 const address='https://munipuren.cl/unit-fixture.pdf';
 mem.table('free_public_source_cursor').set('fixture-cursor',{position:0,queues:{},seen:{},pending:[],documentPending:[
  {url:address,source:'Synthetic unit fixture',publisherPage:'https://munipuren.cl/convocatoria/'}]});
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async url=>String(url).endsWith('/robots.txt')
  ?new Response('User-agent: *\nAllow: /',{headers:{'content-type':'text/plain'}})
  :new Response(Buffer.from(pdf),{headers:{'content-type':'application/pdf'}});
 try {
  const result=await core.shadowPdfBatch();
  assert.equal(result.processed,1);
  const stored=[...mem.table('radar_shadow_pdf')];
  assert.equal(stored.length,1);assert(stored[0][0].startsWith('pdf-'));
  assert.equal(stored[0][1].pagesRead,1);assert(stored[0][1].textLength>40);
  assert.equal(stored[0][1].publicEligible,false);
  await core.shadowPdfBatch();assert.equal(mem.table('radar_shadow_pdf').size,1);
 } finally {globalThis.fetch=originalFetch;}
});

test('new shadow observations preserve the previously stored publication identity',async()=>{
 const input={url,source:'Unit fixture',raw:html(),http:200,baseline:{status:'verified',reason:'unit_fixture_verified',title:'Unit fixture',work_commune:'Angol'},at:now};
 await core.shadowEvaluate(input);
 const [id,record]=[...mem.table('radar_shadow_b')][0];
 mem.table('radar_shadow_b').set(id,{...record,sourceId:'existing-published-id',publication:'queued_for_feed',stage:'stored'});
 await core.shadowEvaluate(input);
 assert.equal(mem.table('radar_shadow_b').get(id).sourceId,'existing-published-id');
 assert.equal(mem.table('radar_shadow_b').get(id).publication,'queued_for_feed');
 assert.equal(mem.table('radar_shadow_b').get(id).stage,'stored');
});

test('same employer, title and commune on another URL requires review without merging distinct roles',async()=>{
 const pointer=[...mem.table('public_feed_control').values()][0];
 const manifest=mem.table('public_feed_manifests').get(pointer.manifestId);
 const ref=manifest.pages[0],leaf=mem.table('public_feed_versions').get(ref.id);
 const old={kind:'job_offer',title:'TENS para Cuidados Pacientes Domiciliarios / Lumaco',company:'Layner',
  workCommunes:['Lumaco'],url:'https://www.chiletrabajos.cl/trabajo/tens-lumaco-3902931'};
 leaf.entries.push({key:'radar_jobs:existing-lumaco',source:'radar_jobs',sourceId:'existing-lumaco',item:old});
 ref.semanticKeys.push(...core.listingFingerprints(old));
 const offer={status:'verified',reason:'unit_fixture',title:'TENS para Cuidados Pacientes Domiciliarios /Lumaco',company:'LAYNER',
  work_commune:'Lumaco',url:'https://www.chiletrabajos.cl/trabajo/tens-lumaco-3892923'};
 await assert.rejects(core.assertDistinctPublicOffer(offer),/possible_republication/);
 await core.assertDistinctPublicOffer({...offer,title:'TENS turno nocturno en otra unidad'});
 assert.equal(leaf.entries.filter(x=>x.sourceId==='existing-lumaco').length,1);
});

test('poster discovery excludes unrelated images in the surrounding municipal page',()=>{
 const raw='<article><h1>Oferta laboral para operador</h1><img src="/afiche-empleo.png"></article><aside><img src="/permiso-circulacion.png"></aside>';
 const found=core.publicPageLinks(raw,'https://www.malleco7.cl/oferta-operador/').candidates.map(x=>x.url);
 assert(found.some(x=>x.endsWith('/afiche-empleo.png')));
 assert(!found.some(x=>x.endsWith('/permiso-circulacion.png')));
});

test('an initial partial page is never measured as a complete empty public inventory',async()=>{
 const inventory=await core.readFeedInventory(async()=>({data:{items:[],totalItems:0,complete:false,degraded:true}}));
 assert.equal(inventory.complete,false);
 assert(inventory.error);
});

test('resumption retains newly discovered work and old pending URLs without repeating completed identities',()=>{
 const previous={candidates:[{url:'https://unit.invalid/done'}],documents:[],pending:[{url:'https://unit.invalid/old-pending'}]};
 const resumed=resumeWork(previous,[{url:'https://unit.invalid/new-source-job'},{url:'https://unit.invalid/done'}]);
 assert.deepEqual(resumed.map(x=>x.url),['https://unit.invalid/new-source-job','https://unit.invalid/old-pending']);
});

test('all discovered archive links are retained instead of cutting off pagination at five',()=>{
 const raw=Array.from({length:8},(_,i)=>'<a href="/page/'+(i+1)+'/">'+(i+1)+'</a>').join('');
 assert.equal(core.publicPageLinks(raw,'https://www.malleco7.cl/noticias/').archives.length,8);
});

test('separate verified roles in one document retain separate trace IDs and publication receipts',async()=>{
 const start=mem.table('radar_candidate_trace').size;
 const one='a'.repeat(64),two='b'.repeat(64);
 await core.recordCandidate(url,{documentUnitKey:one,state:'verified',sourceId:'unit-one'});
 await core.recordCandidate(url,{documentUnitKey:two,state:'verified',sourceId:'unit-two'});
 assert.notEqual(core.traceId(url,one),core.traceId(url,two));
 assert.equal(mem.table('radar_candidate_trace').size,start+2);
 assert.equal(mem.table('radar_candidate_trace').get(core.traceId(url,one)).sourceId,'unit-one');
 assert.equal(mem.table('radar_candidate_trace').get(core.traceId(url,two)).sourceId,'unit-two');
});

test('an already processed bootstrap cannot starve a newly reviewed real-source URL',async()=>{
 const old={key:'unit-old-bootstrap',name:'Unit fixture',url:'https://unit.invalid/old',territory:'Angol',bootstrap:true};
 const fresh={...old,key:'unit-new-bootstrap',url:'https://unit.invalid/new'};
 const seedId=key=>createHash('sha256').update(key).digest('hex');
 mem.table('free_public_seed_state').set(seedId(old.key),{key:old.key});
 assert.equal((await core.nextBootstrapSource([old,fresh])).key,fresh.key);
 mem.table('free_public_seed_state').set(seedId(fresh.key),{key:fresh.key});
 assert.equal(await core.nextBootstrapSource([old,fresh]),undefined);
});

test('source age requires live application evidence and a fresh check instead of a fabricated closing date',()=>{
 const u='https://www.chiletrabajos.cl/trabajo/operador-angol-1234567';
 const job={'@type':'JobPosting',url:u,title:'Operador en Angol',description:'Oferta laboral para operador',
 hiringOrganization:{name:'Empresa de prueba'},datePosted:'2026-09-01',jobLocation:{address:{addressCountry:'CL',addressLocality:'Angol'}}};
 const raw='<title>Operador en Angol</title><script type="application/ld+json">'+JSON.stringify(job)+'</script><p>Oferta laboral y requisitos</p>';
 const form='<form method="post" action="'+u+'"><button type="submit">Postular</button></form>';
 assert.equal(core.evaluatePublicJob(u,raw+form,u,200,now).status,'verified');
 assert.equal(core.evaluatePublicJob(u,raw,u,200,now).status,'pending');
 const item={kind:'job_offer',active:true,verified:true,review:false,sourcePublishedAt:'2026-09-01',expiresAt:'2026-10-16'};
 assert.equal(core.confirmedOfferDeadline(item),null);
 assert.equal(core.offerRetentionReason(item,now),'source_revalidation_required');
 assert.equal(core.offerRetentionReason({...item,lastVerifiedAt:new Date(now).toISOString()},now),null);
});
