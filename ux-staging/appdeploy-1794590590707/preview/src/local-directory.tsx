import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, auth } from '@appdeploy/client';
import './local-directory.css';

type Kind = 'service' | 'business';
type DirectoryKind = Kind | 'all';
type PhotoViewer = { photos: string[]; index: number; title: string } | null;
type Reviewer = { email: string } | null;
type Listing = {
  id: string; kind: Kind; title: string; category: string; description: string;
  commune: string; coverage: string[]; photos: string[]; reviewCount: number;
  rating: number | null; contactAvailable: boolean;
};
type OwnerReceipt = {
  id:string; title:string; commune:string; kind:Kind;
  status:'pending'|'approved'|'hidden'; photosCount:number;
  category?:string; description?:string; previewPhotos?:string[];
};

type AdminQueue = {
  entries: Array<Listing & { status: string; email: string; phone: string }>;
  reviews: Array<{ id: string; entryId: string; rating: number }>;
  reports: Array<{ id: string; entryId: string; reason: string }>;
};
const PLACES = [
  'Angol', 'Collipulli', 'Ercilla', 'Lumaco', 'Los Sauces', 'Purén',
  'Renaico', 'Traiguén', 'Victoria', 'Mulchén', 'Negrete', 'Nacimiento',
];
function prepareImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/') || file.size > 6 * 1024 * 1024)
    return Promise.reject(new Error('Solo fotografías de hasta 6 MB.'));
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        const scale = Math.min(1, 960 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('No se pudo procesar la fotografía.');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL('image/jpeg', 0.74).split(',')[1];
        if (data.length > 310000)
          throw new Error('La fotografía sigue demasiado grande después de optimizarla.');
        resolve(data);
      } catch (cause) {
        reject(cause);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No fue posible abrir la imagen.'));
    };
    image.src = url;
  });
}
export function LocalDirectory({ place, initialKind, startWithForm=false, onClose }: {
  place: string; initialKind: DirectoryKind; startWithForm?:boolean; onClose: () => void;
}) {
  const [kind, setKind] = useState<DirectoryKind>(initialKind);
  const [formKind,setFormKind] = useState<Kind>(initialKind==='business'?'business':'service');
  const [listings, setListings] = useState<Listing[]>([]);
  const [searchText,setSearchText] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [commune, setCommune] = useState(PLACES.includes(place) ? place : '');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [showPhone, setShowPhone] = useState(true);
  const [showEmail, setShowEmail] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [consent, setConsent] = useState(false);
  const [contacts, setContacts] = useState<Record<string, {phone: string | null; email: string | null}>>({});
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [reviewer, setReviewer] = useState<Reviewer>(null);
  const [loginBusy, setLoginBusy] = useState(false);
  const [rating, setRating] = useState(0);
  const [hired, setHired] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [reportEmail, setReportEmail] = useState('');
  const [reportReason, setReportReason] = useState('Información incorrecta');
  const [ownedReceipts, setOwnedReceipts] = useState<OwnerReceipt[]>([]);
  const [submissionError, setSubmissionError] = useState('');
  const [ownedLookupError,setOwnedLookupError] = useState(false);
  const [photoViewer,setPhotoViewer] = useState<PhotoViewer>(null);
  const photoOrigin = useRef<HTMLButtonElement|null>(null);
  const gestureStart = useRef<number|null>(null);

  function openPhotos(photos:string[],index:number,title:string,button:HTMLButtonElement){
    photoOrigin.current=button;
    setPhotoViewer({photos,index,title});
  }
  function movePhoto(offset:number){
    setPhotoViewer(current=>current?{...current,index:(current.index+offset+current.photos.length)%current.photos.length}:null);
  }
  useEffect(()=>{
    if(!photoViewer)return;
    const was=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape')setPhotoViewer(null);
      if(event.key==='ArrowLeft')movePhoto(-1);
      if(event.key==='ArrowRight')movePhoto(1);
    };
    window.addEventListener('keydown',onKey);
    return()=>{
      document.body.style.overflow=was;
      window.removeEventListener('keydown',onKey);
      photoOrigin.current?.focus({preventScroll:true});
    };
  },[Boolean(photoViewer)]);
  useEffect(()=>{
    let active=true;
    void auth.getUser().then(user=>{
      if(active)setReviewer(user?.email?{email:user.email}:null);
    }).catch(()=>{if(active)setReviewer(null);});
    return()=>{active=false;};
  },[]);
  useEffect(()=>{
    if(!reviewer?.email || !listings.length)return;
    try{
      const saved=sessionStorage.getItem('tc_review_intent');
      const intent=saved?JSON.parse(saved) as {id:string;rating?:number}:null;
      if(!intent?.id)return;
      const match=listings.some(entry=>entry.id===intent.id&&entry.kind==='service');
      if(!match)return;
      setReviewId(intent.id);
      setRating(intent.rating&&intent.rating>=1&&intent.rating<=5?intent.rating:0);
      sessionStorage.removeItem('tc_review_intent');
    }catch{try{sessionStorage.removeItem('tc_review_intent');}catch{/* no storage */}}
  },[reviewer?.email,listings]);
  async function loginToReview(){
    if(!reviewId)return;
    try{
      sessionStorage.setItem('tc_review_intent',JSON.stringify({id:reviewId,rating}));
      setLoginBusy(true);
      await auth.signInWithRedirect({scope:'openid email offline_access'});
    }catch{
      setNotice('No se pudo iniciar la verificación del correo. Puedes reintentar.');
      setLoginBusy(false);
    }
  }

  // Each owner receipt is read with an unguessable token already saved on the
  // same device. No public listing or contact details are exposed here.
  const refreshOwnedReceipts = async () => {
    const owned: Array<{id:string;token:string}> = [];
    try {
      for (let i=0;i<localStorage.length && owned.length<40;i++) {
        const key=localStorage.key(i);
        if (key?.startsWith('tc_directory_owner_local_')) {
          const token=localStorage.getItem(key);
          const id=key.slice('tc_directory_owner_'.length);
          if (token && /^local_[a-f0-9-]{36}$/.test(id))
            owned.push({id,token});
        }
      }
    } catch { return; }
    setOwnedLookupError(false);
    const records = await Promise.all(owned.map(async ({id,token}) => {
      try {
        const result=await api.post('/api/local-directory/'+id+'/status',{ownerToken:token});
        return result.data as OwnerReceipt;
      } catch { return null; }
    }));
    setOwnedLookupError(records.some(value=>!value));
    setOwnedReceipts(records.filter((entry):entry is OwnerReceipt=>Boolean(entry)));
  };
  useEffect(() => { void refreshOwnedReceipts(); }, []);

  useEffect(() => {
    setKind(initialKind);
    if (initialKind!=='all') setFormKind(initialKind);
  }, [initialKind]);
  useEffect(() => { if(startWithForm) setShowForm(true); },[startWithForm]);
  useEffect(() => {
    let mounted = true;
    void api.get('/api/local-directory?kind=' + kind + '&place=' + encodeURIComponent(place))
      .then(response => {
        if (mounted) setListings(Array.isArray(response.data.items) ? response.data.items : []);
      }).catch(() => {
        if (mounted) setNotice('No fue posible consultar el directorio.');
      });
    return () => { mounted = false; };
  }, [kind, place]);
  const visibleListings = listings.filter(entry => [entry.title,entry.category,entry.description]
    .some(value=>value.toLocaleLowerCase('es-CL').includes(searchText.trim().toLocaleLowerCase('es-CL'))));
  const refresh = async () => {
    const response = await api.get('/api/local-directory?kind=' + kind + '&place=' + encodeURIComponent(place));
    setListings(Array.isArray(response.data.items) ? response.data.items : []);
  };
  async function publish(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    setSubmissionError('');
    try {
      const gallery = await Promise.all(photos.slice(0, 3).map(prepareImage));
      const response = await api.post('/api/local-directory', {
        kind:formKind, title, category, description, commune, phone, email,
        photos: gallery, showPhone, showEmail, consent,
      });
      if (!response.data.pendingModeration) throw new Error('No se confirmó la publicación.');
      try {
        localStorage.setItem('tc_directory_owner_' + response.data.id, response.data.ownerToken);
      } catch {
        // The private owner token is optional on devices without local storage.
      }
      setTitle('');
      setCategory('');
      setDescription('');
      setPhone('');
      setEmail('');
      setPhotos([]);
      setConsent(false);
      setShowForm(false);
      setNotice('Ficha recibida: pendiente de aprobación. Revisa el estado en «Mis publicaciones enviadas».');
      setOwnedReceipts(previous => [{
        id:response.data.id, title, commune, kind:formKind, status:'pending', photosCount:gallery.length,
        category, description,
      },...previous.filter(entry=>entry.id!==response.data.id)]);
      setKind('all');
      void refreshOwnedReceipts();
    } catch (cause) {
      const message=cause instanceof Error ? cause.message : 'No se pudo enviar la ficha.';
      setNotice(message);
      setSubmissionError(message);
    } finally {
      setBusy(false);
    }
  }
  async function reveal(id: string) {
    try {
      const response = await api.post('/api/local-directory/' + id + '/contact', {});
      setContacts(previous => ({ ...previous, [id]: response.data }));
    } catch {
      setNotice('El contacto no está disponible.');
    }
  }
  async function review(event: FormEvent) {
    event.preventDefault();
    if (!reviewId) return;
    setBusy(true);
    try {
      if(!reviewer?.email)throw new Error('Debes confirmar tu correo antes de evaluar.');
      await api.post('/api/local-directory/' + reviewId + '/reviews', {rating,hired});
      setNotice('Evaluación recibida para moderación. No se considera contratación verificada.');
      setHired(false);
      setRating(0);
      setReviewId(null);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'No se pudo registrar la evaluación.');
    } finally {
      setBusy(false);
    }
  }
  async function report(event: FormEvent) {
    event.preventDefault();
    if (!reportId) return;
    setBusy(true);
    try {
      await api.post('/api/local-directory/' + reportId + '/report', {
        email: reportEmail, reason: reportReason,
      });
      setNotice('Denuncia recibida para revisión.');
      setReportId(null);
      setReportEmail('');
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'No se pudo registrar la denuncia.');
    } finally {
      setBusy(false);
    }
  }
  async function removeOwn(id: string) {
    const ownerToken = localStorage.getItem('tc_directory_owner_' + id);
    if (!ownerToken || !window.confirm('¿Retirar la ficha y las imágenes publicadas?')) return;
    setBusy(true);
    try {
      await api.post('/api/local-directory/' + id + '/delete', { ownerToken });
      localStorage.removeItem('tc_directory_owner_' + id);
      await refresh();
      setNotice('Ficha retirada.');
    } catch {
      setNotice('No se pudo retirar la publicación.');
    } finally {
      setBusy(false);
    }
  }

  return <section id='local-directory' className='tcLocalDirectory' aria-label='Directorio local'>
    <div className='tcDirectoryTop'>
      <div>
        <small>LA VITRINA DE NUESTRA COMUNIDAD</small>
        <h2>Directorio local</h2>
        <p>Encuentra soldadores, pastelería, servicios y negocios de tu comuna.</p>
      </div>
      <button type='button' aria-label='Cerrar directorio' title='Cerrar directorio' onClick={onClose}>×</button>
    </div>
    <div className='tcDirectoryTabs' role='group' aria-label='Filtrar el directorio'>
      <button type='button' className={kind==='all'?'active':''}
        aria-pressed={kind==='all'} onClick={()=>setKind('all')}>Todos</button>
      <button type='button' className={kind === 'service' ? 'active' : ''}
        aria-pressed={kind === 'service'} onClick={() => setKind('service')}>
        Servicios
      </button>
      <button type='button' className={kind === 'business' ? 'active' : ''}
        aria-pressed={kind === 'business'} onClick={() => setKind('business')}>
        Negocios
      </button>
    </div>
    <div className='tcDirectorySummary'>
      <span>Comuna: <strong>{place === 'Todas' ? 'Las 12 comunas' : place}</strong></span>
      <button onClick={() => {if(kind!=='all')setFormKind(kind);setShowForm(previous => !previous);}}>
        {showForm ? 'Cerrar formulario' : 'Publicar servicio o negocio'}
      </button>
    </div>
    <label className='tcDirectorySearch'>Buscar un servicio o negocio
      <input type='search' value={searchText} onChange={event=>setSearchText(event.target.value)}
        placeholder='Ej.: soldadura, tortas, gasfitería' aria-label='Buscar en el directorio'/>
    </label>
    {notice && <p role='status' className='tcDirectoryNotice'>{notice}</p>}
    {ownedLookupError && <p role='alert' className='tcDirectoryNotice'>No se pudo consultar una de tus publicaciones. No la vuelvas a enviar; actualiza el estado o solicita revisión.</p>}
    {ownedReceipts.length>0 && <details className='tcDirectoryOwned' open={ownedReceipts.some(entry=>entry.status==='pending')}>
      <summary>Mis publicaciones enviadas · {ownedReceipts.length}</summary>
      {ownedReceipts.map(entry=><article className='tcDirectoryOwnedPreview' key={entry.id}>
        <div className='tcOwnedPreviewHeader'>
          <strong>{entry.title}</strong>
          <span className={'tcOwnerStatus tcOwnerStatus-'+entry.status}>
            {entry.status==='pending'?'Pendiente de aprobación':entry.status==='approved'?'Aprobada y publicada':'Retirada o rechazada'}
          </span>
        </div>
        <small>{entry.kind==='business'?'Negocio':'Servicio'} · {entry.commune} · {entry.photosCount} foto(s)</small>
        {entry.category && <strong className='tcOwnedPreviewCategory'>{entry.category}</strong>}
        {entry.description && <p>{entry.description}</p>}
        {entry.previewPhotos?.length ? <div className='tcDirectoryPhotos tcDirectoryOwnerPhotos'>
          {entry.previewPhotos.map((url,index)=><button type='button' key={url} className='tcDirectoryPhotoButton'
            aria-label={'Ampliar fotografía '+(index+1)+' de '+entry.title}
            onClick={event=>openPhotos(entry.previewPhotos||[],index,entry.title,event.currentTarget)}>
              <img src={url} alt={'Fotografía '+(index+1)+' de '+entry.title} loading='lazy'/>
            </button>)}
        </div> : null}
        {entry.status==='pending' && <small className='tcOwnedVisibilityNotice'>Esta vista previa solo aparece en tu dispositivo. El público podrá verla cuando se apruebe.</small>}
      </article>)}
      <button type='button' onClick={()=>void refreshOwnedReceipts()}>Actualizar estados</button>
    </details>}
    {showForm && <form className='tcDirectoryForm' onSubmit={event => void publish(event)}>
      <h3>Publicar en el directorio</h3>
      <fieldset className='tcDirectoryKindChoice'>
        <legend>¿Qué quieres publicar?</legend>
        <label><input type='radio' name='local-kind' value='service' checked={formKind==='service'} onChange={()=>setFormKind('service')}/><span>Servicio (soldadura, reparaciones)</span></label>
        <label><input type='radio' name='local-kind' value='business' checked={formKind==='business'} onChange={()=>setFormKind('business')}/><span>Negocio (pastelería, tienda)</span></label>
      </fieldset>
      <p>Solo pedimos teléfono y correo como datos de contacto. No solicitamos CV, RUT ni domicilio.</p>
      <label>{formKind === 'service' ? 'Servicio que ofreces' : 'Nombre del negocio'}
        <input required minLength={3} maxLength={90} value={title} onChange={e => setTitle(e.target.value)} />
      </label>
      <label>Oficio o rubro
        <input required maxLength={60} value={category} onChange={e => setCategory(e.target.value)} />
      </label>
      <label>Descripción del producto o trabajo
        <textarea required minLength={15} maxLength={750} value={description} onChange={e => setDescription(e.target.value)} />
      </label>
      <label>Comuna donde ofreces el servicio o negocio
        <select required value={commune} onChange={e => setCommune(e.target.value)}>
          <option value='' disabled>Selecciona tu comuna</option>
          {PLACES.map(value => <option key={value}>{value}</option>)}
        </select>
      </label>
      <div className='tcDirectoryContactFields'>
        <label>Teléfono
          <input type='tel' required value={phone} onChange={e => setPhone(e.target.value)} placeholder='+56 9 1234 5678' />
        </label>
        <label>Correo electrónico
          <input type='email' required value={email} onChange={e => setEmail(e.target.value)} placeholder='contacto@ejemplo.cl' />
        </label>
      </div>
      <div className='tcDirectoryChecks'>
        <label><input type='checkbox' checked={showPhone} onChange={e => setShowPhone(e.target.checked)} />
          Permitir consultar mi teléfono</label>
        <label><input type='checkbox' checked={showEmail} onChange={e => setShowEmail(e.target.checked)} />
          Permitir consultar mi correo</label>
      </div>
      <label>Fotografías de tus trabajos o productos (hasta 3)
        <input type='file' multiple accept='image/*'
          onChange={e => setPhotos(Array.from(e.target.files ?? []).slice(0, 3))}/>
      </label>
      <small role='status'>{photos.length ? photos.length+' foto(s) seleccionada(s). ' : ''}Las imágenes se optimizan sin metadatos. Usa solo fotografías propias o autorizadas.</small>
      <label className='tcDirectoryConsent'><input type='checkbox' required checked={consent}
          onChange={e => setConsent(e.target.checked)}/>
        Autorizo tratar mi contacto y el contenido voluntario de esta publicación conforme a la política de privacidad.</label>
      {submissionError && <p role='alert' className='tcDirectoryNotice'>{submissionError}</p>}
      <button type='submit' disabled={busy || (!showPhone && !showEmail)}>
        {busy ? 'Enviando…' : 'Enviar para revisión'}
      </button>
    </form>}
    {visibleListings.length > 0 ? <div className='tcDirectoryGrid'>
      {visibleListings.map(entry => <article key={entry.id} className='tcDirectoryCard'>
        {entry.photos.length > 0 && <div className='tcDirectoryPhotos'>
          {entry.photos.map((src,index)=><button type='button' key={src} className='tcDirectoryPhotoButton'
            aria-label={'Ampliar fotografía '+(index+1)+' de '+entry.title}
            onClick={event=>openPhotos(entry.photos,index,entry.title,event.currentTarget)}>
              <img src={src} alt={'Trabajo o producto de '+entry.title+', foto '+(index+1)}
                loading='lazy' width={320} height={220}/>
            </button>)}
        </div>}
        <small><span className='tcDirectoryKindBadge'>{entry.kind==='service'?'Servicio':'Negocio'}</span> · {entry.category} · {entry.commune}</small>
        <h3>{entry.title}</h3>
        <p>{entry.description}</p>
        <span className='tcDirectoryCoverage'>Atiende en: {entry.coverage.join(', ')}</span>
        {entry.kind === 'service' && <span className='tcDirectoryRating'>
          <span className='tcDirectoryRatingStars' aria-hidden='true'>{entry.rating===null?'☆☆☆☆☆':'★★★★★'}</span>
          <span>{entry.rating===null?'Sin calificaciones aún':entry.rating.toFixed(1)+' / 5 · '+entry.reviewCount+' opiniones revisadas'}</span>
        </span>}
        {contacts[entry.id] && <div className='tcDirectoryContact'>
          {contacts[entry.id].phone && <a href={'tel:' + contacts[entry.id].phone}>{contacts[entry.id].phone}</a>}
          {contacts[entry.id].email && <a href={'mailto:' + contacts[entry.id].email}>{contacts[entry.id].email}</a>}
        </div>}
        <div className='tcDirectoryCardActions'>
          {entry.contactAvailable && <button onClick={() => void reveal(entry.id)}>Ver contacto</button>}
          {entry.kind === 'service' && !localStorage.getItem('tc_directory_owner_' + entry.id) && <button className='tcRateAction' onClick={() => { setReviewId(entry.id); setRating(0); setHired(false); setReportId(null); }}>
            ★ Calificar servicio
          </button>}
          {!localStorage.getItem('tc_directory_owner_' + entry.id) && <button onClick={() => { setReportId(entry.id); setReviewId(null); }}>Reportar problema</button>}
        </div>
        {localStorage.getItem('tc_directory_owner_' + entry.id) && <details className='tcDirectoryOwnerActions'>
          <summary>Gestionar mi ficha</summary>
          <button className='tcDirectoryRemove' onClick={() => void removeOwn(entry.id)}>Retirar mi ficha</button>
        </details>}
        {reviewId===entry.id && <form className='tcDirectoryForm tcDirectoryReviewForm' onSubmit={event=>void review(event)}>
          <h4>¿Cómo calificarías este servicio?</h4>
          <div className='tcDirectoryStars' role='radiogroup' aria-label='Elige de 1 a 5 estrellas'>
            {[1,2,3,4,5].map(value=><button key={value} type='button' role='radio'
              aria-checked={rating===value} aria-label={value+' '+(value===1?'estrella':'estrellas')}
              className={rating>=value?'selected':''} onClick={()=>setRating(value)}>★</button>)}
          </div>
          <p>Elige las estrellas que reflejen tu experiencia. Tu opinión se revisará antes de aparecer.</p>
          {reviewer?.email
            ? <p className='tcDirectoryVerifiedEmail'>Correo confirmado: <strong>{reviewer.email}</strong></p>
            : <button type='button' className='tcDirectoryEmailLogin' disabled={loginBusy}
                onClick={()=>void loginToReview()}>
                {loginBusy?'Abriendo acceso…':'Confirmar mi correo para opinar'}
              </button>}
          <label className='tcDirectoryConsent'><input type='checkbox' checked={hired} required
            onChange={e=>setHired(e.target.checked)}/> Confirmo que contraté este servicio.</label>
          <div className='tcDirectoryReviewActions'>
            <button disabled={busy||rating===0||!hired||!reviewer?.email}>Enviar calificación</button>
            <button type='button' onClick={()=>setReviewId(null)}>Cancelar</button>
          </div>
          <small>No verificamos la contratación. No puedes evaluar tu propia ficha.</small>
        </form>}
        {reportId===entry.id && <form className='tcDirectoryForm tcDirectoryReviewForm' onSubmit={event => void report(event)}>
          <h4>Informar un problema con esta ficha</h4>
          <label>Correo electrónico<input type='email' required value={reportEmail}
            onChange={e => setReportEmail(e.target.value)}/></label>
          <label>¿Qué ocurrió?<select value={reportReason} onChange={e => setReportReason(e.target.value)}>
            {['Información incorrecta','Posible estafa','Imágenes no autorizadas','Otro'].map(value=><option key={value}>{value}</option>)}
          </select></label>
          <div className='tcDirectoryReviewActions'><button disabled={busy}>Enviar reporte</button>
            <button type='button' onClick={() => setReportId(null)}>Cancelar</button></div>
        </form>}
      </article>)}
    </div> : <div className='tcDirectoryEmpty'>
      <strong>{searchText ? 'No hay resultados para esta búsqueda.' : 'Aún no hay fichas aprobadas en esta comuna.'}</strong>
      <p>Las solicitudes enviadas aparecen en «Mis publicaciones enviadas» hasta que se aprueben.</p>
    </div>}
    {photoViewer && <div className='tcPhotoLightbox' role='presentation'
      onMouseDown={event=>{if(event.target===event.currentTarget)setPhotoViewer(null);}}>
      <section role='dialog' aria-modal='true' aria-label={'Fotografías de '+photoViewer.title}
        className='tcPhotoDialog'
        onTouchStart={event=>{gestureStart.current=event.touches[0]?.clientX??null;}}
        onTouchEnd={event=>{
          const x=gestureStart.current;gestureStart.current=null;
          if(x===null)return;
          const moved=(event.changedTouches[0]?.clientX??x)-x;
          if(Math.abs(moved)>45)movePhoto(moved<0?1:-1);
        }}>
        <header><strong>{photoViewer.title}</strong><button type='button' aria-label='Cerrar fotografía'
          onClick={()=>setPhotoViewer(null)}>×</button></header>
        <div className='tcPhotoDialogImage'><img src={photoViewer.photos[photoViewer.index]}
          alt={'Fotografía ampliada '+(photoViewer.index+1)+' de '+photoViewer.title}/></div>
        <footer>
          {photoViewer.photos.length>1 && <button type='button' aria-label='Fotografía anterior'
            onClick={()=>movePhoto(-1)}>‹</button>}
          <span>{photoViewer.index+1} / {photoViewer.photos.length}</span>
          {photoViewer.photos.length>1 && <button type='button' aria-label='Fotografía siguiente'
            onClick={()=>movePhoto(1)}>›</button>}
        </footer>
      </section>
    </div>}
  </section>;
}

