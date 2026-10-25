import {db,notifications} from '@appdeploy/sdk';
import {createHash,randomUUID} from 'node:crypto';
import {readPublicFeedItem} from './public-feed';
import {publicFeedIdentity} from './public-source-adapters';
import {hasVerificationEvidence} from '../shared/offer-public-state';

type Row=Record<string,unknown>;
export type AlertPreference={userId:string;communes:string[];keywords:string[];active:boolean;createdAt:string;updatedAt:string};
type OfferEvent={id:string;publicId:string;firstPublishedAt:string;prefCursor?:string;prefOffset?:number};
type Delivery={userId:string;event:OfferEvent;status:string;attempt:number;nextAttemptAt?:string};
type Control={enabledAt:string;legacyCursor?:string;legacyComplete?:boolean;retryCursor?:string;leaseOwner?:string;leaseUntil?:string;revision:string};
const PREFS='notification_user_preferences',EVENTS='notification_offer_queue',HISTORY='notification_offer_history',RECEIPTS='notification_delivery_receipts',RETRIES='notification_delivery_retries',CONTROL='notification_dispatch_control';
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
const DAY=86400000;
async function control():Promise<Control>{
 const [old]=await db.get<Control>(CONTROL,['current'],{consistent:true});if(old)return old;
 const created={enabledAt:new Date().toISOString(),revision:randomUUID()};
 const [id]=await db.tx.add(CONTROL,[{id:'current',...created}]);
 if(id)return created;
 const [saved]=await db.get<Control>(CONTROL,['current'],{consistent:true});
 if(!saved)throw Error('notification_control_unconfirmed');return saved;
}
export async function getAlertPreference(userId:string){
 const [row]=await db.get<AlertPreference>(PREFS,[digest(userId)],{consistent:true});
 if(row)return row;
 const [state]=await db.get<Control>(CONTROL,['current'],{consistent:true});
 return {userId,active:false,communes:[],keywords:[],legacyPending:!state?.legacyComplete};
}
export async function saveAlertPreference(userId:string,communes:string[],keywords:string[]){
 const id=digest(userId),[old]=await db.get<AlertPreference>(PREFS,[id],{consistent:true});
 const now=new Date().toISOString(),record={userId,communes,keywords,active:true,createdAt:old?.createdAt||now,updatedAt:now};
 const [ok]=old?await db.tx.update(PREFS,[{id,record}]):await db.tx.add(PREFS,[{id,...record}]);
 if(!ok)throw Error('notification_preference_not_saved');await control();return record;
}
export async function disableAlertPreference(userId:string){
 // A keyed tombstone overrides legacy rows, including users beyond the first page.
 const id=digest(userId),[old]=await db.get<AlertPreference>(PREFS,[id],{consistent:true}),now=new Date().toISOString();
 const record={userId,communes:old?.communes||[],keywords:old?.keywords||[],active:false,createdAt:old?.createdAt||now,updatedAt:now};
 const [ok]=old?await db.tx.update(PREFS,[{id,record}]):await db.tx.add(PREFS,[{id,...record}]);
 if(!ok)throw Error('notification_disable_not_saved');
}

