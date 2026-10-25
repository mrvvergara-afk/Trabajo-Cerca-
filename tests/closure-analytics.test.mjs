import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {createHash} from 'node:crypto';
const read=name=>stripTypeScriptTypes(readFileSync('integrations/appdeploy/house-ads/backend/'+name,'utf8'),{mode:'strip'}).replace(/^import .*;$/gm,'').replace(/^export /gm,'');
const load=(name,exports,dependencies)=>vm.runInNewContext('(function(){'+read(name)+';return {'+exports+'};})()',dependencies);
test('PostHog uses only its fixed HTTPS destination, sanitized properties and a daily pseudonym',async()=>{
 const calls=[],{sendPosthogEvent}=load('analytics-delivery.ts','sendPosthogEvent',{Buffer,AbortSignal});
 const transport=async(url,request)=>{calls.push({url,request});return {ok:true};};
 const id=createHash('sha256').update('isolated daily identity').digest('hex');
 assert(await sendPosthogEvent('isolated-public-key','tc_app_open',id,{commune:'Renaico',phone:'private-fixture',ownerToken:'secret-fixture'},transport));
 assert.equal(calls[0].url,'https://us.i.posthog.com/capture/');assert.equal(calls[0].request.redirect,'error');assert.equal(calls[0].request.method,'POST');
 const data=JSON.parse(calls[0].request.body);assert.equal(data.properties.distinct_id,id);assert.equal(data.properties.$process_person_profile,false);assert(!calls[0].request.body.includes('fixture'));
 await assert.rejects(sendPosthogEvent('x','tc_app_open','raw-device-id',{},transport),/daily_identity/);assert.equal(calls.length,1);
});
function usage(){
 let tables=new Map(),unknown=false;const table=(name,target=tables)=>{if(!target.has(name))target.set(name,new Map());return target.get(name);};
 const apply=(op,target)=>op.rows.map(row=>{const t=table(op.name,target);if(op.kind==='add'){if(t.has(row.id))return null;t.set(row.id,structuredClone(row));return row.id;}const old=t.get(row.id);if(!old)return false;const patch={...row.record};for(const [key,value] of Object.entries(patch))if(value&&typeof value==='object'&&'inc'in value)patch[key]=(old[key]||0)+value.inc;t.set(row.id,{...old,...patch});return true;});
 const operation=(kind,name,rows)=>({kind,name,rows,then(resolve,reject){try{resolve(apply(this,tables));}catch(e){reject(e);}}});
 const db={get:async(name,ids)=>ids.map(id=>structuredClone(table(name).get(id)||null)),list:async name=>({items:[...table(name).values()]}),tx:{add:(name,rows)=>operation('add',name,rows),update:(name,rows)=>operation('update',name,rows)},transact:async operations=>{const staged=structuredClone(tables);for(const op of operations)if(apply(op,staged).some(x=>x===null||x===false))throw Object.assign(Error(),{code:'AppDatabaseDuplicateId'});tables=staged;if(unknown){unknown=false;throw Object.assign(Error(),{code:'AppDatabaseUnknownOutcome'});}}};
 const api=load('usage-metrics.ts','recordUsageEvent,readUsageMetrics',{db,createHash,Date,increment:inc=>({inc}),isAppDatabaseError:e=>!!e?.code,WORK_PLACES:['Renaico']});return {...api,table,unknown:()=>{unknown=true;},all:()=>[...tables.values()].flatMap(t=>[...t.values()])};
}
test('event receipt replay does not duplicate counts or daily unique devices',async()=>{
 const h=usage();await h.recordUsageEvent('isolated-event-0001','tc_app_open','isolated-visitor','Renaico');await h.recordUsageEvent('isolated-event-0001','tc_app_open','isolated-visitor','Renaico');await h.recordUsageEvent('isolated-event-0002','tc_app_open','isolated-visitor','Renaico');
 const [metric]=h.table('growth_usage_metrics').values();assert.equal(metric.count,2);assert.equal(metric.uniqueDevices,1);assert(!JSON.stringify(h.all()).includes('isolated-visitor'));
});
test('unknown transaction outcome is reconciled without applying another increment',async()=>{
 const h=usage();h.unknown();assert.equal((await h.recordUsageEvent('isolated-event-0003','tc_app_open','visitor','Renaico')).received,true);assert.equal([...h.table('growth_usage_metrics').values()][0].count,1);
});
test('contacts and arbitrary strings cannot become analytics dimensions',async()=>{
 const h=usage();await h.recordUsageEvent('isolated-event-0004','tc_app_open','visitor','private@example.invalid');assert.equal([...h.table('growth_usage_metrics').values()][0].commune,'Todas');assert(!JSON.stringify(h.all()).includes('@'));
});
