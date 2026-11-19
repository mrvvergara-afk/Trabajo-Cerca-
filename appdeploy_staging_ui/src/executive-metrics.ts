/** Executive metrics stay conservative: no inferred coverage, publication or health. */
export type AdminSnapshot = {
  publicVisible?:number; jobs?:number; verified?:number; pending?:number;
  campaigns?:number; requests?:number; lastSweep?:string;
};
export type ExecutiveKpi={key:string;label:string;value:string;note:string};
export const MAIN_CITIES = [
  'Angol','Collipulli','Ercilla','Lumaco','Los Sauces','Purén',
  'Renaico','Traiguén','Victoria','Mulchén','Negrete','Nacimiento'
] as const;

export function knownCount(value:unknown):string {
  return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?String(value):'Sin datos';
}
export function executiveKpis(s?:AdminSnapshot):ExecutiveKpi[] {
  return [
    {key:'visible',label:'Ofertas visibles',value:knownCount(s?.publicVisible),note:'Total del catálogo; no equivale a nuevas de hoy'},
    {key:'coverage',label:'Cobertura efectiva',value:'Sin datos',note:'Pendiente de lecturas útiles por fuente y motor'},
    {key:'motors',label:'Motores saludables',value:'Sin datos',note:'Faltan latidos comparables de los seis motores'},
    {key:'pending',label:'Candidatos pendientes',value:knownCount(s?.pending),note:'Registros internos; no publicaciones'},
    {key:'ads',label:'Campañas activas',value:knownCount(s?.campaigns),note:'Solicitudes comerciales: '+knownCount(s?.requests)}
  ];
}
export type CityCount = {city:string;visible:string;audited:string;expected:string;failed:string};
type Row=Record<string,unknown>;
export function cityCounts(payload:unknown):CityCount[] {
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
    return {
      city,
      visible:knownCount(row?.publicJobs),
      audited:knownCount(row?.sourceChecked),
      expected:knownCount(row?.sourceConfigured),
      failed:knownCount(row?.sourceFailed),
    };
  });
}