export async function queueNotificationOffers(items:Row[]){
 if(!items.length)return;
 const state=await control(),now=Date.now();
 for(const item of items){
  const first=Date.parse(String(item.firstPublishedAt||''));
  if(item.kind!=='job_offer'||item.verified!==true||item.review===true||!hasVerificationEvidence(item)||!Number.isFinite(first)||first<Date.parse(state.enabledAt)||first>now)continue;
  const identity=typeof item.url==='string'?publicFeedIdentity(item.url,String(item.documentUnitKey||'')||undefined):null;
  // Stable first incorporation and source identity, never the last verification stamp.
  const id=digest((identity||String(item.id))+'\0'+new Date(first).toISOString());
  const [finished]=await db.get(HISTORY,[id],{consistent:true});if(finished)continue;
  const [existing]=await db.get<OfferEvent>(EVENTS,[id],{consistent:true});
  if(existing){
   if(existing.publicId!==item.id)await db.tx.update(EVENTS,[{id,record:{publicId:item.id}}],{patch:true});
  }else await db.tx.add(EVENTS,[{id,publicId:String(item.id),firstPublishedAt:new Date(first).toISOString()}]);
 }
}
function matches(item:Row,pref:AlertPreference){
 const towns=Array.isArray(item.workCommunes)?item.workCommunes:[];
 if(!pref.active||!pref.communes.some(t=>towns.includes(t)))return false;
 if(!pref.keywords.length)return true;
 const text=[item.title,item.company,item.area,item.note,...(Array.isArray(item.tags)?item.tags:[])].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 return pref.keywords.some(word=>text.includes(word.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()));
}
async function eligible(event:OfferEvent,userId:string){
 const [pref]=await db.get<AlertPreference>(PREFS,[digest(userId)],{consistent:true});
 const item=await readPublicFeedItem(event.publicId),first=Date.parse(event.firstPublishedAt);
 if(!pref||!item||Date.now()-first>7*DAY||first<Date.parse(pref.createdAt)||item.kind!=='job_offer'||item.verified!==true||item.review===true||!hasVerificationEvidence(item)||!matches(item,pref))return null;
 return {pref,item};
}
type DeliveryStatus='sent'|'retry'|'failed'|'uncertain'|'skipped'|'ineligible';
async function deliver(event:OfferEvent,userId:string,retry=false):Promise<DeliveryStatus>{
 const key=digest(userId+'\0'+event.id),[prior]=await db.get<Delivery>(RECEIPTS,[key],{consistent:true});
 if(prior&&(!retry||prior.status!=='retry'||Date.parse(prior.nextAttemptAt||'')>Date.now()))return ['sending','uncertain'].includes(prior.status)?'uncertain':'skipped';
 const current=await eligible(event,userId);
 if(!current){if(retry)await db.delete(RETRIES,[key]);return 'ineligible';}
 const attempt=(prior?.attempt||0)+1;
 const record:Delivery={userId,event,status:'sending',attempt};
 const [claimed]=prior?await db.tx.update(RECEIPTS,[{id:key,record,if:{status:'retry',attempt:prior.attempt}}]):await db.tx.add(RECEIPTS,[{id:key,...record}]);
 if(!claimed)return 'skipped';
 let result:{sent:number;failed:number};
 try{
  const commune=current.pref.communes.find(t=>Array.isArray(current.item.workCommunes)&&current.item.workCommunes.includes(t))||current.pref.communes[0];
  result=await notifications.send({userIds:[userId],notification:{title:'Nueva oferta en '+commune,body:String(current.item.title),url:'/?listing='+encodeURIComponent(event.publicId)},data:{kind:'new_verified_job',event_id:key,listing_id:event.publicId},ttlSeconds:3600});
 }catch{
  // The provider may have accepted an interrupted request. Never blindly resend it.
  await db.tx.update(RECEIPTS,[{id:key,record:{status:'uncertain'},if:{status:'sending',attempt}}],{patch:true});
  if(retry)await db.delete(RETRIES,[key]);return 'uncertain';
 }
 if(result.sent>0){
  const [saved]=await db.tx.update(RECEIPTS,[{id:key,record:{status:'sent',sentAt:new Date().toISOString()},if:{status:'sending',attempt}}],{patch:true});
  if(!saved)throw Error('notification_delivery_receipt_unconfirmed');
  if(retry)await db.delete(RETRIES,[key]);return 'sent';
 }
 const nextAttemptAt=new Date(Date.now()+Math.min(6,2**(attempt-1))*3600000).toISOString();
 const status=attempt<3?'retry':'failed';
 const [saved]=await db.tx.update(RECEIPTS,[{id:key,record:{status,nextAttemptAt},if:{status:'sending',attempt}}],{patch:true});
 if(!saved)throw Error('notification_retry_receipt_unconfirmed');
 if(status==='retry'){
  if(retry)await db.tx.update(RETRIES,[{id:key,record:{userId,event,nextAttemptAt}}]);
  else await db.tx.add(RETRIES,[{id:key,userId,event,nextAttemptAt}]);
 }else if(retry)await db.delete(RETRIES,[key]);
 return status;
}

