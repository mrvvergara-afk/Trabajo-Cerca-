import { useEffect, useState } from 'react';
import { api } from '@appdeploy/client';
import { COMMERCIAL_PLACES } from '../shared/commercial-policy';
import { ArrowRight, Check, Eye, ImagePlus, MapPin, Megaphone, Pencil, Save, X } from 'lucide-react';
import './commercial-editor.css';

type Slot = 'search' | 'listing' | 'featured' | 'form';
type Page = 'home' | 'people' | 'needs' | 'services' | 'forms';
type Format = 'featured' | 'compact';

type Campaign = {
  id:string;
  businessName:string;
  headline:string;
  detail:string;
  category:string;
  url?:string;
  ctaLabel?:string;
  status:string;
  communes:string[];
  placements?:Slot[];
  pages?:Page[];
  priority:number;
  format?:Format;
  startAt?:string;
  endAt?:string;
  image?:{storagePath?:string;approved?:boolean};
  imageUrl?:string;
};

type Draft = {
  id:string;
  businessName:string;
  headline:string;
  detail:string;
  category:string;
  url:string;
  ctaLabel:string;
  communes:string[];
  placements:Slot[];
  pages:Page[];
  format:Format;
  priority:number;
  imageStoragePath?:string|null;
  publicWhatsAppApproved:boolean;
};

const PAGES:{id:Page;title:string;description:string}[]=[
  {id:'home',title:'Portada y empleos',description:'Búsqueda de trabajo y ofertas laborales'},
  {id:'people',title:'Perfiles de personas',description:'Personas que ofrecen su trabajo'},
  {id:'needs',title:'Necesidades de trabajadores',description:'Avisos de empresas y particulares'},
  {id:'services',title:'Buscar servicios',description:'Oficios, profesionales y servicios locales'},
  {id:'forms',title:'Formularios de publicación',description:'Franja editorial discreta según localidad seleccionada'},
];
const SPACES:{id:Slot;title:string;description:string}[]=[
  {id:'search',title:'Después del buscador',description:'Tarjeta destacada antes de los resultados'},
  {id:'listing',title:'Entre los resultados',description:'Tarjeta insertada dentro del listado'},
  {id:'featured',title:'Espacio territorial destacado',description:'En el bloque donde aparece Comunidad y Desarrollo Regional'},
  {id:'form',title:'Apoyo local en formularios',description:'Formato delicado del boceto 3, después de la selección de localidad'},
];

function toDraft(row:Campaign):Draft {
  const wa=Boolean(row.url?.startsWith('https://wa.me/'));
  return {
    id:row.id,
    businessName:row.businessName||'',
    headline:row.headline||'',
    detail:row.detail||'',
    category:row.category||'Comercio local',
    url:row.url||'',
    ctaLabel:row.ctaLabel||(wa?'Hablar por WhatsApp':'Conocer negocio'),
    communes:row.communes||[],
    placements:row.placements||['search'],
    pages:row.pages||['home'],
    format:row.format||'featured',
    priority:Number.isInteger(row.priority)?row.priority:0,
    imageStoragePath:undefined,
    publicWhatsAppApproved:false,
  };
}

