import {CommercialControls} from './commercial-admin';
import { useEffect, useState } from 'react';
import { api, notifications } from '@appdeploy/client';
import { HOUSE_DEFAULTS, type HouseCampaign, type Creative } from '../shared/house-ads';
import './house-advertising.css';
type Metric={id:string;day:string;campaignId:string;creativeId:string;impression?:number;click?:number;form_started?:number;registration_completed?:number;profile_published?:number;employer_added?:number;advertiser_captured?:number;trial_activated?:number;paid_conversion?:number};
type Application={id:string;businessName:string;commune:string;category?:string;presence?:string;contact?:string;note?:string;createdAt?:string;status?:string;trialState?:string;trialCampaignId?:string;trialEndAt?:string;advertisingConsent?:boolean};
const split=(s:string)=>s.split(',').map(v=>v.trim()).filter(Boolean);
export function HouseCampaignAdmin() {
  const [campaigns,setCampaigns]=useState<HouseCampaign[]>([]);
  const [revision,setRevision]=useState('');const [selected,setSelected]=useState('');
  const [stats,setStats]=useState<Metric[]>([]);const [cursor,setCursor]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
  const [applications,setApplications]=useState<Application[]>([]);const [trialCursor,setTrialCursor]=useState<string|null>(null);
  const [trial,setTrial]=useState({leadId:'',headline:'',detail:'',url:''});
  useEffect(()=>{let alive=true;void api.get('/api/admin/marketing/house').then(r=>{if(alive){setCampaigns(r.data.campaigns);setRevision(r.data.revision);setSelected(r.data.campaigns[0]?.id||'');setStats(r.data.stats);setCursor(r.data.nextToken);}}).catch(()=>{if(alive)setMessage('No se pudo cargar Marketing. Verifica tu sesión y recarga.');});return()=>{alive=false;};},[]);

  const [pushEnabled,setPushEnabled]=useState(false);
  useEffect(()=>{let alive=true;
    const reload=()=>api.get('/api/admin/marketing/trials').then(r=>{if(alive){setApplications(Array.isArray(r.data.items)?r.data.items:[]);setTrialCursor(r.data.nextToken||null);}}).catch(()=>{if(alive)setMessage('No se pudo leer la bandeja comercial. Revisa tu sesión.');});
    void reload();
    void api.get('/api/admin/marketing/notifications').then(r=>{if(alive)setPushEnabled(Boolean(r.data.enabled));}).catch(()=>undefined);
    const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void reload();},90000);
    return()=>{alive=false;window.clearInterval(timer);};
  },[]);
  async function reviewLead(id:string,status:'new'|'in_review'|'rejected'){
    if(status==='rejected'&&!window.confirm('¿Rechazar esta solicitud? No se publicará.'))return;
    setBusy(true);try{await api.put('/api/admin/marketing/trials',{id,status});setMessage(status==='rejected'?'Solicitud rechazada.':status==='in_review'?'En revisión.':'Solicitud reabierta.');await loadTrials();}catch{setMessage('No se guardó la decisión. Vuelve a consultar antes de reintentar.');}finally{setBusy(false);}
  }
  async function enablePush(){
    setBusy(true);try{await notifications.subscribe();await api.post('/api/admin/marketing/notifications',{enabled:true});setPushEnabled(true);setMessage('Alertas comerciales habilitadas cuando el dispositivo permita notificaciones.');}catch{setMessage('No se pudieron activar alertas push. Puedes seguir revisando la bandeja.');}finally{setBusy(false);}
  }

  const [imageStoragePath,setImageStoragePath]=useState('');
  const [imagePreview,setImagePreview]=useState('');
  const [imageBusy,setImageBusy]=useState(false);
  const [whatsAppNumber,setWhatsAppNumber]=useState('');
  const [publicWhatsAppApproved,setPublicWhatsAppApproved]=useState(false);
  const [imageMessage,setImageMessage]=useState('');
  const pendingTrial=applications.find(row=>row.id===trial.leadId);
  const normalizedWhatsApp=(phone:string)=>{
    const digits=phone.replace(/\D/g,'');
    const normalized=digits.length===9&&digits.startsWith('9')?'56'+digits:digits;
    return /^569\d{8}$/.test(normalized)?normalized:'';
  };
  function draftFor(a:Application){
    const business=a.businessName.trim().slice(0,90);
    const category=(a.category||'comercio y servicios').trim().toLowerCase();
    const town=a.commune.trim();
    return {
      leadId:a.id,
      headline:('Conoce '+business+' en '+town).slice(0,120),
      detail:(business+' · '+category+' en '+town+'. Consulta directamente sus productos, servicios y condiciones de atención.').slice(0,300),
      url:'',
    };
  }
  async function generateVisual(a:Application){
    setImageBusy(true);setImageMessage('');
    try{
      const canvas=document.createElement('canvas');canvas.width=640;canvas.height=400;
      const ctx=canvas.getContext('2d');if(!ctx)throw Error('No se pudo crear el diseño.');
      const bg=ctx.createLinearGradient(0,0,640,400);bg.addColorStop(0,'#072d20');bg.addColorStop(1,'#2e7750');
      ctx.fillStyle=bg;ctx.fillRect(0,0,640,400);
      ctx.globalAlpha=.18;ctx.fillStyle='#b9f266';ctx.beginPath();ctx.arc(580,45,210,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(55,360,180,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
      ctx.fillStyle='#ceef89';ctx.fillRect(40,40,90,6);ctx.fillStyle='#e5f7dc';ctx.font='600 18px Arial, sans-serif';ctx.fillText('NEGOCIO LOCAL · '+a.commune.toLocaleUpperCase('es-CL').slice(0,20),40,85,540);
      ctx.fillStyle='#ffffff';ctx.font='bold 44px Arial, sans-serif';ctx.fillText(a.businessName.trim().slice(0,75),40,174,548);
      ctx.fillStyle='#dbebc8';ctx.font='23px Arial, sans-serif';ctx.fillText((a.category||'Productos y servicios locales').slice(0,70),40,220,545);
      ctx.fillStyle='#c2f16b';ctx.beginPath();ctx.roundRect(40,275,294,64,16);ctx.fill();
      ctx.fillStyle='#102f21';ctx.font='bold 21px Arial, sans-serif';ctx.fillText('Consulta disponibilidad',60,315,255);
      ctx.strokeStyle='#b3e5a0';ctx.lineWidth=3;ctx.beginPath();ctx.arc(565,302,26,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(565,277);ctx.lineTo(565,327);ctx.moveTo(540,302);ctx.lineTo(590,302);ctx.stroke();
      const data=canvas.toDataURL('image/jpeg',.75);
      const content=data.split(',')[1];
      if(content.length>265000)throw Error('La imagen generada superó el tamaño permitido.');
      const r=await api.post('/api/admin/marketing/creative',{content,mime:'image/jpeg'});
      if(!r.data?.storagePath)throw Error('No se confirmó la imagen.');
      setImageStoragePath(r.data.storagePath);setImagePreview(data);
      setImageMessage('Imagen ilustrativa creada y preparada. No es una foto real del negocio.');
    }catch{setImageMessage('No fue posible generar la imagen. Puedes adjuntar una fotografía autorizada o publicar un anuncio con diseño gráfico sin foto.');}
    finally{setImageBusy(false);}
  }
  async function uploadCommercialVisual(file:File){
    if(file.size>200000||!['image/jpeg','image/png','image/webp'].includes(file.type)){setImageMessage('Archivo inválido: usa JPEG, PNG o WebP hasta 200 KB.');return;}
    setImageBusy(true);
    try{
      const data=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=reject;r.readAsDataURL(file);});
      const result=await api.post('/api/admin/marketing/creative',{content:data.split(',')[1],mime:file.type});
      if(!result.data?.storagePath)throw Error('Imagen no confirmada.');
      setImageStoragePath(result.data.storagePath);setImagePreview(data);setImageMessage('Imagen adjuntada. Confirma que tienes autorización para usarla.');
    }catch{setImageMessage('No fue posible adjuntar la imagen. Revisa tamaño y formato.');}
    finally{setImageBusy(false);}
  }
  function prepareTrial(a:Application){
    setTrial(draftFor(a));
    setImageStoragePath('');setImagePreview('');setImageMessage('');
    setWhatsAppNumber(normalizedWhatsApp(a.contact||''));setPublicWhatsAppApproved(false);
    void generateVisual(a);
  }

  const current=campaigns.find(c=>c.id===selected);
  function update(patch:Partial<HouseCampaign>){setCampaigns(all=>all.map(c=>c.id===selected?{...c,...patch}:c));}
  function creative(index:number,patch:Partial<Creative>){if(current)update({creatives:current.creatives.map((c,i)=>i===index?{...c,...patch}:c)});}
  async function save(){setBusy(true);setMessage('');try{const r=await api.put('/api/admin/marketing/house',{revision,campaigns});setRevision(r.data.revision);setCampaigns(r.data.campaigns);setMessage('Campañas guardadas. La configuración se aplicará en las siguientes visitas.');}catch{setMessage('No se guardó. Puede haber cambios de otra sesión o datos inválidos; recarga antes de sobrescribir.');}finally{setBusy(false);}}
  async function upload(file:File,index:number){if(file.size>200000){setMessage('Usa una imagen hasta 200 KB.');return;}setBusy(true);try{const content=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=reject;r.readAsDataURL(file);});const r=await api.post('/api/admin/marketing/creative',{content,mime:file.type});creative(index,{storagePath:r.data.storagePath});setMessage('Imagen guardada. Guarda también la campaña para asociarla.');}catch{setMessage('No se pudo guardar la imagen. Usa PNG, JPEG o WebP válido.');}finally{setBusy(false);}}
  async function moreStats(){setBusy(true);try{const r=await api.get('/api/admin/marketing/house?cursor='+encodeURIComponent(cursor||''));setStats(rows=>[...rows,...r.data.stats]);setCursor(r.data.nextToken);}catch{setMessage('No se completó la lectura de métricas.');}finally{setBusy(false);}}
  async function loadTrials(more=false){setBusy(true);try{const r=await api.get('/api/admin/marketing/trials'+(more?'?cursor='+encodeURIComponent(trialCursor||''):''));setApplications(rows=>more?[...rows,...r.data.items]:r.data.items);setTrialCursor(r.data.nextToken);}catch{setMessage('No se pudieron leer las solicitudes.');}finally{setBusy(false);}}
  async function activate(){
    if(imageBusy){setMessage('La imagen todavía se está preparando.');return;}
    if(publicWhatsAppApproved&&!normalizedWhatsApp(whatsAppNumber)){setMessage('Ingresa un WhatsApp móvil chileno válido antes de activar el contacto público.');return;}
    if(publicWhatsAppApproved&&!window.confirm('Confirmas que el negocio autorizó expresamente publicar este WhatsApp comercial?'))return;
    const url=publicWhatsAppApproved?'https://wa.me/'+normalizedWhatsApp(whatsAppNumber):trial.url;
    const payload={...trial,url,imageStoragePath:imageStoragePath||undefined,publicWhatsAppApproved};
    setBusy(true);try{const r=await api.post('/api/admin/marketing/trial',payload);setApplications(rows=>rows.map(a=>a.id===trial.leadId?{...a,trialState:'active'}:a));setMessage('Prueba comercial gratuita activada hasta '+new Date(r.data.endAt).toLocaleDateString('es-CL')+'. No se registró una venta.');await loadTrials();setTrial({leadId:'',headline:'',detail:'',url:''});}catch(cause:unknown){const failure=cause as {response?:{data?:{error?:string}};message?:string};setMessage('No se activó la prueba: '+(failure.response?.data?.error||failure.message||'Revisa lanzamiento y consentimiento.'));}finally{setBusy(false);}}
  return <section className='tcHouseAdmin' aria-label='Marketing y Monetización'>
    <h2>Marketing y Monetización</h2>
    <section className='tcCommercialInbox' id='solicitudes-comerciales' aria-label='Solicitudes publicitarias privadas'>
      <header><div><span className='overline'>BANDEJA COMERCIAL</span><h3>Solicitudes publicitarias</h3><p>Revisa solicitudes recibidas y decide antes de activar un anuncio. Los datos de contacto son privados.</p></div><b>{applications.filter(a=>a.status!=='rejected'&&a.trialState!=='active'&&!a.trialCampaignId).length} por revisar (página actual)</b></header>
      <p className='tcCommercialNote'>No hay correo automático configurado. Puedes activar avisos push y la bandeja se consulta al entrar a Administración.</p>
      <div className='tcCommercialActions'><button disabled={busy} onClick={()=>void loadTrials()}>Actualizar solicitudes</button>{!pushEnabled&&<button disabled={busy} onClick={()=>void enablePush()}>Activar avisos administrativos</button>}{pushEnabled&&<span>Push habilitado en tu cuenta</span>}</div>
      {!applications.length&&<p>No hay solicitudes cargadas. Si esperabas una solicitud, pulsa Actualizar solicitudes y revisa los mensajes del panel.</p>}
      {applications.map(a=><article key={a.id} className='tcCommercialLead'>
        <div className='tcCommercialLeadTop'><strong>{a.businessName}</strong><span>{a.trialCampaignId||a.trialState==='active'?'Activada':a.status==='rejected'?'Rechazada':a.status==='in_review'?'En revisión':'Pendiente de revisión'}</span></div>
        <dl><div><dt>Comuna</dt><dd>{a.commune}</dd></div><div><dt>Rubro</dt><dd>{a.category||'No informado'}</dd></div><div><dt>Fecha de ingreso</dt><dd>{a.createdAt?new Date(a.createdAt).toLocaleString('es-CL'):'No informada'}</dd></div><div><dt>Presencia</dt><dd>{a.presence||'No informada'}</dd></div><div><dt>Contacto privado</dt><dd>{a.contact||'No informado'}</dd></div><div><dt>Consentimiento publicitario</dt><dd>{a.advertisingConsent===true?'Registrado':'No acreditado'}</dd></div>{a.note&&<div className='tcCommercialNoteRow'><dt>Mensaje</dt><dd>{a.note}</dd></div>}{a.trialEndAt&&<div><dt>Fin de campaña</dt><dd>{new Date(a.trialEndAt).toLocaleDateString('es-CL')}</dd></div>}</dl>
        {!a.trialCampaignId&&a.trialState!=='active'&&<div className='tcCommercialActions'>{a.status!=='rejected'&&<button disabled={busy||a.status==='in_review'} onClick={()=>void reviewLead(a.id,'in_review')}>Marcar en revisión</button>}{a.status!=='rejected'&&<button disabled={busy||a.advertisingConsent!==true} onClick={()=>prepareTrial(a)}>Crear campaña automáticamente</button>}{a.status!=='rejected'&&<button className='tcCommercialReject' disabled={busy} onClick={()=>void reviewLead(a.id,'rejected')}>Rechazar</button>}{a.status==='rejected'&&<button disabled={busy} onClick={()=>void reviewLead(a.id,'new')}>Reabrir</button>}</div>}
      </article>)}
      {trialCursor&&<button disabled={busy} onClick={()=>void loadTrials(true)}>Cargar más solicitudes</button>}
      {trial.leadId&&<form className='tcCommercialApproval' onSubmit={e=>{e.preventDefault();if(window.confirm('¿Confirmas la aprobación y activación de la promoción gratuita?'))void activate();}}>
        <h4>Propuesta de anuncio preparada</h4>
        <p>Texto e ilustración creados a partir de la solicitud, sin inventar ofertas, precios ni fotografías del negocio. Puedes corregirlos antes de aprobar.</p>
        <div className='tcCampaignPreview' aria-label='Vista previa del anuncio que verá el público'>
          <div className='tcCampaignPreviewArt'>{imagePreview?<img src={imagePreview} alt='Diseño ilustrativo para la campaña'/>:<div><strong>{pendingTrial?.businessName}</strong><small>{pendingTrial?.category} · {pendingTrial?.commune}</small></div>}</div>
          <div className='tcCampaignPreviewCopy'><small>PUBLICIDAD LOCAL · {pendingTrial?.commune}</small><h5>{trial.headline}</h5><p>{trial.detail}</p><span>{publicWhatsAppApproved?'Hablar por WhatsApp':trial.url?'Conocer negocio':'Anuncio informativo'}</span></div>
        </div>
        <p className='tcCampaignImageInfo' role='status'>{imageBusy?'Creando imagen ilustrativa…':imageMessage}</p>
        <div className='tcCommercialActions'><button type='button' disabled={busy||imageBusy||!pendingTrial} onClick={()=>{if(pendingTrial)void generateVisual(pendingTrial);}}>Regenerar diseño gráfico</button><label className='tcCommercialImageUpload'>Usar fotografía del negocio (si está autorizada)<input type='file' disabled={busy||imageBusy} accept='image/jpeg,image/png,image/webp' onChange={e=>{const file=e.target.files?.[0];if(file)void uploadCommercialVisual(file);e.target.value='';}}/></label></div>
        <label>Título público<input required maxLength={120} value={trial.headline} onChange={e=>setTrial({...trial,headline:e.target.value})}/></label>
        <label>Descripción pública<textarea required maxLength={300} value={trial.detail} onChange={e=>setTrial({...trial,detail:e.target.value})}/></label>
        <label className='tcWhatsAppConsent'><input type='checkbox' checked={publicWhatsAppApproved} onChange={e=>setPublicWhatsAppApproved(e.target.checked)}/> <span>Confirmo que el negocio me autorizó expresamente a publicar su WhatsApp como medio de contacto. La solicitud original lo mantenía privado.</span></label>
        <label>WhatsApp comercial (solo si se autorizó)<input type='tel' disabled={!publicWhatsAppApproved} value={whatsAppNumber} placeholder='+56 9 XXXX XXXX' onChange={e=>setWhatsAppNumber(e.target.value)}/></label>
        <label>Enlace público HTTPS (opcional, si no se usa WhatsApp)<input type='url' disabled={publicWhatsAppApproved} placeholder='https://' value={trial.url} onChange={e=>setTrial({...trial,url:e.target.value})}/></label>
        <div className='tcCommercialActions'><button type='submit' disabled={busy||imageBusy}>Aprobar y activar promoción gratuita</button><button type='button' disabled={busy} onClick={()=>setTrial({leadId:'',headline:'',detail:'',url:''})}>Cancelar</button></div>
      </form>}
    </section>
    <h3>Campañas propias</h3><p>Promoción de Trabajo Cerca. Las métricas HOUSE_AD no representan ventas, ingresos ni clientes pagados.</p>
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
    <CommercialControls/>
  </section>;
}
