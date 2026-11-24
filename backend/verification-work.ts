import { db, isAppDatabaseError } from '@appdeploy/sdk';
import { createHash, randomUUID } from 'node:crypto';

type Lane='new'|'retry'|'recheck';
export type WorkStatus='leased'|'retry'|'verified'|'rejected'|'blocked'|'superseded';
type Job=Record<string,unknown>;
type Work={
 id:string; jobId:string; lane:Lane; status:WorkStatus; version:string; token:string;
 attempts:number; admittedAt:number; dueAt:number; leaseUntil:number; evidence:string;
};
const WORK='tc_verification_work_v1';
const READY='tc_verification_ready_v1';
const RETRY='tc_verification_retry_v1';
const EVENTS='tc_verification_attempts_v1';
const MAX_ATTEMPTS=5;
const LEASE_MS=3*60_000;
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const workKey=(jobId:string)=>digest(jobId);

export function verificationEvidence(job:Job):string {
 return digest(JSON.stringify([
  job.url,job.title,job.company,job.workCommunes,job.workLocation,job.workLocationEvidence,
  job.sourcePublishedAt,job.sourceValidThrough,job.note,job.socialEvidence,job.contact,job.verified===true,
 ]));
}

export function verificationRetryDelay(attempt:number,retryAfterMs=0):number {
 return Math.max(Math.min(24*3600_000,15*60_000*2**Math.min(Math.max(0,attempt-1),8)),retryAfterMs);
}

export function canClaimVerification(old:Work|undefined, evidence:string, version:string, now:number):boolean {
 if(!old)return true;
 if(old.status==='leased' && old.leaseUntil>now)return false;
 if(old.evidence!==evidence || old.version!==version)return true;
 return (old.status==='leased' && old.attempts<MAX_ATTEMPTS) ||
        ((old.status==='retry'||old.status==='verified') && old.dueAt<=now);
}

export function verificationIntake(jobId:string,now=Date.now()){
 return db.tx.add(READY,[{id:workKey(jobId),jobId,admittedAt:now}]);
}

type Intake={id:string;jobId:string;admittedAt:number;dueAt?:number};
export async function readVerificationIntake(now=Date.now()){
 const [ready,cursor]=await Promise.all([
  db.list<Intake>(READY,{limit:80}),
  db.get<{nextToken?:string}>('tc_verification_retry_cursor_v1',['current'],{consistent:true}),
 ]);
 const page=await db.list<Intake>(RETRY,{limit:32,...(cursor[0]?.nextToken?{nextToken:cursor[0].nextToken}:{})});
 return {items:[...ready.items,...page.items.filter(item=>(item.dueAt??0)<=now)],fresh:ready.items.length,
  retrySample:page.items.length,retryCursor:page.nextToken};
}

export async function saveVerificationRetryCursor(nextToken?:string){
 const [ok]=await db.tx.update('tc_verification_retry_cursor_v1',[{
  id:'current',record:nextToken?{nextToken}:{}
 }]);
 if(!ok)throw Error('verification_retry_cursor_write_failed');
}

export async function clearOrphanedIntake(id:string){
 await db.transact([db.tx.delete(READY,[id]),db.tx.delete(RETRY,[id])]);
}

export async function claimVerification(jobId:string, job:Job, version:string, admittedAt?:number, now=Date.now()){
 const id=workKey(jobId), evidence=verificationEvidence(job);
 const [prior]=await db.get<Work>(WORK,[id],{consistent:true});
 const old=prior??undefined;
 if(old?.status==='leased' && old.leaseUntil<=now && old.attempts>=MAX_ATTEMPTS &&
    old.evidence===evidence && old.version===version){
  const record={...old,status:'blocked',leaseUntil:0,token:randomUUID()};
  try{
   await db.transact([
    db.tx.update(WORK,[{id,if:{token:old.token},record}]),
    db.tx.delete(READY,[id]),db.tx.delete(RETRY,[id]),
    db.tx.add(EVENTS,[{id:record.token,jobId,lane:old.lane,status:'blocked',attempt:old.attempts,
      admittedAt:old.admittedAt,at:now,reason:'lease_recovery_exhausted'}]),
   ]);
  }catch(error){
   if(!isAppDatabaseError(error)||error.code!=='AppDatabaseConditionFailed')throw error;
  }
  return null;
 }
 if(!canClaimVerification(old,evidence,version,now))return null;
 const attempts=old?.evidence===evidence && old.version===version && old.status!=='verified'?old.attempts+1:1;
 const lane:Lane=job.verified===true?'recheck':attempts>1?'retry':'new';
 const lease:Work={id,jobId,lane,status:'leased',version,token:randomUUID(),attempts,
  admittedAt:admittedAt??old?.admittedAt??now,dueAt:now,leaseUntil:now+LEASE_MS,evidence};
 const [saved]=old?await db.tx.update(WORK,[{id,if:{token:old.token},record:lease}]):await db.tx.add(WORK,[lease]);
 return saved?lease:null;
}

