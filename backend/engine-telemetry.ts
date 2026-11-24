import {db} from '@appdeploy/sdk';
import {producerAuditSnapshot} from './engine-source-audit';
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
/* Bounded cursor walk; continuing beyond the cap requires a separate, checkpointed backfill.
 * Never treat a truncated list as a complete 30-day history.
 */
async function limitedPageWalk(table:string,limit=80,maxPages=3){
 const items:Record<string,unknown>[]=[];
 const known=new Set<string>();
 let nextToken:string|undefined;
 let pages=0;
 do {
  const page=await db.list<Record<string,unknown>>(table,{limit,...(nextToken?{nextToken}:{})});
  for(const row of page.items){const key=String(row.id||'');if(key&&!known.has(key)){known.add(key);items.push(row);}}
  pages++;
  nextToken=page.nextToken;
 }while(nextToken&&pages<maxPages);
 return {items,complete:!nextToken,pages,hasMore:!!nextToken};
}
async function readHistory(engine:'A'|'B'|'C',table:string,measure:DayPoint['measure']){
 try{
  const page=await limitedPageWalk(table);
  const daily=new Map<string,number>();
  const cutoff=Date.now()-30*86400000;
  for(const row of page.items){
   const ts=runTime(row);
   if(!ts||Date.parse(ts)<cutoff||Date.parse(ts)>Date.now()+300000)continue;
   const day=dayChile(ts),value=runValue(engine,row);
   if(day&&value!==null)daily.set(day,(daily.get(day)||0)+value);
  }
  return {table,points:[...daily].sort((a,b)=>a[0].localeCompare(b[0]))
   .map(([day,value])=>({day,engine,measure,value})),complete:page.complete,
   scanned:page.items.length,pages:page.pages,error:false};
 }catch{
  return {table,points:[] as DayPoint[],complete:false,scanned:0,pages:0,error:true};
 }
}

/* Durable, admin-only telemetry receipts are sampled execution snapshots.
 * They are not a claim that a crawler ran at the time of the receipt.
 */
