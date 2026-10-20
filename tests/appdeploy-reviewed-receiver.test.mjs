import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
const source=readFileSync(new URL('../integrations/appdeploy/reviewed-receiver.ts',import.meta.url),'utf8').replace(/^export /gm,'');
const h=vm.createContext({Date,Number,Promise});vm.runInContext(stripTypeScriptTypes(source,{mode:'strip'}),h);

test('only a stored signed batch can advance and confirm the existing feed',async()=>{
 const calls=[];
 const run=h.reviewedReceiver({ingest:async()=>{calls.push('signed');return{status:'stored_waiting_for_feed',stored:3,published:0};},
  advance:async()=>{calls.push('feed');return{rebuilding:false};},confirm:async()=>{calls.push('receipts');return{status:'published',published:3};}});
 const result=await run({records:[{title:'untrusted input is not accepted'}]});
 assert.deepEqual(calls,['signed','feed','receipts']);assert.equal(result.receipts.published,3);assert.equal(result.providerCalls,0);
});
test('a rejected signature, absent exchange or transport failure never advances or confirms',async()=>{
 for(const status of ['batch_rejected','awaiting_signed_batch','transport_unavailable','no_verified_offers']){
 const run=h.reviewedReceiver({ingest:async()=>({status,stored:0,published:0}),advance:async()=>assert.fail('Must not advance'),confirm:async()=>assert.fail('Must not confirm')});
 assert.equal((await run()).status,status);
 }
});
test('concurrent calls share one consumption and a one-minute cooldown limits later work',async()=>{
 let at=100000,ingestions=0,done;
 const waiting=new Promise(resolve=>{done=resolve;});
 const run=h.reviewedReceiver({ingest:async()=>{ingestions++;await waiting;return{status:'unchanged',stored:0,published:3};},advance:async()=>({}),confirm:async()=>({status:'published',published:3})},()=>at);
 const one=run(),two=run();assert.equal(one,two);done();await one;assert.equal(ingestions,1);
 assert.equal((await run()).status,'cooldown');assert.equal(ingestions,1);
 at+=60000;await run();assert.equal(ingestions,2);
});
test('a partial feed stays pending instead of being counted as a new publication',async()=>{
 const run=h.reviewedReceiver({ingest:async()=>({status:'stored_waiting_for_feed',stored:3,published:0}),advance:async()=>({rebuilding:true}),confirm:async()=>({status:'stored_waiting_for_feed',published:0})});
 const result=await run();assert.equal(result.status,'stored_waiting_for_feed');assert.equal(result.receipts.published,0);
 assert.equal(result.published_new,undefined);
});
test('failure propagates without a fallback collector and releases the concurrency lock',async()=>{
 let at=0,count=0;
 const run=h.reviewedReceiver({ingest:async()=>{count++;throw new Error('verification unavailable');},advance:async()=>assert.fail(),confirm:async()=>assert.fail()},()=>at);
 await assert.rejects(run(),/verification unavailable/);at=60000;await assert.rejects(run(),/verification unavailable/);assert.equal(count,2);
});
