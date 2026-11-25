import { db } from '@appdeploy/sdk';
import {createHash,randomUUID} from 'node:crypto';
import { shadowPdfBatch } from './shadow-pdf';
import { runFastBCHtml } from './fast-bc-html';
import { assistMotorCWhenBIdle } from './motor-b-idle-assist';
import { pruneResolved } from './recheck-policy';

/**
 * Dedicated fast B/C third-pass processor. Reads ONLY live Motor A documentWork.
 * It never calls legacy B/C crawlers or queues, and cannot auto-publish an
 * unverifiable PDF. The verified A/D direct route remains untouched.
 */
type Decision={state:'closed'|'not_job'|'needs_source_evidence'|'blocked';reason:string;checkedAt:string};
type Progress={id:string;resolved:Record<string,Decision>;lastRunAt?:string;runId?:string;lastBatch?:Record<string,unknown>};
const STATE='fast_bc_state_v2';
const nonJob= /subsidio electrico|beneficios? estudiantiles|feria|puesto de venta|becas?|decreto municipal/i;
const jobDocumentName=/bases[-_ ].*cargo|bases[-_ ]jefatura|bases[-_ ]profesional|cargo[-_ ].*auxiliar|jefe[-_ ]tecnic|tecnico[-_ ]extensionista|concurso|postul|oferta[-_ ]laboral|operari/i;
export async function runFastBCPipeline(){
  // PDF extraction and short HTML second-chance review run independently.
  const runId=randomUUID(),startedAt=new Date().toISOString();
  const [pdfOutcome,htmlOutcome]=await Promise.allSettled([shadowPdfBatch(),runFastBCHtml()]);
  const finishedAt=new Date().toISOString();
  const stageInputs=[{engine:'B',kind:'pdf',outcome:pdfOutcome},{engine:'C',kind:'html',outcome:htmlOutcome}] as const;
  // Durable, separate stage receipts; do not mark output as committed until
  // the producer's own checkpoint has been written successfully.
  const stageReceipts=stageInputs.map(({engine,kind,outcome})=>{
    const success=outcome.status==='fulfilled';
    const data=success?outcome.value:null;
    const processed=success?(kind==='pdf'?Number((data as {processed?:number}).processed||0):Number((data as {checked?:number}).checked||0)):null;
    const output=success?JSON.stringify(data):'';
    return {id:runId+'-'+engine,runId,attempt:1,engine,stage:kind,
      startedAt,finishedAt,status:success?'completed':'failed',processed,
      outputHash:success?createHash('sha256').update(output).digest('hex'):null,
      error:success?null:String(outcome.reason).slice(0,160),
      // Count only known terminal stage decisions; never infer published.
      ...(success&&kind==='pdf'?{inputCount:Number((data as {totalDocuments?:number}).totalDocuments||0),
        outcomes:(data as {outcomes?:unknown[]}).outcomes?.length??null,
        rawDocumentInputs:(data as {rawDocumentInputs?:number|null}).rawDocumentInputs??null,
        eligibleDocumentInputs:(data as {eligibleDocumentInputs?:number}).eligibleDocumentInputs??null,
        imageInputs:(data as {imageInputs?:number}).imageInputs??null}:{}),
      ...(success&&kind==='html'?{inputCount:Number((data as {found?:number}).found||0),
        verified:Number((data as {verified?:number}).verified||0),
        blocked:Number((data as {blocked?:number}).blocked||0),
        already:Number((data as {already?:number}).already||0),
        deferredOutside:Number((data as {deferredOutside?:number}).deferredOutside||0),
        deferredIndex:Number((data as {deferredIndex?:number}).deferredIndex||0),
        unsupported:(data as {unsupported?:number}).unsupported??null,
        budgetDeferred:(data as {budgetDeferred?:number}).budgetDeferred??null,
        archived:Number((data as {archived?:number}).archived||0),
        storedForFeed:Number((data as {storedForFeed?:number}).storedForFeed||0),
        storageFailures:Number((data as {storageFailures?:number}).storageFailures||0)}:{})};
  });
  const written=await db.tx.add('bc_stage_execution_receipts_v1',stageReceipts);
  if(written.length!==2||written.some(x=>!x))throw Error('bc_stage_receipts_write_failed');
  if(pdfOutcome.status==='rejected'&&htmlOutcome.status==='rejected')throw Error('bc_stage_failed_receipts_saved');
  const result=pdfOutcome.status==='fulfilled'?pdfOutcome.value:{processed:0,totalDocuments:null,outcomes:[]};
  const html=htmlOutcome.status==='fulfilled'?htmlOutcome.value:{found:null,checked:null,verified:null,archived:null,blocked:null,storageFailures:null};
  const partial=pdfOutcome.status==='rejected'||htmlOutcome.status==='rejected';
  const bIdleAssist=!partial?await assistMotorCWhenBIdle(result.processed,result.totalDocuments).catch(error=>({eligible:true,failed:true,error:String(error).slice(0,160)})):null;
  if(bIdleAssist) console.warn('MOTOR_B_IDLE_ASSIST '+JSON.stringify(bIdleAssist));
  // No new PDF decisions or HTML work: reuse the checkpoint instead of
  // migrating old rows and writing the same status on every cron invocation.
  if(!partial && result.processed===0 && !result.outcomes.length && html.checked===0 && html.storageFailures===0){
    const [previous]=await db.get<Progress>(STATE,['current'],{consistent:true});
    if(previous?.lastBatch){
      console.warn('MOTOR_B_C_FAST_IDLE '+JSON.stringify({remainingPdf:result.totalDocuments}));
      return {scanned:0,remainingPdf:result.totalDocuments,decisions:{closed:0,not_job:0,needs_source_evidence:0,blocked:0},completedTotal:Object.keys(previous.resolved||{}).length,html:{found:html.found,checked:0,verified:0,archived:0,blocked:0},idle:true,bIdleAssist};
    }
  }
  const [existing]=await db.get<Progress>(STATE,['current'],{consistent:true});
  const legacy=(await db.list<Progress>('fast_bc_state_v1',{limit:40})).items;
  const migrated:Record<string,Decision>={};
  for(const row of legacy){for(const [url,decision] of Object.entries(row.resolved || {})){
    const previous=migrated[url];
    if(!previous || Date.parse(decision.checkedAt)>Date.parse(previous.checkedAt))migrated[url]=decision;
  }}
  const resolved:Record<string,Decision>={...migrated,...(existing?.resolved || {})};
  const counted={closed:0,not_job:0,needs_source_evidence:0,blocked:0};
  const now=new Date().toISOString();
  for(const item of result.outcomes){
    const url=String(item.url || '');
    if(!url)continue;
    const stage=String(item.stage || '');
    if(stage==='retry')continue;
    const titles=Array.isArray(item.jobTitles)?item.jobTitles.map(String):[];
    const reason=String(item.reason || 'without_evidence').slice(0,110);
    // Motor C: definitive triage without a pending retry cycle.
    // Recoverable offers are preserved as evidence, never mistaken for verified jobs.
    const state:Decision['state']=stage==='closed'?'closed':
      stage==='blocked'?'blocked':
      stage==='recoverable'||reason==='no_job_text_evidence'?'needs_source_evidence':
      !nonJob.test(url) && (titles.length>0 || jobDocumentName.test(url))?'needs_source_evidence':'not_job';
    resolved[url]={state,reason,checkedAt:now};
    counted[state]++;
  }
  // A single bounded checkpoint allows A to acknowledge completed documents.
  // No old A/B/C tables are reopened or deleted.
  // Keep unresolved cases until they receive a terminal decision. Dropping
  // them merely because the map is large makes them reappear as new work.
  const pruned=pruneResolved(resolved,1000);
  const record={id:'current',resolved:pruned,lastRunAt:now,runId,
    lastBatch:{scanned:result.processed,remainingPdf:result.totalDocuments===null?null:Math.max(0,result.totalDocuments-result.processed),
      decisions:counted,partial,bIdleAssist,completedTotal:Object.keys(pruned).length,html:{found:html.found,checked:html.checked,verified:html.verified,archived:html.archived,blocked:html.blocked}}};
  if(existing){const [ok]=await db.tx.update(STATE,[{id:'current',record,...(existing.runId?{if:{runId:existing.runId}}:{})}]);if(!ok)throw Error('fast_bc_checkpoint_update_failed');}
  else{const [id]=await db.tx.add(STATE,[record]);if(!id)throw Error('fast_bc_checkpoint_create_failed');}
  console.warn('MOTOR_B_C_FAST '+JSON.stringify(record.lastBatch));
  return record.lastBatch;
}
