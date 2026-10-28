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
