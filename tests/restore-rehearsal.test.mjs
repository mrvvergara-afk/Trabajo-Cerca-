import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const read=name=>fs.readFileSync(new URL('../integrations/appdeploy/'+name,import.meta.url),'utf8');
const url=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const cryptoUrl=url(stripTypeScriptTypes(read('backup-crypto.ts')));
const cryptoModule=await import(cryptoUrl);
const restoreCode=stripTypeScriptTypes(read('restore-rehearsal.ts')).replace("from './backup-crypto'",'from '+JSON.stringify(cryptoUrl));
const {rehearseRestore}=await import(url(restoreCode));
const password='synthetic-local-restore-fixture';
async function archive({app='trabajo-cerca-laboratorio-3ojgro',count=2}={}) {
  const {envelope,key}=await cryptoModule.beginEncryptedBackup(password);
  await cryptoModule.appendEncrypted(envelope,key,{kind:'table',table:'community_posts',items:[{id:'closed',active:false,ownerToken:'private-fixture-only',contact:{phone:'synthetic'},sourcePublishedAt:'2026-10-01T00:00:00Z'}]});
  await cryptoModule.appendEncrypted(envelope,key,{kind:'table',table:'notification_preferences',items:[{id:'preference',active:true,communes:['Angol']}]});
  await cryptoModule.appendEncrypted(envelope,key,{kind:'file',path:'synthetic.png',content:'AAECAw=='});
  await cryptoModule.appendEncrypted(envelope,key,{kind:'manifest',appId:app,complete:true,tables:[{table:'community_posts',count:1},{table:'notification_preferences',count:count-1}],files:1,parts:envelope.parts.length});
  return JSON.stringify(envelope);
}
function store({corrupt=false,missing=false,cleanupFailure=false}={}) {
  const rows=new Map();let disposed=0;let writes=0;
  return {rows,get disposed(){return disposed;},get writes(){return writes;},async write(batch){writes++;for(const row of batch)rows.set(row.key,structuredClone(row));},
    async read(offset,limit){const batch=[...rows.values()].filter(row=>row.key>=offset&&row.key<offset+limit).sort((a,b)=>a.key-b.key).map(row=>structuredClone(row));if(missing)batch.pop();if(corrupt&&batch.length)new Uint8Array(batch[0].content)[0]^=1;return batch;},
    async dispose(){disposed++;rows.clear();if(cleanupFailure)throw Error('temporary cleanup failed');}
  };
}
test('reconstructs every record/file, compares hashes and deletes isolated ciphertext store',async()=>{
  const target=store();const progress=[];
  const report=await rehearseRestore(await archive(),password,{createStore:async()=>target,progress:value=>progress.push(value)});
  assert.equal(report.tables,2);assert.equal(report.records,2);assert.equal(report.files,1);assert.equal(report.comparedElements,3);
  assert.equal(report.mismatches,0);assert.equal(report.temporaryStoreDeleted,true);assert.equal(report.platformRestoreTested,false);
  assert.equal(report.productionWrites,0);assert.equal(target.disposed,1);assert.equal(target.rows.size,0);assert.equal(report.encryptedFileSha256.length,64);
  assert(!JSON.stringify(report).includes('private-fixture-only'));assert(progress.some(value=>value.startsWith('Comparando')));
});
test('the temporary adapter receives encrypted payloads without private cleartext',async()=>{
  const target=store();const originalWrite=target.write;
  target.write=async rows=>{for(const row of rows){assert.deepEqual(Object.keys(row).sort(),['content','iv','key']);assert(row.content instanceof ArrayBuffer);assert(!new TextDecoder().decode(row.content).includes('private-fixture-only'));}await originalWrite(rows);};
  await rehearseRestore(await archive(),password,{createStore:async()=>target});assert(target.writes>0);
});
test('missing or corrupt reconstructed data fails, and cleanup still runs',async()=>{
  for(const options of [{missing:true},{corrupt:true}]){
    const target=store(options);await assert.rejects(rehearseRestore(await archive(),password,{createStore:async()=>target}));assert.equal(target.disposed,1);assert.equal(target.rows.size,0);
  }
});
test('wrong password, foreign application and inconsistent manifest never pass',async()=>{
  for(const [text,secret] of [[await archive(),'wrong-password'],[await archive({app:'another-app'}),password],[await archive({count:3}),password]]){
    const target=store();await assert.rejects(rehearseRestore(text,secret,{createStore:async()=>target}));assert.equal(target.disposed,1);
  }
});
test('cancellation disposes the temporary store and does not create a success report',async()=>{
  const target=store();await assert.rejects(rehearseRestore(await archive(),password,{createStore:async()=>target,cancelled:()=>true}),/cancelada/);assert.equal(target.disposed,1);
});
test('failure to delete the temporary database cannot be reported as a successful cleanup',async()=>{
  const target=store({cleanupFailure:true});await assert.rejects(rehearseRestore(await archive(),password,{createStore:async()=>target}),/cleanup/);
});
