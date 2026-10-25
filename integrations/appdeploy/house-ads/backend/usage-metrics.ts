import {db,increment,isAppDatabaseError} from '@appdeploy/sdk';
import {createHash} from 'node:crypto';
import {WORK_PLACES} from '../shared/territories';
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
export async function recordUsageEvent(eventId:string,event:string,visitorId:string,place:unknown){
 const day=new Date().toISOString().slice(0,10),commune=typeof place==='string'&&WORK_PLACES.includes(place)?place:'Todas';
 const metricId=digest(day+'\0'+event+'\0'+commune),visitor=digest(day+'\0'+visitorId),uniqueId=digest(metricId+'\0'+visitor),receiptId=digest(eventId+'\0'+visitor);
 for(let attempt=0;attempt<3;attempt++){
  const [receipt]=await db.get<{event:string;metricId:string}>('growth_usage_events',[receiptId],{consistent:true});
  if(receipt){if(receipt.event!==event||receipt.metricId!==metricId)throw Error('analytics_event_identity_conflict');return {received:true,duplicate:true};}
  await db.tx.add('growth_usage_metrics',[{id:metricId,day,event,commune,count:0,uniqueDevices:0}]);
  const [seen]=await db.get('growth_usage_visitors',[uniqueId],{consistent:true});
  const writes=[db.tx.add('growth_usage_events',[{id:receiptId,event,day,metricId}]),db.tx.update('growth_usage_metrics',[{id:metricId,record:{count:increment(1),uniqueDevices:increment(seen?0:1)}}],{patch:true})];
  if(!seen)writes.push(db.tx.add('growth_usage_visitors',[{id:uniqueId,day}]));
  try{await db.transact(writes);return {received:true,duplicate:false};}
  catch(cause){
   if(isAppDatabaseError(cause)&&['AppDatabaseDuplicateId','AppDatabaseUnknownOutcome'].includes(cause.code)){
    const [saved]=await db.get<{event:string;metricId:string}>('growth_usage_events',[receiptId],{consistent:true});
    if(saved&&saved.event===event&&saved.metricId===metricId)return {received:true,duplicate:true};
    if(cause.code==='AppDatabaseDuplicateId')continue;
   }
   throw cause;
  }
 }
 throw Error('analytics_contention');
}
export async function readUsageMetrics(cursor?:string){return db.list('growth_usage_metrics',{limit:50,...(cursor?{nextToken:cursor}:{})});}
