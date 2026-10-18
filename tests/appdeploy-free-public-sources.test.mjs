import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const stamp=Date.parse('2026-10-13T12:00:00Z');
const url='https://cl.indeed.com/viewjob?jk=0123456789abcdef';

test('Lumaco downloads without a PDF extension reach the document lane without creating offer identities',()=>{
  const h=harness(),origin='https://www.munilumaco.cl/index.php/afiches-municipales/811-llamados-a-concurso-publico';
  const download='https://www.munilumaco.cl/index.php/component/phocadownload/category/1-concursos?Itemid=101&download=23%3Abases-jefatura-grado-8';
  const links=h.ctx.publicPageLinks('<a href="'+download.replace('&','&amp;')+'">Bases Jefatura grado 8°</a>',origin);
  assert.equal(links.candidates.length,1);
  assert.equal(h.ctx.publicSourceAdapter(download),null);
  const pending=[{url:links.candidates[0].url,source:'Lumaco',publisherPage:origin}];
  const work=h.ctx.publicDocumentWork({pending});
  assert.equal(work.items.length,1);assert.equal(work.items[0].kind,'document');
  assert.equal(work.items[0].publisher_page,origin);
  assert.equal(h.ctx.pendingCandidateIndex(pending),-1);
  for (const invalid of [download+'&token=x',download+'&download=24:other',download.replace('munilumaco.cl','attacker.example'),download+'&redirect=https://attacker.example/a.pdf',download.replace('download=23','download=0')]) {
    assert.equal(h.ctx.publicDocumentUrl(invalid),false);
  }
});

test('Image-only local notices keep their media URL and export read-only work without using capture dates',()=>{
  const h=harness(),article='https://www.munilumaco.cl/oferta-laboral-operador';
  const links=h.ctx.publicPageLinks('<main><h1>Oferta laboral</h1><img src="/images/afiche.png"><img src="/logo.png"></main>',article);
  assert.equal(links.candidates.length,1);
  const work=h.ctx.publicDocumentWork({pending:[{url:links.candidates[0].url,source:'OMIL',publisherPage:article},
    {url:'https://attacker.example/afiche.png',source:'Unknown',publisherPage:article}],checkedAt:new Date(stamp).toISOString()});
  assert.equal(work.items.length,1);assert.equal(work.items[0].publisher_page,article);
  assert.equal(work.read_only,true);assert.equal(work.paid_provider_calls,0);
  assert.equal(work.items[0].source_published_at,undefined);
});

test('Embedded municipal PDFs retain their original publisher and cannot inject cross-domain or unsafe documents',()=>{
  const h=harness(),source='https://mtraiguen.cl/municipalidad/concurso/';
  const raw='<main><h1>Concurso público</h1><iframe src="about:blank" data-emsrc="/wp-content/uploads/2026/10/bases.pdf"></iframe>'
    +'<object data="/wp-content/uploads/2026/10/calendario.pdf"></object><embed src="https://attacker.example/empleo.pdf">'
    +'<iframe src="javascript:bad.pdf"></iframe></main>';
  const links=h.ctx.publicPageLinks(raw,source);
  assert.equal(links.candidates.length,2);
  const work=h.ctx.publicDocumentWork({pending:links.candidates.map(item=>({url:item.url,source:'Municipalidad',publisherPage:source}))});
  assert.equal(work.items.length,2);assert.ok(work.items.every(item=>item.publisher_page===source&&item.kind==='document'));
  assert.equal(work.paid_provider_calls,0);
});

test('Local roots keep three of five discovery slots and their own cursor even with many portal searches',()=>{
  const h=harness(),state={};
  const local=[{key:'angol',url:'https://noticias.angol.cl/index.php/noticias',discoveryGroup:'local'},
    {key:'lumaco',url:'https://www.munilumaco.cl/',discoveryGroup:'local'},
    {key:'traiguen',url:'https://mtraiguen.cl/',discoveryGroup:'local'},
    {key:'mulchen',url:'https://www.munimulchen.cl/',discoveryGroup:'local'}];
  const portals=Array.from({length:45},(_,i)=>({key:'portal-'+i,url:url+'&l='+i,discoveryGroup:'portal'}));
  const first=Array.from({length:5},(_,i)=>h.ctx.nextPublicSource([...local,...portals],state,i));
  assert.equal(first.filter(source=>source.discoveryGroup==='local').length,3);
  assert.deepEqual(first.filter(source=>source.discoveryGroup==='local').map(source=>source.key),['angol','lumaco','traiguen']);
  const second=Array.from({length:5},(_,i)=>h.ctx.nextPublicSource([...local,...portals],state,i));
  assert.equal(second[0].key,'mulchen');
  assert.equal(second[1].key,'portal-2');
  assert.equal(h.ctx.nextPublicSource(portals,{},0).key,'portal-0');
  assert.equal(h.ctx.nextPublicSource(local,{},1).key,'angol');
});
function page(source=url) {
  return '<title>Operador</title><main>Requisitos de empleo</main><script type="application/ld+json">'+JSON.stringify({ '@type':'JobPosting',url:source,title:'Operador',hiringOrganization:{ name:'Empresa de prueba' },jobLocation:{ address:{ addressLocality:'Angol',addressCountry:'CL' } },datePosted:'2026-10-12T12:00:00Z',validThrough:'2026-10-25T12:00:00Z' })+'</script><a href="/postular/123">Postula</a>';
}

