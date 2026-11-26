import { db } from '@appdeploy/sdk';
import { enqueueAdminReviewedOffer } from './radar-review-queue';
import { randomUUID } from 'node:crypto';
type Review={id:string;kind?:string;sourceId?:string;status?:string;lastCheckedAt?:string};
type Cursor={id:string;cursor?:string|null;pending?:string[];revision?:string;leaseUntil?:number;retryAfter?:Record<string,number>};
const TABLE='motor_b_c_idle_cursor_v2';
const eligible=(r:Review,now:number)=>r.kind==='review_candidate'&&/^motor-c(?:-|$)/.test(r.sourceId||'')&&r.status==='ready_for_final_check'&&/^tc_[a-f0-9]{22}$/.test(r.id)&&(!r.lastCheckedAt||!Number.isFinite(Date.parse(r.lastCheckedAt))||now-Date.parse(r.lastCheckedAt)>=7200000);
export async function assistMotorCWhenBIdle(pdfProcessed:number,pdfAvailable:number|null){
 const result={checked:0,submitted:0,alreadyQueued:0,deferred:0,errors:0,hasMore:false,eligible:false};
 if(pdfProcessed!==0||pdfAvailable!==0)return result;
 const now=Date.now(),revision=randomUUID();
 const [old]=await db.get<Cursor>(TABLE,['current'],{consistent:true});
 if(old?.leaseUntil&&old.leaseUntil>now)return result;
 let state:Cursor={id:'current',cursor:old?.cursor||null,pending:old?.pending||[],retryAfter:old?.retryAfter||{},revision,leaseUntil:now+600000};
 const [claimed]=old?await db.tx.update(TABLE,[{id:'current',record:state,if:{revision:old.revision}}]):await db.tx.add(TABLE,[state]);
 if(!claimed)return result;
 async function save(patch:Partial<Cursor>){
  const next={...state,...patch,revision:randomUUID()};
  const [ok]=await db.tx.update(TABLE,[{id:'current',record:next,if:{revision:state.revision}}]);
  if(!ok)throw Error('idle_assist_checkpoint_conflict');
  state=next;
 }
 try{
  result.eligible=true;
  if(!state.pending?.length){
   for(let pages=0;pages<4&&!state.pending?.length;pages++){
   const page=await db.list<Review>('radar_review_inbox',{limit:24,...(state.cursor?{nextToken:state.cursor}:{})});
   const retryAfter=Object.fromEntries(Object.entries(state.retryAfter||{}).filter(([,until])=>until>now));
   await save({cursor:page.nextToken||null,pending:page.items.filter(r=>eligible(r,now)&&!retryAfter[r.id]).map(r=>r.id),retryAfter});
   if(!page.nextToken)break;
   }
  }
  for(const id of (state.pending||[]).slice(0,2)){
   const [row]=await db.get<Review>('radar_review_inbox',[id],{consistent:true});
   let retry=false;
   if(row&&eligible(row,Date.now())){
    result.checked++;
    try{const outcome=await enqueueAdminReviewedOffer({id});if(outcome.queued){if('alreadyQueued' in outcome&&outcome.alreadyQueued)result.alreadyQueued++;else result.submitted++;}else{result.deferred++;retry=true;}}
    catch{result.errors++;retry=true;}
   }
   await save({pending:(state.pending||[]).filter(x=>x!==id),retryAfter:{...state.retryAfter,...(retry?{[id]:Date.now()+7200000}:{})}});
  }
  result.hasMore=Boolean(state.cursor||state.pending?.length);
  return result;
 }finally{await save({leaseUntil:0});}
}
