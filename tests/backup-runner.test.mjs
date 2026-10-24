import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const read = name => fs.readFileSync(new URL('../integrations/appdeploy/'+name,import.meta.url),'utf8');
const url = code => 'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const cryptoUrl = url(stripTypeScriptTypes(read('backup-crypto.ts')));
const runnerCode = stripTypeScriptTypes(read('backup-runner.ts')).replace("from './backup-crypto'",'from '+JSON.stringify(cryptoUrl));
const {newBackupRun,advanceBackup,checkBackupRun,backupFailure}=await import(url(runnerCode));
const password='synthetic-resume-password';
function source() {
  const calls=[];let fail=true;
  return {calls,read:async body=>{
    calls.push({...body});
    if(body.kind==='scope')return {tables:['community_posts'],revision:'fixture'};
    if(body.kind==='table'&&!body.cursor)return {kind:'table',table:body.table,items:[{id:'old',active:false,ownerToken:'fixture-only'}],nextToken:'page-two'};
    if(body.kind==='table') {if(fail){fail=false;throw {response:{status:429}};}return {kind:'table',table:body.table,items:[{id:'new'}]};}
    if(body.kind==='storage')return {paths:['fixture/a','fixture/b']};
    if(body.kind==='file')return {kind:'file',path:body.path,content:'AAECAw=='};
  }};
}
test('a quota interruption resumes at the saved page and preserves prior IDs and ciphertext',async()=>{
  const f=source();let state=await newBackupRun(password);
  state=await advanceBackup(state,f.read);state=await advanceBackup(state,f.read);
  const original=JSON.stringify(state.envelope);const cursor=state.cursor;
  await assert.rejects(advanceBackup(state,f.read));
  assert.equal(state.cursor,cursor);assert.equal(JSON.stringify(state.envelope),original);
  while(state.phase!=='complete')state=await advanceBackup(state,f.read);
  const result=await checkBackupRun(state,password);
  assert.deepEqual(result,{tables:1,records:2,files:2,platformRestoreTested:false});
  assert.equal(f.calls.filter(c=>c.kind==='scope').length,1);
  assert.equal(f.calls.filter(c=>c.kind==='table'&&!c.cursor).length,1);
  assert.equal(f.calls.filter(c=>c.kind==='table'&&c.cursor==='page-two').length,2);
});
test('a file failure retries only the pending object, not completed storage pages/files',async()=>{
  const f=source();let state=await newBackupRun(password);
  const read=async body=>{try{return await f.read(body);}catch{return {kind:'table',table:body.table,items:[{id:'new'}]};}};
  while(state.phase!=='files')state=await advanceBackup(state,read);
  state=await advanceBackup(state,read);
  const before=JSON.stringify(state.envelope);
  await assert.rejects(advanceBackup(state,async()=>{throw Error('network');}));
  assert.equal(JSON.stringify(state.envelope),before);assert.deepEqual(state.pendingPaths,['fixture/b']);
  while(state.phase!=='complete')state=await advanceBackup(state,read);
  assert.equal(f.calls.filter(c=>c.kind==='storage').length,1);
  assert.equal(f.calls.filter(c=>c.path==='fixture/a').length,1);
  assert.equal((await checkBackupRun(state,password)).files,2);
});
test('failed encryption/byte budget does not commit a duplicate page on retry',async()=>{
  const f=source();let state=await advanceBackup(await newBackupRun(password),f.read);
  state.encryptedBytes=45000000;const before=JSON.stringify(state.envelope);
  await assert.rejects(advanceBackup(state,f.read),/backup_limit/);
  assert.equal(JSON.stringify(state.envelope),before);assert.equal(state.cursor,null);assert.deepEqual(state.ids,{});
});
test('pagination loop and duplicate physical IDs stop without advancing the checkpoint',async()=>{
  const f=source();let state=await advanceBackup(await newBackupRun(password),f.read);
  state=await advanceBackup(state,f.read);const before=JSON.stringify(state.envelope);
  await assert.rejects(advanceBackup(state,async()=>({kind:'table',table:'community_posts',items:[],nextToken:'page-two'})),/pagination_loop/);
  await assert.rejects(advanceBackup(state,async()=>({kind:'table',table:'community_posts',items:[{id:'old'}]})),/duplicate_id/);
  assert.equal(JSON.stringify(state.envelope),before);
});
test('diagnostics distinguish quota/session/size/inconsistency without echoing raw sensitive errors',()=>{
  for(const status of [401,403,429,503])assert.equal(backupFailure({response:{status}}).resumable,true);
  assert.equal(backupFailure({response:{status:413}}).code,'backup_size');
  assert.equal(backupFailure({response:{status:413}}).resumable,false);
  assert.equal(backupFailure(Error('duplicate_id')).resumable,false);
  assert(!JSON.stringify(backupFailure(Error('password=private-value'))).includes('private-value'));
});
