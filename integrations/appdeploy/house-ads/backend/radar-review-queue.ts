import { db, isAppDatabaseError } from '@appdeploy/sdk';
import { registerPublicFeedChange, currentPublicFeedManifest, readPublicFeedItem } from './public-feed';
import { checkOneReview } from './radar-review-check';
import {publicFeedIdentity} from './public-source-adapters';
import {offerRetentionReason} from './offer-retention';

type Review={kind?:string;status?:string;url?:string;sourceId?:string};
type Job={url?:string;kind?:string;review?:boolean;verified?:boolean};
type Check={status:string;reason?:string;title?:string;company?:string;workCommune?:string;
  publishedDate?:string;sourcePublishedAt?:string;application?:string;deadline?:string|null;source?:string};

export const ADMIN_VERIFICATION_QUEUE='radar_admin_verification_queue';
export async function stageAdminReviewVerification(id:string){
 if(!/^tc_[a-f0-9]{22}$/.test(id))throw Error('invalid_review_id');
 try{await db.tx.add(ADMIN_VERIFICATION_QUEUE,[{id,queuedAt:new Date().toISOString()}]);}
 catch(cause){if(!isAppDatabaseError(cause)||cause.code!=='AppDatabaseUnknownOutcome')throw cause;const [saved]=await db.get(ADMIN_VERIFICATION_QUEUE,[id],{consistent:true});if(!saved)throw cause;}
}
async function saveQueuedReceipt(id:string){
 const [work]=await db.get(ADMIN_VERIFICATION_QUEUE,[id],{consistent:true});
 const writes=[db.tx.update('radar_review_inbox',[{id,record:{status:'queued_for_verification',radarJobId:'tcq_'+id.slice(3),updatedAt:new Date().toISOString()},if:{status:'submitting'}}],{patch:true}),work?db.tx.update(ADMIN_VERIFICATION_QUEUE,[{id,record:{touchedAt:new Date().toISOString()}}],{patch:true}):db.tx.add(ADMIN_VERIFICATION_QUEUE,[{id,queuedAt:new Date().toISOString()}])];
 try{const result=await db.transact(writes);if(result.flat().some(value=>!value))throw Error('review_receipt_checkpoint_failed');}
 catch(cause){if(!isAppDatabaseError(cause)||cause.code!=='AppDatabaseUnknownOutcome')throw cause;const [review]=await db.get<Review>('radar_review_inbox',[id],{consistent:true});const [saved]=await db.get(ADMIN_VERIFICATION_QUEUE,[id],{consistent:true});if(review?.status!=='queued_for_verification'||!saved)throw cause;}
}

/** A verified administrator may queue a source for the EXISTING verifier.
 * Never writes a verified:true or review:false job. No direct publication.
 */
export async function enqueueAdminReviewedOffer(body:unknown){
  const input=body&&typeof body==='object'?body as Record<string,unknown>:{};
  const id=typeof input.id==='string'?input.id:'';
  if(!/^tc_[a-f0-9]{22}$/.test(id))return {queued:false,reason:'invalid_review_id'};
  const jobId='tcq_'+id.slice(3);
  const [row]=await db.get<Review>('radar_review_inbox',[id],{consistent:true});
  if(!row||row.kind!=='review_candidate'||!row.url)
    return {queued:false,reason:'review_missing'};
  if(row.status==='queued_for_verification'||row.status==='submitting'){
    const [existing]=await db.get<Job>('radar_jobs',[jobId],{consistent:true});
    if(!existing||existing.url!==row.url)
      return {queued:false,reason:'needs_queue_reconciliation'};
    if(row.status==='submitting'){
      await registerPublicFeedChange('radar_jobs',jobId);
      const [recovered]=await db.tx.update('radar_review_inbox',[{
        id,record:{status:'queued_for_verification',radarJobId:jobId,updatedAt:new Date().toISOString()},
        if:{status:'submitting'}
      }],{patch:true});
      if(!recovered)return {queued:false,reason:'review_changed_during_recovery'};
    }
    await stageAdminReviewVerification(id);
    return {queued:true,alreadyQueued:true,jobId,published:false};
  }
  if(row.status!=='ready_for_final_check')
    return {queued:false,reason:'final_review_required'};
  const check=await checkOneReview({id}) as Check;
  if(check.status!=='verified_for_final_review'||!check.title||!check.company||
     !check.workCommune||!check.publishedDate||!check.sourcePublishedAt||!check.application)
    return {queued:false,reason:check.reason||'source_verification_required'};
  const [claimed]=await db.tx.update('radar_review_inbox',[{
    id,record:{status:'submitting',updatedAt:new Date().toISOString()},
    if:{status:'ready_for_final_check'}
  }],{patch:true});
  if(!claimed)return {queued:false,reason:'concurrent_review_change'};
  let stored=false;
  try{
    const now=new Date().toISOString();
    const record={
      id:jobId,kind:'job_offer',origin:'radar',
      title:check.title,company:check.company,
      workLocation:check.workCommune,workCommunes:[check.workCommune],
      recruitmentZones:[check.workCommune],recruitmentCommunes:[check.workCommune],
      area:'Radar · revisión administrativa',status:'Por confirmar',
      date:check.publishedDate,source:check.source||row.sourceId||'Fuente laboral',
      sourceDomain:new URL(row.url).hostname.replace(/^www\./,''),
      sourcePublishedAt:check.sourcePublishedAt,sourceValidThrough:check.deadline||null,
      url:row.url,applicationUrl:check.application,
      note:'Aviso revisado; verificación del sistema pendiente. Postulación: '+check.application,
      tags:[check.title,check.workCommune].join(' ').toLowerCase().split(/\s+/).slice(0,18),
      visual:'field',icon:'work',discoveredBy:'admin-review-inbox-v1',
      review:true,verified:false,active:true,createdAt:now,lastSeenAt:now
    };
    const [existing]=await db.get<Job>('radar_jobs',[jobId],{consistent:true});
    if(existing&&existing.url!==row.url)throw Error('candidate_id_conflict');
    if(!existing){
      try{
        const [created]=await db.tx.add('radar_jobs',[record]);
        if(!created){
          const [saved]=await db.get<Job>('radar_jobs',[jobId],{consistent:true});
          if(!saved||saved.url!==row.url)throw Error('candidate_storage_failed');
        }
      }catch(cause:unknown){
        if(isAppDatabaseError(cause)&&
           (cause.code==='AppDatabaseDuplicateId'||cause.code==='AppDatabaseUnknownOutcome')){
          const [saved]=await db.get<Job>('radar_jobs',[jobId],{consistent:true});
          if(!saved||saved.url!==row.url)throw cause;
        }else throw cause;
      }
    }
    stored=true;
    await registerPublicFeedChange('radar_jobs',jobId);
    await saveQueuedReceipt(id);
    return {queued:true,jobId,published:false,next:'verify-publish'};
  }catch(cause){
    if(!stored)await db.tx.update('radar_review_inbox',[{
      id,record:{status:'ready_for_final_check',updatedAt:new Date().toISOString()},
      if:{status:'submitting'}
    }],{patch:true});
    throw cause;
  }
}

