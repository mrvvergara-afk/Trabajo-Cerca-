import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
import {memoryDatabase} from './memory-appdeploy.mjs';

const source=await readFile(new URL('./shadow-pdf.ts',import.meta.url),'utf8');
const code=stripTypeScriptTypes(source.replace(/^import .*;\r?\n/gm,'').replace('export async function','async function'));
const input=(name)=>({kind:'document',url:'https://fixture.test/'+name,source:'QA',publisher_page:'https://fixture.test/jobs'});
const attemptTable='tc_document_attempts_v1';
const receiptTable='tc_document_receipts_v1';
const stateTable='fast_bc_state_v2';
const storedTable='fast_bc_documents_v1';

function fixture(inputs,options={}){
 const memory=memoryDatabase();
 const reads=[];
 const open=async url=>{
  reads.push(url);
  return (await options.open?.(url))??{url,response:new Response(Buffer.from('sample'),{headers:{'Content-Type':'image/png'}})};
 };
 const work=async()=>({items:inputs,rawDocumentInputs:options.unknown?null:inputs.length,
  eligibleDocuments:options.unknown?null:inputs.length,excludedDocumentInputs:options.unknown?null:0});
 const extract=async()=>({status:'extracted',text:'Oferta laboral\nCargo: Técnico eléctrico\nLugar de trabajo: Angol',
  sha256:'hash-of-fixture',method:'fixture',kind:'image'});
 const run=new Function('db','isAppDatabaseError','createHash','randomUUID','openPublicResponse','readPublicDocumentWork',
  'extractBDocument','worksiteMentionsCommune','WORK_PLACES',code+'\nreturn shadowPdfBatch;')
  (memory.db,cause=>Boolean(cause?.code),createHash,randomUUID,open,work,extract,(a,b)=>a===b,['Angol','Temuco']);
 return {...memory,run,reads};
}

test('document claims are exclusive and terminal evidence replays without another download',async()=>{
 const f=fixture([input('notice.png')]);
 const concurrent=await Promise.all(Array.from({length:10},()=>f.run()));
 assert.equal(concurrent.reduce((sum,r)=>sum+r.processed,0),1);
 assert.equal(f.reads.length,1);
 const receipt=(await f.db.list(receiptTable)).items;
 assert.equal(receipt.length,1);
 assert.equal(receipt[0].state,'recoverable');
 assert.equal((await f.db.list(storedTable)).items[0].publicEligible,false);
 const replay=await f.run();
 assert.equal(replay.processed,0);
 assert.equal(replay.remainingDocuments,0);
 assert.equal(replay.replayedDocumentInputs,1);
 assert.equal(replay.outcomes[0].replayed,true);
});

test('a transient failure leaves a timed retry and does not prevent processing a subsequent input',async()=>{
 const first=input('first.pdf'),second=input('second.png');
 let fails=true;
 const f=fixture([first,second],{open:url=>url===first.url&&fails?{url,error:'source_timeout'}:undefined});
 const initial=await f.run();
 assert.equal(initial.processed,2);
 assert.equal(initial.deferredDocumentInputs,1);
 assert.equal(initial.remainingDocuments,1);
 assert.equal(initial.terminalDocumentInputs,1);
 const deferred=await f.run();
 assert.equal(deferred.availableDocumentInputs,0);
 assert.equal(deferred.remainingDocuments,1);
 const attempt=(await f.db.list(attemptTable)).items.find(row=>row.state==='retry');
 await f.db.tx.update(attemptTable,[{id:attempt.id,record:{due:0}}],{patch:true});
 fails=false;
 assert.equal((await f.run()).remainingDocuments,0);
 assert.equal(f.reads.length,3);
 assert.equal((await f.db.list(receiptTable)).items.length,3);
});

test('unsupported content reaches a terminal state and never stays in the active queue',async()=>{
 const f=fixture([input('notice.pdf')],{open:url=>({url,response:new Response('unsupported',{headers:{'Content-Type':'text/html'}})})});
 assert.equal((await f.run()).outcomes[0].reason,'document_mime_mismatch');
 const replay=await f.run();
 assert.equal(replay.availableDocumentInputs,0);
 assert.equal(replay.remainingDocuments,0);
 assert.equal(f.reads.length,1);
});

test('a lost acknowledgement reconciles against the receipt from the same transaction',async()=>{
 const f=fixture([input('notice.png')]);
 f.failNextCommitResponse();
 assert.equal((await f.run()).processed,1);
 const saved=(await f.db.list(receiptTable)).items;
 assert.equal(saved.length,1);
 await f.db.tx.add(stateTable,[{id:'current',resolved:{'https://fixture.test/notice.png':{reason:saved[0].reason}}}]);
 assert.equal((await f.run()).totalDocuments,0);
 assert.equal(f.reads.length,1);
});

test('a missing A checkpoint reports an unknown inventory',async()=>{
 const r=await fixture([],{unknown:true}).run();
 assert.equal(r.totalDocuments,null);
 assert.equal(r.availableDocumentInputs,null);
 assert.equal(r.pendingOtherDocumentInputs,null);
});

test('a reclaimed lease preserves the original observation time',async()=>{
 const source=input('reclaim.png');
 let observed;
 const f=fixture([source],{open:async url=>{
  [observed]=await f.db.get(attemptTable,[id],{consistent:true});
  return {url,error:'source_timeout'};
 }});
 const id='pdf-'+createHash('sha256').update(source.url).digest('hex').slice(0,42);
 const firstSeenAt=Date.now()-120_000;
 await f.db.tx.add(attemptTable,[{id,token:'original',attempt:1,due:0,state:'leased',firstSeenAt}]);
 await f.run();
 const [attempt]=await f.db.get(attemptTable,[id],{consistent:true});
 assert.equal(observed.firstSeenAt,firstSeenAt);
 assert.equal(attempt.firstSeenAt,firstSeenAt);
 assert.equal(attempt.state,'retry');
});
