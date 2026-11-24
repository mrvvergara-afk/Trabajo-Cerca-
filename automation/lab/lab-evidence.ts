// This module is wired only by the laboratory overlay.
import {db,json} from '@appdeploy/sdk';
import {extractBDocument} from './motor-b-document';
import {pullGeminiReviewQueue} from './motor-gemini-github-pull';

const fixture='__OCR_FIXTURE__';
const table='tc_lab_ocr_probe_v1';
export async function runLabOcrProbe() {
 const [claimed]=await db.tx.add(table,[{id:'bundled-v2',state:'running',at:new Date().toISOString()}]);
 if(!claimed)return;
 try {
  const result=await extractBDocument('https://fixture.invalid/prueba.png',Buffer.from(fixture,'base64'),'image/png');
  const passed=result.status==='extracted'&&/TRABAJO:\s*ANGOL/i.test(result.text);
  await db.tx.update(table,[{id:'bundled-v2',record:{
   state:passed?'passed':'failed',method:result.method,at:new Date().toISOString(),
   error:result.reason?.includes('Cannot find module')?'ocr_package_not_available':result.reason??null,
  }}]);
 }catch(error){
  await db.tx.update(table,[{id:'bundled-v2',record:{state:'failed',error:error instanceof Error?error.name:'unknown',at:new Date().toISOString()}}]);
 }
}
export async function runLabGeminiCheck(){
 const [claim]=await db.tx.add('tc_lab_engine_proofs_v1',[{id:'gemini-access-check',at:new Date().toISOString()}]);
 if(claim)await pullGeminiReviewQueue();
}
const bridgeView=(row:Record<string,unknown>|null)=>row
 ?Object.fromEntries(['state','at','batchId','newCount','duplicates','newlyQueued','blockedBatches','inserted','queued','expired']
  .filter(key=>typeof row[key]==='string'||typeof row[key]==='number').map(key=>[key,row[key]]))
 :null;
export async function labEvidence(){
 const [result,visibility,ready,attempts,chat,d,gemini]=await Promise.all([
  db.get(table,['bundled-v2'],{consistent:true}),
  db.list<{publicOfferId:string;firstVisibleAt:string;manifestId:string;latencyMs:number|null;trace?:{engine?:string;discoveredAt?:string;queuedAt?:string;storedAt?:string}}>('tc_first_visibility_v1',{limit:60}),
  db.list('tc_verification_ready_v1',{limit:80}),
  db.list<{status:string}>('tc_verification_attempts_v1',{limit:80}),
  db.get<Record<string,unknown>>('chatgpt_bridge_latest',['current'],{consistent:true}),
  db.get<Record<string,unknown>>('motor_d_bridge_status',['current'],{consistent:true}),
  db.get<Record<string,unknown>>('gemini_github_pull_status',['current'],{consistent:true}),
 ]);
 return json({ocr:result[0]??null,bridges:{chatgpt:bridgeView(chat[0]),d:bridgeView(d[0]),gemini:bridgeView(gemini[0])},visibilitySample:visibility.items.map(r=>({
  id:r.publicOfferId,at:r.firstVisibleAt,manifestId:r.manifestId,latencyMs:r.latencyMs,
  engine:r.trace?.engine??null,discoveredAt:r.trace?.discoveredAt??null,queuedAt:r.trace?.queuedAt??null,
  storedAt:r.trace?.storedAt??null,
 })),visibilityPartial:Boolean(visibility.nextToken),verificationReadySample:ready.items.length,
  verificationReadyPartial:Boolean(ready.nextToken),attemptsSample:attempts.items.length});
}
