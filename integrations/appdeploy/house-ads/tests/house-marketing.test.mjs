import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const shared=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(read('shared/house-ads.ts'))).toString('base64'));
function setup(){
 let tables=new Map();const writes=[];let fail=false;
 const table=(t,map=tables)=>{if(!map.has(t))map.set(t,new Map());return map.get(t);};
 const operation=(kind,t,rows,options={})=>({kind,t,rows,options,then(resolve,reject){try{resolve(apply(this,tables));}catch(e){reject(e);}}});
 const conflict=()=>Object.assign(Error('conflict'),{code:'AppDatabaseConditionFailed'});
 function apply(op,map){writes.push(op.kind);const dest=table(op.t,map);return op.rows.map(row=>{
   if(op.kind==='add'){if(dest.has(row.id))return null;dest.set(row.id,structuredClone(row));return row.id;}
   const old=dest.get(row.id);if(!old||Object.entries(row.if||{}).some(([k,v])=>old[k]!==v))return false;
   const patch=Object.fromEntries(Object.entries(row.record).map(([k,v])=>[k,v&&typeof v==='object'&&'inc'in v?(old[k]||0)+v.inc:v]));dest.set(row.id,{...old,...patch});return true;
 });}
 const db={get:async(t,ids)=>ids.map(id=>structuredClone(table(t).get(id)||null)),list:async(t)=>({items:[...table(t).values()].map(structuredClone)}),tx:{add:(t,rows)=>operation('add',t,rows),update:(t,rows,options)=>operation('update',t,rows,options)},transact:async ops=>{if(fail)throw conflict();const copy=structuredClone(tables);for(const op of ops){const r=apply(op,copy);if(r.some(v=>v===null||v===false))throw conflict();}tables=copy;}};
 const json=(value,statusCode=200)=>({statusCode,headers:{},body:JSON.stringify(value)});const storage={url:async paths=>paths.map(path=>({path,url:'https://example.org/signed'})),write:async()=>[true]};
 const source=stripTypeScriptTypes(read('backend/house-marketing.ts')).replace(/^import .*;$/gm,'').replace(/^export /gm,'');
 const exports=vm.runInNewContext('(function(){'+source+';return {houseConfiguration,saveHouseConfiguration,advertisingCatalog,houseClientEvent,recordHouseEvent,houseDashboard,activateFreeTrial,uploadHouseCreative};})()',{db,storage,json,error:(message,statusCode)=>json({error:message},statusCode),increment:n=>({inc:n}),isAppDatabaseError:e=>!!e?.code,createHash,randomUUID,Buffer,URL,console,...shared});
 return {...exports,table:(t)=>table(t),setFail:v=>{fail=v;},writes};
}
const attrib={campaignId:'house-professionals',creativeId:'a'};
test('zero advertisers returns four defaults without seeding commercial records or writing data',async()=>{
 const b=setup();const r=await b.advertisingCatalog();assert.equal(r.complete,true);assert.equal(r.house.length,4);assert.equal(r.commercial.length,0);assert.equal(b.writes.length,0);
});
test('configuration persists pause/creative changes and rejects stale revision',async()=>{
 const b=setup();const campaigns=structuredClone(shared.HOUSE_DEFAULTS);campaigns[0].status='paused';
 const saved=await b.saveHouseConfiguration({body:{revision:'defaults-v1',campaigns}});assert.equal(saved.statusCode,200);
 assert.equal((await b.houseConfiguration()).campaigns[0].status,'paused');assert.equal((await b.saveHouseConfiguration({body:{revision:'defaults-v1',campaigns}})).statusCode,409);
});
test('browser metrics are idempotent and cannot forge server conversions or commercial sales',async()=>{
 const b=setup();const ctx={body:{...attrib,event:'impression',eventId:'synthetic-event-id-123'}};
 assert.equal((await b.houseClientEvent(ctx)).statusCode,202);await b.houseClientEvent(ctx);
 const rows=[...b.table('growth_house_metrics').values()];assert.equal(rows.length,1);assert.equal(rows[0].impression,1);assert.equal(rows[0].paid_conversion,0);assert.equal(rows[0].type,'HOUSE_AD');
 assert.equal((await b.houseClientEvent({body:{...ctx.body,event:'trial_activated'}})).statusCode,400);assert.equal(b.table('growth_campaigns').size,0);
 await b.recordHouseEvent(attrib,'profile_published','real-record-fixture');await b.recordHouseEvent(attrib,'profile_published','real-record-fixture');assert.equal([...b.table('growth_house_metrics').values()][0].profile_published,1);
});
test('failed atomic event cannot increment counters without a receipt',async()=>{
 const b=setup();b.setFail(true);await assert.rejects(b.recordHouseEvent(attrib,'click','event-fail'));assert.equal([...b.table('growth_house_metrics').values()][0].click,0);assert.equal(b.table('growth_house_events').size,0);
});
test('trial approval activates exactly 30 days, stays free and never renews on replay',async()=>{
 const b=setup();b.table('growth_advertiser_leads').set('lead',{id:'lead',businessName:'Fixture empresa',category:'Comercio',commune:'Angol',houseAttribution:attrib});
 const ctx={body:{leadId:'lead',headline:'Contenido revisado',detail:'Anuncio de fixture',url:'https://example.org'}};
 const first=JSON.parse((await b.activateFreeTrial(ctx)).body);const second=JSON.parse((await b.activateFreeTrial(ctx)).body);
 assert.equal(Date.parse(first.endAt)-Date.parse(first.startAt),30*86400000);assert.equal(first.id,second.id);assert.equal(first.endAt,second.endAt);assert.equal(second.duplicate,true);
 assert.equal(b.table('growth_campaigns').size,1);const ad=[...b.table('growth_campaigns').values()][0];assert.equal(ad.adType,'COMMERCIAL_FREE');assert(!JSON.stringify(ad).includes('houseAttribution'));assert.equal([...b.table('growth_house_metrics').values()][0].trial_activated,1);
});
test('invalid uploads and links reject before any storage write',async()=>{
 const b=setup();assert.equal((await b.uploadHouseCreative({body:{mime:'image/svg+xml',content:'PHN2Zz4='}})).statusCode,400);
 assert.equal((await b.uploadHouseCreative({body:{mime:'image/png',content:Buffer.from('not-png').toString('base64')}})).statusCode,400);
 assert.equal((await b.activateFreeTrial({body:{leadId:'x',headline:'X',detail:'X',url:'javascript:alert(1)'}})).statusCode,400);
});
test('new management endpoints retain SDK authentication and admin allowlist; public stats have no admin response',()=>{
 const source=read('backend/index.ts');for(const name of ['GET /api/admin/marketing/house','PUT /api/admin/marketing/house','POST /api/admin/marketing/creative','GET /api/admin/marketing/trials','POST /api/admin/marketing/trial'])assert(source.includes("'"+name+"': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS),"));
 assert(source.includes("'POST /api/growth/house-events': [publicQuota("));
});

test('both public form views pass house attribution through the actual FormPanel',()=>{
 const source=read('src/App.tsx');const forms=[...source.matchAll(/<FormPanel flow=\{flow\}[^>]+/g)];assert.equal(forms.length,2);assert(forms.every(m=>m[0].includes('attribution={houseAttribution}')));
});
