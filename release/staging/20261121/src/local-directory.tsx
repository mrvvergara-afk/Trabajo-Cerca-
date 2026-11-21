import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, auth } from '@appdeploy/client';
import './local-directory.css';

type Kind = 'service' | 'business';
type DirectoryKind = Kind | 'all';
type PhotoViewer = { photos: string[]; index: number; title: string } | null;
type Reviewer = { email: string } | null;
type Listing = {
  id: string;
  kind: Kind;
  title: string;
  category: string;
  description: string;
  commune: string;
  coverage: string[];
  photos: string[];
  reviewCount: number;
  rating: number | null;
  contactAvailable: boolean;
  publicPreview?: boolean;
};
type OwnerReceipt = {
  id: string;
  title: string;
  commune: string;
  kind: Kind;
  status: 'pending' | 'approved' | 'hidden';
  photosCount: number;
  category?: string;
  description?: string;
  previewPhotos?: string[];
};

type AdminQueue = {
  entries: Array<Listing & { status: string; email: string; phone: string }>;
  reviews: Array<{ id: string; entryId: string; rating: number }>;
  reports: Array<{ id: string; entryId: string; reason: string }>;
};
const PLACES = [
  'Angol',
  'Collipulli',
  'Ercilla',
  'Lumaco',
  'Los Sauces',
  'Purén',
  'Renaico',
  'Traiguén',
  'Victoria',
  'Mulchén',
  'Negrete',
  'Nacimiento',
];
function prepareImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/') || file.size > 6 * 1024 * 1024)
    return Promise.reject(new Error('Solo fotografías de hasta 6 MB.'));
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        const scale = Math.min(
          1,
          960 / Math.max(image.naturalWidth, image.naturalHeight)
        );
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('No se pudo procesar la fotografía.');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL('image/jpeg', 0.74).split(',')[1];
        if (data.length > 310000)
          throw new Error(
            'La fotografía sigue demasiado grande después de optimizarla.'
          );
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
export function LocalDirectory({
  place,
  initialKind,
  startWithForm = false,
  onClose,
}: {
  place: string;
  initialKind: DirectoryKind;
  startWithForm?: boolean;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<DirectoryKind>(initialKind);
  const [formKind, setFormKind] = useState<Kind>(
    initialKind === 'business' ? 'business' : 'service'
  );
  const [listings, setListings] = useState<Listing[]>([]);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [recovered, setRecovered] = useState<OwnerReceipt[]>([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [commune, setCommune] = useState(PLACES.includes(place) ? place : '');
  const [coverage, setCoverage] = useState<string[]>([]);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [showPhone, setShowPhone] = useState(true);
  const [showEmail, setShowEmail] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [consent, setConsent] = useState(false);
  const [contacts, setContacts] = useState<
    Record<string, { phone: string | null; email: string | null }>
  >({});
  const [onlySaved, setOnlySaved] = useState(false);
  // Local-only favorites: no registration, server profile, tracking or contact storage.
  const [savedDirectoryIds, setSavedDirectoryIds] = useState<string[]>(() => {
    try {
      const values = JSON.parse(
        localStorage.getItem('tc_saved_local_directory_v1') || '[]'
      );
      return Array.isArray(values)
        ? values
            .filter(
              (id): id is string =>
                typeof id === 'string' && /^local_[a-f0-9-]{36}$/.test(id)
            )
            .slice(0, 100)
        : [];
    } catch {
      return [];
    }
  });
  function toggleSavedDirectory(id: string) {
    setSavedDirectoryIds(current => {
      const next = current.includes(id)
        ? current.filter(value => value !== id)
        : [id, ...current].slice(0, 100);
      try {
        localStorage.setItem(
          'tc_saved_local_directory_v1',
          JSON.stringify(next)
        );
      } catch {}
      return next;
    });
  }
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState('');
  const [reviewSuccess, setReviewSuccess] = useState(false);
  const reviewOrigin = useRef<HTMLButtonElement | null>(null);
  const reviewDialogRef = useRef<HTMLElement | null>(null);
  const [reviewer, setReviewer] = useState<Reviewer>(null);
  const [reviewEntry, setReviewEntry] = useState<Listing | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);
  const [rating, setRating] = useState(0);
  const [reviewScores, setReviewScores] = useState({ timeliness: 0, quality: 0, commitment: 0 });
  function setCriterion(key: 'timeliness' | 'quality' | 'commitment', score: number) {
    const next = { ...reviewScores, [key]: score };
    setReviewScores(next);
    const values = Object.values(next);
    setRating(values.every(value => value >= 1)
      ? Math.round(values.reduce((a, b) => a + b, 0) / 3 * 10) / 10 : 0);
  }
  const [hired, setHired] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [reportEmail, setReportEmail] = useState('');
  const [reportReason, setReportReason] = useState('Información incorrecta');
  const [ownedReceipts, setOwnedReceipts] = useState<OwnerReceipt[]>([]);
  const [submissionError, setSubmissionError] = useState('');
  const [ownedLookupError, setOwnedLookupError] = useState(false);
  const [photoViewer, setPhotoViewer] = useState<PhotoViewer>(null);
  const photoOrigin = useRef<HTMLButtonElement | null>(null);
  const gestureStart = useRef<number | null>(null);

  function openPhotos(
    photos: string[],
    index: number,
    title: string,
    button: HTMLButtonElement
  ) {
    photoOrigin.current = button;
    setPhotoViewer({ photos, index, title });
  }
  function movePhoto(offset: number) {
    setPhotoViewer(current =>
      current
        ? {
            ...current,
            index:
              (current.index + offset + current.photos.length) %
              current.photos.length,
          }
        : null
    );
  }
  useEffect(() => {
    if (!photoViewer) return;
    const was = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPhotoViewer(null);
      if (event.key === 'ArrowLeft') movePhoto(-1);
      if (event.key === 'ArrowRight') movePhoto(1);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = was;
      window.removeEventListener('keydown', onKey);
      photoOrigin.current?.focus({ preventScroll: true });
    };
  }, [Boolean(photoViewer)]);
  useEffect(() => {
    let active = true;
    void auth
      .getUser()
      .then(user => {
        if (active) setReviewer(user?.email ? { email: user.email } : null);
      })
      .catch(() => {
        if (active) setReviewer(null);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!reviewer?.email) return;
    try {
      const saved = sessionStorage.getItem('tc_review_intent');
      const intent = saved
        ? (JSON.parse(saved) as {
            id: string;
            rating?: number;
            scores?: { timeliness: number; quality: number; commitment: number };
            hired?: boolean;
          })
        : null;
      if (!intent?.id) return;
      setReviewId(intent.id);
      const scores = intent.scores;
      const valid = scores && ['timeliness', 'quality', 'commitment']
        .every(key => Number.isInteger(scores[key as keyof typeof scores]) &&
          scores[key as keyof typeof scores] >= 1 && scores[key as keyof typeof scores] <= 5);
      setReviewScores(valid ? scores : { timeliness: 0, quality: 0, commitment: 0 });
      setRating(valid ? Math.round(
        (scores.timeliness + scores.quality + scores.commitment) / 3 * 10
      ) / 10 : 0);
      setHired(intent.hired === true);
      setReviewSuccess(false);
      sessionStorage.removeItem('tc_review_intent');
    } catch {
      try {
        sessionStorage.removeItem('tc_review_intent');
      } catch {
        /* no storage */
      }
    }
  }, [reviewer?.email, listings]);
  useEffect(() => {
    if (!reviewId || listings.some(x => x.id === reviewId)) {
      setReviewEntry(null);
      return;
    }
    let alive = true;
    void api
      .get('/api/local-directory/' + encodeURIComponent(reviewId))
      .then(r => {
        if (alive) setReviewEntry(r.data.entry || null);
      })
      .catch(() => {
        if (alive) setReviewError('Ficha no disponible.');
      });
    return () => {
      alive = false;
    };
  }, [reviewId, listings]);
  useEffect(() => {
    if (!reviewId) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    reviewDialogRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setReviewId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
      reviewOrigin.current?.focus({ preventScroll: true });
    };
  }, [Boolean(reviewId)]);
  async function loginToReview() {
    if (!reviewId) return;
    try {
      sessionStorage.setItem(
        'tc_review_intent',
        JSON.stringify({ id: reviewId, rating, scores: reviewScores, hired })
      );
    } catch {
      setReviewError(
        'Habilita el almacenamiento del navegador para confirmar tu correo.'
      );
      return;
    }
    try {
      setLoginBusy(true);
      await auth.signInWithRedirect({ scope: 'openid email offline_access' });
    } catch {
      setReviewError(
        'No se pudo abrir la confirmación de correo. Revisa el acceso y vuelve a intentarlo.'
      );
      setLoginBusy(false);
    }
  }

  // Each owner receipt is read with an unguessable token already saved on the
  // same device. No public listing or contact details are exposed here.
  const refreshOwnedReceipts = async () => {
    const owned: Array<{ id: string; token: string }> = [];
    try {
      for (let i = 0; i < localStorage.length && owned.length < 40; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('tc_directory_owner_local_')) {
          const token = localStorage.getItem(key);
          const id = key.slice('tc_directory_owner_'.length);
          if (token && /^local_[a-f0-9-]{36}$/.test(id))
            owned.push({ id, token });
        }
      }
    } catch {
      return;
    }
    setOwnedLookupError(false);
    const records = await Promise.all(
      owned.map(async ({ id, token }) => {
        try {
          const result = await api.post(
            '/api/local-directory/' + id + '/status',
            { ownerToken: token }
          );
          return result.data as OwnerReceipt;
        } catch {
          return null;
        }
      })
    );
    setOwnedLookupError(records.some(value => !value));
    setOwnedReceipts(
      records.filter((entry): entry is OwnerReceipt => Boolean(entry))
    );
  };
  useEffect(() => {
    void refreshOwnedReceipts();
  }, []);
  useEffect(() => {
    if (!reviewer?.email) return;
    let recover = false;
    try {
      recover = sessionStorage.getItem('tc_directory_recover_intent') === '1';
      if (recover) sessionStorage.removeItem('tc_directory_recover_intent');
    } catch {}
    if (recover) void recoverMine();
  }, [reviewer?.email]);

  useEffect(() => {
    setKind(initialKind);
    if (initialKind !== 'all') setFormKind(initialKind);
  }, [initialKind]);
  useEffect(() => {
    if (startWithForm) setShowForm(true);
  }, [startWithForm]);
  useEffect(() => {
    const t = window.setTimeout(
      () => setDebouncedSearch(searchText.trim()),
      280
    );
    return () => window.clearTimeout(t);
  }, [searchText]);
  useEffect(() => {
    let alive = true;
    setDirectoryLoading(true);
    setNextCursor(null);
    setListings([]);
    const q = new URLSearchParams({ kind, place, search: debouncedSearch });
    if (new URLSearchParams(window.location.search).get('datos') === 'pruebas') q.set('lab', '1');
    void api
      .get('/api/local-directory?' + q.toString())
      .then(r => {
        if (alive) {
          setListings(Array.isArray(r.data.items) ? r.data.items : []);
          setNextCursor(r.data.nextCursor ?? null);
        }
      })
      .catch(() => {
        if (alive) setNotice('No se pudo consultar el directorio.');
      })
      .finally(() => {
        if (alive) setDirectoryLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [kind, place, debouncedSearch]);
  async function moreDirectory() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const q = new URLSearchParams({
        kind,
        place,
        search: debouncedSearch,
        cursor: nextCursor,
      });
      if (new URLSearchParams(window.location.search).get('datos') === 'pruebas') q.set('lab', '1');
      const r = await api.get('/api/local-directory?' + q.toString());
      setListings(prev => {
        const all = new Map(prev.map(x => [x.id, x]));
        for (const row of (r.data.items || []) as Listing[])
          all.set(row.id, row);
        return [...all.values()];
      });
      setNextCursor(r.data.nextCursor ?? null);
    } catch {
      setNotice('No se pudo cargar más.');
    } finally {
      setLoadingMore(false);
    }
  }
  const visibleListings = onlySaved
    ? listings.filter(item => savedDirectoryIds.includes(item.id))
    : listings;
  const savedHere = listings.filter(item =>
    savedDirectoryIds.includes(item.id)
  ).length;
  const refresh = async () => {
    const q = new URLSearchParams({ kind, place, search: debouncedSearch });
    if (new URLSearchParams(window.location.search).get('datos') === 'pruebas') q.set('lab', '1');
    const r = await api.get('/api/local-directory?' + q.toString());
    setListings(Array.isArray(r.data.items) ? r.data.items : []);
    setNextCursor(r.data.nextCursor ?? null);
  };
  async function publish(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    setSubmissionError('');
    try {
      const gallery = await Promise.all(photos.slice(0, 3).map(prepareImage));
      const response = await api.post('/api/local-directory', {
        kind: formKind,
        title,
        category,
        description,
        commune,
        coverage: [commune, ...coverage.filter(value => value !== commune)],
        phone,
        email,
        photos: gallery,
        showPhone,
        showEmail,
        consent,
      });
      if (!response.data.pendingModeration)
        throw new Error('No se confirmó la publicación.');
      try {
        localStorage.setItem(
          'tc_directory_owner_' + response.data.id,
          response.data.ownerToken
        );
      } catch {
        // The private owner token is optional on devices without local storage.
      }
      setTitle('');
      setCategory('');
      setDescription('');
      setCoverage([]);
      setPhone('');
      setEmail('');
      setPhotos([]);
      setConsent(false);
      setShowForm(false);
      setNotice(
        'Ficha recibida: pendiente de aprobación. Revisa el estado en «Mis publicaciones enviadas».'
      );
      setOwnedReceipts(previous => [
        {
          id: response.data.id,
          title,
          commune,
          kind: formKind,
          status: 'pending',
          photosCount: gallery.length,
          category,
          description,
        },
        ...previous.filter(entry => entry.id !== response.data.id),
      ]);
      setKind('all');
      void refreshOwnedReceipts();
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : 'No se pudo enviar la ficha.';
      setNotice(message);
      setSubmissionError(message);
    } finally {
      setBusy(false);
    }
  }
  function searchRelatedShops() {
    setOnlySaved(false);
    setKind('business');
    setSearchText('ferretería');
    setNotice(
      'Buscando ferreterías publicadas en la zona seleccionada. La disponibilidad se consulta con cada negocio.'
    );
    document
      .getElementById('local-directory')
      ?.scrollIntoView({ behavior: 'auto', block: 'start' });
  }
  async function reveal(id: string) {
    try {
      const response = await api.post(
        '/api/local-directory/' + id + '/contact',
        {}
      );
      setContacts(previous => ({ ...previous, [id]: response.data }));
    } catch {
      setNotice('El contacto no está disponible.');
    }
  }
  async function review(event: FormEvent) {
    event.preventDefault();
    if (!reviewId) return;
    setBusy(true);
    setReviewError('');
    try {
      if (!reviewer?.email)
        throw new Error('Confirma tu correo para continuar.');
      await api.post('/api/local-directory/' + reviewId + '/reviews', {
        rating,
        scores: reviewScores,
        hired,
      });
      setNotice('Gracias por evaluar.');
      setReviewSuccess(true);
      setHired(false);
      setRating(0);
      setReviewScores({ timeliness: 0, quality: 0, commitment: 0 });
    } catch (cause) {
      const status = (cause as { response?: { status?: number } })?.response
        ?.status;
      if (status === 401) {
        setReviewer(null);
        setReviewError(
          'Tu sesión ha vencido. Confirma nuevamente tu correo para enviar la opinión.'
        );
      } else if (status === 409) {
        setReviewError(
          'Este correo ya calificó esta ficha. No se permiten duplicados.'
        );
      } else if (status === 400) {
        const response = cause as {
          response?: { data?: { error?: string; message?: string } };
        };
        const reason = String(
          response.response?.data?.error ||
            response.response?.data?.message ||
            ''
        ).toLowerCase();
        setReviewError(
          reason.includes('propio') || reason.includes('propia')
            ? 'No puedes calificar tu propia publicación. Solo pueden evaluarte quienes contrataron o compraron.'
            : 'Comprueba tu correo confirmado, las estrellas y la declaración de contratación.'
        );
      } else {
        setReviewError(
          'No se pudo registrar la calificación. Revisa tu conexión e inténtalo nuevamente.'
        );
      }
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
        email: reportEmail,
        reason: reportReason,
      });
      setNotice('Denuncia recibida para revisión.');
      setReportId(null);
      setReportEmail('');
    } catch (cause) {
      setNotice(
        cause instanceof Error
          ? cause.message
          : 'No se pudo registrar la denuncia.'
      );
    } finally {
      setBusy(false);
    }
  }
  function ownsEntry(id: string) {
    try {
      return Boolean(localStorage.getItem('tc_directory_owner_' + id));
    } catch {
      return false;
    }
  }
  async function recoverMine() {
    try {
      const user = await auth.getUser();
      if (!user?.email) {
        try {
          sessionStorage.setItem('tc_directory_recover_intent', '1');
        } catch {}
        await auth.signInWithRedirect({ scope: 'openid email offline_access' });
        return;
      }
      const r = await api.get('/api/local-directory/mine');
      setRecovered(Array.isArray(r.data.items) ? r.data.items : []);
      setNotice(
        r.data.items?.length
          ? 'Fichas recuperadas por correo.'
          : 'Sin fichas asociadas a este correo.'
      );
    } catch {
      setNotice('No se pudo recuperar con este correo.');
    }
  }
  async function removeOwn(id: string) {
    let ownerToken: string | null = null;
    try {
      ownerToken = localStorage.getItem('tc_directory_owner_' + id);
    } catch {}
    if (!window.confirm('¿Retirar la ficha y las imágenes publicadas?')) return;
    setBusy(true);
    try {
      if (ownerToken)
        await api.post('/api/local-directory/' + id + '/delete', {
          ownerToken,
        });
      else
        await api.post('/api/local-directory/' + id + '/remove-by-email', {});
      try {
        localStorage.removeItem('tc_directory_owner_' + id);
      } catch {}
      setRecovered(old => old.filter(x => x.id !== id));
      await refresh();
      setNotice('Ficha retirada.');
    } catch {
      setNotice('No se pudo retirar la publicación.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      id="local-directory"
      className="tcLocalDirectory"
      aria-label="Directorio local"
    >
      <div className="tcDirectoryTop">
        <div>
          <h2>Servicios y negocios</h2>
          {new URLSearchParams(window.location.search).get('datos') !== 'pruebas' && (
            <small>Vista pública de referencia · solo lectura</small>
          )}
        </div>
        <button
          type="button"
          aria-label="Cerrar directorio"
          title="Cerrar directorio"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div
        className="tcDirectoryTabs"
        role="group"
        aria-label="Filtrar el directorio"
      >
        <button
          type="button"
          className={kind === 'all' ? 'active' : ''}
          aria-pressed={kind === 'all'}
          onClick={() => setKind('all')}
        >
          Todos
        </button>
        <button
          type="button"
          className={kind === 'service' ? 'active' : ''}
          aria-pressed={kind === 'service'}
          onClick={() => setKind('service')}
        >
          Servicios
        </button>
        <button
          type="button"
          className={kind === 'business' ? 'active' : ''}
          aria-pressed={kind === 'business'}
          onClick={() => setKind('business')}
        >
          Negocios
        </button>
      </div>
      <div className="tcDirectorySummary">
        <span className="tcVisuallyHidden">Zona: {place}</span>
        <button
          onClick={() => {
            if (kind !== 'all') setFormKind(kind);
            setShowForm(previous => !previous);
          }}
        >
          {showForm ? 'Cerrar' : '+ Publicar gratis'}
        </button>
      </div>
      <label className="tcDirectorySearch">
        <span className="tcVisuallyHidden">Buscar oficio o negocio</span>
        <input
          type="search"
          value={searchText}
          onChange={event => setSearchText(event.target.value)}
          placeholder="Buscar oficio o negocio…"
          aria-label="Buscar en el directorio"
        />
      </label>
      <div className="tcDirectorySavedControls">
        <button
          type="button"
          aria-pressed={onlySaved}
          onClick={() => setOnlySaved(value => !value)}
        >
          {onlySaved
            ? 'Ver todos los resultados'
            : '♡ Guardados (' + savedHere + ')'}
        </button>
        <small className="tcVisuallyHidden">Guardados en este dispositivo.</small>
      </div>
      {notice && (
        <p role="status" className="tcDirectoryNotice">
          {notice}
        </p>
      )}
      <details className="tcDirectoryManagement">
        <summary>Mis publicaciones</summary>
        <button type="button" className="tcRecoverDirectory"
          onClick={() => void recoverMine()}>
          Vincular con mi correo
        </button>
      {recovered.length > 0 && (
        <details className="tcDirectoryOwned" open>
          <summary>Fichas recuperadas · {recovered.length}</summary>
          {recovered.map(x => (
            <div key={x.id} className="tcDirectoryOwnedRow">
              <span>
                {x.title} · {x.commune} ·{' '}
                {x.status === 'approved'
                  ? 'Publicada'
                  : x.status === 'pending'
                    ? 'Pendiente'
                    : 'Retirada'}
              </span>
              {x.status !== 'hidden' && (
                <button type="button" onClick={() => void removeOwn(x.id)}>
                  Retirar
                </button>
              )}
            </div>
          ))}
        </details>
      )}
      {ownedLookupError && (
        <p role="alert" className="tcDirectoryNotice">
          No se pudo consultar una de tus publicaciones. No la vuelvas a enviar;
          actualiza el estado o solicita revisión.
        </p>
      )}
      {ownedReceipts.length > 0 && (
        <details
          className="tcDirectoryOwned"
          open={ownedReceipts.some(entry => entry.status === 'pending')}
        >
          <summary>Mis publicaciones enviadas · {ownedReceipts.length}</summary>
          {ownedReceipts.map(entry => (
            <article className="tcDirectoryOwnedPreview" key={entry.id}>
              <div className="tcOwnedPreviewHeader">
                <strong>{entry.title}</strong>
                <span className={'tcOwnerStatus tcOwnerStatus-' + entry.status}>
                  {entry.status === 'pending'
                    ? 'Pendiente de aprobación'
                    : entry.status === 'approved'
                      ? 'Aprobada y publicada'
                      : 'Retirada o rechazada'}
                </span>
              </div>
              <small>
                {entry.kind === 'business' ? 'Negocio' : 'Servicio'} ·{' '}
                {entry.commune} · {entry.photosCount} foto(s)
              </small>
              {entry.category && (
                <strong className="tcOwnedPreviewCategory">
                  {entry.category}
                </strong>
              )}
              {entry.description && <p>{entry.description}</p>}
              {entry.previewPhotos?.length ? (
                <div className="tcDirectoryPhotos tcDirectoryOwnerPhotos">
                  {entry.previewPhotos.map((url, index) => (
                    <button
                      type="button"
                      key={url}
                      className="tcDirectoryPhotoButton"
                      aria-label={
                        'Ampliar fotografía ' +
                        (index + 1) +
                        ' de ' +
                        entry.title
                      }
                      onClick={event =>
                        openPhotos(
                          entry.previewPhotos || [],
                          index,
                          entry.title,
                          event.currentTarget
                        )
                      }
                    >
                      <img
                        src={url}
                        alt={'Fotografía ' + (index + 1) + ' de ' + entry.title}
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
              ) : null}
              {entry.status === 'pending' && (
                <small className="tcOwnedVisibilityNotice">
                  Esta vista previa solo aparece en tu dispositivo. El público
                  podrá verla cuando se apruebe.
                </small>
              )}
            </article>
          ))}
          <button type="button" onClick={() => void refreshOwnedReceipts()}>
            Actualizar estados
          </button>
        </details>
      )}
      </details>
      {showForm && (
        <form
          className="tcDirectoryForm"
          onSubmit={event => void publish(event)}
        >
          <h3>Publica gratis tu servicio o negocio</h3>
          <fieldset className="tcDirectoryKindChoice">
            <legend>¿Qué quieres publicar?</legend>
            <label>
              <input
                type="radio"
                name="local-kind"
                value="service"
                checked={formKind === 'service'}
                onChange={() => setFormKind('service')}
              />
              <span>Servicio (soldadura, reparaciones)</span>
            </label>
            <label>
              <input
                type="radio"
                name="local-kind"
                value="business"
                checked={formKind === 'business'}
                onChange={() => setFormKind('business')}
              />
              <span>Negocio (pastelería, tienda)</span>
            </label>
          </fieldset>
          <p className="tcVisuallyHidden" aria-live="polite">
            <strong>
              {formKind === 'service' ? 'Servicio gratuito' : 'Negocio gratuito'}
            </strong>
            {' · '}
            {formKind === 'service'
              ? 'Para ofrecer trabajos que realizas: soldadura, reparaciones, gasfitería o mantenimiento.'
              : 'Para dar a conocer un comercio o emprendimiento: tienda, ferretería, pastelería o productos a pedido.'}
            {' '}Tu ficha aparecerá en el directorio de tu comuna después de la revisión.
          </p>
          <details className="tcPublishGuideDetails">
            <summary>ⓘ ¿Ficha gratis o publicidad?</summary>
            <p>
              La ficha de servicio o negocio es gratuita y se encuentra por
              comuna y rubro. Una campaña publicitaria es opcional: permite
              aparecer en espacios destacados, puede tener un período
              promocional gratuito o un precio informado por separado.
              No necesitas contratar publicidad para publicar tu ficha.
            </p>
          </details>
          <p className="tcVisuallyHidden">Sin RUT ni currículum.</p>
          <label>
            {formKind === 'service'
              ? 'Servicio que ofreces'
              : 'Nombre del negocio'}
            <input
              required
              minLength={3}
              maxLength={90}
              value={title}
              placeholder={
                formKind === 'service'
                  ? 'Ej.: Instalación de calefones'
                  : 'Ej.: Pastelería Los Aromos'
              }
              onChange={e => setTitle(e.target.value)}
            />
            <details className="tcInlineHelp"><summary aria-label="Ayuda del campo">ⓘ</summary><small className="tcFieldHelp">
              {formKind === 'service'
                ? 'Escribe el trabajo que realizas. Ej.: Instalación de calefones o Soldadura a domicilio.'
                : 'Escribe el nombre con que te conocen tus clientes. Ej.: Ferretería Mininco.'}
            </small></details>
          </label>
          <label>
            {formKind === 'service' ? 'Oficio o especialidad' : 'Rubro del negocio'}
            <input
              required
              maxLength={60}
              value={category}
              placeholder={
                formKind === 'service'
                  ? 'Ej.: Soldadura o gasfitería'
                  : 'Ej.: Ferretería o alimentación'
              }
              onChange={e => setCategory(e.target.value)}
            />
            <details className="tcInlineHelp"><summary aria-label="Ayuda del campo">ⓘ</summary><small className="tcFieldHelp">
              {formKind === 'service'
                ? 'Selecciona tu especialidad principal. Así podrán encontrarte por oficio.'
                : 'Indica qué vende o hace tu negocio. Así aparecerá en búsquedas de ese rubro.'}
            </small></details>
          </label>
          <label>
            {formKind === 'service'
              ? 'Describe los trabajos que realizas'
              : 'Describe los productos o la atención de tu negocio'}
            <textarea
              required
              minLength={15}
              maxLength={750}
              value={description}
              placeholder={
                formKind === 'service'
                  ? 'Ej.: Fabrico rejas, reparo portones y atiendo a domicilio.'
                  : 'Ej.: Vendemos herramientas, materiales y hacemos entregas locales.'
              }
              onChange={e => setDescription(e.target.value)}
            />
            <details className="tcInlineHelp"><summary aria-label="Ayuda del campo">ⓘ</summary><small className="tcFieldHelp">
              {formKind === 'service'
                ? 'Explica qué haces, si trabajas a domicilio y en qué zonas atiendes.'
                : 'Explica qué productos ofreces, horarios o formas de entrega.'}
              {' '}No publiques RUT, claves ni direcciones particulares.
            </small></details>
          </label>
          <label>
            Comuna donde ofreces el servicio o negocio
            <select
              required
              value={commune}
              onChange={e => setCommune(e.target.value)}
            >
              <option value="" disabled>
                Selecciona tu comuna
              </option>
              {PLACES.map(value => (
                <option key={value}>{value}</option>
              ))}
            </select>
            <details className="tcInlineHelp"><summary aria-label="Ayuda del campo">ⓘ</summary><small className="tcFieldHelp">
              Elige la comuna real donde {formKind === 'service' ? 'atiendes' : 'funciona tu negocio'}.
              {' '}Mininco corresponde a Collipulli; Coihue a Negrete; Capitán Pastene a Lumaco.
            </small></details>
          </label>
          <details className="tcCoveragePicker">
            <summary>ⓘ Otras comunas donde atiendes</summary>
            <div className="tcCoverageChoices" role="group" aria-label="Comunas de atención">
              {PLACES.filter(value => value !== commune).map(value => (
                <button type="button" key={value}
                  aria-pressed={coverage.includes(value)}
                  className={coverage.includes(value) ? 'selected' : ''}
                  onClick={() => setCoverage(old => old.includes(value)
                    ? old.filter(item => item !== value) : [...old, value])}>
                  {coverage.includes(value) ? '✓ ' : '+ '}{value}
                </button>
              ))}
            </div>
            <small>Selecciona dónde puedes trabajar, vender o realizar entregas.</small>
          </details>
          <div className="tcDirectoryContactFields">
            <label>
              Teléfono
              <input
                type="tel"
                required
                inputMode="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+56 9 1234 5678"
              />
              <details className="tcInlineHelp"><summary aria-label="Ayuda del campo">ⓘ</summary><small className="tcFieldHelp">
                Contacto para consultas. Solo se muestra si lo autorizas.
              </small></details>
            </label>
            <label>
              Correo electrónico
              <input
                type="email"
                required
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="contacto@ejemplo.cl"
              />
              <details className="tcInlineHelp"><summary aria-label="Ayuda del campo">ⓘ</summary><small className="tcFieldHelp">
                Para confirmar y recuperar tu ficha. No es público sin permiso.
              </small></details>
            </label>
          </div>
          <div className="tcDirectoryChecks">
            <label>
              <input
                type="checkbox"
                checked={showPhone}
                onChange={e => setShowPhone(e.target.checked)}
              />
              Permitir consultar mi teléfono
            </label>
            <label>
              <input
                type="checkbox"
                checked={showEmail}
                onChange={e => setShowEmail(e.target.checked)}
              />
              Permitir consultar mi correo
            </label>
          </div>
          <label>
            {formKind === 'service'
              ? 'Fotografías de tus trabajos (hasta 3)'
              : 'Fotografías de tus productos o negocio (hasta 3)'}
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={e =>
                setPhotos(Array.from(e.target.files ?? []).slice(0, 3))
              }
            />
          </label>
          <small role="status">
            {photos.length ? photos.length + ' foto(s) seleccionada(s). ' : ''}
            Las imágenes se optimizan sin metadatos. Usa solo fotografías
            propias o autorizadas.
          </small>
          <label className="tcDirectoryConsent">
            <input
              type="checkbox"
              required
              checked={consent}
              onChange={e => setConsent(e.target.checked)}
            />
            Autorizo tratar mi contacto y el contenido voluntario de esta
            publicación conforme a la política de privacidad.
          </label>
          <p className="tcVisuallyHidden">Publicación gratuita sujeta a revisión.</p>
          {submissionError && (
            <p role="alert" className="tcDirectoryNotice">
              {submissionError}
            </p>
          )}
          <button type="submit" disabled={busy || (!showPhone && !showEmail)}>
            {busy ? 'Enviando…' : 'Enviar para revisión'}
          </button>
        </form>
      )}
      {directoryLoading && (
        <p role="status" className="tcDirectoryNotice">
          Cargando directorio local…
        </p>
      )}
      {visibleListings.length > 0 ? (
        <div className="tcDirectoryGrid">
          {visibleListings.map(entry => (
            <article key={entry.id} className="tcDirectoryCard">
              {entry.photos.length > 0 ? (
                <div className="tcDirectoryPhotos">
                  {entry.photos.map((src, index) => (
                    <button
                      type="button"
                      key={src}
                      className="tcDirectoryPhotoButton"
                      aria-label={
                        'Ampliar fotografía ' +
                        (index + 1) +
                        ' de ' +
                        entry.title
                      }
                      onClick={event =>
                        openPhotos(
                          entry.photos,
                          index,
                          entry.title,
                          event.currentTarget
                        )
                      }
                    >
                      <img
                        src={src}
                        alt={
                          'Trabajo o producto de ' +
                          entry.title +
                          ', foto ' +
                          (index + 1)
                        }
                        loading="lazy"
                        width={320}
                        height={220}
                      />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="tcDirectoryIllustration" aria-hidden="true">
                  <img
                    src={
                      '/house-creatives/' +
                      (entry.kind === 'business'
                        ? 'local-business'
                        : 'professionals') +
                      '.svg'
                    }
                    alt=""
                    loading="lazy"
                  />
                </div>
              )}
              <small>
                <span className="tcDirectoryKindBadge">
                  {entry.kind === 'service' ? 'Servicio' : 'Negocio'}
                </span>{' '}
                · {entry.category} · {entry.commune}
              </small>
              <h3>{entry.title}</h3>
              <p>{entry.description}</p>
              <span className="tcDirectoryCoverage">
                Atiende en: {entry.coverage.join(', ')}
              </span>
              {
                <span className="tcDirectoryRating">
                  <span className="tcDirectoryRatingStars" aria-hidden="true">
                    {entry.rating === null
                      ? '☆☆☆☆☆'
                      : '★'.repeat(
                          Math.max(0, Math.min(5, Math.round(entry.rating)))
                        ) +
                        '☆'.repeat(
                          5 - Math.max(0, Math.min(5, Math.round(entry.rating)))
                        )}
                  </span>
                  <span>
                    {entry.rating === null
                      ? entry.reviewCount > 0
                        ? entry.reviewCount +
                          ' opiniones'
                        : 'Sin calificaciones aún'
                      : entry.rating.toFixed(1) +
                        ' / 5 · ' +
                        entry.reviewCount +
                        ' evaluaciones'}
                  </span>
                </span>
              }
              {contacts[entry.id] && (
                <div className="tcDirectoryContact">
                  {contacts[entry.id].phone && (
                    <a href={'tel:' + contacts[entry.id].phone}>
                      {contacts[entry.id].phone}
                    </a>
                  )}
                  {contacts[entry.id].email && (
                    <a href={'mailto:' + contacts[entry.id].email}>
                      {contacts[entry.id].email}
                    </a>
                  )}
                </div>
              )}
              <div className="tcDirectoryCardActions">
                {entry.contactAvailable && !entry.publicPreview && (
                  <button onClick={() => void reveal(entry.id)}>
                    Ver contacto
                  </button>
                )}
                {entry.kind === 'service' &&
                  /gasfit|gasfiter|fontaner|calef[oó]n|tuber[ií]a|electric/i.test(
                    [entry.title, entry.category, entry.description].join(' ')
                  ) && (
                    <button
                      type="button"
                      className="tcDirectorySupplierButton"
                      onClick={searchRelatedShops}
                    >
                      Buscar ferreterías en la zona
                    </button>
                  )}
                <button
                  type="button"
                  className="tcDirectorySaveButton"
                  aria-pressed={savedDirectoryIds.includes(entry.id)}
                  aria-label={
                    (savedDirectoryIds.includes(entry.id)
                      ? 'Quitar de guardados: '
                      : 'Guardar ficha: ') + entry.title
                  }
                  onClick={() => toggleSavedDirectory(entry.id)}
                >
                  {savedDirectoryIds.includes(entry.id)
                    ? '♥ Guardado'
                    : '♡ Guardar'}
                </button>
                {!entry.publicPreview && !ownsEntry(entry.id) && (
                  <button
                    className="tcRateAction"
                    onClick={event => {
                      reviewOrigin.current = event.currentTarget;
                      setReviewError('');
                      setReviewSuccess(false);
                      setReviewId(entry.id);
                      setRating(0);
      setReviewScores({ timeliness: 0, quality: 0, commitment: 0 });
                      setHired(false);
                      setReportId(null);
                    }}
                  >
                    ★ Calificar{' '}
                    {entry.kind === 'business'
                      ? 'este negocio'
                      : 'este servicio'}
                  </button>
                )}
                {ownsEntry(entry.id) && (
                  <span className="tcDirectoryOwnRatingNote">
                    Esta ficha es tuya: solo pueden calificar quienes
                    contrataron el servicio o compraron en el negocio.
                  </span>
                )}
                {!entry.publicPreview && !ownsEntry(entry.id) && (
                  <button
                    onClick={() => {
                      setReportId(entry.id);
                      setReviewId(null);
                    }}
                  >
                    Reportar problema
                  </button>
                )}
              </div>
              {ownsEntry(entry.id) && (
                <details className="tcDirectoryOwnerActions">
                  <summary>Gestionar mi ficha</summary>
                  <button
                    className="tcDirectoryRemove"
                    onClick={() => void removeOwn(entry.id)}
                  >
                    Retirar mi ficha
                  </button>
                </details>
              )}
              {reportId === entry.id && (
                <form
                  className="tcDirectoryForm tcDirectoryReviewForm"
                  onSubmit={event => void report(event)}
                >
                  <h4>Informar un problema con esta ficha</h4>
                  <label>
                    Correo electrónico
                    <input
                      type="email"
                      required
                      value={reportEmail}
                      onChange={e => setReportEmail(e.target.value)}
                    />
                  </label>
                  <label>
                    ¿Qué ocurrió?
                    <select
                      value={reportReason}
                      onChange={e => setReportReason(e.target.value)}
                    >
                      {[
                        'Información incorrecta',
                        'Posible estafa',
                        'Imágenes no autorizadas',
                        'Otro',
                      ].map(value => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                  <div className="tcDirectoryReviewActions">
                    <button disabled={busy}>Enviar reporte</button>
                    <button type="button" onClick={() => setReportId(null)}>
                      Cancelar
                    </button>
                  </div>
                </form>
              )}
            </article>
          ))}
        </div>
      ) : (
        !directoryLoading && (
          <div className="tcDirectoryEmpty">
            <strong>
              {onlySaved
                ? 'No hay guardados entre estos resultados.'
                : searchText
                  ? 'No hay resultados para esta búsqueda.'
                  : 'Aún no hay fichas aprobadas en esta comuna.'}
            </strong>
            <p>
              Las solicitudes enviadas aparecen en «Mis publicaciones enviadas»
              hasta que se aprueben.
            </p>
          </div>
        )
      )}
      {nextCursor && (
        <button
          type="button"
          className="tcDirectoryMore"
          disabled={loadingMore}
          onClick={() => void moreDirectory()}
        >
          {loadingMore ? 'Cargando…' : 'Cargar más fichas'}
        </button>
      )}
      {reviewId && (
        <div
          className="tcReviewBackdrop"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setReviewId(null);
          }}
        >
          <section
            ref={reviewDialogRef}
            className="tcReviewDialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tc-review-title"
            tabIndex={-1}
          >
            <header className="tcReviewHeader">
              <div>
                <small>OPINIÓN DE QUIEN CONTRATÓ</small>
                <h3 id="tc-review-title">
                  Calificar{' '}
                  {(
                    reviewEntry || listings.find(entry => entry.id === reviewId)
                  )?.kind === 'business'
                    ? 'negocio'
                    : 'servicio'}
                </h3>
                <p>
                  {(
                    reviewEntry || listings.find(entry => entry.id === reviewId)
                  )?.title || 'Servicio local'}
                </p>
              </div>
              <button
                type="button"
                className="tcReviewClose"
                aria-label="Cerrar calificación"
                onClick={() => setReviewId(null)}
              >
                ×
              </button>
            </header>
            {reviewSuccess ? (
              <div className="tcReviewSaved" role="status">
                <strong>✓ Gracias por evaluar</strong>
                <p>Tu opinión ayuda a nuestra comunidad.</p>
                <button type="button" onClick={() => setReviewId(null)}>
                  Volver al directorio
                </button>
              </div>
            ) : (
              <form
                className="tcReviewBody"
                onSubmit={event => void review(event)}
              >
                <strong>¿Cómo fue tu experiencia?</strong>
                {([
                  { key: 'timeliness' as const, label: (reviewEntry || listings.find(x => x.id === reviewId))?.kind === 'business' ? 'Atención' : 'Puntualidad' },
                  { key: 'quality' as const, label: (reviewEntry || listings.find(x => x.id === reviewId))?.kind === 'business' ? 'Calidad de productos' : 'Calidad del trabajo' },
                  { key: 'commitment' as const, label: 'Cumplimiento' },
                ]).map(criterion => (
                  <div className="tcCriteriaRow" key={criterion.key}>
                    <span>{criterion.label}</span>
                    <div className="tcDirectoryStars" role="group"
                      aria-label={'Calificar ' + criterion.label}>
                      {[1, 2, 3, 4, 5].map(value => (
                        <button key={value} type="button"
                          aria-label={criterion.label + ': ' + value + ' estrellas'}
                          aria-pressed={reviewScores[criterion.key] === value}
                          className={reviewScores[criterion.key] >= value ? 'selected' : ''}
                          onClick={() => setCriterion(criterion.key, value)}>★</button>
                      ))}
                    </div>
                  </div>
                ))}
                <p className="tcReviewScore" role="status">
                  {rating > 0 ? 'Nota: ' + rating.toFixed(1) + ' / 5' : 'Califica los tres aspectos'}
                </p>
                <label className="tcReviewHired">
                  <input
                    type="checkbox"
                    required
                    checked={hired}
                    onChange={e => setHired(e.target.checked)}
                  />
                  <span>
                    Confirmo que contraté este servicio o compré en este
                    negocio.
                  </span>
                </label>
                {reviewer?.email ? (
                  <p className="tcDirectoryVerifiedEmail">
                    Correo confirmado: <strong>{reviewer.email}</strong>
                  </p>
                ) : (
                  <div className="tcReviewIdentity">
                    <p>
                      Para evitar valoraciones falsas, confirma tu correo
                      mediante el acceso seguro. No necesitas iniciar sesión
                      para navegar o contactar.
                    </p>
                    <button
                      type="button"
                      className="tcDirectoryEmailLogin"
                      disabled={loginBusy}
                      onClick={() => void loginToReview()}
                    >
                      {loginBusy
                        ? 'Abriendo acceso…'
                        : 'Continuar con Google, Apple o correo'}
                    </button>
                  </div>
                )}
                {reviewError && (
                  <p role="alert" className="tcReviewError">
                    {reviewError}
                  </p>
                )}
                <div className="tcDirectoryReviewActions">
                  <button
                    type="submit"
                    disabled={
                      busy || rating === 0 || !hired || !reviewer?.email
                    }
                  >
                    {busy ? 'Enviando…' : 'Enviar calificación'}
                  </button>
                  <button type="button" onClick={() => setReviewId(null)}>
                    Cancelar
                  </button>
                </div>
                <small>
                  Tu opinión se revisa antes de publicarse. Confirmar el correo
                  no verifica la contratación o compra. No se permite evaluar tu
                  propia ficha.
                </small>
              </form>
            )}
          </section>
        </div>
      )}
      {photoViewer && (
        <div
          className="tcPhotoLightbox"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setPhotoViewer(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={'Fotografías de ' + photoViewer.title}
            className="tcPhotoDialog"
            onTouchStart={event => {
              gestureStart.current = event.touches[0]?.clientX ?? null;
            }}
            onTouchEnd={event => {
              const x = gestureStart.current;
              gestureStart.current = null;
              if (x === null) return;
              const moved = (event.changedTouches[0]?.clientX ?? x) - x;
              if (Math.abs(moved) > 45) movePhoto(moved < 0 ? 1 : -1);
            }}
          >
            <header>
              <strong>{photoViewer.title}</strong>
              <button
                type="button"
                aria-label="Cerrar fotografía"
                onClick={() => setPhotoViewer(null)}
              >
                ×
              </button>
            </header>
            <div className="tcPhotoDialogImage">
              <img
                src={photoViewer.photos[photoViewer.index]}
                alt={
                  'Fotografía ampliada ' +
                  (photoViewer.index + 1) +
                  ' de ' +
                  photoViewer.title
                }
              />
            </div>
            <footer>
              {photoViewer.photos.length > 1 && (
                <button
                  type="button"
                  aria-label="Fotografía anterior"
                  onClick={() => movePhoto(-1)}
                >
                  ‹
                </button>
              )}
              <span>
                {photoViewer.index + 1} / {photoViewer.photos.length}
              </span>
              {photoViewer.photos.length > 1 && (
                <button
                  type="button"
                  aria-label="Fotografía siguiente"
                  onClick={() => movePhoto(1)}
                >
                  ›
                </button>
              )}
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}

/** Moderation is available exclusively in the existing operations panel.
 * This module does not query any admin endpoint on normal public directory visits.
 * Backend still independently enforces requireAuth + administrator allowlist.
 */
export function LocalDirectoryModeration() {
  const [queue, setQueue] = useState<AdminQueue | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
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
    let active = true;
    void auth
      .getUser()
      .then(user => {
        if (active && user) void refresh();
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  async function decide(path: string) {
    setBusy(true);
    setNotice('');
    try {
      await api.post(path, {});
      await refresh();
      setNotice('Decisión registrada.');
    } catch {
      setNotice('No se pudo completar la decisión.');
    } finally {
      setBusy(false);
    }
  }
  if (!queue) return null;
  return (
    <section
      className="opsCard tcDirectoryAdmin"
      aria-label="Moderación de servicios y negocios"
    >
      <h2>Servicios y negocios · Revisión</h2>
      <p>
        Solo administración. Las fichas pendientes aún no aparecen en el
        catálogo público.
      </p>
      <button type="button" onClick={() => void refresh()} disabled={busy}>
        Actualizar bandeja
      </button>
      {notice && <p role="status">{notice}</p>}
      <p>
        Fichas pendientes: <strong>{queue.entries.length}</strong>; opiniones:{' '}
        <strong>{queue.reviews.length}</strong>; denuncias:{' '}
        <strong>{queue.reports.length}</strong>.
      </p>
      {queue.entries.map(entry => (
        <div className="tcDirectoryAdminRow" key={entry.id}>
          <span>
            <strong>{entry.title}</strong> ·{' '}
            {entry.kind === 'service' ? 'Servicio' : 'Negocio'} ·{' '}
            {entry.commune}
            <small>
              {entry.category} · {entry.email} · {entry.phone}
            </small>
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void decide('/api/admin/local-directory/' + entry.id + '/approve')
            }
          >
            Aprobar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void decide('/api/admin/local-directory/' + entry.id + '/hide')
            }
          >
            Rechazar
          </button>
        </div>
      ))}
      {queue.reviews.map(item => (
        <div className="tcDirectoryAdminRow" key={item.id}>
          <span>
            Opinión sobre {item.entryId} · {item.rating} puntos · contratación
            no verificada
          </span>
          <button
            disabled={busy}
            onClick={() =>
              void decide(
                '/api/admin/local-directory/reviews/' + item.id + '/approve'
              )
            }
          >
            Aprobar opinión
          </button>
        </div>
      ))}
      {queue.reports.map(item => (
        <div className="tcDirectoryAdminRow" key={item.id}>
          <span>
            Reporte: {item.reason} · {item.entryId}
          </span>
          <button
            disabled={busy}
            onClick={() =>
              void decide(
                '/api/admin/local-directory/reports/' + item.id + '/resolve'
              )
            }
          >
            Marcar revisado
          </button>
        </div>
      ))}
    </section>
  );
}
