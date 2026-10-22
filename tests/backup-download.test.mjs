import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { webcrypto } from 'node:crypto';

const read = name => fs.readFileSync(new URL('../integrations/appdeploy/'+name, import.meta.url), 'utf8');
const code = stripTypeScriptTypes(read('backup-crypto.ts'),{mode:'strip'});
const cryptoModule = await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const {beginEncryptedBackup,appendEncrypted,verifyEncryptedBackup}=cryptoModule;
const PASSWORD='synthetic-fixture-password-only';
async function archive({duplicate=false,count=1}={}) {
  const {envelope,key}=await beginEncryptedBackup(PASSWORD);
  await appendEncrypted(envelope,key,{kind:'table',table:'community_posts',items:[{id:'old',active:false,ownerToken:'synthetic-private-fixture'}]});
  if(duplicate)await appendEncrypted(envelope,key,{kind:'table',table:'community_posts',items:[{id:'old'}]});
  await appendEncrypted(envelope,key,{kind:'file',path:'fixture.png',content:'AAECAw=='});
  await appendEncrypted(envelope,key,{kind:'manifest',complete:true,tables:[{table:'community_posts',count}],files:1,parts:envelope.parts.length});
  return envelope;
}
test('AES-GCM archive preserves closed history/private fields without plaintext in downloaded JSON',async()=>{
  const envelope=await archive();const text=JSON.stringify(envelope);
  assert(!text.includes('synthetic-private-fixture'));assert(!text.includes('community_posts'));assert(!text.includes(PASSWORD));
  const result=await verifyEncryptedBackup(text,PASSWORD);
  assert.deepEqual(result,{tables:1,records:1,files:1,platformRestoreTested:false});
});
test('wrong password and altered ciphertext cannot validate',async()=>{
  const envelope=await archive();
  await assert.rejects(verifyEncryptedBackup(JSON.stringify(envelope),'a-wrong-password'));
  envelope.parts[0].content='AAAA'+envelope.parts[0].content.slice(4);
  await assert.rejects(verifyEncryptedBackup(JSON.stringify(envelope),PASSWORD));
});
test('truncation, reordered blocks and untrusted KDF parameters are rejected',async()=>{
  const envelope=await archive();const truncated=structuredClone(envelope);truncated.parts.pop();
  await assert.rejects(verifyEncryptedBackup(JSON.stringify(truncated),PASSWORD),/incompleto/);
  [envelope.parts[0],envelope.parts[1]]=[envelope.parts[1],envelope.parts[0]];
  await assert.rejects(verifyEncryptedBackup(JSON.stringify(envelope),PASSWORD));
  envelope.iterations=999999999;await assert.rejects(verifyEncryptedBackup(JSON.stringify(envelope),PASSWORD),/Formato/);
});
test('duplicate IDs and incorrect manifest counts cannot masquerade as complete backup',async()=>{
  await assert.rejects(verifyEncryptedBackup(JSON.stringify(await archive({duplicate:true})),PASSWORD),/duplicado/);
  await assert.rejects(verifyEncryptedBackup(JSON.stringify(await archive({count:2})),PASSWORD),/inconsistente/);
  await assert.rejects(beginEncryptedBackup('short'),/12 caracteres/);
});

function backend(overrides={}) {
  const reads=[];
  const db={list:async(table,options)=>{reads.push({table,options});return {items:[{id:'physical-id',active:false}],nextToken:'second-page'};},...overrides.db};
  const storage={list:async options=>{reads.push({storage:options});return {paths:['images/f.png'],nextToken:'next'};},read:async paths=>{reads.push({paths});return [{path:paths[0],content:'AAECAw=='}];},...overrides.storage};
  const json=(data,statusCode=200)=>({statusCode,headers:{},body:JSON.stringify(data)});
  const error=(message,statusCode)=>json({error:message},statusCode);
  const source=stripTypeScriptTypes(read('admin-backup.ts'),{mode:'strip'}).replace(/^import .*;$/gm,'').replace(/^export /gm,'');
  const functions=vm.runInNewContext('(function(){'+source+';return {adminBackupPage,backupTableAllowed};})()',{db,storage,json,error,Buffer});
  return {...functions,reads};
}
test('export returns one bounded page and no-cache headers while keeping physical IDs/history',async()=>{
  const b=backend();const result=await b.adminBackupPage({body:{kind:'table',table:'community_posts',cursor:'resume'}});
  assert.equal(result.statusCode,200);assert.equal(b.reads.length,1);assert.equal(b.reads[0].options.limit,5);assert.equal(b.reads[0].options.nextToken,'resume');
  assert.equal(JSON.parse(result.body).items[0].id,'physical-id');assert.equal(JSON.parse(result.body).items[0].active,false);
  assert.equal(result.headers['Cache-Control'],'no-store, private');assert.equal(result.headers.Vary,'Authorization');
});
test('arbitrary table/path/cursor requests are rejected before SDK access',async()=>{
  const b=backend();
  for(const table of ['users','secrets','radar_external_bad','public_feed_page_123456789','community_posts__bad'])assert.equal((await b.adminBackupPage({body:{kind:'table',table}})).statusCode,400);
  for(const path of ['../secret','/private','images/../x','images\\secret','images//x'])assert.equal((await b.adminBackupPage({body:{kind:'file',path}})).statusCode,400);
  assert.equal((await b.adminBackupPage({body:{kind:'table',table:'community_posts',cursor:3}})).statusCode,400);assert.equal(b.reads.length,0);
});
test('file absence, oversized pages and quota errors abort instead of reporting completeness',async()=>{
  const missing=backend({storage:{read:async paths=>[{path:paths[0],content:null}]}});
  assert.equal((await missing.adminBackupPage({body:{kind:'file',path:'images/missing.png'}})).statusCode,409);
  const large=backend({db:{list:async()=>({items:[{id:'big',payload:'x'.repeat(1500001)}]})}});
  assert.equal((await large.adminBackupPage({body:{kind:'table',table:'community_posts'}})).statusCode,413);
  let calls=0;const quota=backend({db:{list:async()=>{calls++;throw Error('AppDatabaseQuotaExceeded');}}});
  await assert.rejects(quota.adminBackupPage({body:{kind:'table',table:'community_posts'}}),/QuotaExceeded/);assert.equal(calls,1);
});
test('scope and storage traversal are bounded and do not mint signed public links',async()=>{
  const b=backend();const scope=JSON.parse((await b.adminBackupPage({body:{kind:'scope'}})).body);
  assert.equal(scope.tables.length,37);assert.equal(scope.fullPlatformBackup,false);assert.equal(b.reads.length,0);
  await b.adminBackupPage({body:{kind:'storage',cursor:'next-page'}});
  assert.equal(b.reads.length,1);assert.equal(b.reads[0].storage.limit,5);
});
