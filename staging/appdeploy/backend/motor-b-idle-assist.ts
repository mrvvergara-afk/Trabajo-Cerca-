import { db } from '@appdeploy/sdk';
import { enqueueAdminReviewedOffer } from './radar-review-queue';
import { freePublicSourceStatus } from './free-public-sources';

/** Staged helper: B supports C only when the PDF worker has no eligible items.
 * It never promotes a candidate without source verification.
 */
type Review = { id:string; kind?:string; sourceId?:string; status?:string; lastCheckedAt?:string };
type Cursor = { id:string; cursor?:string|null };
export async function assistMotorCWhenBIdle(pdfProcessed:number,pdfAvailable:number) {
  const result={eligible:false,documentsWaiting:0,checked:0,submitted:0,alreadyQueued:0,deferred:0,errors:0,hasMore:false};
  if(pdfProcessed>0||pdfAvailable>0)return result;
  const source=await freePublicSourceStatus();
  result.documentsWaiting=source.documentWork.items.filter(item=>item.kind==='document').length;
  const [checkpoint]=await db.get<Cursor>('motor_b_c_idle_cursor_v1',['current'],{consistent:true});
  const page=await db.list<Review>('radar_review_inbox',{limit:24,...(checkpoint?.cursor?{nextToken:checkpoint.cursor}:{})});
  result.hasMore=Boolean(page.nextToken);
  const selected=page.items.filter(row=>row.kind==='review_candidate' &&
    typeof row.sourceId==='string' && /^motor-c(?:-|$)/.test(row.sourceId) &&
    row.status==='ready_for_final_check' && /^tc_[a-f0-9]{22}$/.test(row.id) &&
    (!row.lastCheckedAt || Date.now()-Date.parse(row.lastCheckedAt)>=2*3600000)).slice(0,2);
  result.eligible=true;
  for(const row of selected){
    result.checked++;
    try{
      const outcome=await enqueueAdminReviewedOffer({id:row.id});
      if(outcome.queued){
        if('alreadyQueued' in outcome && outcome.alreadyQueued) result.alreadyQueued++;
        else result.submitted++;
      } else result.deferred++;
    }catch(error){result.errors++;console.warn('MOTOR_B_C_IDLE_ASSIST_ERROR '+String(error).slice(0,120));}
  }
  const next={id:'current',cursor:page.nextToken||null,updatedAt:new Date().toISOString()};
  if(checkpoint)await db.tx.update('motor_b_c_idle_cursor_v1',[{id:'current',record:next}]);
  else await db.tx.add('motor_b_c_idle_cursor_v1',[next]);
  console.warn('MOTOR_B_C_IDLE_ASSIST '+JSON.stringify(result));
  return result;
}
