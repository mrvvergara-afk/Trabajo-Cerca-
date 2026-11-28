import {secrets} from '@appdeploy/sdk';
import {ENGINE_IDS,asRow,makeRow,nonnegative,stamp,type EngineRow,type DayPoint} from './engine-metrics-contract';

/** Source-side producer snapshots. All calls are GET to exact repositories and
 * known report paths; only aggregate counters return to the admin interface.
 * Authenticated GitHub access is server side and never logged or exposed.
 */
const BASE='https://api.github.com/repos/';
const PUBLIC_REPO='mrvvergara-afk/Trabajo-Cerca-';
const GEMINI_REPO='mrvvergara-afk/motor-rastreo-gemini';
const TTL_MS=30*60_000; // Admin refreshes read a cached source snapshot; no crawl is launched.
const READ_STATES=new Set(['checked_found','checked_empty','checked','accessible']);
const MEASURED_STATES=new Set([...READ_STATES,'blocked','failed','unsupported']);
type ProducerRows=Partial<Record<'D'|'CHATGPT'|'GEMINI',EngineRow>>;
type ProducerSnapshot={rows:ProducerRows;history:DayPoint[];
  historyDays:number;expectedHistoryDays:number;
  sourceHistoryDays:Record<string,number>;sourceWarnings:string[]};
let cached:{at:number;data:ProducerSnapshot}|null=null;
let flight:Promise<ProducerSnapshot>|null=null;

