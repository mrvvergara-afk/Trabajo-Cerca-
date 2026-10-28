import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
const stamp=Date.parse('2026-10-13T12:00:00Z'),url='https://cl.indeed.com/viewjob?jk=0123456789abcdef';
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
    return op.records.map(change=>{const old=rows.get(change.id);if (!old || Object.entries(change.if || {}).some(([key,value])=>old[key]!==value)) return false;rows.set(change.id,structuredClone(op.options?.patch?{...old,...change.record}:change.record));return true;});
  };
  const handle=operation=>({ operation,then(resolve,reject) {try{return Promise.resolve(execute(operation)).then(resolve,reject);}catch(error){return Promise.reject(error).then(resolve,reject);} } });
  const db={
    async list(name,{ limit=100,nextToken }={}) {calls.push({ method:'list',name,limit });const all=[...table(name)].map(([id,row])=>({...structuredClone(row),id})),start=Number(nextToken||0),end=start+limit;return {items:all.slice(start,end),nextToken:end<all.length?String(end):undefined};},
    async get(name,ids,options) {calls.push({ method:'get',name,ids,options });return ids.map(id=>structuredClone(table(name).get(id)||null));},
    async update(name,records) {calls.push({ method:'update',name });return execute({ method:'update',table:name,records });},
    tx:{ add:(name,records)=>handle({ method:'add',table:name,records }),update:(name,records,options)=>handle({ method:'update',table:name,records,options }) },
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
  vm.createContext(ctx); vm.runInContext(stripTypeScriptTypes(readFileSync('integrations/appdeploy/house-ads/shared/territories.ts','utf8'),{mode:'strip'}).replace(/^export /gm,''),ctx);
  for (const name of ['social-evidence.ts','public-source-adapters.ts','public-source-verifier.ts','offer-identity.ts','radar-trace.ts','publication-preflight.ts','free-public-sources.ts']) {
    vm.runInContext(stripTypeScriptTypes(readFileSync(new URL('../integrations/appdeploy/house-ads/backend/'+name,import.meta.url),'utf8'),{ mode:'strip' }).replace(/^import .*;$/gm,'').replace(/^export /gm,''),ctx);
  }
  return { ctx,tables,table,calls,registered,now(next){time=next;},sources:[{ key:'indeed-angol',name:'Indeed',url,territory:'Angol' }] };
}

test('native scan reports storage without inventing public publication',async()=>{
 const h=harness();const first=await h.ctx.runFreePublicSources(h.sources,'closure-source-0001',stamp);assert.equal(first.newStored,1);assert.equal(first.published,null);assert.equal(first.publicationStatus,'awaiting_public_feed_confirmation');
 const id=h.registered[0].id,table=h.registered[0].table,original=h.table(table).get(id).sourcePublishedAt;
 h.now(stamp+19*3600000);const second=await h.ctx.runFreePublicSources(h.sources,'closure-source-0002',stamp+19*3600000);
 assert.equal(second.newStored,0);assert.equal(second.revalidations,1);assert.equal(h.table(table).get(id).sourcePublishedAt,original);assert.equal(h.table(table).get(id).firstVerifiedAt,new Date(stamp).toISOString());
});
test('old archive cursors refresh the current index without discarding resumable work',async()=>{
 const h=harness({fetcher:async source=>({url:source,status:200,raw:'<a href="/page/97/" rel="next">Siguiente</a>',mime:'text/html',bytes:50})});const root='https://www.radionativa.cl/';const key=createHash('sha256').update('radio').digest('hex');h.table('free_public_seed_state').set(key,{id:key,key:'radio',queue:[root+'page/97/'],seen:[],revision:1});
 await h.ctx.runFreePublicSources([{key:'radio',name:'Radio',url:root,territory:'Lumaco'}],'closure-source-0003',stamp);assert(h.calls.some(x=>x.method==='http'&&x.source===root));assert(!h.calls.some(x=>x.method==='http'&&x.source.includes('/97/')));assert(h.table('free_public_seed_state').get(key).queue.some(x=>x.includes('/97/')));
});
test('Victoria stays local while all four complementary cities remain opt-in',()=>{
 const territory=readFileSync('integrations/appdeploy/house-ads/shared/territories.ts','utf8'),exploration=readFileSync('integrations/appdeploy/house-ads/src/territorial-exploration.ts','utf8');const js=stripTypeScriptTypes(territory+'\n'+exploration,{mode:'strip'}).replace(/^import .*;$/gm,'').replace(/^export /gm,'');const m=vm.runInNewContext('(function(){'+js+';return {PRIMARY_PLACES,EXPLORATION_CITIES,matchesTerritorialView};})()',{URL});
 assert.equal(m.PRIMARY_PLACES.length,13);assert.equal(m.EXPLORATION_CITIES.length,4);assert(m.matchesTerritorialView({kind:'job_offer',workCommunes:['Victoria']},'Todas',m.PRIMARY_PLACES));for(const city of m.EXPLORATION_CITIES)assert(!m.matchesTerritorialView({kind:'job_offer',workCommunes:[city]},'Todas',m.PRIMARY_PLACES));
});
