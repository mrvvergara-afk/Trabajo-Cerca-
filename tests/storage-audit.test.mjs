import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
const read=name=>fs.readFileSync(new URL('../integrations/appdeploy/'+name,import.meta.url),'utf8');
const url=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const cryptoUrl=url(stripTypeScriptTypes(read('backup-crypto.ts')));
const c=await import(cryptoUrl);
const {auditBackupStorage,referenceCollector}=await import(url(stripTypeScriptTypes(read('storage-audit.ts')).replace("from './backup-crypto'",'from '+JSON.stringify(cryptoUrl))));
const password='synthetic-storage-audit-only';
async function archive(rows=[],files=[],appId='trabajo-cerca-laboratorio-3ojgro'){
 const {envelope,key}=await c.beginEncryptedBackup(password);
 await c.appendEncrypted(envelope,key,{kind:'table',table:'community_posts',items:rows});
 for(const path of files)await c.appendEncrypted(envelope,key,{kind:'file',path,content:'AAECAw=='});
 await c.appendEncrypted(envelope,key,{kind:'manifest',appId,complete:true,tables:[{table:'community_posts',count:rows.length}],files:files.length,parts:envelope.parts.length});
 return JSON.stringify(envelope);
}
test('classifies SDK, static, external and inline references without fetching originals',async()=>{
 const calls=[];const rows=[{id:'one',record:{active:false,evidenceImagePath:'resources/evidence.png',mediaUrl:'https://example.org/private-original.jpg',imageUrl:'/resources/logo.png',photoUrl:'data:image/png;base64,AA==',attachmentPath:'ambiguous.pdf'}}];
 const r=await auditBackupStorage(await archive(rows),password,async body=>{calls.push(body);return body.kind==='storage'?{kind:'storage',paths:[]}:{kind:'file-status',available:false};});
 assert.equal(r.storageReferencesInBackup,1);assert.equal(r.missingReferencedObjects.closed,1);assert.equal(r.externalMediaReferences,1);assert.equal(r.bundledAssetReferences,1);assert.equal(r.inlineMediaReferences,1);assert.equal(r.unclassifiedReferenceValues,1);
 assert.equal(r.productionWrites,0);assert.equal(r.passwordUploaded,false);assert.equal(r.fullPlatformStorageCertified,false);
 assert(!JSON.stringify(r).includes('private-original'));assert(!JSON.stringify(calls).includes(password));assert(!JSON.stringify(calls).includes('example.org'));
});
test('complete pagination compares historical capture and current objects without inferring causes',async()=>{
 const r=await auditBackupStorage(await archive([{id:'x',active:true,evidenceImagePath:'live.png'}],['old.png']),password,async body=>body.cursor?{kind:'storage',paths:['live.png']}:{kind:'storage',paths:['new.png'],nextToken:'page2'});
 assert.equal(r.currentSdkStorageObjects,2);assert.equal(r.sdkRequests,2);assert.equal(r.currentObjectsNotCapturedInBackup,2);assert.equal(r.capturedObjectsNotInCurrentListing,1);assert.equal(r.missingReferencedObjects.current,0);
});
test('missing references are independently checked and preserve highest activity state',async()=>{
 const rows=[{id:'a',active:false,evidenceImagePath:'same.png'},{id:'b',active:true,evidenceImagePath:'same.png'},{id:'c',storagePath:'outside.png'},{id:'d',storagePath:'unknown.png'}];
 const r=await auditBackupStorage(await archive(rows),password,async body=>body.kind==='storage'?{kind:'storage',paths:[]}:{kind:'file-status',available:body.path==='outside.png'});
 assert.equal(r.missingReferencedObjects.current,1);assert.equal(r.missingReferencedObjects.closed,0);assert.equal(r.missingReferencedObjects.unknown,1);assert.equal(r.referencesFoundOutsideListing,1);
});
test('listing failures, invalid cursors, duplicates and loops cannot report empty success',async()=>{
 const text=await archive();
 for(const read of [async()=>{throw Error('quota');},async()=>({kind:'storage'}),async()=>({kind:'storage',paths:[],nextToken:3}),async()=>({kind:'storage',paths:['same','same']}),async()=>({kind:'storage',paths:[],nextToken:'loop'})])await assert.rejects(auditBackupStorage(text,password,read));
});
test('caps individual probes and reports unverified references rather than false absence',async()=>{
 const rows=Array.from({length:52},(_,i)=>({id:String(i),storagePath:'p'+i}));
 const r=await auditBackupStorage(await archive(rows),password,async body=>body.kind==='storage'?{kind:'storage',paths:[]}:{kind:'file-status',available:false});
 assert.equal(r.independentlyCheckedReferences,50);assert.equal(r.unverifiedAbsentReferences,2);
});
test('wrong password and foreign app fail before SDK reads; cancellation aborts',async()=>{
 let calls=0;const read=async()=>{calls++;return {kind:'storage',paths:[]};};
 await assert.rejects(auditBackupStorage(await archive(),'wrong',read));
 await assert.rejects(auditBackupStorage(await archive([],[],'foreign'),password,read));
 await assert.rejects(auditBackupStorage(await archive(),password,read,()=>true));assert.equal(calls,0);
});
test('metadata endpoint returns only availability and size, including missing undefined content',async()=>{
 const source=stripTypeScriptTypes(read('admin-backup.ts')).replace(/^import .*;$/gm,'').replace(/^export /gm,'');
 for(const content of ['secret-content',null,undefined]){
 const json=(data,statusCode=200)=>({statusCode,headers:{},body:JSON.stringify(data)});
 const b=vm.runInNewContext('(function(){'+source+';return adminBackupPage;})()',{db:{},storage:{read:async paths=>[{path:paths[0],content}]},Buffer,json,error:(message,statusCode)=>json({error:message},statusCode),isAppDatabaseError:()=>false,console});
 const r=await b({body:{kind:'file-status',path:'safe.png'}});const data=JSON.parse(r.body);
 assert.equal(data.available,typeof content==='string');assert(!r.body.includes('secret-content'));assert.equal(r.headers['Cache-Control'],'no-store, private');
 }
});
