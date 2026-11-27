// Node 22+ with stripTypeScriptTypes. No production calls.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
const ts=await readFile(new URL('./fast-bc-pipeline.ts',import.meta.url),'utf8');
const js=stripTypeScriptTypes(ts.replace(/^import .*;\r?\n/gm,'').replace('export async function','async function'));
const pdf={processed:0,totalDocuments:0,outcomes:[],rawDocumentInputs:0,eligibleDocumentInputs:0,imageInputs:0,pendingOtherDocumentInputs:0};
const html={found:0,checked:0,verified:0,archived:0,blocked:0,storageFailures:0};
function fixture(p={},options={}){
 const calls=[],receipts=[],checkpoints=[];
 const db={get:async()=>[],list:async()=>({items:[]}),tx:{add:async(table,rows)=>{(table==='bc_stage_execution_receipts_v1'?receipts:checkpoints).push(...rows);return rows.map(r=>r.id)}}};
 const shadowPdfBatch=async()=>{if(options.pdfError)throw Error('pdf failed');return {...pdf,...p}};
 const runFastBCHtml=async()=>{if(options.htmlError)throw Error('html failed');return html};
 const assistMotorCWhenBIdle=async(...args)=>{calls.push(args);if(options.assistError)throw Error('assist failed');return {eligible:true,submitted:1}};
 const run=new Function('db','createHash','randomUUID','shadowPdfBatch','runFastBCHtml','assistMotorCWhenBIdle','pruneResolved',js+'\nreturn runFastBCPipeline;')(db,createHash,randomUUID,shadowPdfBatch,runFastBCHtml,assistMotorCWhenBIdle,r=>r);
 return {run,calls,receipts,checkpoints};
}
test('zero other documents allows assistance',async()=>{const f=fixture();const r=await f.run();assert.deepEqual(f.calls,[[0,0]]);assert.equal(r.bIdleAssist.submitted,1);assert.equal(f.receipts.length,2)});
test('unresolved image backlog blocks assistance and remains visible',async()=>{const f=fixture({rawDocumentInputs:3,imageInputs:3,pendingOtherDocumentInputs:3});const r=await f.run();assert.equal(f.calls.length,0);assert.equal(r.pendingOtherDocuments,3);assert.equal(f.receipts.find(x=>x.engine==='B').pendingOtherDocumentInputs,3)});
test('unknown document backlog fails closed',async()=>{const f=fixture({pendingOtherDocumentInputs:undefined});await f.run();assert.equal(f.calls.length,0);assert.equal(f.receipts.find(x=>x.engine==='B').pendingOtherDocumentInputs,null)});
test('PDF failure preserves C receipt without assistance',async()=>{const f=fixture({}, {pdfError:true});const r=await f.run();assert.equal(r.partial,true);assert.equal(f.calls.length,0);assert.equal(f.receipts.find(x=>x.engine==='B').status,'failed');assert.equal(f.receipts.find(x=>x.engine==='C').status,'completed')});
test('assistance failure does not stop checkpoint',async()=>{const f=fixture({}, {assistError:true});const r=await f.run();assert.equal(r.bIdleAssist.failed,true);assert.equal(f.checkpoints.length,1)});
test('both stage failures save receipts and reject',async()=>{const f=fixture({}, {pdfError:true,htmlError:true});await assert.rejects(f.run(),/bc_stage_failed_receipts_saved/);assert.equal(f.receipts.length,2);assert.equal(f.checkpoints.length,0)});
test('deferred documents remain pending without reserving idle B capacity',async()=>{
 const f=fixture({rawDocumentInputs:2,imageInputs:2,totalDocuments:2,availableDocumentInputs:0,
  remainingDocuments:2,deferredDocumentInputs:2});
 const r=await f.run();
 assert.deepEqual(f.calls,[[0,0]]);
 assert.equal(r.remainingDocuments,2);
 assert.equal(r.deferredDocuments,2);
 assert.equal(f.receipts.find(x=>x.engine==='B').deferredDocumentInputs,2);
});
test('unreadable OCR evidence stays available for review instead of being discarded',async()=>{
 const url='https://example.test/notice.png';
 const f=fixture({processed:1,totalDocuments:1,remainingDocuments:0,availableDocumentInputs:1,
  outcomes:[{url,stage:'needs_review',reason:'document_no_legible_text'}]});
 const r=await f.run();
 assert.equal(r.decisions.needs_source_evidence,1);
 assert.equal(f.checkpoints[0].resolved[url].state,'needs_source_evidence');
});

test('independent HTML failure does not prevent idle B assistance',async()=>{
 const f=fixture({}, {htmlError:true});const r=await f.run();
 assert.deepEqual(f.calls,[[0,0]]);assert.equal(r.partial,true);
 assert.equal(f.receipts.find(x=>x.engine==='C').status,'failed');
 assert.equal(f.receipts.find(x=>x.engine==='B').status,'completed');
});