/** Moderation is available exclusively in the existing operations panel.
 * This module does not query any admin endpoint on normal public directory visits.
 * Backend still independently enforces requireAuth + administrator allowlist.
 */
export function LocalDirectoryModeration() {
  const [queue,setQueue] = useState<AdminQueue | null>(null);
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState('');
  const refresh = async () => {
    try {
      const response = await api.get('/api/admin/local-directory');
      setQueue(response.data as AdminQueue);
      return true;
    } catch {
      setQueue(null);
      return false;
    }
  };
  useEffect(() => {
    let active=true;
    void auth.getUser().then(user => {
      if (active && user) void refresh();
    }).catch(() => undefined);
    return () => { active=false; };
  },[]);
  async function decide(path:string) {
    setBusy(true);setNotice('');
    try {
      await api.post(path,{});
      await refresh();
      setNotice('Decisión registrada.');
    } catch {
      setNotice('No se pudo completar la decisión.');
    } finally { setBusy(false); }
  }
  if (!queue) return null;
  return <section className='opsCard tcDirectoryAdmin' aria-label='Moderación de servicios y negocios'>
    <h2>Servicios y negocios · Revisión</h2>
    <p>Solo administración. Las fichas pendientes aún no aparecen en el catálogo público.</p>
    <button type='button' onClick={()=>void refresh()} disabled={busy}>Actualizar bandeja</button>
    {notice && <p role='status'>{notice}</p>}
    <p>Fichas pendientes: <strong>{queue.entries.length}</strong>;
      opiniones: <strong>{queue.reviews.length}</strong>;
      denuncias: <strong>{queue.reports.length}</strong>.</p>
    {queue.entries.map(entry=><div className='tcDirectoryAdminRow' key={entry.id}>
      <span><strong>{entry.title}</strong> · {entry.kind==='service'?'Servicio':'Negocio'} · {entry.commune}
        <small>{entry.category} · {entry.email} · {entry.phone}</small>
      </span>
      <button type='button' disabled={busy} onClick={()=>void decide('/api/admin/local-directory/'+entry.id+'/approve')}>Aprobar</button>
      <button type='button' disabled={busy} onClick={()=>void decide('/api/admin/local-directory/'+entry.id+'/hide')}>Rechazar</button>
    </div>)}
    {queue.reviews.map(item=><div className='tcDirectoryAdminRow' key={item.id}>
      <span>Opinión sobre {item.entryId} · {item.rating} puntos · contratación no verificada</span>
      <button disabled={busy} onClick={()=>void decide('/api/admin/local-directory/reviews/'+item.id+'/approve')}>Aprobar opinión</button>
    </div>)}
    {queue.reports.map(item=><div className='tcDirectoryAdminRow' key={item.id}>
      <span>Reporte: {item.reason} · {item.entryId}</span>
      <button disabled={busy} onClick={()=>void decide('/api/admin/local-directory/reports/'+item.id+'/resolve')}>Marcar revisado</button>
    </div>)}
  </section>;
}
