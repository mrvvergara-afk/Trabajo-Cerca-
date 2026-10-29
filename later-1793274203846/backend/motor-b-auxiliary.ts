import { db } from '@appdeploy/sdk';

// Auxiliary B: independently classifies its own queue; never marks an offer verified
// and never writes to the public catalog.
type BOffer = { id:string; url?:string; status?:string; title?:string; company?:string|null; commune?:string|null; publishedAt?:string|null; application?:string|null; reason?:string };
const completed = new Set(['closed','not_job','duplicate']);
export async function triageMotorBQueue() {
  const [checkpoint] = await db.get<{cursor?:string}>('motor_b_aux_state',['current'],{consistent:true});
  const page = await db.list<BOffer>('motor_b_offers',{limit:20,...(checkpoint?.cursor?{nextToken:checkpoint.cursor}:{})});
  let examined=0,ready=0,needsEvidence=0;
  for(const candidate of page.items.slice(0,8)) {
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
  }
  if(checkpoint)await db.tx.update('motor_b_aux_state',[{id:'current',record:{cursor:page.nextToken||null,updatedAt:new Date().toISOString()}}],{patch:true});
  else await db.tx.add('motor_b_aux_state',[{id:'current',cursor:page.nextToken||null,updatedAt:new Date().toISOString()}]);
  console.warn('MOTOR_B_AUX '+JSON.stringify({examined,ready,needsEvidence,hasMore:!!page.nextToken}));
  return {examined,ready,needsEvidence};
}
