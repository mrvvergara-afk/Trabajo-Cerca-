import {useEffect,useState} from 'react';
import './coverage-proposal.css';
import {api} from '@appdeploy/client';
import type {CommercialConfig} from '../shared/commercial-policy';
import {COMMERCIAL_PLACES} from '../shared/commercial-policy';
type Metric={id:string;day:string;campaignId:string;type:string;impression?:number;click?:number};
type Campaign={id:string;businessName:string;status:string;startAt?:string;endAt:string;communes?:string[];placements?:string[]};
export function CommercialControls(){
  const [config,setConfig]=useState<CommercialConfig|null>(null);
  const [rows,setRows]=useState<Campaign[]>([]);const [cursor,setCursor]=useState<string|null>(null);
  const [metrics,setMetrics]=useState<Metric[]>([]);const [metricCursor,setMetricCursor]=useState<string|null>(null);const [metricsLoaded,setMetricsLoaded]=useState(false);
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
  const [publicChecks,setPublicChecks]=useState<Record<string,string>>({});
  useEffect(()=>{let active=true;void api.get('/api/admin/marketing/commercial').then(r=>{if(active)setConfig(r.data);}).catch(()=>{if(active)setMessage('No se pudo leer la configuración comercial.');});return()=>{active=false;};},[]);
  function update(patch:Partial<CommercialConfig>){setConfig(c=>c?{...c,...patch}:c);}
  async function save(){setBusy(true);try{const r=await api.put('/api/admin/marketing/commercial',config);setConfig(r.data);setMessage('Promoción guardada. No se activaron anuncios ni cobros.');}catch{setMessage('No se guardó. Revisa los datos y recarga: otra aprobación puede haber cambiado los cupos.');}finally{setBusy(false);}}
  async function load(more=false){setBusy(true);try{const r=await api.get('/api/admin/marketing/campaigns'+(more?'?cursor='+encodeURIComponent(cursor||''):''));setRows(old=>more?[...old,...r.data.items]:r.data.items);setCursor(r.data.nextToken);}catch{setMessage('No se completó la consulta de campañas.');}finally{setBusy(false);}}
  async function loadMetrics(more=false){setBusy(true);try{const r=await api.get('/api/admin/marketing/commercial-metrics'+(more?'?cursor='+encodeURIComponent(metricCursor||''):''));setMetrics(old=>more?[...old,...r.data.items]:r.data.items);setMetricCursor(r.data.nextToken);setMetricsLoaded(true);}catch{setMessage('No se completó la lectura de métricas comerciales.');}finally{setBusy(false);}}
  async function status(id:string,status:string){setBusy(true);try{await api.put('/api/admin/marketing/campaigns',{id,status});setRows(old=>old.map(r=>r.id===id?{...r,status}:r));setMessage('Estado actualizado. No se modificaron fechas ni beneficios.');}catch{setMessage('No se cambió el estado; una campaña vencida no puede renovarse así.');}finally{setBusy(false);}}

 async function checkPublic(row:Campaign) {
    const place=row.communes?.includes('Mininco')?'Mininco':row.communes?.find(p=>p!=='Todas')||'Todas';
    setPublicChecks(old=>({...old,[row.id]:'Consultando catálogo público…'}));
    try {
      const result=await api.get('/api/growth/advertising?place='+encodeURIComponent(place)+'&turn=1');
      const found=Array.isArray(result.data?.commercial)&&result.data.commercial.some((item:{id:string})=>item.id===row.id);
      setPublicChecks(old=>({...old,[row.id]:found
        ? 'Incluida en el catálogo público para '+place+'. Verifica también su visualización en pantalla.'
        : 'No figura en la selección pública para '+place+'. Revisa cobertura, fecha y prioridad.'}));
    } catch {
      setPublicChecks(old=>({...old,[row.id]:'No fue posible consultar el catálogo público.'}));
    }
  }

 const [coverageId,setCoverageId]=useState('');
 const [coveragePlaces,setCoveragePlaces]=useState<string[]>([]);
 const [coverageSlots,setCoverageSlots]=useState<string[]>([]);
 const [coveragePlan,setCoveragePlan]=useState<'basic'|'featured'|'multi'>('basic');
 function selectCoverage(row:Campaign){setCoverageId(row.id);setCoveragePlaces(row.communes||[]);setCoverageSlots(row.placements||['search']);setMessage('');}
 async function saveCoverage(){setBusy(true);try{const result=await api.post('/api/admin/marketing/coverage',{id:coverageId,communes:coveragePlaces,placements:coverageSlots,plan:coveragePlan});setMessage(result.data.notice||'Propuesta guardada.');setCoverageId('');}catch{setMessage('No se guardó la propuesta: selecciona una nueva comuna o espacio.');}finally{setBusy(false);}}

  return <section aria-label='Promociones y campañas comerciales'><h3>Promoción vigente</h3><p>La fecha oficial solo se configura cuando el lanzamiento esté aprobado. Una promoción por negocio revisado; beneficios no acumulables.</p><p role='status'>{message}</p>
    {config&&<fieldset disabled={busy}><legend>Configuración centralizada</legend>
      <label><input type='checkbox' checked={config.enabled} onChange={e=>update({enabled:e.target.checked})}/>Promoción habilitada</label>
      <label>Lanzamiento aprobado, UTC; vacío = sin lanzamiento<input type='datetime-local' value={config.launchAt?.slice(0,16)||''} onChange={e=>update({launchAt:e.target.value?new Date(e.target.value+'Z').toISOString():null})}/></label>
      <label>Cierre de convocatoria UTC, opcional<input type='datetime-local' value={config.founderClosesAt?.slice(0,16)||''} onChange={e=>update({founderClosesAt:e.target.value?new Date(e.target.value+'Z').toISOString():null})}/></label>
      {([['founderSlots','Cupos fundadores'],['founderDays','Días por fundador'],['founderWindowDays','Días de convocatoria desde lanzamiento'],['standardDays','Días de prueba estándar']] as const).map(([key,label])=><label key={key}>{label}<input type='number' min='1' max={key==='founderSlots'?10000:365} value={config[key]} onChange={e=>update({[key]:Number(e.target.value)})}/></label>)}
      <p>Cupos otorgados: {config.foundersUsed}. Disponibles: {Math.max(0,config.founderSlots-config.foundersUsed)}. No son ingresos.</p>
      <label><input type='checkbox' checked={config.standardEnabled} onChange={e=>update({standardEnabled:e.target.checked})}/>Prueba estándar al cerrar fundadores</label>
      <label>Mensaje público<textarea maxLength={300} value={config.message} onChange={e=>update({message:e.target.value})}/></label>
      <label>Condiciones<textarea maxLength={1000} value={config.conditions} onChange={e=>update({conditions:e.target.value})}/></label>
      <details><summary>Planes referenciales, sin contratación ni pagos habilitados</summary>{config.plans.map((plan,index)=><div key={plan.id}><b>{plan.id}</b><label>Precio referencial CLP / {plan.days} días<input type='number' min='0' value={plan.priceCLP} onChange={e=>update({plans:config.plans.map((p,i)=>i===index?{...p,priceCLP:Number(e.target.value)}:p)})}/></label><label>IVA<select value={plan.vat} onChange={e=>update({plans:config.plans.map((p,i)=>i===index?{...p,vat:e.target.value as typeof p.vat}:p)})}><option value='pending'>Pendiente de definición</option><option value='included'>Incluido</option><option value='excluded'>No incluido</option></select></label></div>)}</details>
      <button type='button' onClick={()=>void save()}>Guardar promoción y tarifas preliminares</button>
    </fieldset>}
    <h3>Rendimiento comercial</h3><p>Impresiones visibles y clics reportados por navegador. No son ventas ni facturación; los contactos de WhatsApp no prueban una contratación.</p><button disabled={busy} onClick={()=>void loadMetrics()}>Consultar métricas comerciales</button>
    {!metrics.length&&<p>{metricsLoaded?'Sin datos':'Sin datos cargados'}</p>}
    {metrics.map(m=><p key={m.id}>{m.day} · {m.campaignId} · {m.type}: {m.impression||0} impresiones, {m.click||0} clics · CTR {m.impression?((m.click||0)/m.impression*100).toFixed(1):'0'}%</p>)}
    {metricCursor&&<button disabled={busy} onClick={()=>void loadMetrics(true)}>Cargar más métricas comerciales</button>}
    <h3>Campañas comerciales</h3><button disabled={busy} onClick={()=>void load()}>Consultar campañas</button>
    {!rows.length&&<p>Sin datos cargados.</p>}
    {rows.map(row=><article key={row.id} className='tcCampaignRow'>
      <b>{row.businessName}</b>
      <p>Estado: {row.status==='active'?'Activa':row.status} · Fin de vigencia interno: {new Date(row.endAt).toLocaleDateString('es-CL')}</p>
      <p>Territorios: {row.communes?.join(', ')||'No configurados'} · Espacios: {(row.placements||['search']).map(p=>p==='search'?'Bajo buscador':'Entre resultados').join(', ')}</p>
      <button type='button' disabled={busy} onClick={()=>void checkPublic(row)}>Comprobar catálogo público</button>
      {publicChecks[row.id]&&<p role='status'>{publicChecks[row.id]}</p>}{(['active','paused','rejected'] as const).map(value=><button key={value} disabled={busy||row.status===value} onClick={()=>void status(row.id,value)}>{value==='active'?'Activar':value==='paused'?'Pausar':'Rechazar'}</button>)} <button type='button' disabled={busy} onClick={()=>selectCoverage(row)}>Agregar comunas o espacios</button></article>)}
    {coverageId&&<section className='tcCoverageProposal' aria-label='Propuesta de ampliación comercial'>
 <h4>Ampliar publicidad</h4><p>Selecciona comunas y espacios adicionales. Se guardará como propuesta pendiente: sin cobro ni publicación automática.</p>
 <label>Modalidad<select value={coveragePlan} onChange={e=>setCoveragePlan(e.target.value as typeof coveragePlan)}><option value='basic'>Básica</option><option value='featured'>Destacada</option><option value='multi'>Multicomuna</option></select></label>
 <fieldset><legend>Comunas</legend><div className='tcCoverageOptions'>{COMMERCIAL_PLACES.map(place=><label key={place}><input type='checkbox' checked={coveragePlaces.includes(place)} onChange={e=>setCoveragePlaces(x=>e.target.checked?[...x,place]:x.filter(v=>v!==place))}/>{place}</label>)}</div></fieldset>
 <fieldset><legend>Espacios disponibles actualmente</legend>{([['search','Junto al buscador'],['listing','Entre resultados']] as const).map(([id,label])=><label key={id}><input type='checkbox' checked={coverageSlots.includes(id)} onChange={e=>setCoverageSlots(x=>e.target.checked?[...x,id]:x.filter(v=>v!==id))}/>{label}</label>)}</fieldset>
 <button type='button' disabled={busy} onClick={()=>void saveCoverage()}>Guardar propuesta sin publicar</button> <button type='button' disabled={busy} onClick={()=>setCoverageId('')}>Cancelar</button>
 </section>}
    {cursor&&<button disabled={busy} onClick={()=>void load(true)}>Cargar más campañas</button>
  }</section>;
}
