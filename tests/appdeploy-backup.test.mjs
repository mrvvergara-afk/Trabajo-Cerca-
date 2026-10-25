import test from 'node:test';
import assert from 'node:assert/strict';
import { beginBackup, backupStep, restoreIsolated } from '../scripts/appdeploy-backup.mjs';

const identity = { appId:'laboratorio', sourceVersion:'fixture-v1', startedAt:'2026-10-21T21:00:00Z', tables:['community_posts','notification_preferences'] };
function fixtures() {
  const objects = new Map();
  const calls = [];
  const sink = { async put(k,v) { objects.set(k,v); return true; }, async get(k) { return objects.get(k); } };
  const source = {
    async listTable(table, options) {
      calls.push({table,...options});
      if (table === 'community_posts') return options.nextToken ? {items:[{id:'two',active:false,ownerToken:'fixture-only'}]} : {items:[{id:'one',active:true,contact:{phone:'synthetic'}}],nextToken:'second'};
      return {items:[{id:'pref',enabled:true,places:['Angol']}]};
    },
    async listStorage() { return {paths:['images/fixture.png']}; },
    async readStorage(path) { return {path,content:'AAECAw=='}; }
  };
  return {objects,calls,sink,source};
}
async function complete(f) {
  let state = beginBackup(identity);
  for (let i=0; !state.complete && i<10; i++) state=await backupStep(state,f.source,f.sink);
  return state;
}
test('bounded export resumes and restores IDs, private fields, closed history and file content in isolation', async()=>{
  const f=fixtures(); const state=await complete(f);
  const restored=await restoreIsolated(state,f.sink,identity);
  assert.equal(restored.tables.get('community_posts').get('two').ownerToken,'fixture-only');
  assert.equal(restored.tables.get('community_posts').get('two').active,false);
  assert.equal(restored.files.get('images/fixture.png'),'AAECAw==');
  assert.equal(restored.productionWrites,0);
  assert.equal(restored.consistency,'rolling_non_atomic');
  assert.equal(f.calls.length,3);
  assert.ok(f.calls.every(call=>call.limit===20));
});
test('failed durable acknowledgement never advances the original checkpoint',async()=>{
  const f=fixtures(); const state=beginBackup(identity); const before=structuredClone(state);
  await assert.rejects(backupStep(state,f.source,{put:async()=>false}),/not_acknowledged/);
  assert.deepEqual(state,before);
  const next=await backupStep(state,f.source,f.sink);
  assert.equal(next.cursor,'second');
});
test('read quota failures propagate without retry or loss of cursor',async()=>{
  const f=fixtures();const state=beginBackup(identity);let calls=0;
  f.source.listTable=async()=>{calls++;throw Error('AppDatabaseQuotaExceeded');};
  await assert.rejects(backupStep(state,f.source,f.sink),/QuotaExceeded/);
  assert.equal(calls,1);assert.equal(state.cursor,null);
});
test('incomplete, missing-table and changed-scope archives cannot restore',async()=>{
  const f=fixtures();await assert.rejects(restoreIsolated(beginBackup(identity),f.sink,identity),/incomplete/);
  const state=await complete(f);
  await assert.rejects(restoreIsolated(state,f.sink,{...identity,tables:['community_posts']}),/scope_mismatch/);
  state.pages=state.pages.filter(p=>p.table!=='notification_preferences');
  await assert.rejects(restoreIsolated(state,f.sink,identity),/table_missing/);
});
test('corrupt page or missing storage object aborts restoration',async()=>{
  const f=fixtures();const state=await complete(f);
  const key=state.pages[0].key;const original=f.objects.get(key);f.objects.set(key,'tampered');
  await assert.rejects(restoreIsolated(state,f.sink,identity),/page_corrupt/);
  f.objects.set(key,original);f.objects.delete(state.files[0].key);
  await assert.rejects(restoreIsolated(state,f.sink,identity),/file_corrupt/);
});
test('repeated pagination token and missing storage body never report success',async()=>{
  const f=fixtures();let state=await backupStep(beginBackup(identity),f.source,f.sink);
  f.source.listTable=async()=>({items:[],nextToken:'second'});
  await assert.rejects(backupStep(state,f.source,f.sink),/pagination_loop/);
  const g=fixtures();state=beginBackup(identity);
  while(state.phase==='tables')state=await backupStep(state,g.source,g.sink);
  g.source.readStorage=async path=>({path,content:null});
  await assert.rejects(backupStep(state,g.source,g.sink),/storage_object_missing/);
});