export function CommercialOverview() {
  const [campaigns,setCampaigns]=useState<Campaign[]>([]);
  const [cursor,setCursor]=useState<string|null>(null);
  const [loading,setLoading]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [checks,setChecks]=useState<Record<string,string>>({});
  const [draft,setDraft]=useState<Draft|null>(null);
  const [localImage,setLocalImage]=useState<string|null>(null);
  const [imageBusy,setImageBusy]=useState(false);

  async function load(more=false) {
    setLoading(true);
    try {
      const path='/api/admin/marketing/campaigns'+(more&&cursor?'?cursor='+encodeURIComponent(cursor):'');
      const response=await api.get(path);
      const rows=Array.isArray(response.data?.items)?response.data.items as Campaign[]:[];
      setCampaigns(old=>more?[...old,...rows]:rows);
      setCursor(response.data?.nextToken||null);
      setLoaded(true);
      setMessage('');
    } catch {
      setMessage('No se pudo consultar la lista de campañas. Verifica tu sesión.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(()=>{void load();},[]);

  function edit(row:Campaign) {
    setDraft(toDraft(row));
    setLocalImage(null);
    setMessage('');
  }

  function change(patch:Partial<Draft>) {
    setDraft(old=>old?{...old,...patch}:old);
  }

  function togglePlace(place:string) {
    if(!draft)return;
    if(place==='Todas') {
      change({communes:draft.communes.includes('Todas')?[]:['Todas']});
      return;
    }
    const selected=draft.communes.filter(p=>p!=='Todas');
    change({communes:selected.includes(place)?selected.filter(p=>p!==place):[...selected,place]});
  }

  function togglePage(page:Page) {
    if(!draft)return;
    if(page==='forms'){
      const enable=!draft.pages.includes('forms');
      change({pages:enable?[...draft.pages,'forms']:draft.pages.filter(p=>p!=='forms'),placements:enable?[...new Set([...draft.placements,'form'])]:draft.placements.filter(p=>p!=='form')});
      return;
    }
    change({pages:draft.pages.includes(page)?draft.pages.filter(p=>p!==page):[...draft.pages,page]});
  }

  function toggleSlot(slot:Slot) {
    if(!draft)return;
    if(slot==='form'){
      const enable=!draft.placements.includes('form');
      change({placements:enable?[...draft.placements,'form']:draft.placements.filter(p=>p!=='form'),pages:enable?[...new Set([...draft.pages,'forms'])]:draft.pages.filter(p=>p!=='forms')});
      return;
    }
    change({placements:draft.placements.includes(slot)?draft.placements.filter(p=>p!==slot):[...draft.placements,slot]});
  }

  async function upload(file:File) {
    if(!draft)return;
    if(file.size>200000||!['image/jpeg','image/png','image/webp'].includes(file.type)){
      setMessage('Usa JPEG, PNG o WebP de hasta 200 KB.');
      return;
    }
    setImageBusy(true);
    try {
      const data=await new Promise<string>((resolve,reject)=>{
        const reader=new FileReader();
        reader.onload=()=>resolve(String(reader.result));
        reader.onerror=()=>reject(new Error('No fue posible leer la imagen.'));
        reader.readAsDataURL(file);
      });
      const response=await api.post('/api/admin/marketing/creative',{
        content:data.split(',')[1],mime:file.type,
      });
      if(typeof response.data?.storagePath!=='string')throw new Error('La imagen no quedó guardada.');
      change({imageStoragePath:response.data.storagePath});
      setLocalImage(data);
      setMessage('Imagen lista para la vista previa. Guarda la campaña para publicarla.');
    } catch {
      setMessage('No se pudo cargar la imagen. Comprueba formato y tamaño.');
    } finally {
      setImageBusy(false);
    }
  }

  async function save() {
    if(!draft)return;
    if(!draft.communes.length||!draft.pages.length||!draft.placements.length){
      setMessage('Debes seleccionar al menos una comuna, sección y espacio.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const response=await api.put('/api/admin/marketing/campaigns/details',draft);
      const confirmed=response.data?.campaign as {id?:string;communes?:string[];pages?:string[];placements?:string[]}|undefined;
      const same=(a:string[]|undefined,b:string[])=>Array.isArray(a)&&a.length===b.length&&a.every(p=>b.includes(p));
      if(!response.data?.saved||!confirmed||confirmed.id!==draft.id||
        !same(confirmed.communes,draft.communes)||!same(confirmed.pages,draft.pages)||!same(confirmed.placements,draft.placements))
        throw new Error('La base de datos no confirmó las ubicaciones seleccionadas. Consulta el registro antes de reintentar.');
      try{localStorage.setItem('tc-commercial-updated',new Date().toISOString());}catch{/* El cambio sigue guardado. */}
      window.dispatchEvent(new Event('tc-commercial-updated'));
      setDraft(null);
      setLocalImage(null);
      setCampaigns(old=>old.map(row=>row.id===draft.id?{...row,...draft,imageUrl:draft.imageStoragePath===null?undefined:(localImage||row.imageUrl)}:row));
      setMessage('Campaña guardada y comprobada en la base de datos. Vuelve a la página pública y selecciona la comuna y sección correspondiente.');
    } catch(cause:unknown) {
      const failure=cause as {response?:{data?:{error?:string;message?:string}}};
      setMessage(failure.response?.data?.error||failure.response?.data?.message||(cause instanceof Error?cause.message:'No se guardaron los cambios. Revisa los campos y vuelve a intentarlo.'));
    } finally {
      setBusy(false);
    }
  }

  async function status(row:Campaign,next:'active'|'paused') {
    if(!window.confirm(next==='paused'?'¿Pausar esta campaña? No se perderán sus datos.':'¿Activar nuevamente esta campaña?'))return;
    setBusy(true);
    try {
      await api.put('/api/admin/marketing/campaigns',{id:row.id,status:next});
      try{localStorage.setItem('tc-commercial-updated',new Date().toISOString());}catch{/* Recuperación por intervalo. */}
      window.dispatchEvent(new Event('tc-commercial-updated'));
      await load();
      setMessage(next==='paused'?'Campaña pausada.':'Campaña activada.');
    } catch {
      setMessage('No se pudo cambiar el estado de la campaña. Revisa su vigencia.');
    } finally {
      setBusy(false);
    }
  }

  async function check(row:Campaign) {
    const place=row.communes?.includes('Mininco')?'Mininco':row.communes?.find(p=>p!=='Todas')||'Todas';
    const pages=row.pages?.length?row.pages:['home'];
    const slots=row.placements?.length?row.placements:['search'];
    setChecks(old=>({...old,[row.id]:'Consultando cada sección asignada en la comuna de referencia…'}));
    try {
      const checks=await Promise.all(pages.map(async page=>{
        const response=await api.get('/api/growth/advertising?place='+encodeURIComponent(place)+'&page='+encodeURIComponent(page)+'&turn=1');
        const chosen=Array.isArray(response.data?.commercial)
          ? response.data.commercial.find((item:Campaign)=>item.id===row.id) as Campaign|undefined : undefined;
        const visible=Boolean(chosen&&slots.every(slot=>chosen.placements?.includes(slot)));
        return {page,visible};
      }));
      const absent=checks.filter(item=>!item.visible).map(item=>PAGES.find(p=>p.id===item.page)?.title||item.page);
      setChecks(old=>({...old,[row.id]:absent.length===0
        ? 'Confirmado en el catálogo público para '+place+': '+pages.length+' secciones y '+slots.length+' espacios. Falta revisar el navegador.'
        : 'No confirmado en '+absent.join(', ')+' para '+place+'. Revisa el estado, prioridad y tiempo de actualización.'}));
    } catch {
      setChecks(old=>({...old,[row.id]:'No se completó la comprobación pública. Inténtalo nuevamente.'}));
    }
  }

  const editingRow=campaigns.find(row=>row.id===draft?.id);
  const previewImage=draft?.imageStoragePath===null?null:localImage||editingRow?.imageUrl||null;
  const previewLink=Boolean(draft?.url.trim());
  const previewCta=draft?.ctaLabel||'Conocer negocio';

  return <section className='tcCommercialOverview' aria-label='Gestión de campañas comerciales'>
    <div className='tcCommercialOverviewHeader'>
      <div>
        <span className='tcEditorEyebrow'>CONTROL COMERCIAL</span>
        <h3>Campañas comerciales</h3>
        <p>Modifica contenidos, cobertura y espacios. Los cambios de esta sección no generan cobros.</p>
      </div>
      <button type='button' onClick={()=>void load()} disabled={loading||busy}>
        {loading?'Actualizando…':'Actualizar campañas'}
      </button>
    </div>
    {message&&<p className='tcCommercialMessage' role='status'>{message}</p>}
    {loaded&&!campaigns.length&&<p>No hay campañas comerciales registradas en la página consultada.</p>}
    <div className='tcCommercialOverviewList'>
      {campaigns.map(row=>{
        const active=row.status==='active'&&Boolean(row.startAt&&row.endAt)&&
          Date.parse(row.startAt!)<=Date.now()&&Date.now()<Date.parse(row.endAt!);
        return <article className='tcCommercialOverviewCard' key={row.id}>
          <div className='tcCampaignHead'>
            <div className='tcCampaignIdentity'>
              <div className='tcCampaignAvatar'>{row.imageUrl?
                <img src={row.imageUrl} alt='' loading='lazy'/>:<Megaphone aria-hidden='true'/>}</div>
              <div><strong>{row.businessName}</strong><small>{row.headline}</small></div>
            </div>
            <span className='tcCampaignState' data-active={active}>{active?'Activa y vigente':row.status==='active'?'Vigencia por revisar':row.status}</span>
          </div>
          <div className='tcCampaignFacts'>
            <span><MapPin aria-hidden='true'/> {row.communes?.includes('Todas')?'Toda la zona':row.communes?.join(', ')||'Sin comuna'}</span>
            <span>{(row.pages||['home']).map(p=>PAGES.find(x=>x.id===p)?.title||p).join(' · ')}</span>
            <span>{(row.placements||['search']).map(p=>SPACES.find(x=>x.id===p)?.title||p).join(' · ')}</span>
          </div>
          <p className='tcCampaignInternal'>Vigencia interna: {row.endAt?new Date(row.endAt).toLocaleDateString('es-CL'):'Sin fecha'} · {row.format==='compact'?'Compacta':'Destacada'}</p>
          <div className='tcCampaignActions'>
            <button type='button' className='tcEditorPrimary' onClick={()=>edit(row)}><Pencil aria-hidden='true'/> Editar anuncio y ubicaciones</button>
            <button type='button' onClick={()=>void check(row)} disabled={busy}><Eye aria-hidden='true'/> Comprobar publicación</button>
            <button type='button' onClick={()=>void status(row,row.status==='active'?'paused':'active')} disabled={busy}>
              {row.status==='active'?'Pausar':'Activar'}
            </button>
          </div>
          {checks[row.id]&&<p className='tcCampaignCheck' role='status'>{checks[row.id]}</p>}
        </article>;
      })}
    </div>
    {cursor&&<button type='button' onClick={()=>void load(true)} disabled={loading}>Cargar más campañas</button>}

    {draft&&<section className='tcEditorPanel' aria-label={'Editar anuncio de '+draft.businessName}>
      <div className='tcEditorSaveBar' role='status'>
        <div><strong>EDICIÓN SIN APLICAR</strong><small>Las casillas y la vista previa no cambian la publicidad hasta que pulses Guardar.</small></div>
        <button type='button' className='tcEditorPrimary' disabled={busy||imageBusy} onClick={()=>void save()}>
          <Save aria-hidden='true'/>{busy?'Comprobando guardado…':'Guardar y publicar en los espacios elegidos'}</button>
      </div>
      <header className='tcEditorHeader'>
        <div><span className='tcEditorEyebrow'>EDITOR DE CAMPAÑAS</span><h3>{draft.businessName}</h3><p>Elige en qué comunas y secciones aparecerá el anuncio. Puedes seleccionar varias.</p></div>
        <button type='button' onClick={()=>{setDraft(null);setLocalImage(null);}} disabled={busy||imageBusy} aria-label='Cerrar editor'><X aria-hidden='true'/> Cerrar</button>
      </header>

      <div className='tcEditorLayout'>
        <div className='tcEditorFields'>
          <fieldset><legend>1. Contenido del anuncio</legend>
            <label>Nombre del negocio
              <input value={draft.businessName} maxLength={120} onChange={e=>change({businessName:e.target.value})}/>
            </label>
            <label>Rubro
              <input value={draft.category} maxLength={90} onChange={e=>change({category:e.target.value})}/>
            </label>
            <label>Título principal
              <input value={draft.headline} maxLength={120} onChange={e=>change({headline:e.target.value})}/>
            </label>
            <label>Descripción
              <textarea value={draft.detail} maxLength={300} rows={3} onChange={e=>change({detail:e.target.value})}/>
            </label>
            <label>Texto del botón
              <input value={draft.ctaLabel} maxLength={38} onChange={e=>change({ctaLabel:e.target.value})}/>
            </label>
            <label>Enlace HTTPS o WhatsApp comercial
              <input type='url' value={draft.url} placeholder='https://...' onChange={e=>change({url:e.target.value})}/>
            </label>
            {draft.url.startsWith('https://wa.me/')&&draft.url!==editingRow?.url&&
              <label className='tcEditorConsent'><input type='checkbox' checked={draft.publicWhatsAppApproved} onChange={e=>change({publicWhatsAppApproved:e.target.checked})}/>
                Confirmo que el cliente autorizó publicar este nuevo número WhatsApp.</label>}
            <div className='tcEditorMedia'>
              <label className='tcEditorUpload'><ImagePlus aria-hidden='true'/> Cambiar fotografía o logotipo
                <input type='file' accept='image/png,image/jpeg,image/webp' disabled={imageBusy||busy}
                  onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file);e.target.value='';}}/>
              </label>
              <small>JPG, PNG o WebP, máximo 200 KB. Usa solo imágenes autorizadas.</small>
              {previewImage&&<button type='button' onClick={()=>{change({imageStoragePath:null});setLocalImage(null);}}>Quitar imagen del anuncio</button>}
            </div>
          </fieldset>

          <fieldset><legend>2. Cobertura territorial</legend>
            <p>Para ver el anuncio, el visitante debe elegir una de estas comunas. Con el filtro inicial «Todas» solo aparecen campañas configuradas para «Toda la zona». Mininco pertenece a Collipulli.</p>
            <div className='tcEditorOptions'>
              {['Todas',...COMMERCIAL_PLACES].map(place=>
                <label key={place} className='tcEditorOption'>
                  <input type='checkbox' checked={draft.communes.includes(place)} onChange={()=>togglePlace(place)}/>
                  <span>{place==='Todas'?'Toda la zona':place}</span>
                </label>)}
            </div>
          </fieldset>

          <fieldset><legend>3. Secciones donde aparecerá</legend>
            <div className='tcEditorChoices'>
              {PAGES.map(page=><label key={page.id} className='tcEditorChoice'>
                <input type='checkbox' checked={draft.pages.includes(page.id)} onChange={()=>togglePage(page.id)}/>
                <span><strong>{page.title}</strong><small>{page.description}</small></span>
              </label>)}
            </div>
          </fieldset>

          <fieldset><legend>4. Espacios dentro de cada sección</legend>
            <div className='tcEditorChoices'>
              {SPACES.map(slot=><label key={slot.id} className='tcEditorChoice'>
                <input type='checkbox' checked={draft.placements.includes(slot.id)} onChange={()=>toggleSlot(slot.id)}/>
                <span><strong>{slot.title}</strong><small>{slot.description}</small></span>
              </label>)}
            </div>
            <p className='tcEditorHint'>La ubicación «Espacio territorial destacado» es la que sustituye el banner «Comunidad y Desarrollo Regional» en las comunas y secciones seleccionadas.</p>
          </fieldset>

          <fieldset><legend>5. Presentación</legend>
            <div className='tcEditorDual'>
              <label>Formato visual
                <select value={draft.format} onChange={e=>change({format:e.target.value as Format})}>
                  <option value='featured'>Destacada · horizontal</option>
                  <option value='compact'>Compacta · resultados</option>
                </select>
              </label>
              <label>Prioridad (0–100)
                <input type='number' min={0} max={100} value={draft.priority} onChange={e=>change({priority:Number(e.target.value)})}/>
              </label>
            </div>
          </fieldset>
        </div>

        <aside className='tcEditorPreview'>
          <div className='tcPreviewHeading'><Eye aria-hidden='true'/><strong>Vista previa del anuncio</strong><span>BORRADOR · NO PUBLICADO</span></div>
          <div className='tcPreviewCard' data-format={draft.format}>
            <span className='tcPreviewAdLabel'><Megaphone aria-hidden='true'/> PUBLICIDAD LOCAL · {draft.communes.includes('Todas')?'Zona completa':draft.communes[0]||'Comuna por elegir'}</span>
            <div className='tcPreviewBody'>
              <div className='tcPreviewImage'>{previewImage?<img src={previewImage} alt='Vista previa del diseño comercial'/>:<span>{draft.businessName.slice(0,1)||'T'}</span>}</div>
              <div className='tcPreviewCopy'>
                <span>{draft.category}</span>
                <h4>{draft.businessName||'Nombre del negocio'}</h4>
                <strong>{draft.headline||'Título del anuncio'}</strong>
                <p>{draft.detail||'Descripción del anuncio'}</p>
              </div>
            </div>
            <div className='tcPreviewAction'>{previewLink?<span>{previewCta}<ArrowRight aria-hidden='true'/></span>:<small>Sin botón: falta un enlace público</small>}</div>
          </div>
          <div className='tcPreviewSummary'>
            <p><Check aria-hidden='true'/> {draft.communes.includes('Todas')?'Toda la zona':draft.communes.length+' localidades seleccionadas'}</p>
            <p><Check aria-hidden='true'/> {draft.pages.length} secciones y {draft.placements.length} espacios</p>
            <p>Vigencia original: {editingRow?.endAt?new Date(editingRow.endAt).toLocaleDateString('es-CL'):'Sin información'} (solo para administración)</p>
          </div>
        </aside>
      </div>

      <footer className='tcEditorFooter'>
        <span>Los cambios no activan cobros ni amplían automáticamente la duración de la campaña.</span>
        <button type='button' onClick={()=>{setDraft(null);setLocalImage(null);}} disabled={busy}>Cancelar</button>
        <button type='button' className='tcEditorPrimary' onClick={()=>void save()} disabled={busy||imageBusy}>
          <Save aria-hidden='true'/>{busy?'Guardando…':'Guardar cambios y ubicaciones'}
        </button>
      </footer>
    </section>}
  </section>;
}
