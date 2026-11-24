/**
 * Normalized read-only indicators. Null means unavailable, NOT zero.
 * A queue record never means a publicly confirmed vacancy.
 */
export const ENGINE_IDS=['A','B','C','D','CHATGPT','GEMINI'] as const;
export type EngineId=typeof ENGINE_IDS[number];
export type EngineRole='discovery'|'documents';
export type Health='recent'|'stale'|'unreported'|'error';
export type EngineCounts={
  scheduled:number|null;attempted:number|null;useful:number|null;blocked:number|null;
  candidates:number|null;verified:number|null;queued:number|null;
  publishedConfirmed:number|null;processed:number|null;
};
export type EngineRow={id:EngineId;name:string;role:EngineRole;status:Health;
  observedAt:string|null;source:string;scope:string;notes:string[];counts:EngineCounts};
export type DayPoint={day:string;engine:EngineId;measure:'sources_attempted'|'docs_processed'|'links_detected';value:number};
export const ENGINE_META:Record<EngineId,{name:string;role:EngineRole;freshHours:number}>={
 A:{name:'Motor A',role:'discovery',freshHours:2},
 B:{name:'Motor B',role:'documents',freshHours:8},
 C:{name:'Motor C',role:'documents',freshHours:8},
 D:{name:'Motor D',role:'discovery',freshHours:8},
 CHATGPT:{name:'Motor ChatGPT',role:'discovery',freshHours:8},
 GEMINI:{name:'Motor Gemini',role:'discovery',freshHours:9}
};
export function nonnegative(value:unknown):number|null {
 return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:null;
}
export function asRow(value:unknown):Record<string,unknown> {
 return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
}
export function stamp(value:unknown):string|null {
 if(typeof value!=='string')return null;
 const ts=Date.parse(value);return Number.isFinite(ts)?new Date(ts).toISOString():null;
}
export function health(id:EngineId,at:string|null,hasError=false,now=Date.now()):Health {
 if(hasError)return 'error';
 if(!at)return 'unreported';
 const age=now-Date.parse(at);
 if(age< -300000 || age>ENGINE_META[id].freshHours*3600_000)return 'stale';
 return 'recent';
}
export function blankCounts():EngineCounts {
 return {scheduled:null,attempted:null,useful:null,blocked:null,candidates:null,
  verified:null,queued:null,publishedConfirmed:null,processed:null};
}
export function makeRow(id:EngineId,raw:unknown,source:string,patch:Partial<EngineCounts>,
 observed:unknown,notes:string[]=[],hasError=false):EngineRow {
 const observedAt=stamp(observed);
 const counts={...blankCounts(),...patch};
 for(const [key,value] of Object.entries(counts)){
   if(value!==null&&nonnegative(value)===null)throw Error('bad_metric:'+id+':'+key);
 }
 return {id,name:ENGINE_META[id].name,role:ENGINE_META[id].role,
  status:health(id,observedAt,hasError),observedAt,source,
  scope:id==='B'||id==='C'?'documentos/cola':'fuentes y ofertas',notes,counts};
}
/* HTTP200 without anti-bot, error or render challenge: read, not a vacancy. */
export function usefulFromAudits(audits:unknown):number|null {
 if(!Array.isArray(audits))return null;
 return audits.filter(x=>{
   const r=asRow(x);return r.http===200&&r.error==null&&r.renderRequired!==true;
 }).length;
}
export function adaptEngine(id:EngineId,raw:unknown,options:{readFailed?:boolean}={}):EngineRow {
 const r=asRow(raw),hasError=options.readFailed===true;
 if(hasError) return makeRow(id,null,'lectura fallida',{},null,['Lectura fallida no equivale a cero.'],true);
 if(id==='A'){
  const s=asRow(r.summary),reads=nonnegative(s.sourcesRead),useful=usefulFromAudits(s.audits);
  return makeRow(id,raw,'free_public_source_cursor_v3',
   {attempted:reads,useful,blocked:reads!==null&&useful!==null?Math.max(0,reads-useful):null,
    candidates:nonnegative(s.noticesChecked),verified:nonnegative(s.verified),
    queued:nonnegative(s.pending),publishedConfirmed:null},
   r.checkedAt||s.checkedAt,['Fuente leída no equivale a empleo; origen de publicación sin conciliación.']);
 }
 if(id==='B')return makeRow(id,raw,'motor_b_latest',
   {attempted:nonnegative(r.visited),blocked:Array.isArray(r.errors)?r.errors.length:null,
    candidates:nonnegative(r.ready),queued:nonnegative(r.queueLength),processed:nonnegative(r.visited)},
   r.at,['Procesados = páginas/documentos visitados en el último ciclo.',
    'Listos para revisión: '+(nonnegative(r.ready)??'Sin datos')+'. En revisión: '+(nonnegative(r.reviews)??'Sin datos')+'.',
    'Errores de lectura: '+(Array.isArray(r.errors)?r.errors.length:'Sin datos')+'. No acredita publicaciones.']);
 if(id==='C')return makeRow(id,raw,'motor_c_local_latest',
   {attempted:nonnegative(r.visited),blocked:Array.isArray(r.errors)?r.errors.length:null,
    candidates:nonnegative(r.identified),queued:nonnegative(r.queued),processed:nonnegative(r.visited)},
   r.at,['Enlaces identificados: '+(nonnegative(r.identified)??'Sin datos')+'.',
    'Rechazados: '+(nonnegative(r.rejected)??'Sin datos')+'. Enviados a revisión final: '+(nonnegative(r.submitted)??'Sin datos')+'.',
    'Pendientes de fuente: '+(nonnegative(r.sourcePending)??'Sin datos')+'. No acredita publicaciones.']);
 if(id==='D'){
  const state=String(r.state||'');
  const failure=/error|invalid|unverified|awaiting_read_token/.test(state);
  return makeRow(id,raw,'motor_d_bridge_status',
   {attempted:nonnegative(r.producerSourcesChecked),useful:nonnegative(r.producerSourcesAccessible),
    candidates:nonnegative(r.producerReadyCandidates),publishedConfirmed:null},
   r.producerLastScanAt||r.at,[
    'Fuentes accesibles desde heartbeat; no prueba publicación.',
    state?'Estado del puente: '+state:'Sin estado del puente'
   ],failure);
 }
 if(id==='GEMINI'){
  const state=String(r.state||'');
  return makeRow(id,raw,'gemini_github_pull_status',
   {candidates:nonnegative(r.received),queued:nonnegative(r.queued),publishedConfirmed:null},
   r.at,[state?'Importador: '+state:'Sin registro del productor.',
     'Encolados no son vacantes publicadas; fuentes de Gemini aún sin sincronización.'
   ],/pull_error|github_http_error/.test(state));
 }
 return makeRow(id,raw,'ChatGPT productor no conectado',{},null,
   ['El radar de GitHub todavía no sincroniza una bitácora comparable a AppDeploy.']);
}
export function rollup(rows:EngineRow[]) {
 return {recent:rows.filter(x=>x.status==='recent').length,
  reporting:rows.filter(x=>x.status!=='unreported'&&x.status!=='error').length,
  total:ENGINE_IDS.length};
}