function reportDay(offset=0):string {
 const now=new Date(Date.now()-offset*86400_000);
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Santiago',
  year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const obj=Object.fromEntries(parts.map(p=>[p.type,p.value]));
 return obj.year+obj.month+obj.day;
}
async function githubJson(repo:string,path:string,token:string|null,ref='main'):Promise<Record<string,unknown>|null> {
 const address=BASE+repo+'/contents/'+path+'?ref='+encodeURIComponent(ref);
 const headers:Record<string,string>={Accept:'application/vnd.github+json',
  'User-Agent':'TrabajoCerca-AdminBI','X-GitHub-Api-Version':'2022-11-28'};
 if(token)headers.Authorization='Bearer '+token;
 const response=await fetch(address,{headers,redirect:'error',signal:AbortSignal.timeout(5000)});
 if(response.status===404)return null;
 if(!response.ok)return null;
 const file=asRow(await response.json());
 if(file.encoding!=='base64'||typeof file.content!=='string'||
   typeof file.size!=='number'||file.size>900_000)return null;
 const bytes=Buffer.from(file.content.replace(/\s/g,''),'base64');
 if(bytes.byteLength!==file.size)return null;
 const decoded=JSON.parse(bytes.toString('utf8')) as unknown;
 return asRow(decoded);
}
function chatgptRow(report:Record<string,unknown>):EngineRow|null {
 if(report.schema_version!==1)return null;
 const waves=asRow(report.waves);
 const ids=Object.keys(waves).filter(x=>/^[0-5]$/.test(x)).sort();
 const latest=new Map<string,{status:string;at:string}>();
 const observedWaves=new Set<string>();
 const signals:string[]=[];
 const add=(raw:unknown,waveId='',waveAt:string|null=null)=>{
  const row=asRow(raw);
  const key=row.source_id||row.key,status=String(row.status||'');
  if(typeof key!=='string'||!key||!MEASURED_STATES.has(status))return;
  const at=stamp(row.timestamp||row.checked_at||row.attempted_at||row.checkedAt)||waveAt||'';
  const previous=latest.get(key);
  if(!previous||at>=previous.at)latest.set(key,{status,at});
  const wave=waveId||String(row.scan_wave??row.run_wave??'');
  if(/^[0-5]$/.test(wave))observedWaves.add(wave);
 };
 for(const id of ids){
  const wave=asRow(waves[id]);
  const at=stamp(wave.timestamp||wave.attempted_at||wave.run_at||wave.heartbeat_at);
  if(at)signals.push(at);
  for(const raw of [...(Array.isArray(wave.sources)?wave.sources:[]),
                    ...(Array.isArray(wave.source_results)?wave.source_results:[]),
                    ...(Array.isArray(wave.results)?wave.results:[])])add(raw,id,at);
 }
 for(const raw of [...(Array.isArray(report.sources)?report.sources:[]),
                   ...(Array.isArray(report.source_results)?report.source_results:[])])add(raw);
 const rows=[...latest.values()];
 const attempted=rows.length||null;
 const checked=attempted===null?null:rows.filter(x=>READ_STATES.has(x.status)).length;
 const blocked=attempted===null?null:rows.filter(x=>x.status==='blocked').length;
 const found=rows.filter(x=>x.status==='checked_found').length;
 const at=stamp(report.run_at)||(attempted===null?signals.sort().at(-1):rows.map(row=>row.at).sort().at(-1))||null;
 if(!at)return null;
 return makeRow('CHATGPT',report,'GitHub: chatgpt_coverage (ondas)',
 {scheduled:nonnegative(report.inventory_count)??nonnegative(report.inventory_endpoints),
  attempted,useful:checked,blocked,candidates:null,publishedConfirmed:null},at,[
  'Ondas con consultas registradas: '+observedWaves.size+'/6. Sin evidencia por onda: '+
   (['0','1','2','3','4','5'].filter(x=>!observedWaves.has(x)).join(', ')||'ninguna')+'.',
  'Fuentes únicas deduplicadas entre ondas; sin doble conteo de intentos.',
  'Fuentes que reportan hallazgos: '+found+'. No son ofertas publicadas.',
  report.coverage_complete===true?'Cobertura declarada completa':'Cobertura incompleta o sin acreditación completa.'
 ]);
}
function motorDRow(report:Record<string,unknown>):EngineRow|null {
 if(report.schema_version!==1||report.producer!=='motor_d_territorial')return null;
 const at=stamp(report.scan_completed_at);if(!at)return null;
 return makeRow('D',report,'GitHub: producer_heartbeat',
  {scheduled:nonnegative(report.source_inventory_registered),
   attempted:nonnegative(report.sources_total),
   useful:nonnegative(report.sources_accessible),
   blocked:nonnegative(report.sources_blocked),
   candidates:nonnegative(report.job_candidates_total),
   publishedConfirmed:report.publication_confirmed===true
     ?nonnegative(report.published_in_trabajo_cerca):null
  },at,[
   'Productor D independiente; 12 comunas son un requisito distinto al 100 % de fuentes.',
   report.full_usable_coverage===true?'Cobertura útil completa acreditada':'Cobertura útil incompleta.'
  ]);
}
function geminiRow(report:Record<string,unknown>):EngineRow|null {
 const at=stamp(report.scanFinishedAt);if(!at)return null;
 return makeRow('GEMINI',report,'GitHub privado: gemini_source_audit_v2',
  {scheduled:nonnegative(report.inventoryExpected),
   attempted:nonnegative(report.sourcesAttempted),
   useful:nonnegative(report.sourcesAccessible),
   blocked:nonnegative(report.sourcesBlocked),
   candidates:nonnegative(report.detailAccepted),
   queued:nonnegative(report.newEntries),
   publishedConfirmed:null
  },at,[
   'Fuentes con enlaces individuales: '+(nonnegative(report.sourcesWithIndividualLinks)??'Sin datos'),
   'Fuentes HTML accesibles sin enlace individual: '+(nonnegative(report.sourcesAccessibleWithoutIndividualLinks)??'Sin datos'),
   'Aceptadas por el productor y encoladas no son publicaciones.'
  ]);
}
// Build daily last-observed snapshots from immutable GitHub commit versions.
// This is an aggregate trend, not a sum of all attempts across the day.
// The GitHub Contents read remains server-only (Gemini needs a private backend token).
function dayChile(value:unknown):string|null {
 const iso=stamp(value);if(!iso)return null;
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Santiago',
  year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(iso));
 const d=Object.fromEntries(parts.map(p=>[p.type,p.value]));
 return d.year&&d.month&&d.day?d.year+'-'+d.month+'-'+d.day:null;
}
async function commitDailyHistory(repo:string,path:string,token:string|null,
 id:'D'|'GEMINI',convert:(raw:Record<string,unknown>)=>EngineRow|null):Promise<{
 points:DayPoint[];days:number;warning:string|null
}>{
 if(repo===GEMINI_REPO&&!token)return {points:[],days:0,warning:'Gemini: token de lectura no configurado en este entorno'};
 const headers:Record<string,string>={Accept:'application/vnd.github+json',
  'User-Agent':'TrabajoCerca-AdminBI','X-GitHub-Api-Version':'2022-11-28'};
 if(token)headers.Authorization='Bearer '+token;
 try{
  const url=BASE+repo+'/commits?path='+encodeURIComponent(path)+'&per_page=100';
  const result=await fetch(url,{headers,redirect:'error',signal:AbortSignal.timeout(6000)});
  if(!result.ok)return {points:[],days:0,warning:id+': lista de versiones HTTP '+result.status};
  const commits=await result.json() as unknown;
  if(!Array.isArray(commits))return {points:[],days:0,warning:id+': historial de commits inválido'};
  const selected=new Map<string,string>();
  for(const c of commits){
   const row=asRow(c),commit=asRow(row.commit),committer=asRow(commit.committer);
   const day=dayChile(committer.date);
   if(!day||typeof row.sha!=='string'||selected.has(day))continue;
   if(Date.parse(day+'T12:00:00Z')<Date.now()-30*86400_000)continue;
   selected.set(day,row.sha);
   if(selected.size>=14)break;
  }
  const samples=await Promise.allSettled([...selected.values()].map(ref=>githubJson(repo,path,token,ref)));
  const daily=new Map<string,{at:string;value:number}>();
  let failures=0;
  for(const item of samples){
   if(item.status!=='fulfilled'||!item.value){failures++;continue;}
   const converted=convert(item.value);
   const at=converted?.observedAt, count=converted?.counts.attempted;
   if(!at||count===null||count===undefined){failures++;continue;}
   const day=dayChile(at);if(!day)continue;
   const previous=daily.get(day);
   if(!previous||at>previous.at)daily.set(day,{at,value:count});
  }
  const points:DayPoint[]=[...daily.entries()].map(([day,v])=>({
   engine:id,day,measure:'sources_attempted',value:v.value
  })).sort((a,b)=>a.day.localeCompare(b.day));
  return {points,days:daily.size,
   warning:failures>0?id+': '+failures+' versiones no recuperables':null};
 }catch{
  return {points:[],days:0,warning:id+': no fue posible consultar su historial de commits'};
 }
}
async function readLatest():Promise<ProducerSnapshot>{
 let token:string|null=null;
 try{
  const names=await secrets.listSecretNames();
  if(names.includes('MOTOR_C_GITHUB_READ_TOKEN'))token=await secrets.readSecret('MOTOR_C_GITHUB_READ_TOKEN');
 }catch{/* Public GitHub reports are still readable; private Gemini stays unknown. */}
 const days=Array.from({length:7},(_,offset)=>reportDay(offset));
 const tasks=await Promise.allSettled([
  githubJson(PUBLIC_REPO,'automation/motor_d_discovery/producer_heartbeat.json',token),
  ...days.map(d=>githubJson(PUBLIC_REPO,'automation/chatgpt_coverage/'+d+'.json',token)),
  token?githubJson(GEMINI_REPO,'output/gemini_source_audit_v2.json',token):Promise.resolve(null),
  commitDailyHistory(PUBLIC_REPO,'automation/motor_d_discovery/producer_heartbeat.json',
   token,'D',motorDRow),
  commitDailyHistory(GEMINI_REPO,'output/gemini_source_audit_v2.json',
   token,'GEMINI',geminiRow)
 ]);
 const valid=(n:number):Record<string,unknown>|null=>{
  const task=tasks[n];return task?.status==='fulfilled'?
   task.value as Record<string,unknown>|null:null;
 };
 const result:ProducerRows={};
 const d=valid(0),g=valid(days.length+1);
 if(d){const row=motorDRow(d);if(row)result.D=row;}
 if(g){const row=geminiRow(g);if(row)result.GEMINI=row;}
 const pairs:{day:string;row:EngineRow}[]=[];
 const failures:string[]=[];
 for(let i=0;i<days.length;i++){
  const report=valid(1+i);if(!report){failures.push(days[i]);continue;}
  const row=chatgptRow(report);if(!row){failures.push(days[i]);continue;}
  const claimed=String(report.date||report.date_chile||'');
  const day=/^\d{4}-\d{2}-\d{2}$/.test(claimed)?claimed:
   days[i].slice(0,4)+'-'+days[i].slice(4,6)+'-'+days[i].slice(6);
  pairs.push({day,row});
 }
 pairs.sort((a,b)=>String(a.row.observedAt||'').localeCompare(String(b.row.observedAt||'')));
 const measured=pairs.filter(p=>p.row.counts.attempted!==null);
 const latestMeasurement=measured.at(-1)?.row;
 const newestReport=pairs.at(-1)?.row;
 if(latestMeasurement)result.CHATGPT=latestMeasurement;
 if(newestReport&&newestReport.counts.attempted===null){
  const base=latestMeasurement??{...newestReport,status:'unreported' as const};
  result.CHATGPT={...base,notes:[...base.notes,'Registro del '+newestReport.observedAt+' sin consultas registradas.']};
 }
 const chatHistory:DayPoint[]=measured.map(p=>({
  day:p.day,engine:'CHATGPT',measure:'sources_attempted',value:p.row.counts.attempted as number
 }));
 const sourceWarnings:string[]=[];
 if(failures.length)sourceWarnings.push('ChatGPT: informes diarios sin acceso/compatibilidad: '+failures.join(', '));
 const hist=(i:number)=>tasks[i]?.status==='fulfilled'
  ?tasks[i].value as {points:DayPoint[];days:number;warning:string|null}
  :{points:[] as DayPoint[],days:0,warning:'Fallo consultando versiones del productor'};
 const dHistory=hist(days.length+2),gHistory=hist(days.length+3);
 if(dHistory.warning)sourceWarnings.push(dHistory.warning);
 if(gHistory.warning)sourceWarnings.push(gHistory.warning);
 return {rows:result,history:[...chatHistory,...dHistory.points,...gHistory.points],
  historyDays:chatHistory.length,expectedHistoryDays:30,
  sourceHistoryDays:{CHATGPT:chatHistory.length,D:dHistory.days,GEMINI:gHistory.days},
  sourceWarnings};
}
export async function producerAuditSnapshot():Promise<ProducerSnapshot>{
 if(cached&&Date.now()-cached.at<TTL_MS)return cached.data;
 if(!flight)flight=readLatest().then(data=>{cached={at:Date.now(),data};return data;})
  .finally(()=>{flight=null;});
 return flight;
}
export async function producerAudits():Promise<ProducerRows>{
 return (await producerAuditSnapshot()).rows;
}
