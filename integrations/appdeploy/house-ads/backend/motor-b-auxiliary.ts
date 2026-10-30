import { db } from '@appdeploy/sdk';
import { createHash } from 'node:crypto';
import { importReview, decideReview } from './radar-review-inbox';
import { enqueueAdminReviewedOffer } from './radar-review-queue';

// Auxiliary B: independently classifies its own queue; never marks an offer verified
// and never writes to the public catalog.
type BOffer = { id:string; url?:string; status?:string; title?:string; company?:string|null; commune?:string|null; publishedAt?:string|null; application?:string|null; reason?:string };
const completed = new Set(['closed','not_job','duplicate']);
export async function triageMotorBQueue() {
  const [checkpoint] = await db.get<{cursor?:string}>('motor_b_aux_state',['current'],{consistent:true});
  const page = await db.list<BOffer>('motor_b_offers',{limit:8,...(checkpoint?.cursor?{nextToken:checkpoint.cursor}:{})});
  let examined=0,ready=0,needsEvidence=0,bridged=0,bridgeRejected=0,submitted=0;
  for(const candidate of page.items) {
    if(completed.has(candidate.status||''))continue;
    const hasIdentity=Boolean(candidate.url&&candidate.title&&candidate.commune);
    const hasEvidence=Boolean(candidate.company&&candidate.publishedAt&&candidate.application);
    const classification=hasIdentity&&hasEvidence?'ready_for_primary_verifier':'needs_source_evidence';
    const reason=classification==='needs_source_evidence'
      ?[!candidate.title?'title':null,!candidate.commune?'workplace':null,!candidate.company?'employer':null,!candidate.publishedAt?'original_date':null,!candidate.application?'application':null].filter(Boolean).join(',')
      :'eligible_for_primary_verification_not_published';
    const id=candidate.id;
    if(!id)continue;
    const [old]=await db.get<{classification?:string;reason?:string}>('motor_b_aux_queue',[id],{consistent:true});
    if(!old){
      await db.tx.add('motor_b_aux_queue',[{id,sourceOfferId:id,classification,reason,checkedAt:new Date().toISOString()}]);
    }else if(old.classification!==classification||old.reason!==reason) {
      await db.tx.update('motor_b_aux_queue',[{id,record:{classification,reason,checkedAt:new Date().toISOString()}}],{patch:true});
    }
    examined++;if(hasIdentity&&hasEvidence)ready++;else needsEvidence++;
    if(hasIdentity&&candidate.url&&candidate.title&&candidate.commune){
      const candidate_key=createHash('sha256').update('motor-b|'+candidate.url+'|'+candidate.title).digest('hex').slice(0,22);
      const item={candidate_key,url:candidate.url,source_id:'motor-b-independent',status:'revision_obligatoria',reported_territories:[candidate.commune],published_date_evidence:candidate.publishedAt||null,deadline_evidence:null};
      try{const result=await importReview({items:[item]});bridged+=result.inserted;bridgeRejected+=result.rejected;
        if(hasEvidence&&candidate.status==='ready'){
          const reviewId='tc_'+candidate_key;
          try{
            await decideReview({id:reviewId,status:'ready_for_final_check'});
            const outcome=await enqueueAdminReviewedOffer({id:reviewId});
            if(outcome.queued)submitted++;
          }catch(e){console.warn('MOTOR_B_PRIMARY_REVIEW_PENDING '+String(e).slice(0,160));}
        }
      }
      catch(e){bridgeRejected++;console.warn('MOTOR_B_BRIDGE_REVIEW '+String(e).slice(0,150));}
    }
  }
  if(checkpoint)await db.tx.update('motor_b_aux_state',[{id:'current',record:{cursor:page.nextToken||null,updatedAt:new Date().toISOString()}}],{patch:true});
  else await db.tx.add('motor_b_aux_state',[{id:'current',cursor:page.nextToken||null,updatedAt:new Date().toISOString()}]);
  console.warn('MOTOR_B_AUX '+JSON.stringify({examined,ready,needsEvidence,bridged,bridgeRejected,submitted,hasMore:!!page.nextToken}));
  return {examined,ready,needsEvidence};
}
