import {db} from '@appdeploy/sdk';
import {producerAudits} from './engine-source-audit';
import {ENGINE_IDS,adaptEngine,rollup,asRow,nonnegative,stamp,
 type EngineId,type DayPoint,type EngineRow} from './engine-metrics-contract';

/** All reads are bounded. This endpoint has no side effects and is restricted
 * by requireAuth + requireAdminEmailAllowlist in the parent router.
 */
const STATUS_TABLES:Partial<Record<EngineId,[string,string]>>={
 A:['free_public_source_cursor_v3','cursor'],
 B:['motor_b_latest','current'],
 C:['motor_c_local_latest','current'],
 D:['motor_d_bridge_status','current'],
 GEMINI:['gemini_github_pull_status','current']
};
const HISTORIES=[
 {engine:'A',table:'free_public_source_runs',measure:'sources_attempted'},
 {engine:'B',table:'motor_b_runs',measure:'docs_processed'},
 {engine:'C',table:'motor_c_local_runs',measure:'docs_processed'}
] as const;

type ReadOutcome={value:Record<string,unknown>|null;error:boolean};
async function readStatus(table:string,id:string):Promise<ReadOutcome>{
 try {
   const [record]=await db.get<Record<string,unknown>>(table,[id],{consistent:true});
   return {value:record??null,error:false};
 } catch {
   return {value:null,error:true};
 }
}
function dayChile(value:unknown):string|null {
 const iso=stamp(value);if(!iso)return null;
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Santiago',year:'numeric',
  month:'2-digit',day:'2-digit'}).formatToParts(new Date(iso));
 const fields=Object.fromEntries(parts.map(x=>[x.type,x.value]));
 return fields.year&&fields.month&&fields.day?fields.year+'-'+fields.month+'-'+fields.day:null;
}
function runValue(engine:'A'|'B'|'C',row:Record<string,unknown>):number|null {
 if(engine==='A')return nonnegative(asRow(row.summary).sourcesRead);
 return nonnegative(row.visited);
}
function runTime(row:Record<string,unknown>):string|null {
 return stamp(row.at||row.checkedAt||asRow(row.summary).checkedAt);
}
/* Sampled histories: db.list does not guarantee a complete chronological range. */
async function readHistory(engine:'A'|'B'|'C',table:string,measure:DayPoint['measure']){
 try {
   const page=await db.list<Record<string,unknown>>(table,{limit:60});
   const daily=new Map<string,number>(),windowStart=Date.now()-8*86400000;
   for(const item of page.items) {
     const ts=runTime(item);
     if(!ts||Date.parse(ts)<windowStart||Date.parse(ts)>Date.now()+300000)continue;
     const day=dayChile(ts),value=runValue(engine,item);
     if(!day||value===null)continue;
     daily.set(day,(daily.get(day)||0)+value);
   }
   return {points:[...daily].sort((a,b)=>a[0].localeCompare(b[0]))
     .map(([day,value])=>({day,engine,measure,value})),complete:!page.nextToken,error:false};
 } catch {
   return {points:[] as DayPoint[],complete:false,error:true};
 }
}
export async function executiveEngineTelemetry() {
 const statuses=await Promise.all(ENGINE_IDS.map(async id=>{
   const source=STATUS_TABLES[id];
   if(!source)return {id,value:null,error:false};
   const data=await readStatus(source[0],source[1]);
   return {id,...data};
 }));
 const internal:EngineRow[]=statuses.map(item=>
   adaptEngine(item.id,item.value,{readFailed:item.error}));
 // Reporter snapshots are fetched independently from authoritative producer
 // artifacts, not from the import queue; only counters enter the response.
 const [external,histories]=await Promise.all([
   producerAudits().catch(()=>({} as Awaited<ReturnType<typeof producerAudits>>)),
   Promise.all(HISTORIES.map(h=>readHistory(h.engine,h.table,h.measure)))
 ]);
 const engines:EngineRow[]=internal.map(item=>{
   const candidate=item.id==='D'||item.id==='CHATGPT'||item.id==='GEMINI'?external[item.id]:null;
   // A recent direct producer observation supersedes an old importer report.
   if(!candidate)return item;
   if(!item.observedAt)return candidate;
   return Date.parse(candidate.observedAt||'')>=Date.parse(item.observedAt)?candidate:item;
 });
 const points=histories.flatMap(h=>h.points);
 const incomplete=histories.some(x=>!x.complete);
 const missing=engines.filter(x=>x.status==='unreported'||x.status==='error').map(x=>x.id);
 return {
   schemaVersion:1,readOnly:true,
   generatedAt:new Date().toISOString(),
   measurements:{discovery:'fuentes por última ejecución',documents:'documentos/links por última ejecución',
      history:'muestra acotada de hasta 60 ejecuciones por motor; no representa una serie exhaustiva',
      publications:'solo catálogo público confirmado; no atribuibles aún a motor de origen'},
   engines,rollup:rollup(engines),history:points,
   historyComplete:!incomplete,
   missingOrFailed:missing,
   warning:missing.length
     ? 'Algunos productores no entregan telemetría conectada. No sustituir ausencia por cero.'
     : 'Las métricas de producción son por etapa; las publicaciones requieren conciliación con el catálogo.',
   personalDataIncluded:false
 };
}
