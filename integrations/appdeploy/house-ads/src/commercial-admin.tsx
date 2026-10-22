import {useEffect,useState} from 'react';
import {api} from '@appdeploy/client';
import type {CommercialConfig} from '../shared/commercial-policy';
type Metric={id:string;day:string;campaignId:string;type:string;impression?:number;click?:number};
type Campaign={id:string;businessName:string;status:string;endAt:string};
export function CommercialControls(){
  const [config,setConfig]=useState<CommercialConfig|null>(null);
  const [rows,setRows]=useState<Campaign[]>([]);const [cursor,setCursor]=useState<string|null>(null);
  const [metrics,setMetrics]=useState<Metric[]>([]);const [metricCursor,setMetricCursor]=useState<string|null>(null);const [metricsLoaded,setMetricsLoaded]=useState(false);
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
  useEffect(()=>{let active=true;void api.get('/api/admin/marketing/commercial').then(r=>{if(active)setConfig(r.data);}).catch(()=>{if(active)setMessage('No se pudo leer la configuración comercial.');});return()=>{active=false;};},[]);
  function update(patch:Partial<CommercialConfig>){setConfig(c=>c?{...c,...patch}:c);}
  async function save(){setBusy(true);try{const r=await api.put('/api/admin/marketing/commercial',config);setConfig(r.data);setMessage('Promoción guardada. No se activaron anuncios ni cobros.');}catch{setMessage('No se guardó. Revisa los datos y recarga: otra aprobación puede haber cambiado los cupos.');}finally{setBusy(false);}}
  async function load(more=false){setBusy(true);try{const r=await api.get('/api/admin/marketing/campaigns'+(more?'?cursor='+encodeURIComponent(cursor||''):''));setRows(old=>more?[...old,...r.data.items]:r.data.items);setCursor(r.data.nextToken);}catch{setMessage('No se completó la consulta de campañas.');}finally{setBusy(false);}}
  async function loadMetrics(more=false){setBusy(true);try{const r=await api.get('/api/admin/marketing/commercial-metrics'+(more?'?cursor='+encodeURIComponent(metricCursor||''):''));setMetrics(old=>more?[...old,...r.data.items]:r.data.items);setMetricCursor(r.data.nextToken);setMetricsLoaded(true);}catch{setMessage('No se completó la lectura de métricas comerciales.');}finally{setBusy(false);}}
  async function status(id:string,status:string){setBusy(true);try{await api.put('/api/admin/marketing/campaigns',{id,status});setRows(old=>old.map(r=>r.id===id?{...r,status}:r));setMessage('Estado actualizado. No se modificaron fechas ni beneficios.');}catch{setMessage('No se cambió el estado; una campaña vencida no puede renovarse así.');}finally{setBusy(false);}}
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
    {rows.map(row=><article key={row.id}><b>{row.businessName}</b><p>{row.status} · cierre {new Date(row.endAt).toLocaleDateString('es-CL')}</p>{(['active','paused','rejected'] as const).map(value=><button key={value} disabled={busy||row.status===value} onClick={()=>void status(row.id,value)}>{value==='active'?'Activar':value==='paused'?'Pausar':'Rechazar'}</button>)}</article>)}
    {cursor&&<button disabled={busy} onClick={()=>void load(true)}>Cargar más campañas</button>}
  </section>;
}
