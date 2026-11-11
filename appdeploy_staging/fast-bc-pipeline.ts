import { db } from '@appdeploy/sdk';
import { shadowPdfBatch } from './shadow-pdf';
import { runFastBCHtml } from './fast-bc-html';

/**
 * Dedicated fast B/C third-pass processor. Reads ONLY live Motor A documentWork.
 * It never calls legacy B/C crawlers or queues, and cannot auto-publish an
 * unverifiable PDF. The verified A/D direct route remains untouched.
 */
type Decision={state:'closed'|'not_job'|'needs_source_evidence'|'blocked';reason:string;checkedAt:string};
type Progress={id:string;resolved:Record<string,Decision>;lastRunAt?:string;lastBatch?:Record<string,unknown>};
const STATE='fast_bc_state_v2';
const nonJob= /subsidio electrico|beneficios? estudiantiles|feria|puesto de venta|becas?|decreto municipal/i;
const jobDocumentName=/bases[-_ ].*cargo|bases[-_ ]jefatura|bases[-_ ]profesional|cargo[-_ ].*auxiliar|jefe[-_ ]tecnic|tecnico[-_ ]extensionista|concurso|postul|oferta[-_ ]laboral|operari/i;
export async function runFastBCPipeline(){
  // PDF extraction and short HTML second-chance review run independently.
  const [result,html]=await Promise.all([shadowPdfBatch(),runFastBCHtml()]);
  // No new PDF decisions or HTML work: reuse the checkpoint instead of
  // migrating old rows and writing the same status on every cron invocation.
  if(result.processed===0 && html.checked===0 && html.storageFailures===0){
    const [previous]=await db.get<Progress>(STATE,['current'],{consistent:true});
    if(previous?.lastBatch){
      console.warn('MOTOR_B_C_FAST_IDLE '+JSON.stringify({remainingPdf:result.totalDocuments}));
      return {...previous.lastBatch, idle:true};
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
    const titles=Array.isArray(item.jobTitles)?item.jobTitles.map(String):[];
    const reason=String(item.reason || 'without_evidence').slice(0,110);
    // Motor C: definitive triage without a pending retry cycle.
    // Recoverable offers are preserved as evidence, never mistaken for verified jobs.
    const state:Decision['state']=stage==='closed'?'closed':
      stage==='blocked'?'blocked':
      stage==='recoverable'?'needs_source_evidence':
      !nonJob.test(url) && (titles.length>0 || jobDocumentName.test(url))?'needs_source_evidence':'not_job';
    resolved[url]={state,reason,checkedAt:now};
    counted[state]++;
  }
  // A single bounded checkpoint allows A to acknowledge completed documents.
  // No old A/B/C tables are reopened or deleted.
  const urls=Object.keys(resolved);
  if(urls.length>180)for(const url of urls.slice(0,urls.length-180))delete resolved[url];
  const record={id:'current',resolved,lastRunAt:now,
    lastBatch:{scanned:result.processed,remainingPdf:Math.max(0,result.totalDocuments-result.processed),
      decisions:counted,completedTotal:Object.keys(resolved).length,html:{found:html.found,checked:html.checked,verified:html.verified,archived:html.archived,blocked:html.blocked}}};
  if(existing){const [ok]=await db.tx.update(STATE,[{id:'current',record}]);if(!ok)throw Error('fast_bc_checkpoint_update_failed');}
  else{const [id]=await db.tx.add(STATE,[record]);if(!id)throw Error('fast_bc_checkpoint_create_failed');}
  console.warn('MOTOR_B_C_FAST '+JSON.stringify(record.lastBatch));
  return record.lastBatch;
}