// One manifest and at most one read per referenced public leaf for a dashboard page.
// A key in the manifest alone is not proof that the actual public item exists.
export function reviewPublicationReader(){
 let root:ReturnType<typeof currentPublicFeedManifest>|undefined;
 const leaves=new Map<string,Promise<{entries?:Array<{source:string;sourceId:string;item:Record<string,unknown>}>}|null>>();
 return async (id:string,review:{kind?:string;status?:string;url?:string;motorState?:string;blockReason?:string;lastCheckedAt?:string;lastCheck?:{reason?:string;status?:string;existingPublicId?:string}})=>{
  const jobId='tcq_'+id.slice(3);
  const base={jobId,published:false,lastCheckedAt:review.lastCheckedAt||null,reason:review.blockReason||review.lastCheck?.reason||null};
  if(!['submitting','queued_for_verification'].includes(review.status||''))return {...base,state:'not_queued'};
  const [job]=await db.get<Record<string,unknown>>('radar_jobs',[jobId],{consistent:true});
  if(!job||job.url!==review.url||job.discoveredBy!=='admin-review-inbox-v1')return {...base,state:'queue_reconciliation_required'};
  const reason=review.blockReason||review.lastCheck?.reason||job.verificationReason||base.reason;
  const latest=[job.verificationCheckedAt,base.lastCheckedAt].filter((x):x is string=>typeof x==='string'&&Number.isFinite(Date.parse(x))).sort((a,b)=>Date.parse(b)-Date.parse(a))[0]||null;
  const dates={lastCheckedAt:latest,sourcePublishedAt:job.sourcePublishedAt||null,firstPublishedAt:job.firstPublishedAt||null};
  const excluded=offerRetentionReason(job);
  if(job.active===false||(excluded&&excluded!=='approval_or_quality_review_required')){
   if(review.motorState==='duplicate'){
    const existingId=review.lastCheck?.existingPublicId;
    const existing=existingId?await readPublicFeedItem(existingId):null;
    const same=existing&&existing.kind==='job_offer'&&typeof existing.url==='string'&&typeof review.url==='string'&&publicFeedIdentity(existing.url)===publicFeedIdentity(review.url);
    return {...base,...dates,reason,state:'duplicate',...(same?{existingPublicId:existingId,existingPublicUrl:'/?listing='+encodeURIComponent(existingId!)}:{})};
   }
   return {...base,...dates,reason,state:'inactive_or_rejected'};
  }
  if(job.review!==false||job.verified!==true)return {...base,...dates,reason,state:review.motorState==='blocked'?'blocked':'pending_verifier'};
  root??=currentPublicFeedManifest();
  const snapshot=await root;
  if(!snapshot)return {...base,...dates,reason,state:'waiting_for_feed'};
  const page=snapshot.manifest.pages.find(p=>p.keys.includes('radar_jobs:'+jobId));
  if(!page)return {...base,...dates,reason,state:'waiting_for_feed_projection'};
  if(!leaves.has(page.id))leaves.set(page.id,db.get<{entries?:Array<{source:string;sourceId:string;item:Record<string,unknown>}>}>('public_feed_versions',[page.id],{consistent:true}).then(rows=>rows[0]||null));
  const leaf=await leaves.get(page.id);
  const entry=leaf?.entries?.find(e=>e.source==='radar_jobs'&&e.sourceId===jobId&&e.item.id===jobId);
  if(!entry||entry.item.url!==review.url||entry.item.verified!==true||entry.item.review!==false)return {...base,...dates,reason,state:'waiting_for_feed_projection'};
  return {...base,...dates,reason,state:'published_confirmed',published:true,feedManifestId:snapshot.manifestId,feedPageId:page.id,url:'/?listing='+encodeURIComponent(jobId)};
 };
}
export async function readAdminReviewPublicationStatus(body:unknown){
 const input=body&&typeof body==='object'?body as Record<string,unknown>:{};
 const id=typeof input.id==='string'?input.id:'';
 if(!/^tc_[a-f0-9]{22}$/.test(id))return {state:'invalid_id',published:false};
 const [review]=await db.get<Review>('radar_review_inbox',[id],{consistent:true});
 if(!review||review.kind!=='review_candidate')return {state:'review_missing',published:false};
 return reviewPublicationReader()(id,review);
}
