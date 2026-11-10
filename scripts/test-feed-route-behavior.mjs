// Executes the real AppDeploy route excerpt with the proposed patch in an isolated VM.
// Run: node --test scripts/test-feed-route-behavior.mjs
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
const fixture=readFileSync(new URL('../appdeploy_staging/fixtures/index-listings-route.ts.txt',import.meta.url),'utf8');
const diff=readFileSync(new URL('../appdeploy_staging/patches/no-false-zero-feed.patch',import.meta.url),'utf8');
const removed=[],added=[];
let hunk=false;
for(const line of diff.split('\n')){
 if(line.startsWith('@@')){hunk=true;continue;}
 if(!hunk||line==='*** End Patch')continue;
 if(line.startsWith('-'))removed.push(line.slice(1));
 else if(line.startsWith('+'))added.push(line.slice(1));
 else if(line.startsWith(' ')){removed.push(line.slice(1));added.push(line.slice(1));}
}
const before=removed.join('\n'),after=added.join('\n');
assert.equal(fixture.split(before).length-1,1,'AppDeploy source fixture drift');
const updated=fixture.replace(before,after);
const begin=updated.indexOf("'GET /api/listings': [");
const end=updated.indexOf("'GET /api/listings/:id': [",begin);
assert.ok(begin>=0&&end>begin);
const declaration=updated.slice(begin,end).trim().replace(/,\s*$/,'');
function routeWith({feed=null,staged=null,throwError=null}={}){
 const calls={warns:[]};
 const scope={
   readPublicFeedPage:async()=>{if(throwError)throw throwError;return feed;},
   readStagedPublicFeedPage:async()=>staged,
   json:x=>({status:200,body:x}),
   error:(message,status)=>({status,body:{message}}),
   cacheable:(x,seconds)=>({status:200,body:x,cacheSeconds:seconds}),
   console:{warn:x=>calls.warns.push(x)}
 };
 const routes=runInNewContext('({'+declaration+'})',scope);
 return {handler:routes['GET /api/listings'][0],calls};
}
test('normal manifest remains visible with cache',async()=>{
 const data={items:[{title:'Trabajo vigente'}],totalItems:228};
 const {handler}=routeWith({feed:data});
 const result=await handler({query:{}});
 assert.equal(result.status,200);
 assert.equal(result.body.totalItems,228);
 assert.equal(result.cacheSeconds,60);
});
test('fresh manifest is returned uncached',async()=>{
 const {handler}=routeWith({feed:{items:[],totalItems:228}});
 const result=await handler({query:{fresh:'1'}});
 assert.equal(result.status,200);
 assert.equal(result.cacheSeconds,undefined);
});
test('staged verified page remains available',async()=>{
 const staged={items:[{title:'Oferta provisional verificada'}],degraded:true};
 const {handler}=routeWith({staged});
 const result=await handler({query:{}});
 assert.equal(result.status,200);
 assert.equal(result.body.items.length,1);
});
test('no manifest or staged page yields 503, never a false zero',async()=>{
 const {handler,calls}=routeWith();
 const result=await handler({query:{}});
 assert.equal(result.status,503);
 assert.equal(result.body.totalItems,undefined);
 assert.equal(calls.warns.length,1);
});
test('invalid cursor still returns HTTP 400',async()=>{
 const {handler}=routeWith({throwError:new Error('Feed cursor invalid')});
 const result=await handler({query:{cursor:'bad'}});
 assert.equal(result.status,400);
});
test('other storage errors propagate for monitoring',async()=>{
 const {handler}=routeWith({throwError:new Error('database offline')});
 await assert.rejects(handler({query:{}}),/database offline/);
});
