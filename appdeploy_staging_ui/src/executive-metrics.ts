/** Presentation contracts for read-only backend metrics.
 * Figures are measured, never filled with simulated data.
 */
export type AdminSnapshot={
 publicVisible?:number;jobs?:number;verified?:number;pending?:number;
 campaigns?:number;requests?:number;lastSweep?:string;
};
export type EngineId='A'|'B'|'C'|'D'|'CHATGPT'|'GEMINI';
export type EngineRole='discovery'|'documents';
export type EngineStatus='recent'|'stale'|'unreported'|'error';
export type EngineRow={
 id:EngineId;name:string;role:EngineRole;status:EngineStatus;observedAt:string|null;
 source:string;scope:string;notes:string[];
 counts:{scheduled:number|null;attempted:number|null;useful:number|null;blocked:number|null;
 candidates:number|null;verified:number|null;queued:number|null;
 publishedConfirmed:number|null;processed:number|null};
};
export type DayPoint={day:string;engine:EngineId;measure:'sources_attempted'|'docs_processed';value:number};
export type Telemetry={
 schemaVersion:number;readOnly:boolean;generatedAt:string;engines:EngineRow[];
 rollup:{recent:number;reporting:number;total:number};
 history:DayPoint[];historyComplete:boolean;
 missingOrFailed:EngineId[];warning:string;
};
export type ExecutiveKpi={key:string;label:string;value:string;note:string;accent:string};
export const MAIN_CITIES=[
 'Angol','Collipulli','Ercilla','Lumaco','Los Sauces','Purén','Renaico',
 'Traiguén','Victoria','Mulchén','Negrete','Nacimiento'
] as const;
export function knownCount(value:unknown):string{
 return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?String(value):'Sin datos';
}
export function percent(part:unknown,total:unknown):number|null {
 return typeof part==='number'&&typeof total==='number'&&
  Number.isSafeInteger(part)&&part>=0&&Number.isSafeInteger(total)&&total>0&&part<=total
    ?Math.round((part/total)*100):null;
}
export function formatRatio(part:unknown,total:unknown):string{
 const p=percent(part,total);
 return p===null?'Sin datos':p+' %';
}
export function executiveKpis(s?:AdminSnapshot,t?:Telemetry|null):ExecutiveKpi[]{
 const d=t?.engines?.find(e=>e.id==='D');
 const a=t?.engines?.find(e=>e.id==='A');
 const readable=d?.counts.attempted!==null&&d?.counts.attempted!==undefined?d:a;
 const ratio=readable?formatRatio(readable.counts.useful,readable.counts.attempted):'Sin datos';
 return [
  {key:'visible',label:'Ofertas públicas',value:knownCount(s?.publicVisible),
   note:'En el catálogo, no nuevas del día',accent:'blue'},
  {key:'readable',label:'Lectura útil · '+(readable?.name||'motores'),value:ratio,
   note:readable?'Fuentes accesibles / intentadas del último ciclo':'Aún sin reporte válido',accent:'teal'},
  {key:'motors',label:'Motores con reporte reciente',
   value:t?knownCount(t.rollup.recent)+' / '+knownCount(t.rollup.total):'Sin datos',
   note:'Actividad observada, no cobertura completa',accent:'violet'},
  {key:'pending',label:'Candidatos pendientes',value:knownCount(s?.pending),
   note:'Conteo interno consultado; no publicados',accent:'amber'},
  {key:'ads',label:'Campañas publicitarias',value:knownCount(s?.campaigns),
   note:'Solicitudes por revisar: '+knownCount(s?.requests),accent:'green'}
 ];
}
export type CityCount={city:string;visible:string;audited:string;expected:string;failed:string};
type Row=Record<string,unknown>;
export function cityCounts(payload:unknown):CityCount[]{
 const record=payload&&typeof payload==='object'&&!Array.isArray(payload)?payload as Record<string,unknown>:{};
 const items=Array.isArray(record.communes)?record.communes:[];
 const byCity=new Map<string,Row>();
 for(const item of items){
  if(!item||typeof item!=='object'||Array.isArray(item))continue;
  const row=item as Row;
  if(typeof row.city==='string'&&MAIN_CITIES.includes(row.city as typeof MAIN_CITIES[number]))byCity.set(row.city,row);
 }
 return MAIN_CITIES.map(city=>{
  const row=byCity.get(city);
  return {city,visible:knownCount(row?.publicJobs),
   audited:knownCount(row?.sourceChecked),expected:knownCount(row?.sourceConfigured),
   failed:knownCount(row?.sourceFailed)};
 });
}
export function chartValues(points:DayPoint[],engine:'A'|'B'|'C'):DayPoint[]{
 return points.filter(p=>p.engine===engine&&
   (engine==='A'?p.measure==='sources_attempted':p.measure==='docs_processed')&&
   /^\d{4}-\d{2}-\d{2}$/.test(p.day)&&Number.isSafeInteger(p.value)&&p.value>=0)
   .sort((a,b)=>a.day.localeCompare(b.day)).slice(-8);
}
export function engineStatus(status:EngineStatus):string{
 return {recent:'Registro reciente',stale:'Sin ejecución reciente',unreported:'Sin reporte',
   error:'Requiere revisión'}[status];
}