export async function runNotificationDispatch(){
 const old=await control(),now=Date.now();
 if(Date.parse(old.leaseUntil||'')>now)return {deferred:true,sent:0};
 const leaseOwner=randomUUID(),revision=randomUUID();
 const [locked]=await db.tx.update(CONTROL,[{id:'current',record:{leaseOwner,leaseUntil:new Date(now+55000).toISOString(),revision},if:{revision:old.revision}}],{patch:true});
 if(!locked)return {deferred:true,sent:0};
 let legacyCursor=old.legacyCursor,legacyComplete=!!old.legacyComplete,retryCursor=old.retryCursor;
 const summary={sent:0,retry:0,failed:0,uncertain:0,skipped:0,ineligible:0,offers:0,preferencesMigrated:0,legacyComplete:false};
 let sends=0;
 try{
  if(!legacyComplete){
   const legacy=await db.list<AlertPreference>('notification_preferences',{limit:40,...(legacyCursor?{nextToken:legacyCursor}:{})});
   for(const row of legacy.items){
    if(typeof row.userId!=='string')continue;
    // Never replace a newer explicit update or unsubscribe tombstone.
    const [id]=await db.tx.add(PREFS,[{...row,id:digest(row.userId)}]);if(id)summary.preferencesMigrated++;
   }
   legacyCursor=legacy.nextToken;legacyComplete=!legacy.nextToken;
  }
  if(!legacyComplete)return {...summary,legacyComplete:false};
  const retries=await db.list<{userId:string;event:OfferEvent;nextAttemptAt:string}>(RETRIES,{limit:10,...(retryCursor?{nextToken:retryCursor}:{})});
  for(const row of retries.items){
   if(Date.now()-now>40000)break;
   if(Date.parse(row.nextAttemptAt)>Date.now())continue;
   const status=await deliver(row.event,row.userId,true);summary[status]++;sends++;
  }
  retryCursor=retries.nextToken;
  const events=await db.list<OfferEvent>(EVENTS,{limit:1});
  const event=events.items[0];
  if(event&&Date.now()-now<40000){
   summary.offers=1;
   const page=await db.list<AlertPreference>(PREFS,{limit:40,...(event.prefCursor?{nextToken:event.prefCursor}:{})});
   let offset=event.prefOffset||0;
   for(;offset<page.items.length;offset++){
    if(sends>=20||Date.now()-now>40000)break;
    const pref=page.items[offset];if(!pref.active)continue;
    const status=await deliver(event,pref.userId);summary[status]++;sends++;
   }
   if(offset<page.items.length)await db.tx.update(EVENTS,[{id:event.id,record:{prefOffset:offset}}],{patch:true});
   else if(page.nextToken)await db.tx.update(EVENTS,[{id:event.id,record:{prefCursor:page.nextToken,prefOffset:0}}],{patch:true});
   else if(legacyComplete){
    await db.tx.add(HISTORY,[{id:event.id,firstPublishedAt:event.firstPublishedAt,completedAt:new Date().toISOString()}]);
    await db.delete(EVENTS,[event.id]);
   } // Revisit while legacy users are migrating; individual receipts suppress duplicates.
  }
  summary.legacyComplete=legacyComplete;
  return summary;
 }finally{
  const [saved]=await db.tx.update(CONTROL,[{id:'current',record:{legacyCursor,legacyComplete,retryCursor,leaseUntil:undefined,leaseOwner:undefined,revision:randomUUID(),lastRunAt:new Date().toISOString()},if:{leaseOwner,revision}}],{patch:true});
  if(!saved)throw Error('notification_checkpoint_unconfirmed');
 }
}
