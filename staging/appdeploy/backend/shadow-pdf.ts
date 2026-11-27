import {db,isAppDatabaseError} from '@appdeploy/sdk';
import {createHash,randomUUID} from 'node:crypto';
import {openPublicResponse} from './public-source-http';
import {readPublicDocumentWork} from './free-public-sources';
import {extractBDocument} from './motor-b-document';
import {worksiteMentionsCommune} from './worksite-semantics';
import {WORK_PLACES} from '../shared/territories';

type Row=Record<string,unknown>;
type Attempt={id:string;token:string;attempt:number;due:number;state:'leased'|'retry'|'completed';firstSeenAt:number};
const DOCUMENTS='fast_bc_documents_v1';
const ATTEMPTS='tc_document_attempts_v1';
const unsupported=new Set(['document_mime_mismatch','pdf_mime_mismatch','image_pixel_limit',
 'image_ocr_pixel_limit','document_byte_limit','robots_disallowed','publisher_not_allowed',
 'https_required','redirect_identity_unconfirmed','document_http_404','document_http_410']);

async function readBoundedDocument(response:Response):Promise<Uint8Array>{
 const reader=response.body?.getReader();
 if(!reader)throw Error('document_body_missing');
 const chunks:Uint8Array[]=[];
 let size=0;
 try{
  for(;;){
   const part=await reader.read();
   if(part.done)break;
   size+=part.value.byteLength;
   if(size>6_000_000)throw Error('document_byte_limit');
   chunks.push(part.value);
  }
 }finally{
  await reader.cancel().catch(()=>{});
  reader.releaseLock();
 }
 return Buffer.concat(chunks,size);
}

