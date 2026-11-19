import {secrets} from '@appdeploy/sdk';
import {ENGINE_IDS,asRow,makeRow,nonnegative,stamp,type EngineRow} from './engine-metrics-contract';

/** Source-side producer snapshots. All calls are GET to exact repositories and
 * known report paths; only aggregate counters return to the admin interface.
 * Authenticated GitHub access is server side and never logged or exposed.
 */
const BASE='https://api.github.com/repos/';
const PUBLIC_REPO='mrvvergara-afk/Trabajo-Cerca-';
const GEMINI_REPO='mrvvergara-afk/motor-rastreo-gemini';
const TTL_MS=4*60_000;
let cached:{at:number;rows:Partial<Record<'D'|'CHATGPT'|'GEMINI',EngineRow>>}|null=null;
let flight:Promise<Partial<Record<'D'|'CHATGPT'|'GEMINI',EngineRow>>>|null=null;

function reportDay(offset=0):string {
 const now=new Date(Date.now()-offset*86400_000);
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Santiago',
  year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const obj=Object.fromEntries(parts.map(p=>[p.type,p.value]));
 return obj.year+obj.month+obj.day;
}
async function githubJson(repo:string,path:string,token:string|null):Promise<Record<string,unknown>|null> {
 const address=BASE+repo+'/contents/'+path+'?ref=main';
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
 const entries=Array.isArray(report.source_results)?report.source_results:[];
 const latest=new Map<string,Record<string,unknown>>();
 for(const raw of entries){
  const x=asRow(raw),key=String(x.source_id||'');
  if(!key)continue;
  const prior=latest.get(key);
  if(!prior||String(x.attempted_at||'')>=String(prior.attempted_at||''))latest.set(key,x);
 }
 const rows=[...latest.values()];
 const checked=rows.filter(x=>['checked_found','checked_empty'].includes(String(x.status))).length;
 const found=rows.filter(x=>x.status==='checked_found').length;
 const blocked=rows.filter(x=>x.status==='blocked').length;
 const attempted=rows.filter(x=>x.status!=='not_attempted'&&x.status!=='unreported').length;
 const scheduled=nonnegative(report.inventory_endpoints);
 const at=stamp(report.run_at);
 if(!at)return null;
 return makeRow('CHATGPT',report,'GitHub: chatgpt_coverage',
  {scheduled,attempted,useful:checked,blocked,candidates:null,
   publishedConfirmed:null},at,[
    'Lectura útil = fuente revisada con estado checked_empty o checked_found.',
    'Detectó resultados en '+found+' índices; no equivale a ofertas publicadas.',
    report.coverage_complete===true?'Inventario declarado como completo':'Cobertura incompleta según productor'
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
async function readLatest():Promise<Partial<Record<'D'|'CHATGPT'|'GEMINI',EngineRow>>>{
 let token:string|null=null;
 try{
  const names=await secrets.listSecretNames();
  if(names.includes('MOTOR_C_GITHUB_READ_TOKEN'))token=await secrets.readSecret('MOTOR_C_GITHUB_READ_TOKEN');
 }catch{/* Public producer files remain accessible; private Gemini stays unknown. */}
 const tasks=await Promise.allSettled([
  githubJson(PUBLIC_REPO,'automation/motor_d_discovery/producer_heartbeat.json',token),
  githubJson(PUBLIC_REPO,'automation/chatgpt_coverage/'+reportDay()+'.json',token),
  token?githubJson(GEMINI_REPO,'output/gemini_source_audit_v2.json',token):Promise.resolve(null)
 ]);
 const result:Partial<Record<'D'|'CHATGPT'|'GEMINI',EngineRow>>={};
 const d=tasks[0].status==='fulfilled'?tasks[0].value:null;
 const c=tasks[1].status==='fulfilled'?tasks[1].value:null;
 const g=tasks[2].status==='fulfilled'?tasks[2].value:null;
 if(d){const row=motorDRow(d);if(row)result.D=row;}
 if(c){const row=chatgptRow(c);if(row)result.CHATGPT=row;}
 if(g){const row=geminiRow(g);if(row)result.GEMINI=row;}
 // Do not silently classify older data as a successful today run.
 return result;
}
export async function producerAudits():Promise<Partial<Record<'D'|'CHATGPT'|'GEMINI',EngineRow>>> {
 if(cached&&Date.now()-cached.at<TTL_MS)return cached.rows;
 if(!flight)flight=readLatest().then(rows=>{cached={at:Date.now(),rows};return rows;})
   .finally(()=>{flight=null;});
 return flight;
}