function harness({ blocked=false,abort=false,fetcher }={}) {
  const tables=new Map(),calls=[],registered=[];
  let time=stamp;
  const table=name=>{if (!tables.has(name)) tables.set(name,new Map());return tables.get(name);};
  const execute=(op, target=tables)=>{
    const name=op.table;if (!target.has(name)) target.set(name,new Map());
    const rows=target.get(name);
    if (op.method==='add') return op.records.map(record=>{if (rows.has(record.id)) return null;rows.set(record.id,structuredClone(record));return record.id;});
    return op.records.map(change=>{const old=rows.get(change.id);if (!old || Object.entries(change.if || {}).some(([key,value])=>old[key]!==value)) return false;rows.set(change.id,structuredClone(change.record));return true;});
  };
  const handle=operation=>({ operation,then(resolve,reject) {try{return Promise.resolve(execute(operation)).then(resolve,reject);}catch(error){return Promise.reject(error).then(resolve,reject);} } });
  const db={
    async list(name,{ limit }={}) {calls.push({ method:'list',name,limit });return { items:[...table(name).values()].slice(0,limit).map(row=>structuredClone(row)) };},
    async get(name,ids,options) {calls.push({ method:'get',name,ids,options });return ids.map(id=>structuredClone(table(name).get(id)||null));},
    async update(name,records) {calls.push({ method:'update',name });return execute({ method:'update',table:name,records });},
    tx:{ add:(name,records)=>handle({ method:'add',table:name,records }),update:(name,records)=>handle({ method:'update',table:name,records }) },
    async transact(handles) {
      calls.push({ method:'transact' });if (abort) {abort=false;throw new Error('simulated_atomic_abort');}
      const staged=structuredClone(tables),results=handles.map(item=>execute(item.operation,staged));
      if (results.flat().some(value=>!value)) throw new Error('Atomic condition failed');
      tables.clear();for (const [key,value] of staged) tables.set(key,value);return results;
    },
  };
  class Clock extends Date {constructor(...args) {super(...(args.length?args:[time]));}static now(){return time;}}
  const ctx={ URL,Intl,Date:Clock,Buffer,createHash,db,structuredClone,
    fetchPublicPage:async source=>{calls.push({ method:'http',source });return fetcher ? fetcher(source) : { url:source,status:blocked?403:200,raw:blocked?'':page(source),mime:'text/html',bytes:500 };},
    registerPublicFeedChange:async (table,id)=>registered.push({ table,id }),
    currentPublicFeedManifest:async()=>null };
  vm.createContext(ctx);
  for (const name of ['social-evidence.ts','public-source-adapters.ts','public-source-verifier.ts','free-public-sources.ts']) {
    vm.runInContext(stripTypeScriptTypes(readFileSync(new URL('../integrations/appdeploy/'+name,import.meta.url),'utf8'),{ mode:'strip' }).replace(/^import .*;$/gm,'').replace(/^export /gm,''),ctx);
  }
  return { ctx,tables,table,calls,registered,now(next){time=next;},sources:[{ key:'indeed-angol',name:'Indeed',url,territory:'Angol' }] };
}

test('A verified free source saves a real ID and audit receipt before advancing its cursor, without claiming publication',async()=>{
  const h=harness();const result=await h.ctx.runFreePublicSources(h.sources,'public-run-00001',stamp);
  assert.equal(result.verified,1);assert.equal(result.stored,1);assert.equal(result.published,0);assert.equal(result.providerCalls,0);
  assert.equal(h.registered.length,1);assert.ok(h.registered[0].id.startsWith('free-'));
  assert.equal(h.table('free_public_source_runs').size,1);assert.equal(h.table('free_public_source_cursor').size,1);
});

test('Repeating a completed request reuses the receipt without network reads or duplicate offers',async()=>{
  const h=harness();await h.ctx.runFreePublicSources(h.sources,'public-run-00002',stamp);
  const calls=h.calls.filter(call=>call.method==='http').length;
  const result=await h.ctx.runFreePublicSources(h.sources,'public-run-00002',stamp);
  assert.equal(result.replayed,true);assert.equal(h.calls.filter(call=>call.method==='http').length,calls);assert.equal(h.registered.length,1);
});

