import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {prepareRestorePlan, createTemporaryRestoreTarget, restorePreparedPlan} from '../integrations/appdeploy/isolated-restore.mjs';
const source=stripTypeScriptTypes(readFileSync(new URL('../integrations/appdeploy/backup-crypto.ts',import.meta.url),'utf8'));
const {beginEncryptedBackup,appendEncrypted}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const password='synthetic-isolated-restore-only';
async function archive(appId='trabajo-cerca-laboratorio-3ojgro') {
 const {envelope,key}=await beginEncryptedBackup(password);
 for(const block of [
  {kind:'table',table:'empty',items:[]},
  {kind:'table',table:'community_posts',items:[{id:'closed-id',active:false,expiresAt:'2026-10-08',sourcePublishedAt:'2026-09-25',ownerToken:'private-fixture',evidenceImagePath:'old.png'}]},
  {kind:'table',table:'public_feed_versions',items:[{id:'manifest-id',record:{references:['closed-id']}}]},
  {kind:'file',path:'old.png',content:'AAECAw=='},
 ])await appendEncrypted(envelope,key,block);
 await appendEncrypted(envelope,key,{kind:'manifest',appId,complete:true,tables:[{table:'empty',count:0},{table:'community_posts',count:1},{table:'public_feed_versions',count:1}],files:1,parts:envelope.parts.length});
 return JSON.stringify(envelope);
}
test('restores empty tables, original IDs, historical state and references after durable reopen',async()=>{
 const plan=await prepareRestorePlan(await archive(),password);const target=createTemporaryRestoreTarget();
 try {
  const report=restorePreparedPlan(plan,target);
  assert.equal(report.tables,3);assert.equal(report.records,2);assert.equal(report.files,1);assert.equal(report.comparedUnits,6);assert.equal(report.durableReopenTested,true);
  const units=plan.entries.map(e=>JSON.parse(target.read(e.key)));
  const record=units.find(u=>u.id==='closed-id').record;
  assert.equal(record.active,false);assert.equal(record.sourcePublishedAt,'2026-09-25');assert.equal(record.ownerToken,'private-fixture');
  assert.equal(units.find(u=>u.id==='manifest-id').record.record.references[0],record.id);
  assert.equal(units.find(u=>u.path===record.evidenceImagePath).content,'AAECAw==');
  assert.equal(report.productionWrites,0);assert.equal(report.platformRestoreTested,false);assert(!JSON.stringify(report).includes('private-fixture'));
 }finally{target.dispose();}
});
test('rejects populated destination without overwriting historical data',async()=>{
 const plan=await prepareRestorePlan(await archive(),password);const target=createTemporaryRestoreTarget();
 try{restorePreparedPlan(plan,target);assert.throws(()=>restorePreparedPlan(plan,target),/target_not_empty/);assert.equal(target.count(),6);}finally{target.dispose();}
});
test('wrong password, foreign app and incomplete archive fail before destination creation',async()=>{
 const text=await archive();await assert.rejects(prepareRestorePlan(text,'wrong'));await assert.rejects(prepareRestorePlan(await archive('other'),password));
 const truncated=JSON.parse(text);truncated.parts.pop();await assert.rejects(prepareRestorePlan(JSON.stringify(truncated),password));
});
test('changed plan and unsafe adapter reject before any write',async()=>{
 const plan=await prepareRestorePlan(await archive(),password);const target=createTemporaryRestoreTarget();
 try{plan.entries[0].text+=' ';assert.throws(()=>restorePreparedPlan(plan,target),/plan_changed/);assert.equal(target.count(),0);assert.throws(()=>restorePreparedPlan(plan,{identity:{kind:'appdeploy'}}),/unsafe_target/);}finally{target.dispose();}
});
test('failure during import rolls back every row',async()=>{
 const plan=await prepareRestorePlan(await archive(),password);const target=createTemporaryRestoreTarget();const write=target.write;let calls=0;
 target.write=entry=>{if(++calls===3)throw Error('synthetic-write-failure');write(entry);};
 try{assert.throws(()=>restorePreparedPlan(plan,target),/synthetic-write-failure/);assert.equal(target.count(),0);}finally{target.dispose();}
});
test('temporary database never stores private payloads in cleartext and cleanup removes it',async()=>{
 const {readdirSync,existsSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const before=new Set(readdirSync(tmpdir()));const target=createTemporaryRestoreTarget();
 const directory=readdirSync(tmpdir()).find(name=>name.startsWith('tc-isolated-restore-')&&!before.has(name));
 assert(directory);
 try{const plan=await prepareRestorePlan(await archive(),password);restorePreparedPlan(plan,target);const data=readFileSync(join(tmpdir(),directory,'restore.sqlite'));assert(!data.includes(Buffer.from('private-fixture')));assert(!data.includes(Buffer.from('closed-id')));}finally{target.dispose();}
 assert.equal(existsSync(join(tmpdir(),directory)),false);
});
