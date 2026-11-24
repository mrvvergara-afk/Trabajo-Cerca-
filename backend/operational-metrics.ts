import {db} from '@appdeploy/sdk';
import {createHash} from 'node:crypto';
export const MOTOR_IDS=['A','B','C','D','CHATGPT','GEMINI'] as const;
type Motor=typeof MOTOR_IDS[number];
type Source=Record<string,unknown>;
export type CandidateTrace={candidateId:string;engine:Motor|null;source:string|null;sourcePublishedAt:string|null;
 discoveredAt:string|null;queuedAt:string|null;verifiedAt:string|null;storedAt:string|null;retries:number|null};
export type Visibility={id:string;publicOfferId:string;trace:CandidateTrace;firstVisibleAt:string;
 manifestId:string;latencyMs:number|null};
export const VISIBLE='tc_first_visibility_v1';
export const HOURS='tc_operation_hours_v1';
const HOUR=3600_000;
const BUCKETS=[1,5,10,15,30,60,360,1440] as const;
const digest=(text:string)=>createHash('sha256').update(text).digest('hex');

function stamp(value:unknown){
 return typeof value==='string'&&Number.isFinite(Date.parse(value))?value:null;
}
export function candidateTrace(id:string,source:Source):CandidateTrace|undefined{
 if(source.traceVersion!==1)return;
 const producer=String(source.sourceProducer??'');
 const engine=MOTOR_IDS.find(id=>id===producer.toUpperCase()) ??
  (producer==='chatgpt_territorial'?'CHATGPT':producer==='motor_d_territorial'?'D':null);
 return {
  candidateId:id,engine,source:typeof source.sourceDomain==='string'?source.sourceDomain.slice(0,100):null,
  sourcePublishedAt:stamp(source.sourcePublishedAt),discoveredAt:stamp(source.discoveredAt),
  queuedAt:stamp(source.queuedAt),verifiedAt:stamp(source.verifiedAt),
  storedAt:stamp(source.storedAt),
  retries:typeof source.verificationAttempts==='number'?Math.max(0,source.verificationAttempts-1):null,
 };
}

export function visibilityEvent(identity:string,publicOfferId:string,trace:CandidateTrace,
 manifestId:string,firstVisibleAt:string):Visibility{
 const started=Date.parse(trace.queuedAt??trace.discoveredAt??'');
 const finished=Date.parse(firstVisibleAt);
 return {id:digest(identity),publicOfferId,trace,firstVisibleAt,manifestId,
  latencyMs:Number.isFinite(started)&&started<=finished?finished-started:null};
}

export function hourCounters(visible:Visibility[],now:number,previous?:Record<string,unknown>|null){
 const keys=[...MOTOR_IDS,'UNKNOWN'] as const;
 const engines=Object.fromEntries(keys.map(key=>[key,Number(previous?.['engine_'+key]||0)]));
 const histogram=Array.from({length:BUCKETS.length+1},(_,i)=>Number(previous?.['latency_'+i]||0));
 for(const row of visible){
  engines[row.trace.engine??'UNKNOWN']++;
  if(row.latencyMs!==null){
   const found=BUCKETS.findIndex(bound=>row.latencyMs!<=bound*60_000);
   histogram[found<0?BUCKETS.length:found]++;
  }
 }
 return {at:new Date(Math.floor(now/HOUR)*HOUR).toISOString(),visible:Number(previous?.visible||0)+visible.length,
  ...Object.fromEntries(keys.map(key=>['engine_'+key,engines[key]])),
  ...Object.fromEntries(histogram.map((value,i)=>['latency_'+i,value]))};
}

export function latencyPercentile(histogram:number[],fraction:number){
 const n=histogram.reduce((a,b)=>a+b,0);
 if(!n)return null;
 const goal=Math.ceil(n*fraction);
 let seen=0;
 for(let i=0;i<histogram.length;i++){
  seen+=histogram[i];
  if(seen>=goal)return {upperMinutes:BUCKETS[i]??null,samples:n};
 }
 return null;
}

export async function operationalView(now=Date.now()){
 const bucket=Math.floor(now/HOUR);
 const rows=await db.get<Record<string,unknown>>(HOURS,Array.from({length:24},(_,i)=>String(bucket-i)),{consistent:true});
 const filled=rows.filter(row=>row!==null);
 const histogram=Array.from({length:BUCKETS.length+1},(_,i)=>filled.reduce((sum,row)=>sum+Number(row?.['latency_'+i]||0),0));
 return {
  scope:'24 clock-hour buckets including current partial hour',
  observedBuckets:filled.length,byHour:rows.map((row,i)=>({at:new Date((bucket-i)*HOUR).toISOString(),visible:row?.visible??null})),
  visible:filled.length?filled.reduce((sum,row)=>sum+Number(row?.visible||0),0):null,
  motors:Object.fromEntries(MOTOR_IDS.map(id=>[id,filled.length?filled.reduce((sum,row)=>sum+Number(row?.['engine_'+id]||0),0):null])),
  latency:{p50:latencyPercentile(histogram,.5),p95:latencyPercentile(histogram,.95),p99:latencyPercentile(histogram,.99)},
 };
}
