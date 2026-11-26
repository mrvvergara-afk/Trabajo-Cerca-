// Run with Node 24: node --test staging/appdeploy/backend/motor-b-idle-assist.test.mjs
// Simulated SDK; no production calls. Executes the actual TypeScript source.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {randomUUID} from 'node:crypto';
const source=stripTypeScriptTypes((await readFile(new URL('./motor-b-idle-assist.ts',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace('export async function','async function'));
const build=(db,enqueueAdminReviewedOffer)=>new Function('db','enqueueAdminReviewedOffer','randomUUID',source+'\nreturn assistMotorCWhenBIdle;')(db,enqueueAdminReviewedOffer,randomUUID);
const id=n=>'tc_'+n.toString(16).padStart(22,'0');
function fixture(count,enqueue){
 const rows=Array.from({length:count},(_,i)=>({id:id(i+1),kind:'review_candidate',sourceId:'motor-c-test',status:'ready_for_final_check'}));
 let checkpoint;const calls=[];
 const db={get:async(table,ids)=>table==='radar_review_inbox'?rows.filter(r=>ids.includes(r.id)):[structuredClone(checkpoint)],list:async()=>({items:rows,nextToken:null}),tx:{
 add:async(table,[row])=>{if(checkpoint)return [false];checkpoint=structuredClone(row);return [row.id]},
 update:async(table,[change])=>{if(checkpoint?.revision!==change.if.revision)return [false];checkpoint=structuredClone(change.record);return [true]}
 }};
 return {run:build(db,async({id})=>{calls.push(id);return enqueue(id)}),calls,checkpoint:()=>checkpoint};
}
test('first two fail, third and fourth succeed, remaining candidate preserved',async()=>{
 const f=fixture(5,async x=>{if(x===id(1))throw Error('temporary');return {queued:x!==id(2)}});
 const r=await f.run(0,0);assert.equal(r.checked,4);assert.equal(r.errors,1);assert.equal(r.deferred,1);assert.equal(r.submitted,2);assert.deepEqual(f.checkpoint().pending,[id(5)]);assert.ok(f.checkpoint().retryAfter[id(1)]);assert.ok(f.checkpoint().retryAfter[id(2)]);assert.equal(f.checkpoint().leaseUntil,0);
 const next=await f.run(0,0);assert.equal(next.submitted,1);assert.equal(f.calls.length,5);
});
test('six attempts maximum with all rejected',async()=>{const f=fixture(8,async()=>({queued:false}));const r=await f.run(0,0);assert.equal(r.checked,6);assert.equal(r.deferred,6);assert.equal(f.checkpoint().pending.length,2)});
test('existing queue entries count toward the two-item safety cap',async()=>{const f=fixture(5,async()=>({queued:true,alreadyQueued:true}));const r=await f.run(0,0);assert.equal(r.alreadyQueued,2);assert.equal(r.submitted,0);assert.equal(f.calls.length,2)});
test('PDF backlog or unknown input prohibits assistance',async()=>{const f=fixture(3,async()=>({queued:true}));for(const [a,b] of [[1,0],[0,1],[0,null]])assert.equal((await f.run(a,b)).eligible,false);assert.equal(f.calls.length,0)});
test('concurrent invocations acquire only one checkpoint lease',async()=>{const f=fixture(5,async()=>({queued:true}));const results=await Promise.all([f.run(0,0),f.run(0,0)]);assert.equal(results.filter(r=>r.eligible).length,1);assert.equal(f.calls.length,2)});
