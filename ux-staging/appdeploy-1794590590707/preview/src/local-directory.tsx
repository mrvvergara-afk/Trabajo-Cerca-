import { useEffect, useState, type FormEvent } from 'react';
import { api, auth } from '@appdeploy/client';
import './local-directory.css';

type Kind = 'service' | 'business';
type Listing = {
  id: string; kind: Kind; title: string; category: string; description: string;
  commune: string; coverage: string[]; photos: string[]; reviewCount: number;
  rating: number | null; contactAvailable: boolean;
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
export function LocalDirectory({ place, initialKind, onClose }: {
  place: string; initialKind: Kind; onClose: () => void;
}) {
  const [kind, setKind] = useState<Kind>(initialKind);
  const [listings, setListings] = useState<Listing[]>([]);
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
  const [rating, setRating] = useState(5);
  const [hired, setHired] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [reportEmail, setReportEmail] = useState('');
  const [reportReason, setReportReason] = useState('Información incorrecta');
  const [admin, setAdmin] = useState<AdminQueue | null>(null);

  useEffect(() => { setKind(initialKind); }, [initialKind]);
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
    try {
      const gallery = await Promise.all(photos.slice(0, 3).map(prepareImage));
      const response = await api.post('/api/local-directory', {
        kind, title, category, description, commune, phone, email,
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
      setNotice('Tu ficha quedó en revisión. No se mostrará hasta la aprobación.');
      void refreshAdmin();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'No se pudo enviar la ficha.');
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
        <h2>Oficios, servicios y negocios cerca de ti</h2>
        <p>Encuentra y contacta a quienes trabajan o emprenden en tu comuna.</p>
      </div>
      <button type='button' onClick={onClose}>Cerrar ×</button>
    </div>
    <div className='tcDirectoryTabs' role='group' aria-label='Categorías del directorio'>
      <button type='button' className={kind === 'service' ? 'active' : ''}
        aria-pressed={kind === 'service'} onClick={() => setKind('service')}>
        Oficios y servicios
      </button>
      <button type='button' className={kind === 'business' ? 'active' : ''}
        aria-pressed={kind === 'business'} onClick={() => setKind('business')}>
        Negocios y emprendimientos
      </button>
    </div>
    <div className='tcDirectorySummary'>
      <span>Comuna: <strong>{place === 'Todas' ? 'Las 12 comunas' : place}</strong></span>
      <button onClick={() => setShowForm(previous => !previous)}>
        {showForm ? 'Cancelar' : kind === 'service' ? 'Ofrecer un servicio gratis' : 'Registrar mi negocio gratis'}
      </button>
    </div>
    {notice && <p role='status' className='tcDirectoryNotice'>{notice}</p>}
    {showForm && <form className='tcDirectoryForm' onSubmit={event => void publish(event)}>
      <h3>{kind === 'service' ? 'Publica tu oficio o servicio' : 'Presenta tu negocio local'}</h3>
      <p>Solo pedimos teléfono y correo como datos de contacto. No solicitamos CV, RUT ni domicilio.</p>
      <label>{kind === 'service' ? 'Servicio que ofreces' : 'Nombre del negocio'}
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
      <small>Las imágenes se convierten a JPEG optimizado, sin los metadatos de la fotografía original.
        Publica solo imágenes que tengas derecho a utilizar.</small>
      <label className='tcDirectoryConsent'><input type='checkbox' required checked={consent}
          onChange={e => setConsent(e.target.checked)}/>
        Autorizo tratar mi contacto y el contenido voluntario de esta publicación conforme a la política de privacidad.</label>
      <button type='submit' disabled={busy || (!showPhone && !showEmail)}>
        {busy ? 'Enviando…' : 'Enviar para revisión'}
      </button>
    </form>}
    {listings.length > 0 ? <div className='tcDirectoryGrid'>
      {listings.map(entry => <article key={entry.id} className='tcDirectoryCard'>
        {entry.photos.length > 0 && <div className='tcDirectoryPhotos'>
          {entry.photos.map((src, index) => <img key={src} src={src}
            alt={'Trabajo o producto de ' + entry.title + ', foto ' + (index + 1)}
            loading='lazy' width={320} height={220}/>)}
        </div>}
        <small>{entry.category} · {entry.commune}</small>
        <h3>{entry.title}</h3>
        <p>{entry.description}</p>
        <span className='tcDirectoryCoverage'>Atiende en: {entry.coverage.join(', ')}</span>
        {entry.kind === 'service' && <span className='tcDirectoryRating'>
          {entry.rating === null ? 'Aún sin calificación pública suficiente'
            : '★ ' + entry.rating.toFixed(1) + ' · ' + entry.reviewCount + ' opiniones moderadas'}
        </span>}
        {contacts[entry.id] && <div className='tcDirectoryContact'>
          {contacts[entry.id].phone && <a href={'tel:' + contacts[entry.id].phone}>{contacts[entry.id].phone}</a>}
          {contacts[entry.id].email && <a href={'mailto:' + contacts[entry.id].email}>{contacts[entry.id].email}</a>}
        </div>}
        <div className='tcDirectoryCardActions'>
          {entry.contactAvailable && <button onClick={() => void reveal(entry.id)}>Ver contacto</button>}
          {entry.kind === 'service' && <button onClick={() => { setReviewId(entry.id); setReportId(null); }}>
            Evaluar servicio
          </button>}
          <button onClick={() => { setReportId(entry.id); setReviewId(null); }}>Denunciar</button>
        </div>
        {localStorage.getItem('tc_directory_owner_' + entry.id) && <button className='tcDirectoryRemove'
          onClick={() => void removeOwn(entry.id)}>Retirar mi ficha</button>}
      </article>)}
    </div> : <div className='tcDirectoryEmpty'>
      <strong>Aún no hay fichas aprobadas para esta selección.</strong>
      <p>Puedes registrar tu servicio o negocio gratis. No presentamos publicaciones de ejemplo como si fueran reales.</p>
    </div>}
    {reviewId && <form className='tcDirectoryForm' onSubmit={event => void review(event)}>
      <h3>Evaluar un servicio contratado</h3>
      <p>Las evaluaciones son solo para servicios particulares. La contratación no se considera verificada.</p>
      <label>Correo electrónico<input type='email' required value={reviewEmail}
        onChange={e => setReviewEmail(e.target.value)} /></label>
      <label>Estrellas<select value={rating} onChange={e => setRating(Number(e.target.value))}>
        {[5, 4, 3, 2, 1].map(value => <option key={value} value={value}>
          {value} estrella{value === 1 ? '' : 's'}</option>)}
      </select></label>
      <label className='tcDirectoryConsent'><input type='checkbox' checked={hired} required
        onChange={e => setHired(e.target.checked)}/> Declaro que contraté este servicio.</label>
      <button disabled={busy}>Enviar evaluación para moderación</button>
      <button type='button' onClick={() => setReviewId(null)}>Cancelar</button>
    </form>}
    {reportId && <form className='tcDirectoryForm' onSubmit={event => void report(event)}>
      <h3>Denunciar publicación</h3>
      <label>Correo electrónico<input type='email' required value={reportEmail}
        onChange={e => setReportEmail(e.target.value)}/></label>
      <label>Motivo<select value={reportReason} onChange={e => setReportReason(e.target.value)}>
        {['Información incorrecta', 'Posible estafa', 'Imágenes no autorizadas', 'Otro']
          .map(value => <option key={value}>{value}</option>)}
      </select></label>
      <button disabled={busy}>Enviar denuncia</button>
      <button type='button' onClick={() => setReportId(null)}>Cancelar</button>
    </form>}
    {admin && <section className='tcDirectoryAdmin' aria-label='Moderación del directorio'>
      <h3>Moderación · Solo administración</h3>
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
    </section>}
  </section>;
}
