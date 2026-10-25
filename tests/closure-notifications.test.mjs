import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {createHash,randomUUID} from 'node:crypto';
const root='integrations/appdeploy/house-ads/';
const code=stripTypeScriptTypes(readFileSync(root+'backend/notification-dispatch.ts','utf8'),{mode:'strip'}).replace(/^import .*;$/gm,'').replace(/^export /gm,'');
const hash=s=>createHash('sha256').update(s).digest('hex');
function harness(send=async()=>({sent:1,failed:0})){
 let clock=Date.parse('2026-10-25T02:00:00Z');
 class Clock extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
 const tables=new Map(),items=new Map(),calls=[],sends=[];
 const table=name=>{if(!tables.has(name))tables.set(name,new Map());return tables.get(name);};
 const db={get:async(name,ids)=>ids.map(id=>structuredClone(table(name).get(id)||null)),
  list:async(name,options={})=>{calls.push({name,...options});const rows=[...table(name)].map(([id,row])=>({...structuredClone(row),id}));const start=Number(options.nextToken||0),limit=options.limit||40;return {items:rows.slice(start,start+limit),nextToken:start+limit<rows.length?String(start+limit):undefined};},
  delete:async(name,ids)=>ids.map(id=>table(name).delete(id)),tx:{
   add:async(name,rows)=>rows.map(row=>{if(table(name).has(row.id))return null;table(name).set(row.id,structuredClone(row));return row.id;}),
   update:async(name,changes,options={})=>changes.map(change=>{const old=table(name).get(change.id);if(!old||Object.entries(change.if||{}).some(([key,value])=>old[key]!==value))return false;const value=options.patch?{...old,...structuredClone(change.record)}:structuredClone(change.record);for(const key of Object.keys(value))if(value[key]===undefined)delete value[key];table(name).set(change.id,value);return true;})}};
 const api=vm.runInNewContext('(function(){'+code+';return {queueNotificationOffers,runNotificationDispatch,getAlertPreference,saveAlertPreference,disableAlertPreference};})()',{db,notifications:{send:async payload=>{sends.push(payload);return send(payload);}},createHash,randomUUID,Date:Clock,readPublicFeedItem:async id=>items.get(id)||null,publicFeedIdentity:value=>value,hasVerificationEvidence:item=>!!item.verificationMethod});
 const job=(id='external-isolated')=>({id,kind:'job_offer',verified:true,review:false,active:true,title:'Ensayo aislado',workCommunes:['Angol'],verificationMethod:'isolated-evidence',url:'https://example.invalid/job/'+id,firstPublishedAt:new Clock().toISOString()});
 return {api,table,items,calls,sends,job,advance:ms=>{clock+=ms;}};
}
test('a new canonical offer from an external source is staged and sent once; revalidation cannot resend it',async()=>{
 const h=harness();await h.api.saveAlertPreference('user',['Angol'],[]);h.advance(1000);const item=h.job();h.items.set(item.id,item);
 await h.api.queueNotificationOffers([item]);await h.api.runNotificationDispatch();assert.equal(h.sends.length,1);
 h.advance(3600000);await h.api.queueNotificationOffers([{...item,verifiedAt:new Date().toISOString()}]);await h.api.runNotificationDispatch();assert.equal(h.sends.length,1);assert.equal(h.table('notification_offer_history').size,1);
});
test('an explicit failed send is retried after its own deadline even after the offer queue advanced',async()=>{
 let attempts=0;const h=harness(async()=>++attempts===1?{sent:0,failed:1}:{sent:1,failed:0});
 await h.api.saveAlertPreference('user',['Angol'],[]);h.advance(1000);const item=h.job();h.items.set(item.id,item);await h.api.queueNotificationOffers([item]);
 await h.api.runNotificationDispatch();assert.equal(h.table('notification_delivery_retries').size,1);assert.equal(h.table('notification_offer_queue').size,0);
 await h.api.runNotificationDispatch();assert.equal(attempts,1);h.advance(3600001);await h.api.runNotificationDispatch();assert.equal(attempts,2);assert.equal(h.table('notification_delivery_retries').size,0);assert.equal([...h.table('notification_delivery_receipts').values()][0].status,'sent');
});
test('an ambiguous provider exception is visible as uncertain and never blindly resent',async()=>{
 const h=harness(async()=>{throw Error('unknown acceptance');});await h.api.saveAlertPreference('user',['Angol'],[]);h.advance(1000);const item=h.job();h.items.set(item.id,item);await h.api.queueNotificationOffers([item]);
 const result=await h.api.runNotificationDispatch();assert.equal(result.uncertain,1);assert.equal(h.table('notification_delivery_retries').size,0);h.advance(3600000);await h.api.runNotificationDispatch();assert.equal(h.sends.length,1);
});
test('legacy preference 201 can unsubscribe immediately; migration cannot overwrite its tombstone',async()=>{
 const h=harness();for(let i=0;i<205;i++)h.table('notification_preferences').set('legacy-'+i,{userId:'user-'+i,active:true,communes:['Angol'],keywords:[],createdAt:'2026-10-24T00:00:00Z',updatedAt:'2026-10-24T00:00:00Z'});
 await h.api.disableAlertPreference('user-201');assert.equal((await h.api.getAlertPreference('user-201')).active,false);
 for(let i=0;i<6;i++)await h.api.runNotificationDispatch();assert.equal(h.table('notification_user_preferences').size,205);assert.equal(h.table('notification_user_preferences').get(hash('user-201')).active,false);
 assert(h.calls.filter(x=>x.name==='notification_preferences').every(x=>x.limit===40));
});
test('recipient pagination and checkpoints reach beyond 200 without resending previous recipients',async()=>{
 const h=harness();for(let i=0;i<205;i++)await h.api.saveAlertPreference('user-'+i,['Angol'],[]);
 h.advance(1000);const item=h.job();h.items.set(item.id,item);await h.api.queueNotificationOffers([item]);
 for(let i=0;i<15;i++)await h.api.runNotificationDispatch();assert.equal(h.sends.length,205);assert.equal(new Set(h.sends.map(x=>x.data.event_id)).size,205);assert.equal(h.table('notification_offer_queue').size,0);
});
test('expired/removed offers, other communes and subscriptions created after publication are not notified',async()=>{
 const h=harness();await h.api.saveAlertPreference('other',['Victoria'],[]);h.advance(1000);const item=h.job();h.items.set(item.id,item);await h.api.queueNotificationOffers([item]);h.advance(1000);await h.api.saveAlertPreference('late',['Angol'],[]);await h.api.runNotificationDispatch();assert.equal(h.sends.length,0);
});
test('old offers before dispatcher enablement do not become new by editing or revalidating',async()=>{
 const h=harness();await h.api.saveAlertPreference('user',['Angol'],[]);const item={...h.job(),firstPublishedAt:'2026-10-20T00:00:00Z'};await h.api.queueNotificationOffers([item]);assert.equal(h.table('notification_offer_queue').size,0);
});
