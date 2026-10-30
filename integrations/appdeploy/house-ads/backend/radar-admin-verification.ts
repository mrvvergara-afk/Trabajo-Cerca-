import {db,isAppDatabaseError} from '@appdeploy/sdk';
import {randomUUID} from 'node:crypto';
import {checkOneReview,type ReviewCheck} from './radar-review-check';
import {registerPublicFeedChange} from './public-feed';
import {reviewPublicationReader,ADMIN_VERIFICATION_QUEUE,stageAdminReviewVerification} from './radar-review-queue';

type Row={kind?:string;status?:string;url?:string;radarJobId?:string;nextCheckAt?:string;motorState?:string;territories?:string[];lastCheck?:ReviewCheck;lastCheckedAt?:string};
type Job={kind?:string;url?:string;active?:boolean;review?:boolean;verified?:boolean;discoveredBy?:string;sourcePublishedAt?:string;sourceValidThrough?:string|null;expiresAt?:string;firstPublishedAt?:string;createdAt?:string;note?:string;verifiedAt?:string;firstVerifiedAt?:string;adminVerificationAttempt?:string};
type Control={cursor?:string;pendingIds:string[];revision:string;lastScheduledTime?:string;migrationCursor?:string;migrationComplete?:boolean;leaseOwner?:string;leaseUntil?:string};
const CONTROL='radar_admin_verification_control';
const valid=(id:string)=>/^tc_[a-f0-9]{22}$/.test(id);
const queued=(row:Row)=>row.kind==='review_candidate'&&['queued_for_verification','submitting'].includes(row.status||'');
export function isAdminVerificationSlot(event:{type:string;name:string;scheduledTime:string}|undefined){
 if(!event||event.type!=='cron'||event.name!=='verify-publish'||!Number.isFinite(Date.parse(event.scheduledTime)))return false;
 const minute=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Santiago',minute:'2-digit'}).format(new Date(event.scheduledTime)));
 return [5,20,35,50].includes(minute);
}
const terminal=new Set(['duplicate','rejected','blocked','published']);
async function state(){
 const [row]=await db.get<Control>(CONTROL,['current'],{consistent:true});if(row)return row;
 const created={revision:randomUUID(),pendingIds:[]};await db.tx.add(CONTROL,[{id:'current',...created}]);
 const [saved]=await db.get<Control>(CONTROL,['current'],{consistent:true});if(!saved)throw Error('admin_verification_control_unconfirmed');return saved;
}
async function saveReview(id:string,row:Row,record:Record<string,unknown>){
 const [ok]=await db.tx.update('radar_review_inbox',[{id,record,if:{status:row.status}}],{patch:true});if(!ok)throw Error('admin_verification_review_changed');
}
async function saveJob(id:string,job:Job,record:Record<string,unknown>){
 const attempt=randomUUID();
 try{const [ok]=await db.tx.update('radar_jobs',[{id,record:{...record,adminVerificationAttempt:attempt},if:{url:job.url,active:job.active,review:job.review,verified:job.verified}}],{patch:true});if(!ok)throw Error('admin_verification_job_changed');}
 catch(cause){if(!isAppDatabaseError(cause)||cause.code!=='AppDatabaseUnknownOutcome')throw cause;const [saved]=await db.get<Job>('radar_jobs',[id],{consistent:true});if(saved?.adminVerificationAttempt!==attempt)throw cause;}
 await registerPublicFeedChange('radar_jobs',id);
}
export async function processAdminReviewBatch(options:{scheduledTime:string;project:(item:Record<string,unknown>&{id:string})=>Record<string,unknown>|null}){
 if(!Number.isFinite(Date.parse(options.scheduledTime)))throw Error('admin_verification_schedule_required');
 const old=await state(),started=Date.now();
 if(Date.parse(old.lastScheduledTime||'')>=Date.parse(options.scheduledTime))return {alreadyProcessed:true,processed:0,verified:0,paidCalls:0};
 if(Date.parse(old.leaseUntil||'')>started)return {deferred:true,processed:0,verified:0,paidCalls:0};
 const leaseOwner=randomUUID(),revision=randomUUID();
 const [locked]=await db.tx.update(CONTROL,[{id:'current',record:{leaseOwner,lastScheduledTime:options.scheduledTime,leaseUntil:new Date(started+55000).toISOString(),revision},if:{revision:old.revision}}],{patch:true});
 if(!locked)return {deferred:true,processed:0,verified:0,paidCalls:0};
 let cursor=old.cursor,remaining=[...old.pendingIds],migrationCursor=old.migrationCursor,migrationComplete=old.migrationComplete===true;
 const report={processed:0,verified:0,pending:0,blocked:0,rejected:0,duplicate:0,waitingForFeed:0,paidCalls:0,sourceChecks:0};
 try{
  if(!migrationComplete){const legacy=await db.list<Row>('radar_review_inbox',{limit:20,...(migrationCursor?{nextToken:migrationCursor}:{})});for(const row of legacy.items)if(valid(row.id)&&queued(row)&&!terminal.has(row.motorState||''))await stageAdminReviewVerification(row.id);migrationCursor=legacy.nextToken;migrationComplete=!legacy.nextToken;}
  if(!remaining.length){const page=await db.list(ADMIN_VERIFICATION_QUEUE,{limit:20,...(cursor?{nextToken:cursor}:{})});cursor=page.nextToken;remaining=page.items.map(x=>x.id).filter(valid);}
  for(let index=0;index<remaining.length;){
   if(report.processed>=4||Date.now()-started>35000)break;
   const id=remaining[index],[row]=await db.get<Row>('radar_review_inbox',[id],{consistent:true});
   if(!row||!queued(row)||terminal.has(row.motorState||'')){await db.delete(ADMIN_VERIFICATION_QUEUE,[id]);remaining.splice(index,1);continue;}
   if(Date.parse(row.nextCheckAt||'')>Date.now()){remaining.splice(index,1);continue;}
   const jobId='tcq_'+id.slice(3),[job]=await db.get<Job>('radar_jobs',[jobId],{consistent:true});
   report.processed++;
   if(!job||job.kind!=='job_offer'||job.url!==row.url||job.discoveredBy!=='admin-review-inbox-v1'){
    await saveReview(id,row,{motorState:'blocked',blockReason:'queue_reconciliation_required'});report.blocked++;remaining.splice(index,1);continue;
   }
   if(job.active===false){await saveReview(id,row,{motorState:'rejected',blockReason:'inactive_or_rejected'});report.rejected++;remaining.splice(index,1);continue;}
   // Previously verified rows may already be represented by an external-source publication.
   if(job.verified===true&&job.review===false){
    const status=await reviewPublicationReader()(id,row);
    if(status.published){report.waitingForFeed++;remaining.splice(index,1);continue;}
   }
   const check=await checkOneReview({id},{queuedJobId:jobId});report.sourceChecks++;
   let reason=check.reason;
   if(check.status==='verified_for_final_review'){
    if(job.sourcePublishedAt&&job.sourcePublishedAt!==check.sourcePublishedAt)reason='original_source_date_changed';
    else if((job.sourceValidThrough&&Date.parse(job.sourceValidThrough)<=Date.now())||(job.expiresAt&&Date.parse(job.expiresAt)<=Date.now()))reason='expired_deadline';
    else{
     const now=check.checkedAt;
     const deadline=job.sourceValidThrough&&check.deadline?new Date(Math.min(Date.parse(job.sourceValidThrough),Date.parse(check.deadline))).toISOString():job.sourceValidThrough||check.deadline||null;
     const patch={note:job.note?.startsWith('Aviso revisado; verificación del sistema pendiente.')?'Fuente pública comprobada. Postulación: '+check.application:job.note,title:check.title,company:check.company,workLocation:check.workCommune,workCommunes:[check.workCommune],sourcePublishedAt:job.sourcePublishedAt||check.sourcePublishedAt,sourceValidThrough:deadline,applicationUrl:check.application,verificationMethod:check.verificationMethod||'Fuente pública · revisión administrativa',verificationReason:reason,validityMethod:check.validityMethod,...(check.officialOpenEvidence?{officialOpenEvidence:check.officialOpenEvidence,vacancies:check.vacancies,applicationMethod:'in_person',applicationInstructions:check.officialOpenEvidence.applicationInstructions}:{}),verificationCheckedAt:now,lastVerifiedAt:now,verifiedAt:job.verifiedAt||job.firstVerifiedAt||now,firstVerifiedAt:job.firstVerifiedAt||job.verifiedAt||now,firstPublishedAt:job.firstPublishedAt||now,review:false,verified:true,active:true,status:'Verificada',adminVerificationEvidence:check.evidence};
     if(options.project({...job,...patch,id:jobId})){
      await saveJob(jobId,job,patch);await saveReview(id,row,{motorState:'verified_awaiting_feed',blockReason:null,nextCheckAt:null,lastCheckedAt:now});report.verified++;remaining.splice(index,1);continue;
     }
     reason='public_projection_rejected';
    }
   }
   const duplicate=['already_in_internal_inventory','already_in_public_catalog'].includes(reason);
   const rejected=check.status==='rejected'||reason==='expired_deadline';
   const blocked=check.status==='blocked'||reason==='original_source_date_changed'||reason==='public_projection_rejected';
   const motorState=duplicate?'duplicate':rejected?'rejected':blocked?'blocked':'pending';
   if(duplicate||rejected)await saveJob(jobId,job,{active:false,verified:false,review:false,status:'Descartada',verificationCheckedAt:check.checkedAt,verificationReason:reason});
   const slow=/robots|access|HTTP (?:403|429)|challenge/.test(reason);
   await saveReview(id,row,{motorState,blockReason:reason,lastCheckedAt:check.checkedAt,nextCheckAt:terminal.has(motorState)?null:new Date(Date.now()+(slow?2*3600000:15*60000)).toISOString()});
   report[motorState]++;remaining.splice(index,1);
  }
  return report;
 }finally{
  const [ok]=await db.tx.update(CONTROL,[{id:'current',record:{cursor,pendingIds:remaining,migrationCursor,migrationComplete,leaseOwner:undefined,leaseUntil:undefined,revision:randomUUID(),lastRunAt:new Date().toISOString()},if:{leaseOwner,revision}}],{patch:true});if(!ok)throw Error('admin_verification_checkpoint_unconfirmed');
 }
}