export async function shadowPdfBatch(){
 const now=Date.now();
 const documentWork=await readPublicDocumentWork();
 const [old]=await db.get<{resolved?:Record<string,{reason?:string}>}>('fast_bc_state_v2',['current'],{consistent:true});
 const inputs=documentWork.items.filter(x=>x.kind==='document');
 const pending=inputs.filter(item=>!old?.resolved?.[item.url] || old.resolved[item.url].reason==='pdf_byte_limit')
  .map(item=>({...item,id:'pdf-'+createHash('sha256').update(item.url).digest('hex').slice(0,42)}));
 const prior=pending.length?await db.get<Attempt>(ATTEMPTS,pending.map(item=>item.id),{consistent:true}):[];
 const ready=pending.map((source,i)=>({source,old:prior[i]})).filter(({old})=>!old||old.due<=now&&old.state!=='completed');
 const inFlight=prior.filter(row=>row?.state==='leased'&&row.due>now).length;
 const deferred=prior.filter(row=>row?.state==='retry'&&row.due>now).length;
 const firstSeen=prior.flatMap(row=>row?.state!=='completed'&&Number.isFinite(row?.firstSeenAt)?[row!.firstSeenAt]:[]);
 const completed=pending.filter((_,i)=>prior[i]?.state==='completed');
 const durable=completed.length?await db.get<Row>(DOCUMENTS,completed.map(item=>item.id),{consistent:true}):[];
 if(durable.some(item=>!item))throw Error('document_receipt_without_evidence');
 const outcomes:Row[]=durable.flatMap((item,i)=>item?[{url:completed[i].url,stage:item.stage,
   reason:item.reason,jobTitles:item.jobTitles,workCommunes:item.workCommunes,replayed:true}]:[]);
 let processed=0,terminal=0,retried=0,processingMs=0;
 for(const {source,old} of ready.slice(0,4)){
  if(processed&&Date.now()-now>=12_000)break;
  const started=Date.now();
  const {id,url}=source;
  const attempt=(old?.attempt??0)+1,token=randomUUID();
  const firstSeenAt=old?.firstSeenAt??started;
  const lease={id,token,attempt,firstSeenAt,due:started+180_000,state:'leased'};
  const [claimed]=old?await db.tx.update(ATTEMPTS,[{id,if:{token:old.token},record:lease}]):await db.tx.add(ATTEMPTS,[lease]);
  if(!claimed)continue;
  let item:Row={id,url,source:source.source,publisherPage:source.publisher_page,
   scannedAt:new Date(started).toISOString(),stage:'blocked',reason:'document_retry_exhausted',publicEligible:false};
  if(attempt<=5)try{
   const opened=await openPublicResponse(url,AbortSignal.timeout(12_000),'application/pdf,image/png,image/jpeg,image/webp');
   if('error' in opened)throw Error(opened.error);
   const response=opened.response;
   const mime=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
   if(response.status!==200 || !['application/pdf','application/octet-stream','image/png','image/jpeg','image/webp'].includes(mime)){
    await response.body?.cancel();throw Error(response.status!==200?'document_http_'+response.status:'document_mime_mismatch');
   }
   const bytes=await readBoundedDocument(response);
   const result=await extractBDocument(opened.url,bytes,mime);
   if(result.status==='failed')throw Error(result.reason||'document_extraction_failed');
   const text=result.text;
   const worksite=text.match(/(?:lugar de trabajo|comuna de la vacante|ubicaci[oó]n de la faena)\s*:\s*([^\n.;]{2,100})/i)?.[1];
   const work=worksite?WORK_PLACES.filter(place=>worksiteMentionsCommune(worksite,place)):[];
   const hiring=/concurso p[uú]blico|llamado a concurso|se requiere|oferta laboral|convocatoria laboral|se busca|vacante/i.test(text);
   const closed=/postulaciones cerradas|concurso finalizado|proceso cerrado/i.test(text);
   const jobs=[...new Set([...text.matchAll(/\b(?:cargo|puesto|vacante)(?:\s*[:\-]\s*|\s+(?:de|denominado)\s+)([^.;\n]{6,100})/gi)].slice(0,8).map(x=>x[1].trim()))];
   // Text extraction/OCR is evidence only. Publication still needs original date, validity and application proof.
   item={...item,stage:closed?'closed':hiring&&jobs.length?'recoverable':'needs_review',
    reason:closed?'explicit_closure':result.reason||(hiring?'document_job_evidence_extracted':'no_job_text_evidence'),method:result.method,
    kind:result.kind,textLength:text.length,workCommunes:work,jobTitles:jobs,
    sha256:result.sha256,textExcerpt:text.slice(0,600)};
  }catch(error){
   const reason=error instanceof Error?error.message.slice(0,120):'document_failed';
   item={...item,reason,stage:attempt>=5||unsupported.has(reason)?'blocked':'retry'};
  }
  const retry=item.stage==='retry';
  const finished=Date.now(),durationMs=finished-started;
  const record={id,token,attempt,firstSeenAt,due:retry?finished+Math.min(24*3600_000,30*60_000*2**(attempt-1)):0,state:retry?'retry':'completed'};
  const receipts='tc_document_receipts_v1';
  try{
   await db.transact([
    db.tx.update(ATTEMPTS,[{id,if:{token},record}]),
    db.tx.update(DOCUMENTS,[{id,record:item}]),
    db.tx.add(receipts,[{id:token,candidateId:id,attempt,state:item.stage,reason:item.reason,
     at:new Date(finished).toISOString(),durationMs,sha256:item.sha256??null,method:item.method??null}]),
   ]);
  }catch(cause){
   if(!isAppDatabaseError(cause))throw cause;
   if(cause.code==='AppDatabaseConditionFailed')continue;
   if(cause.code!=='AppDatabaseUnknownOutcome')throw cause;
   const [saved]=await db.get<{candidateId:string;state:string}>(receipts,[token],{consistent:true});
   if(saved?.candidateId!==id||saved.state!==item.stage)throw cause;
  }
  processed++;
  processingMs+=durationMs;
  if(retry)retried++;else terminal++;
  outcomes.push({url,stage:item.stage,reason:item.reason,jobTitles:item.jobTitles,workCommunes:item.workCommunes});
 }
 const known=documentWork.rawDocumentInputs!==null;
 return {totalDocuments:known?pending.length:null,remainingDocuments:known?pending.length-completed.length-terminal:null,
  rawDocumentInputs:documentWork.rawDocumentInputs,eligibleDocumentInputs:documentWork.eligibleDocuments,
  excludedDocumentInputs:documentWork.excludedDocumentInputs,
  imageInputs:known?inputs.filter(item=>/\.(?:png|jpe?g|webp)$/i.test(new URL(item.url).pathname)).length:null,
  availableDocumentInputs:known?ready.length+inFlight:null,pendingOtherDocumentInputs:known?0:null,
  deferredDocumentInputs:known?deferred+retried:null,terminalDocumentInputs:terminal,
  replayedDocumentInputs:completed.length,oldestObservedPendingMs:firstSeen.length?Math.max(0,now-Math.min(...firstSeen)):null,
  averageProcessingMs:processed?Math.round(processingMs/processed):null,processed,outcomes};
}