async function readDurableSnapshots(){
 try{
  const page=await limitedPageWalk('engine_telemetry_snapshots_v1',60,3);
  const latest=new Map<string,{at:string;point:DayPoint}>();
  for(const raw of page.items){
   const rows=Array.isArray(raw.engines)?raw.engines:[];
   for(const value of rows){
    const row=asRow(value),id=String(row.id||'');
    if(!['D','CHATGPT','GEMINI'].includes(id))continue;
    const at=stamp(row.observedAt),cnt=nonnegative(asRow(row.counts).attempted);
    if(!at||cnt===null||Date.parse(at)<Date.now()-30*86400_000)continue;
    const day=dayChile(at);if(!day)continue;
    const key=id+'|'+day;
    const prev=latest.get(key);
    if(!prev||at>prev.at)latest.set(key,{at,point:{
     engine:id as EngineId,day,measure:'sources_attempted',value:cnt
    }});
   }
  }
  return {points:[...latest.values()].map(x=>x.point),complete:page.complete,
   scanned:page.items.length,pages:page.pages,error:false};
 }catch{return {points:[] as DayPoint[],complete:false,scanned:0,pages:0,error:true};}
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
 const [externalSnapshot,histories,snapshotHistory]=await Promise.all([
   producerAuditSnapshot().catch(()=>({rows:{},history:[],historyDays:0,expectedHistoryDays:30,sourceHistoryDays:{},sourceWarnings:['No fue posible consultar los reportes externos.']})),
   Promise.all(HISTORIES.map(h=>readHistory(h.engine,h.table,h.measure))),
   readDurableSnapshots()
 ]);
 const external=externalSnapshot.rows;
 const engines:EngineRow[]=internal.map(item=>{
   const candidate=item.id==='D'||item.id==='CHATGPT'||item.id==='GEMINI'?external[item.id]:null;
   if(!candidate)return item;
   // Producer coverage and importer progress are different measurement families.
   // Never replace observed source coverage just because an importer ran later.
   if(item.id==='GEMINI'||item.id==='D'){
    const counts={...candidate.counts,
     scheduled:candidate.counts.scheduled??item.counts.scheduled,
     attempted:candidate.counts.attempted??item.counts.attempted,
     useful:candidate.counts.useful??item.counts.useful,
     blocked:candidate.counts.blocked??item.counts.blocked,
     candidates:candidate.counts.candidates??item.counts.candidates,
     verified:item.counts.verified??candidate.counts.verified,
     queued:item.counts.queued??candidate.counts.queued,
     publishedConfirmed:candidate.counts.publishedConfirmed??item.counts.publishedConfirmed,
     processed:item.counts.processed??candidate.counts.processed
    };
    return {...candidate,counts,
      notes:[...candidate.notes,
       item.observedAt?'Último estado del importador/puente: '+item.observedAt+'.':'Sin registro importador/puente.',
       ...item.notes]};
   }
   return candidate;
 });
 const operational=await Promise.all(['fast_bc_pipeline_latest','chatgpt_bridge_latest','motor_c_github_pull_latest'].map(async name=>{
   const outcome=await readStatus(name,'current');const row=asRow(outcome.value);
   return {name,at:stamp(row.at),state:outcome.error?'read_error':String(row.state||'no_report'),details:name==='fast_bc_pipeline_latest'?asRow(row.result):Object.fromEntries(['indexedBatches','processed','newCount','duplicates','inserted','rejected','lastBatchAgeHours','producerStale'].filter(k=>nonnegative(row[k])!==null||typeof row[k]==='boolean').map(k=>[k,row[k]]))};
 }));
 // B/C share a newer processor. Its counters belong to the joint pipeline,
 // never arbitrarily assign them to B or C individually.
 const [fastCheckpoint,fastState]=await Promise.all([
   readStatus('fast_bc_state_v2','current'),readStatus('fast_bc_pipeline_latest','current')
 ]);
 const fast=asRow(fastCheckpoint.value),batch=asRow(fast.lastBatch);
 const jointBC={at:stamp(fast.lastRunAt||asRow(fastState.value).at),
   scanned:nonnegative(batch.scanned),remainingPdf:nonnegative(batch.remainingPdf),
   decisions:asRow(batch.decisions),html:asRow(batch.html),
   idle:asRow(asRow(fastState.value).result).idle===true,
   note:'Cifras del procesador conjunto B/C; no atribuibles por separado sin identificación de etapa.'};
 // Read B/C receipts once; page cursors are shared by individual and daily totals.
 let stageItems:Record<string,unknown>[]=[];
 let stageComplete=false,stagePages=0,stageReadError=false;
 try {
  const page=await limitedPageWalk('bc_stage_execution_receipts_v1');
  stageItems=page.items;stageComplete=page.complete;stagePages=page.pages;
 }catch{stageReadError=true;}
 const uniqueReceipts=new Map<string,Record<string,unknown>>();
 for(const row of stageItems){
  if(row.engine!=='B'&&row.engine!=='C')continue;
  const key=String(row.engine)+'|'+String(row.runId||row.id||'');
  const existing=uniqueReceipts.get(key);
  if(!existing||String(row.finishedAt||'')>String(existing.finishedAt||''))uniqueReceipts.set(key,row);
 }
 const stageRows=[...uniqueReceipts.values()];
 const stageRead=(['B','C'] as const).map(engine=>{
  const runs=stageRows.filter(x=>x.engine===engine)
   .sort((a,b)=>String(b.finishedAt||'').localeCompare(String(a.finishedAt||'')));
  const latest=runs[0];
  const useful=runs.find(row=>row.status==='completed'&&Number(row.processed)>0);
  return {engine,latest:latest?{
   runId:String(latest.runId||''),at:stamp(latest.finishedAt),
   status:String(latest.status||'unknown'),processed:nonnegative(latest.processed),
   inputCount:nonnegative(latest.inputCount),rawDocumentInputs:nonnegative(latest.rawDocumentInputs),
   eligibleDocumentInputs:nonnegative(latest.eligibleDocumentInputs),imageInputs:nonnegative(latest.imageInputs),verified:nonnegative(latest.verified),
   blocked:nonnegative(latest.blocked),already:nonnegative(latest.already),
   deferredOutside:nonnegative(latest.deferredOutside),deferredIndex:nonnegative(latest.deferredIndex),
   archived:nonnegative(latest.archived),storedForFeed:nonnegative(latest.storedForFeed),
   storageFailures:nonnegative(latest.storageFailures),error:latest.error||null
  }:null,lastUsefulAt:stamp(useful?.finishedAt),sampledRuns:runs.length,complete:stageComplete&&!stageReadError};
 });
 const latestB=stageRead.find(x=>x.engine==='B')?.latest;
 const latestC=stageRead.find(x=>x.engine==='C')?.latest;
 const bcOperations={at:latestC?.at||latestB?.at||jointBC.at,
   pdf:{processed:latestB?.processed??null,pending:nonnegative(batch.remainingPdf),decisions:asRow(batch.decisions)},
   html:{found:latestC?.inputCount??null,checked:latestC?.processed??null,
     verified:latestC?.verified??null,blocked:latestC?.blocked??null,
     archived:latestC?.archived??null,already:latestC?.already??null,
     deferredOutside:latestC?.deferredOutside??null,deferredIndex:latestC?.deferredIndex??null,
     storedForFeed:latestC?.storedForFeed??null,storageFailures:latestC?.storageFailures??null},
   idle:jointBC.idle,
   provenance:'Contadores del recibo de etapa más reciente. Pendientes PDF y decisiones del último checkpoint, que puede ser anterior.'};
 const bcDaily:DayPoint[]=[];
 const daily=new Map<string,number>();
 const latestDetected=new Map<string,{at:string;value:number}>();
 for(const item of stageRows){
  const engine=String(item.engine),date=dayChile(item.finishedAt),
   count=nonnegative(item.processed),dateValue=Date.parse(String(item.finishedAt));
  if((engine!=='B'&&engine!=='C')||!date||count===null||
   !Number.isFinite(dateValue)||dateValue<Date.now()-30*86400000)continue;
  if(item.status!=='completed'||item.error)continue;
  const key=engine+'|'+date;daily.set(key,(daily.get(key)||0)+count);
  // C's "found" is the size of the eligible HTML input on this execution,
  // including previously reviewed links. It must NOT be summed by day.
  if(engine==='C'){
   const found=nonnegative(item.inputCount);
   const at=stamp(item.finishedAt);
   if(found!==null&&at){
    const previous=latestDetected.get(date);
    if(!previous||at>previous.at)latestDetected.set(date,{at,value:found});
   }
  }
 }
 for(const [key,value] of daily){
  const [engine,day]=key.split('|');
  bcDaily.push({engine:engine as 'B'|'C',day,measure:'docs_processed',value});
 }
 for(const [day,sample] of latestDetected) {
  bcDaily.push({engine:'C',day,measure:'links_detected',value:sample.value});
 }
 // Preserve legacy B/C history instead of discarding it when stage receipts arrive.
 // On overlapping dates, prefer the new per-stage receipts rather than adding
 // both systems and double-counting the same work.
 const newStageKeys=new Set(bcDaily.filter(p=>p.measure==='docs_processed').map(p=>p.engine+'|'+p.day));
 const legacyPoints=histories.flatMap(h=>h.points).filter(p=>
   (p.engine==='A'||!newStageKeys.has(p.engine+'|'+p.day)));
 const producerSamples:DayPoint[]=engines.flatMap(row=>{
  if(!['D','GEMINI'].includes(row.id)||!row.observedAt||
   row.counts.attempted===null)return [];
  const day=dayChile(row.observedAt);
  return day?[{engine:row.id,day,measure:'sources_attempted' as const,
   value:row.counts.attempted}]:[];
 });
 // Historical snapshots and today's direct report are the same observation family.
 // Prefer the directly observed current report when the same day also appears in
 // immutable commit history; never add two whole-inventory sweep totals.
 const pointMap=new Map<string,DayPoint>();
 for(const point of [...legacyPoints,...bcDaily,...snapshotHistory.points,...externalSnapshot.history,...producerSamples])
  pointMap.set(point.engine+'|'+point.day+'|'+point.measure,point);
 const points=[...pointMap.values()].sort((a,b)=>
  a.day.localeCompare(b.day)||a.engine.localeCompare(b.engine));
 const incomplete=histories.some(x=>!x.complete)||!stageComplete||stageReadError;
 const historyQuality={
  windowDays:30,fullyRecovered:false,
  producerHistoryDays:externalSnapshot.historyDays,
  producerHistoryDaysByEngine:externalSnapshot.sourceHistoryDays,
  warnings:externalSnapshot.sourceWarnings,
  overlapLegacyBCDays:[...newStageKeys].filter(key=>
   histories.some(h=>h.points.some(p=>p.engine+'|'+p.day===key))),
  sources:[...histories.map(h=>({table:h.table,scanned:h.scanned,pages:h.pages,complete:h.complete,readError:h.error})),
   {table:'engine_telemetry_snapshots_v1',scanned:snapshotHistory.scanned,
    pages:snapshotHistory.pages,complete:snapshotHistory.complete,readError:snapshotHistory.error},
   {table:'bc_stage_execution_receipts_v1',scanned:stageItems.length,pages:stagePages,
    complete:stageComplete,readError:stageReadError}],
  note:incomplete?'Recuperación parcial: existen páginas no recorridas o fallos de lectura; no se inventan ceros.':
   'Tablas legacy recorridas, pero el historial de los productores D/ChatGPT/Gemini aún requiere retención durable.'
 };
 // Each fresh B/C receipt is authoritative for that individual stage; never copy
 // joint checkpoint counts into an unrelated engine.
 const resolvedEngines=engines.map(row=>{
  if(row.id!=='B'&&row.id!=='C')return row;
  const receipt=stageRead.find(x=>x.engine===row.id)?.latest;
  if(!receipt?.at||receipt.processed===null||(
   row.observedAt&&Date.parse(row.observedAt)>Date.parse(receipt.at)))return row;
  const receiptHealthy=['completed','idle'].includes(receipt.status)&&!receipt.error;
  const stageHealth:EngineRow['status']=!receiptHealthy?'error':
   Date.now()-Date.parse(receipt.at)<8*3600_000?'recent':'stale';
  return {...row,status:stageHealth,
   observedAt:receipt.at,source:'bc_stage_execution_receipts_v1',
   counts:{...row.counts,attempted:receipt.inputCount,processed:receipt.processed,
    blocked:receipt.blocked,verified:receipt.verified},
   notes:['Último recibo individual B/C, distinto del checkpoint conjunto.',
    ...row.notes]};
 });
 const missing=resolvedEngines.filter(x=>x.status==='unreported'||x.status==='error').map(x=>x.id);
 return {
   schemaVersion:1,readOnly:true,historyQuality,
   generatedAt:new Date().toISOString(),
   measurements:{discovery:'fuentes por última ejecución',documents:'PDF revisados y HTML realmente procesados por ciclo; enlaces detectados C = inventario observado, incluye ya revisados',
      history:'A/B/C: ventana 30 días con cursor parcial; ChatGPT: 7 días en GitHub; D/Gemini: últimos barridos diarios recuperables por versiones',
      publications:'solo catálogo público confirmado; no atribuibles aún a motor de origen'},
   engines:resolvedEngines,operational,jointBC,stageRead,bcOperations,rollup:rollup(resolvedEngines),history:points,
   historyComplete:false, // Producer histories of 30 days are not durably complete yet.
   missingOrFailed:missing,
   warning:missing.length
     ? 'Algunos productores no entregan telemetría conectada. No sustituir ausencia por cero.'
     : 'Las métricas de producción son por etapa; las publicaciones requieren conciliación con el catálogo.',
   personalDataIncluded:false
 };
}
