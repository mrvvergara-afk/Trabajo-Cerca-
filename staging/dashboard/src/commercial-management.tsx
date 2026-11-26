import {useEffect,useState} from 'react';
import {api} from '@appdeploy/client';
import {knownCount,type AdminSnapshot} from './executive-metrics';
import {commercialTotals} from './commercial-management-metrics';
type Result=ReturnType<typeof commercialTotals>;
export function CommercialManagement({summary}:{summary?:AdminSnapshot}){
 const [result,setResult]=useState<Result|null>(null);
 const [loading,setLoading]=useState(false);
 const [failed,setFailed]=useState(false);
 const [refresh,setRefresh]=useState(0);
 useEffect(()=>{
  if(!refresh)return;
  let active=true;
  setLoading(true);setFailed(false);setResult(null);
  void (async()=>{
   const rows:unknown[]=[];const seen=new Set<string>();let cursor:string|null=null;
   for(let page=0;page<20;page++){
    const path='/api/admin/marketing/commercial-metrics'+(cursor?'?cursor='+encodeURIComponent(cursor):'');
    const r=await api.get(path);if(!active)return;
    if(!Array.isArray(r.data?.items)||!('nextToken' in r.data))throw Error('invalid response');
    rows.push(...r.data.items);
    const next=r.data.nextToken;
    if(next===null||next===''){setResult(commercialTotals(rows,true));return;}
    if(typeof next!=='string'||seen.has(next))throw Error('invalid cursor');
    seen.add(next);cursor=next;
   }
   if(active)setResult(commercialTotals(rows,false));
  })().catch(()=>{if(active)setFailed(true);}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[refresh]);
 return <section className="tcBIChartCard tcEfficiency" aria-label="Gestión comercial y crecimiento">
 <header className="tcBIChartHead"><div><h4>Gestión comercial y crecimiento</h4><p>Separación entre actividad comercial, pruebas y resultados financieros.</p></div></header>
 <div className="tcEfficiencyGrid">
 <article className="tcEfficiencyMotor"><strong>Actividad comercial</strong><dl><div><dt>Campañas activas</dt><dd>{knownCount(summary?.campaigns)}</dd></div><div><dt>Solicitudes por revisar</dt><dd>{knownCount(summary?.requests)}</dd></div></dl></article>
 <article className="tcEfficiencyMotor"><strong>Usuarios y crecimiento</strong><dl><div><dt>Usuarios únicos</dt><dd>Sin medición confirmada</dd></div><div><dt>Recurrencia</dt><dd>Sin medición confirmada</dd></div><div><dt>Postulaciones</dt><dd>Sin medición confirmada</dd></div></dl></article>
 <article className="tcEfficiencyMotor"><strong>Finanzas</strong><dl><div><dt>Ingresos cobrados</dt><dd>Sin datos contables</dd></div><div><dt>Costos reales</dt><dd>Sin datos contables</dd></div></dl><small>Tarifas referenciales no son ingresos.</small></article>
 </div>
 <details className="tcEfficiencyDetails"><summary>Publicidad · laboratorio</summary>
 <p className="tcExecCaution">Datos de prueba, no clientes reales, personas únicas ni ventas. Consulta bajo demanda para limitar lecturas.</p>
 <button type="button" disabled={loading} onClick={()=>setRefresh(n=>n+1)}>{loading?'Consultando…':'Consultar métricas de prueba'}</button>
 {failed&&<p role="status">No fue posible completar la consulta.</p>}
 {result&&<><p>{result.complete?'Consulta paginada completa':'Consulta parcial: no representa el total'} · {result.records} registros únicos válidos</p>
 <dl><div><dt>Impresiones</dt><dd>{knownCount(result.impressions)}</dd></div><div><dt>Clics</dt><dd>{knownCount(result.clicks)}</dd></div><div><dt>CTR</dt><dd>{result.ctr===null?'Sin datos':result.ctr.toFixed(1)+' %'}</dd></div></dl></>}
 </details></section>;
}
