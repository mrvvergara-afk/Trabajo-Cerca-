import { useEffect, useState } from 'react';
import { api } from '@appdeploy/client';
import { HOUSE_DEFAULTS, type HouseCampaign, type Creative } from '../shared/house-ads';
import './house-advertising.css';
type Metric={id:string;day:string;campaignId:string;creativeId:string;impression?:number;click?:number;form_started?:number;registration_completed?:number;profile_published?:number;employer_added?:number;advertiser_captured?:number;trial_activated?:number;paid_conversion?:number};
type Application={id:string;businessName:string;commune:string;trialState?:string};
const split=(s:string)=>s.split(',').map(v=>v.trim()).filter(Boolean);
export function HouseCampaignAdmin() {
  const [campaigns,setCampaigns]=useState<HouseCampaign[]>([]);
  const [revision,setRevision]=useState('');const [selected,setSelected]=useState('');
  const [stats,setStats]=useState<Metric[]>([]);const [cursor,setCursor]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
  const [applications,setApplications]=useState<Application[]>([]);const [trialCursor,setTrialCursor]=useState<string|null>(null);
  const [trial,setTrial]=useState({leadId:'',headline:'',detail:'',url:''});
  useEffect(()=>{let alive=true;void api.get('/api/admin/marketing/house').then(r=>{if(alive){setCampaigns(r.data.campaigns);setRevision(r.data.revision);setSelected(r.data.campaigns[0]?.id||'');setStats(r.data.stats);setCursor(r.data.nextToken);}}).catch(()=>{if(alive)setMessage('No se pudo cargar Marketing. Verifica tu sesión y recarga.');});return()=>{alive=false;};},[]);
  const current=campaigns.find(c=>c.id===selected);
  function update(patch:Partial<HouseCampaign>){setCampaigns(all=>all.map(c=>c.id===selected?{...c,...patch}:c));}
  function creative(index:number,patch:Partial<Creative>){if(current)update({creatives:current.creatives.map((c,i)=>i===index?{...c,...patch}:c)});}
  async function save(){setBusy(true);setMessage('');try{const r=await api.put('/api/admin/marketing/house',{revision,campaigns});setRevision(r.data.revision);setCampaigns(r.data.campaigns);setMessage('Campañas guardadas. La configuración se aplicará en las siguientes visitas.');}catch{setMessage('No se guardó. Puede haber cambios de otra sesión o datos inválidos; recarga antes de sobrescribir.');}finally{setBusy(false);}}
  async function upload(file:File,index:number){if(file.size>200000){setMessage('Usa una imagen hasta 200 KB.');return;}setBusy(true);try{const content=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=reject;r.readAsDataURL(file);});const r=await api.post('/api/admin/marketing/creative',{content,mime:file.type});creative(index,{storagePath:r.data.storagePath});setMessage('Imagen guardada. Guarda también la campaña para asociarla.');}catch{setMessage('No se pudo guardar la imagen. Usa PNG, JPEG o WebP válido.');}finally{setBusy(false);}}
  async function moreStats(){setBusy(true);try{const r=await api.get('/api/admin/marketing/house?cursor='+encodeURIComponent(cursor||''));setStats(rows=>[...rows,...r.data.stats]);setCursor(r.data.nextToken);}catch{setMessage('No se completó la lectura de métricas.');}finally{setBusy(false);}}
  async function loadTrials(more=false){setBusy(true);try{const r=await api.get('/api/admin/marketing/trials'+(more?'?cursor='+encodeURIComponent(trialCursor||''):''));setApplications(rows=>more?[...rows,...r.data.items]:r.data.items);setTrialCursor(r.data.nextToken);}catch{setMessage('No se pudieron leer las solicitudes.');}finally{setBusy(false);}}
  async function activate(){setBusy(true);try{const r=await api.post('/api/admin/marketing/trial',trial);setApplications(rows=>rows.map(a=>a.id===trial.leadId?{...a,trialState:'active'}:a));setMessage('Prueba comercial gratuita activada hasta '+new Date(r.data.endAt).toLocaleDateString('es-CL')+'. No se registró una venta.');setTrial({leadId:'',headline:'',detail:'',url:''});}catch{setMessage('No se activó la prueba. Revisa los datos o vuelve a comprobar su estado.');}finally{setBusy(false);}}
  return <section className='tcHouseAdmin' aria-label='Marketing y Monetización'>
    <h2>Marketing y Monetización</h2><h3>Campañas propias</h3><p>Promoción de Trabajo Cerca. Las métricas HOUSE_AD no representan ventas, ingresos ni clientes pagados.</p>
    <p role='status' aria-live='polite'>{message}</p>
    <label>Campaña<select value={selected} disabled={busy} onChange={e=>setSelected(e.target.value)}>{campaigns.map(c=><option key={c.id} value={c.id}>{c.creatives[0]?.title} · {c.status==='active'?'Activa':'Pausada'}</option>)}</select></label>
    <button disabled={busy||!revision||campaigns.length>=24} onClick={()=>{const c=structuredClone(HOUSE_DEFAULTS[0]);c.id='house-'+crypto.randomUUID();c.status='paused';setCampaigns([...campaigns,c]);setSelected(c.id);}}>Crear campaña</button>
    {current&&<fieldset disabled={busy}><legend>Configuración · HOUSE_AD</legend>
      <div className='tcHouseFields'>
        <label>Estado<select value={current.status} onChange={e=>update({status:e.target.value as HouseCampaign['status']})}><option value='active'>Activa</option><option value='paused'>Pausada</option></select></label>
        <label>Destino real<select value={current.goal} onChange={e=>update({goal:e.target.value as HouseCampaign['goal']})}><option value='professional'>Publicación de servicios / oficio</option><option value='advertiser'>Solicitud de publicidad gratuita</option><option value='employer'>Publicación de oportunidad</option><option value='explore'>Explorar oportunidades</option></select></label>
        <label>Comunas, separadas por coma; vacío = zona completa<input value={current.communes.join(', ')} onChange={e=>update({communes:split(e.target.value)})}/></label>
        <label>Categorías, separadas por coma; vacío = todas<input value={current.categories.join(', ')} onChange={e=>update({categories:split(e.target.value)})}/></label>
        <label>Páginas<select value={current.pages.join(',')} onChange={e=>update({pages:split(e.target.value)})}><option value='home,people,needs,services'>Todas las vistas públicas</option><option value='home'>Inicio y ofertas</option><option value='people'>Profesionales</option><option value='needs'>Empleadores</option><option value='services'>Servicios</option></select></label>
        <label>Ubicaciones<select value={current.placements.join(',')} onChange={e=>update({placements:e.target.value.split(',') as HouseCampaign['placements']})}><option value='search,listing'>Bajo buscador y dentro de resultados</option><option value='search'>Bajo buscador</option><option value='listing'>Dentro de resultados</option></select></label>
        <label>Inicio UTC; vacío = sin límite<input type='datetime-local' value={current.startAt?.slice(0,16)||''} onChange={e=>update({startAt:e.target.value?new Date(e.target.value+'Z').toISOString():null})}/></label>
        <label>Fin UTC; vacío = permanente<input type='datetime-local' value={current.endAt?.slice(0,16)||''} onChange={e=>update({endAt:e.target.value?new Date(e.target.value+'Z').toISOString():null})}/></label>
        <label>Prioridad inicial<input type='number' min='0' max='100' value={current.priority} onChange={e=>update({priority:Number(e.target.value)})}/></label>
        <label>Máximo de impresiones por sesión<input type='number' min='1' max='20' value={current.maxPerSession} onChange={e=>update({maxPerSession:Number(e.target.value)})}/></label>
      </div>
      {current.creatives.map((v,index)=><details key={v.id} open={index===0}><summary>Creatividad {index+1} · {v.id}</summary>
        <label>Título<input maxLength={100} value={v.title} onChange={e=>creative(index,{title:e.target.value})}/></label>
        <label>Mensaje en computador<textarea maxLength={300} value={v.message} onChange={e=>creative(index,{message:e.target.value})}/></label>
        <label>Mensaje en celular<textarea maxLength={150} value={v.mobileMessage} onChange={e=>creative(index,{mobileMessage:e.target.value})}/></label>
        <label>Texto del botón<input maxLength={60} value={v.button} onChange={e=>creative(index,{button:e.target.value})}/></label>
        <label>Imagen opcional, hasta 200 KB<input type='file' accept='image/png,image/jpeg,image/webp' onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file,index);e.target.value='';}}/></label>
        {v.storagePath&&<p>Creatividad guardada. <button type='button' onClick={()=>creative(index,{storagePath:undefined})}>Quitar de esta campaña</button></p>}
      </details>)}
      <button type='button' disabled={current.creatives.length>=4} onClick={()=>update({creatives:[...current.creatives,{...current.creatives[0],id:crypto.randomUUID().slice(0,8)}]})}>Añadir variante para comparar</button>
    </fieldset>}
    <button disabled={busy||!revision} onClick={()=>void save()}>Guardar campañas propias</button>
    <h3>Rendimiento de campañas propias</h3><p>Reportes del navegador y efectos confirmados por el servidor. No son impresiones facturables. Comparación descriptiva de variantes; no acredita significancia estadística. PostHog permanece deshabilitado.</p>
    <div className='tcHouseTable'><table><thead><tr><th>Fecha / campaña / variante</th><th>Impresiones</th><th>Clics / CTR</th><th>Formularios iniciados / guardados</th><th>Perfiles / empleadores</th><th>Anunciantes / pruebas</th></tr></thead><tbody>{stats.map(r=><tr key={r.id}><td>{r.day} · {r.campaignId} · {r.creativeId}</td><td>{r.impression||0}</td><td>{r.click||0} / {r.impression?((r.click||0)/r.impression*100).toFixed(1):'0'}%</td><td>{r.form_started||0} / {r.registration_completed||0}</td><td>{r.profile_published||0} / {r.employer_added||0}</td><td>{r.advertiser_captured||0} / {r.trial_activated||0}</td></tr>)}</tbody></table></div>
    {!stats.length&&<p>Todavía no hay eventos registrados. No se generan métricas de ejemplo.</p>}{cursor&&<button disabled={busy} onClick={()=>void moreStats()}>Cargar más métricas</button>}
    <h3>Pruebas comerciales gratuitas</h3><p>Revisa el texto público antes de activar. La prueba dura 30 días desde la aprobación, sin renovación ni cobro automático.</p>
    <button disabled={busy} onClick={()=>void loadTrials()}>Consultar solicitudes reales</button>
    {applications.map(a=><p key={a.id}>{a.businessName} · {a.commune} · {a.trialState==='active'?'Activada':<button disabled={busy} onClick={()=>setTrial({leadId:a.id,headline:'',detail:'',url:''})}>Revisar solicitud</button>}</p>)}
    {trialCursor&&<button disabled={busy} onClick={()=>void loadTrials(true)}>Cargar más solicitudes</button>}
    {trial.leadId&&<fieldset disabled={busy}><legend>Preparar anuncio revisado</legend><label>Título público<input maxLength={120} value={trial.headline} onChange={e=>setTrial({...trial,headline:e.target.value})}/></label><label>Descripción pública<textarea maxLength={300} value={trial.detail} onChange={e=>setTrial({...trial,detail:e.target.value})}/></label><label>Enlace HTTPS opcional<input type='url' value={trial.url} onChange={e=>setTrial({...trial,url:e.target.value})}/></label><button onClick={()=>void activate()}>Aprobar y activar 30 días gratis</button></fieldset>}
  </section>;
}