test('The public cooldown prevents extra scans and blocked sources remain explicit',async()=>{
  const h=harness({ blocked:true });const result=await h.ctx.runFreePublicSources(h.sources,'public-run-00003',stamp);
  assert.equal(result.verified,0);assert.equal(result.audits[0].http,403);
  assert.equal((await h.ctx.runFreePublicSources(h.sources,'public-run-00004',stamp)).deferred,true);
  assert.equal(h.registered.length,0);
});

test('An atomic checkpoint failure preserves the saved offer and retry never creates a duplicate ID',async()=>{
  const h=harness({ abort:true });await assert.rejects(h.ctx.runFreePublicSources(h.sources,'public-run-00005',stamp),/atomic_abort/);
  assert.equal(h.table('free_public_source_cursor').size,0);assert.equal(h.table('free_public_source_runs').size,0);
  const existingId=h.registered[0].id;
  h.now(stamp+900000);await h.ctx.runFreePublicSources(h.sources,'public-run-00006',stamp+900000);
  assert.equal(h.registered[1].id,existingId);
  assert.equal(h.table(h.registered[0].table).size,1);
});

test('Different jobs receive globally distinct source IDs and storage-only receipts never mean visible publication',async()=>{
  const h=harness();await h.ctx.runFreePublicSources(h.sources,'public-run-00007',stamp);
  h.now(stamp+900000);h.sources[0].url=url.replace('0123456789abcdef','abcdef0123456789');
  await h.ctx.runFreePublicSources(h.sources,'public-run-00008',stamp+900000);
  assert.notEqual(h.registered[0].id,h.registered[1].id);
  const status=await h.ctx.freePublicSourceStatus();assert.equal(status.publishedConfirmed,null);assert.equal(status.readOnly,true);
});

test('Previously accepted offers are rechecked before expiry and keep their source ID, creation date and literal publication date',async()=>{
  const h=harness();
  const identity=createHash('sha256').update(url).digest('hex'),name='radar_external_'+identity.slice(0,32);
  const created='2026-10-11T12:00:00Z',stale=new Date(stamp-19*3600000).toISOString();
  h.table(name).set('historical-source-id',{ id:'historical-source-id',url,externalIdentity:identity,externalVerifiedAt:stale,createdAt:created });
  h.table('radar_external_pull_state').set('accepted',{ id:'accepted',receipts:[{ table:name,id:'historical-source-id' }] });
  const result=await h.ctx.runFreePublicSources(h.sources,'public-run-recheck-1',stamp);
  assert.equal(result.stored,1);assert.equal(result.trackedOffers,1);assert.equal(result.reverificationBacklog,0);
  assert.equal(h.registered[0].id,'historical-source-id');
  assert.equal(h.table(name).get('historical-source-id').createdAt,created);
  assert.equal(h.table(name).get('historical-source-id').sourcePublishedAt,'2026-10-12T12:00:00.000Z');
  assert.equal(h.table(name).get('historical-source-id').externalVerifiedAt,new Date(stamp).toISOString());
});

test('A blocked recheck preserves the historical offer and never refreshes its verification date',async()=>{
  const h=harness({ blocked:true });
  const identity=createHash('sha256').update(url).digest('hex'),name='radar_external_'+identity.slice(0,32);
  const stale=new Date(stamp-25*3600000).toISOString();
  h.table(name).set('historical-source-id',{ id:'historical-source-id',url,externalIdentity:identity,externalVerifiedAt:stale,createdAt:stale });
  h.table('radar_external_pull_state').set('accepted',{ id:'accepted',receipts:[{ table:name,id:'historical-source-id' }] });
  const result=await h.ctx.runFreePublicSources(h.sources,'public-run-recheck-2',stamp);
  assert.equal(result.stored,0);assert.equal(result.trackedOffers,1);assert.equal(h.registered.length,0);
  assert.equal(h.table(name).get('historical-source-id').externalVerifiedAt,stale);
  assert.equal(h.table('free_public_source_cursor').get('cursor').rechecks.length,1);
});

test('A multi-role document cannot be collapsed into a generic URL recheck or a duplicate offer',async()=>{
  const h=harness({blocked:true}),source='https://mtraiguen.cl/municipalidad/concurso/';
  const name='radar_external_'+'a'.repeat(32),record={id:'document-unit-id',url:source,documentUnitVerified:true,externalVerifiedAt:'2026-10-12T00:00:00Z'};
  h.table(name).set(record.id,structuredClone(record));
  h.table('radar_external_pull_state').set('accepted',{id:'accepted',receipts:[{table:name,id:record.id}]});
  h.table('free_public_source_cursor').set('cursor',{id:'cursor',position:0,queues:{},seen:{},pending:[{url:source,source:'Municipalidad'}],
    priorityCandidates:[{url:source,source:'Municipalidad'}],rechecks:[{url:source}]});
  const result=await h.ctx.runFreePublicSources(h.sources,'document-lane-001',stamp);
  assert.equal(result.documentsManagedSeparately,1);assert.equal(result.trackedOffers,0);
  assert.equal(h.calls.some(call=>call.method==='http'&&call.source===source),false);
  assert.deepEqual(h.table(name).get(record.id),record);assert.equal(h.table(name).size,1);
});