// Reads the actual current public item after the single feed writer advances.
// Bounded to one inbox page per invocation; persisted receipts remain auditable.
export async function confirmAdminReviewPublications(){
 const [checkpoint]=await db.get<{cursor?:string}>(CONTROL,['publication'],{consistent:true});
 const page=await db.list(ADMIN_VERIFICATION_QUEUE,{limit:20,...(checkpoint?.cursor?{nextToken:checkpoint.cursor}:{})});
 const reader=reviewPublicationReader();
 let confirmed=0,waiting=0;
 for(const work of page.items){
  const [stored]=await db.get<Row>('radar_review_inbox',[work.id],{consistent:true});
  if(!stored)continue;const row={...stored,id:work.id};
  if(!valid(row.id)||!queued(row)||terminal.has(row.motorState||'')){await db.delete(ADMIN_VERIFICATION_QUEUE,[row.id]);continue;}
  const jobId='tcq_'+row.id.slice(3),[job]=await db.get<Job>('radar_jobs',[jobId],{consistent:true});
  if(!job||job.active!==true||job.review!==false||job.verified!==true)continue;
  const status=await reader(row.id,row);
  if(!status.published){waiting++;continue;}
  await saveReview(row.id,row,{motorState:'published',publication:{state:'published_confirmed',jobId,feedManifestId:'feedManifestId' in status?status.feedManifestId:null,confirmedAt:new Date().toISOString(),url:'/?listing='+encodeURIComponent(jobId)},blockReason:null,nextCheckAt:null});confirmed++;await db.delete(ADMIN_VERIFICATION_QUEUE,[row.id]);
 }
 const [saved]=checkpoint?await db.tx.update(CONTROL,[{id:'publication',record:{cursor:page.nextToken}}],{patch:true}):await db.tx.add(CONTROL,[{id:'publication',cursor:page.nextToken}]);
 if(!saved)throw Error('admin_publication_checkpoint_unconfirmed');
 return {confirmed,waiting,hasMore:!!page.nextToken,paidCalls:0};
}
