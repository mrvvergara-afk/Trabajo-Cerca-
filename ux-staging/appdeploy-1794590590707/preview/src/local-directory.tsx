import { useEffect, useState, type FormEvent } from 'react';
import { api, auth } from '@appdeploy/client';
import './local-directory.css';

type Kind = 'service' | 'business';
type DirectoryKind = Kind | 'all';
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
  const [commune, setCommune] = useState(PLACES.includes(place) ? place : 'Angol');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [showPhone, setShowPhone] = useState(true);
  const [showEmail, setShowEmail] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [consent, setConsent] = useState(false);
  const [contacts, setContacts] = useState<Record<string, {phone: string | null; email: string | null}>>({});
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [reviewEmail, setReviewEmail] = useState('');
  const [rating, setRating] = useState(0);
  const [hired, setHired] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [reportEmail, setReportEmail] = useState('');
  const [reportReason, setReportReason] = useState('Información incorrecta');
  const [admin, setAdmin] = useState<AdminQueue | null>(null);
  const [ownedReceipts, setOwnedReceipts] = useState<OwnerReceipt[]>([]);
  const [submissionError, setSubmissionError] = useState('');
  const [ownedLookupError,setOwnedLookupError] = useState(false);

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
  const refreshAdmin = async () => {
    try {
      const response = await api.get('/api/admin/local-directory');
      setAdmin(response.data as AdminQueue);
    } catch {
      setAdmin(null);
    }
  };
  // The admin endpoint requires authentication; avoid an unnecessary 401 request
  // for every anonymous visitor opening the public directory.
  useEffect(() => {
    let active = true;
    void auth.getUser()
      .then(user => { if (active && user) void refreshAdmin(); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

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
      if (admin) void refreshAdmin();
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
      await api.post('/api/local-directory/' + reviewId + '/reviews', {
        email: reviewEmail, rating, hired,
      });
      setNotice('Evaluación recibida para moderación. No se considera contratación verificada.');
      setReviewEmail('');
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
  async function adminAction(path: string) {
    setBusy(true);
    try {
      await api.post(path, {});
      await Promise.all([refresh(), refreshAdmin()]);
      setNotice('Revisión administrativa registrada.');
    } catch {
      setNotice('No pudo completarse la acción administrativa.');
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
          {entry.previewPhotos.map((url,index)=><img src={url} key={url}
            alt={'Fotografía '+(index+1)+' de '+entry.title} loading='lazy'/>)}
        </div> : null}
        {entry.status==='pending' && <small className='tcOwnedVisibilityNotice'>Esta vista previa solo aparece en tu dispositivo. El público podrá verla cuando se apruebe.</small>}
      </article>)}
      <button type='button' onClick={()=>void refreshOwnedReceipts()}>Actualizar estados</button>
    </details>}
    {showForm && <form className='tcDirectoryForm' onSubmit={event => void publish(event)}>
      <h3>Publicar en el directorio</h3>
      <fieldset className='tcDirectoryKindChoice'>
        <legend>¿Qué quieres publicar?</legend>
        <label><input type='radio' name='local-kind' value='service' checked={formKind==='service'} onChange={()=>setFormKind('service')}/> Un servicio (soldadura, reparaciones…)</label>
        <label><input type='radio' name='local-kind' value='business' checked={formKind==='business'} onChange={()=>setFormKind('business')}/> Un negocio (pastelería, tienda…)</label>
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
      <label>Comuna base
        <select value={commune} onChange={e => setCommune(e.target.value)}>
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
          {entry.photos.map((src, index) => <img key={src} src={src}
            alt={'Trabajo o producto de ' + entry.title + ', foto ' + (index + 1)}
            loading='lazy' width={320} height={220}/>)}
        </div>}
        <small><span className='tcDirectoryKindBadge'>{entry.kind==='service'?'Servicio':'Negocio'}</span> · {entry.category} · {entry.commune}</small>
        <h3>{entry.title}</h3>
        <p>{entry.description}</p>
        <span className='tcDirectoryCoverage'>Atiende en: {entry.coverage.join(', ')}</span>
        {entry.kind === 'service' && <span className='tcDirectoryRating'>
          {entry.rating === null ? 'Sin opiniones publicadas suficientes'
            : (entry.rating >= 4.2?'👍 Buenas opiniones':entry.rating >= 2.5?'😐 Opiniones variadas':'👎 Opiniones negativas')
              + ' · ' + entry.reviewCount + ' opiniones revisadas'}
        </span>}
        {contacts[entry.id] && <div className='tcDirectoryContact'>
          {contacts[entry.id].phone && <a href={'tel:' + contacts[entry.id].phone}>{contacts[entry.id].phone}</a>}
          {contacts[entry.id].email && <a href={'mailto:' + contacts[entry.id].email}>{contacts[entry.id].email}</a>}
        </div>}
        <div className='tcDirectoryCardActions'>
          {entry.contactAvailable && <button onClick={() => void reveal(entry.id)}>Ver contacto</button>}
          {entry.kind === 'service' && !localStorage.getItem('tc_directory_owner_' + entry.id) && <button onClick={() => { setReviewId(entry.id); setRating(0); setHired(false); setReportId(null); }}>
            Opinar sobre el servicio
          </button>}
          {!localStorage.getItem('tc_directory_owner_' + entry.id) && <button onClick={() => { setReportId(entry.id); setReviewId(null); }}>Reportar problema</button>}
        </div>
        {localStorage.getItem('tc_directory_owner_' + entry.id) && <details className='tcDirectoryOwnerActions'>
          <summary>Gestionar mi ficha</summary>
          <button className='tcDirectoryRemove' onClick={() => void removeOwn(entry.id)}>Retirar mi ficha</button>
        </details>}
        {reviewId===entry.id && <form className='tcDirectoryForm tcDirectoryReviewForm' onSubmit={event => void review(event)}>
          <h4>¿Cómo te fue con este servicio?</h4>
          <p>Solo pueden opinar quienes contrataron el trabajo. No puedes evaluar tu propio servicio.</p>
          <fieldset className='tcDirectoryReviewChoices'>
            <legend>Elige una opción</legend>
            {[{value:5,label:'👍 Bueno'},{value:3,label:'😐 Regular'},{value:1,label:'👎 Malo'}].map(choice=>
              <button key={choice.value} type='button' aria-pressed={rating===choice.value}
                onClick={()=>setRating(choice.value)}>{choice.label}</button>)}
          </fieldset>
          <label>Tu correo electrónico
            <input type='email' required value={reviewEmail}
              onChange={e=>setReviewEmail(e.target.value)} placeholder='Para evitar opiniones repetidas'/>
          </label>
          <label className='tcDirectoryConsent'><input type='checkbox' checked={hired} required
            onChange={e => setHired(e.target.checked)}/> Confirmo que contraté este servicio.</label>
          <div className='tcDirectoryReviewActions'>
            <button disabled={busy || rating===0 || !hired}>Enviar opinión</button>
            <button type='button' onClick={() => setReviewId(null)}>Cancelar</button>
          </div>
          <small>Las opiniones se revisan antes de mostrarse. No verificamos contrataciones.</small>
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
    {admin && <details className='tcDirectoryAdmin' aria-label='Moderación del directorio'>
      <summary>Revisión administrativa · Solo personal autorizado</summary>
      <p>Fichas: {admin.entries.length}, evaluaciones: {admin.reviews.length},
        denuncias: {admin.reports.length}.</p>
      {admin.entries.map(entry => <div key={entry.id}>
        <span>{entry.title} · {entry.commune} · {entry.phone} · {entry.email}</span>
        <button disabled={busy} onClick={() => void adminAction('/api/admin/local-directory/' + entry.id + '/approve')}>
          Aprobar
        </button>
        <button disabled={busy} onClick={() => void adminAction('/api/admin/local-directory/' + entry.id + '/hide')}>
          Rechazar
        </button>
      </div>)}
      {admin.reviews.map(item => <div key={item.id}>
        <span>{item.entryId} · {item.rating} estrellas · contratación no verificada</span>
        <button disabled={busy} onClick={() => void adminAction('/api/admin/local-directory/reviews/' + item.id + '/approve')}>
          Aprobar evaluación
        </button>
      </div>)}
      {admin.reports.map(item => <div key={item.id}>
        <span>Denuncia: {item.reason} · {item.entryId}</span>
        <button disabled={busy} onClick={() => void adminAction('/api/admin/local-directory/reports/' + item.id + '/resolve')}>
          Marcar revisada
        </button>
      </div>)}
    </details>}
  </section>;
}