test('Local notices are selected alongside portals while media remains saved for the local reader',()=>{
 const h=harness(),items=[{url:url,source:'Indeed'},{url:'https://www.munilumaco.cl/aviso.pdf',source:'OMIL'},{url:'https://www.munilumaco.cl/oferta-laboral',source:'OMIL'}];
 assert.equal(h.ctx.pendingCandidateIndex(items,0),2);assert.equal(h.ctx.pendingCandidateIndex(items,1),0);
 assert.equal(h.ctx.pendingCandidateIndex([items[1]],0),-1);assert.equal(items.length,3);
});

test('A reviewed source can enter a full queue once without evicting historical candidates',async()=>{
 const h=harness();const pending=Array.from({length:100},(_,i)=>({url:'https://www.munilumaco.cl/archivo-'+i+'.pdf',source:'Archivo'}));
 h.table('free_public_source_cursor').set('cursor',{id:'cursor',position:0,queues:{},seen:{},pending,runId:'older-run-001'});
 h.sources[0].bootstrap=true;
 const result=await h.ctx.runFreePublicSources(h.sources,'bootstrap-scan-001',stamp);
 assert.equal(result.stored,1);assert.equal(result.pending,100);assert.equal(result.documentsAwaitingLocalReader,100);
 assert.equal(h.table('free_public_source_cursor').get('cursor').pending.length,100);
 assert.equal(h.table('free_public_source_reads').size,1);
});

test('Navigation and staff pages are not job candidates; literal job announcements still are',()=>{
 const h=harness(),origin='https://radioviaducto.cl/';
 const raw='<nav><a href="/oferta-laboral-antigua">Oferta laboral</a></nav><a href="/equipo-de-trabajo">Equipo de trabajo</a><a href="/omil-en-terreno">OMIL en terreno</a><a href="/oferta-laboral-operador">Oferta laboral: operador</a>';
 const links=h.ctx.publicPageLinks(raw,origin);assert.equal(links.candidates.length,1);assert.ok(links.candidates[0].url.endsWith('/oferta-laboral-operador'));
});

test('Source evidence retains overflow discoveries even when the work queue is full',async()=>{
 const candidate=url.replace('0123456789abcdef','abcdef0123456789');
 const h=harness({fetcher:async source=>({url:source,status:200,raw:'<a href="'+candidate+'">Operador</a>',mime:'text/html',bytes:100})});
 const pending=Array.from({length:100},(_,i)=>({url:'https://www.munilumaco.cl/archivo-'+i+'.pdf',source:'Archivo'}));
 h.table('free_public_source_cursor').set('cursor',{id:'cursor',position:0,queues:{},seen:{},pending,runId:'older-run-002'});
 const result=await h.ctx.runFreePublicSources(h.sources,'overflow-scan-001',stamp);
 assert.equal(result.pending,100);assert.equal(result.audits[0].queueFull,true);
 const read=[...h.table('free_public_source_reads').values()][0];assert.ok(read.candidateEvidence.some(entry=>entry.url===candidate));
});

test('Historical PDF URLs stay pending but cannot block the HTML source cursor',async()=>{
  const root='https://www.munilumaco.cl/',pdf=root+'bases-concurso.pdf';
  const h=harness({fetcher:async source=>({url:source,status:200,raw:'<h1>Municipalidad</h1>',mime:'text/html',bytes:100})});
  const sources=[{key:'lumaco',name:'OMIL Lumaco',url:root,territory:'Lumaco'}];
  const id=createHash('sha256').update('lumaco').digest('hex');
  h.table('free_public_seed_state').set(id,{id,key:'lumaco',queue:[pdf],seen:[],revision:1});
  h.table('free_public_source_cursor').set('cursor',{id:'cursor',position:0,queues:{},seen:{},pending:[{url:pdf,source:'OMIL Lumaco'}]});
  await h.ctx.runFreePublicSources(sources,'document-seed-001',stamp);
  assert.ok(h.calls.some(call=>call.method==='http' && call.source===root));
  assert.equal(h.calls.some(call=>call.method==='http' && call.source===pdf),false);
  assert.equal((await h.ctx.freePublicSourceStatus()).documentWork.items[0].url,pdf);
});
