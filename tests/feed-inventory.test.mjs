import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

const code=stripTypeScriptTypes(readFileSync(new URL('../integrations/appdeploy/feed-inventory.ts',import.meta.url),'utf8'),{mode:'strip'}).replace(/^export /gm,'');
const context=vm.createContext({ encodeURIComponent });vm.runInContext(code,context);
const readInventory=context.readFeedInventory;
const item=id=>({id,kind:'job_offer',title:id,source:'Municipalidad'});

test('continues after the three expected IDs and reads the last page',async()=>{
  const paths=[];
  const result=await readInventory(async path=>{paths.push(path);return {data:paths.length===1
    ? {items:['traiguen1','traiguen2','traiguen3'].map(item),totalItems:4,nextCursor:'v2:snapshot:1'}
    : {items:[item('later')],totalItems:4}};});
  assert.equal(result.complete,true);assert.equal(result.items.length,4);assert.equal(paths.length,2);
  assert.equal(paths[1],'/api/listings?fresh=1&cursor=v2%3Asnapshot%3A1');
});
test('a partial read, exhausted budget or repeated cursor never confirms the full count',async()=>{
  for (const mode of ['failure','budget','loop']) {
    let count=0;
    const result=await readInventory(async()=>{if (++count===2 && mode==='failure')throw Error('offline');
      return {data:{items:[item('id'+count)],totalItems:10,nextCursor:'same'}};},mode==='budget'?1:3);
    assert.equal(result.complete,false);assert.ok(result.error);
  }
});
test('duplicates and a mismatch with the snapshot total are not hidden by deduplication',async()=>{
  for (const data of [{items:[item('one'),item('one')],totalItems:2},{items:[item('one')],totalItems:2}]) {
    assert.equal((await readInventory(async()=>({data}))).complete,false);
  }
});
test('an authoritative empty snapshot is distinguishable from a failed read',async()=>{
  const empty=await readInventory(async()=>({data:{items:[],totalItems:0,totalJobOffers:0}}));
  assert.equal(empty.complete,true);assert.equal(empty.totalJobOffers,0);assert.equal(empty.items.length,0);
  assert.equal((await readInventory(async()=>{throw Error('offline');})).complete,false);
});
test('complete SDK evidence preserves original dates and the application URL per job ID',async()=>{
 const source={...item('one'),sourcePublishedAt:'2026-10-06T00:00:00Z',sourceValidThrough:'2027-02-03T00:00:00Z',applicationUrl:'https://www.laborum.cl/empleos/unimarc-1118469523.html',lastVerifiedAt:'2026-10-20T09:37:00Z'};
 const result=await readInventory(async()=>({data:{items:[source],totalItems:1}}));assert.equal(result.items[0].applicationUrl,source.applicationUrl);assert.equal(result.items[0].sourcePublishedAt,source.sourcePublishedAt);assert.equal(result.items[0].sourceValidThrough,source.sourceValidThrough);
});
