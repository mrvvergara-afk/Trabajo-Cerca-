import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';import assert from 'node:assert/strict';import test from 'node:test';
const ctx=vm.createContext({URL,Date,Buffer,createHash});
for(const name of ['public-source-adapters.ts','local-contact-evidence.ts']) {
 const raw=readFileSync(new URL('../integrations/appdeploy/'+name,import.meta.url),'utf8');
 vm.runInContext(stripTypeScriptTypes(raw,{mode:'strip'}).replace(/^import .*;$/gm,'').replace(/^export /gm,''),ctx);
}
const evidence=JSON.parse(readFileSync(new URL('../config/evidence/mulchen-17979-2026-10-20.json',import.meta.url),'utf8'));
const source='https://www.munimulchen.cl/oferta-laboral-02-operarios-agrarios-cosecha-de-arandanos/';
const now=Date.parse('2026-10-20T12:00:00Z');
const offer=()=>({source_url:source,title:'OPERARIOS AGRÍCOLAS – COSECHA DE ARÁNDANOS',company:'Empresa del rubro agrícola de la comuna de Mulchén',work_commune:'Mulchén',source_published_at:'2026-10-19T23:37:41Z',valid_through:'',application:source,verified_at:evidence.reviewed_at,vacancies:100,application_details:{method:'in_person',instructions:'Interesados deben presentar la documentación en la Oficina OMIL, ubicada en calle Aníbal Pinto N°495 (al interior del edificio municipal). Atención de lunes a viernes, de 08:15 a 13:45 hrs.'},local_contact_evidence:structuredClone(evidence)});
test('real open municipal article, own index and original REST date allow in-person application without an invented deadline',()=>{
 assert.equal(ctx.validateLocalContactEvidence(offer(),now),true);
 assert.equal(ctx.localContactIndexStatus(evidence.index_html,source,offer().title),'open');
 assert.match(ctx.localContactDescription(evidence),/100 cupos/);
});
test('another role, employer, town, date, vacancy count, address, missing or altered raw evidence cannot publish',()=>{
 for(const changes of [{title:'Enfermera'},{company:'Municipalidad de Mulchén'},{work_commune:'Angol'},{source_published_at:'2026-10-20T01:00:00Z'},{vacancies:101},{application_details:{method:'in_person',instructions:'Presentarse en Oficina OMIL, calle falsa 123'}},{local_contact_evidence:undefined}])assert.throws(()=>ctx.validateLocalContactEvidence({...offer(),...changes},now));
 const item=offer();item.local_contact_evidence.source_html+='changed';assert.throws(()=>ctx.validateLocalContactEvidence(item,now));
 assert.throws(()=>ctx.validateLocalContactEvidence(offer(),now+86400000));
});
test('closing another card does not close this role; its own closed or missing card cannot remain open',()=>{
 const closed=evidence.index_html.replace('Postulación<strong> Abierta','Postulación<strong> Cerrada');
 assert.equal(ctx.localContactIndexStatus(closed,source,offer().title),'closed');
 assert.equal(ctx.localContactIndexStatus('',source,offer().title),'unknown');
 const item=offer();item.local_contact_evidence.index_html=closed;item.local_contact_evidence.index_sha256=createHash('sha256').update(closed).digest('hex');assert.throws(()=>ctx.validateLocalContactEvidence(item,now));
});

test('signed ingestion admits the proved in-person role and preserves physical instructions and the 100 cupos as one record',async()=>{
 const tables=new Map(),registered=[];
 const db={async list(name){return {items:[...(tables.get(name)||new Map())].map(([id,row])=>({id,...row}))};},async add(name,rows){if(!tables.has(name))tables.set(name,new Map());return rows.map(row=>{const id='id-'+tables.get(name).size;tables.get(name).set(id,row);return id;});},async update(name,rows){return rows.map(({id,record})=>{tables.get(name).set(id,record);return true;});}};
 ctx.db=db;ctx.registerPublicFeedChange=async(...args)=>registered.push(args);
 const raw=readFileSync(new URL('../integrations/appdeploy/radar-ingestion.ts',import.meta.url),'utf8');
 vm.runInContext(stripTypeScriptTypes(raw,{mode:'strip'}).replace(/^import .*;$/gm,'').replace(/^export /gm,''),ctx);
 const id=createHash('sha256').update(ctx.publicOfferIdentity(source)).digest('hex').slice(0,24);
 const row={...offer(),source:'Municipalidad de Mulchén',candidate_id:id,idempotency_key:'radar:'+id,validity_method:'dated_in_person',verification_method:'Municipalidad de Mulchén individual notice + dated public in-person application'};
 assert.equal(typeof ctx.validateOffer(row,now),'string');
 await ctx.storeVerifiedBatch({records:[row],run_id:'test'},'digest',x=>({url:x.source_url,title:x.title,company:x.company,active:true,verified:true,lastVerifiedAt:x.verified_at}),now);
 const table=[...tables.keys()].find(x=>x.startsWith('radar_external_')&&x!=='radar_external_pull_state');
 assert.equal(tables.get(table).size,1);const saved=[...tables.get(table).values()][0];assert.equal(saved.vacancies,100);assert.match(saved.note,/Aníbal Pinto/);assert.match(saved.workLocation,/Campamento/);assert.equal(registered.length,1);
 const identity=saved.externalIdentity;const checked=[];ctx.fetchPublicPage=async url=>({status:200,raw:url===evidence.index_url?evidence.index_html:evidence.source_html});
 ctx.db.get=async(name,ids)=>ids.map(id=>tables.get(name)?.get(id));
 await ctx.revalidateLocalContactOffers(now+86400000);assert.equal(tables.get(table).get('id-0').active,true);
 const retained=tables.get(table).get('id-0');assert.equal(retained.lastVerifiedAt,new Date(now+86400000).toISOString());assert.equal(retained.localContactEvidence.reviewed_at,evidence.reviewed_at);
 ctx.fetchPublicPage=async()=>({status:0,raw:'',error:'robots_disallowed'});await ctx.revalidateLocalContactOffers(now+2*86400000);assert.equal(tables.get(table).get('id-0').active,true);assert.equal(tables.get(table).get('id-0').lastVerifiedAt,retained.lastVerifiedAt);
 ctx.fetchPublicPage=async()=>({status:200,raw:evidence.index_html.replace('Postulación<strong> Abierta','Postulación<strong> Cerrada')});await ctx.revalidateLocalContactOffers(now+3*86400000);
 assert.equal(tables.get(table).get('id-0').active,false);assert.equal(tables.get(table).size,1);assert.equal(tables.get(table).get('id-0').externalIdentity,identity);
});