type Decision={id:string;record:Job;inconclusive?:boolean};
export async function settleVerification(lease:Work,before:Job,decision:Decision, now=Date.now(),sourceError=false){
 const after=sourceError?decision.record:{...decision.record,traceVersion:1,
  queuedAt:before.queuedAt??new Date(lease.admittedAt).toISOString(),
  storedAt:before.storedAt??new Date(now).toISOString(),verificationAttempts:lease.attempts};
 // Existing writers do not all share this lease. Compare the source revision fields at commit.
 const condition=Object.fromEntries(['verificationCheckedAt','active','verified','url','sourcePublishedAt',
  'sourceValidThrough','title','company'].map(field=>[field,before[field]]));
 const status:WorkStatus=sourceError||decision.inconclusive?'retry':after.active===false?'rejected':after.verified===true?'verified':'retry';
 const terminal=status==='retry'&&lease.attempts>=MAX_ATTEMPTS?'blocked':status;
 const dueAt=terminal==='verified'?now+24*3600_000:terminal==='retry'?now+verificationRetryDelay(lease.attempts):0;
 const next={...lease,status:terminal,dueAt,leaseUntil:0,evidence:sourceError?lease.evidence:verificationEvidence(after)};
 const event={id:lease.token,jobId:lease.jobId,lane:lease.lane,status:terminal,attempt:lease.attempts,
  admittedAt:lease.admittedAt,at:now,reason:sourceError?'verification_exception':String(after.verificationReason||'').slice(0,120)};
 if(now>=lease.leaseUntil)return false;
 try{
  await db.transact([
   db.tx.update(WORK,[{id:lease.id,if:{token:lease.token,status:'leased'},record:next}]),
   db.tx.add(EVENTS,[event]),
   db.tx.delete(READY,[lease.id]),
   terminal==='retry'
    ?db.tx.update(RETRY,[{id:lease.id,record:{jobId:lease.jobId,admittedAt:lease.admittedAt,dueAt}}])
    :db.tx.delete(RETRY,[lease.id]),
   ...(!sourceError?[
    db.tx.update('radar_jobs',[{id:decision.id,if:condition,record:after}]),
    db.tx.add('public_feed_changes',[{source:'radar_jobs',sourceId:decision.id,queuedAt:new Date(now).toISOString()}]),
   ]:[]),
  ]);
  return true;
 }catch(error){
  if(isAppDatabaseError(error) && error.code==='AppDatabaseConditionFailed')return false;
  if(isAppDatabaseError(error) && ['AppDatabaseUnknownOutcome','AppDatabaseDuplicateId'].includes(error.code)){
   const [receipt]=await db.get(EVENTS,[lease.token],{consistent:true});
   if(receipt)return true;
  }
  throw error;
 }
}

export async function verificationQueueView(now=Date.now()){
 const [fresh,retry]=await Promise.all([
  db.list<Intake>(READY,{limit:80}),db.list<Intake>(RETRY,{limit:80}),
 ]);
 const describe=(page:typeof fresh)=>{
  const ages=page.items.map(row=>now-row.admittedAt).filter(age=>Number.isFinite(age)&&age>=0);
  return {sampled:page.items.length,complete:!page.nextToken,
   oldestSampleMs:ages.length?Math.max(...ages):null};
 };
 return {fresh:describe(fresh),retry:describe(retry)};
}
