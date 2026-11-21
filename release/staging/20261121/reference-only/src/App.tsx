import { StitchBrand } from './stitch-brand';
import { StitchCommunity } from './stitch-community';
import {
  InlineHousePromotion,
  FormEditorialPromotion,
} from './advertising-surfaces';
import { LegalContent } from './legal-content';
import { PRIMARY_PLACES, COMPLEMENTARY_PLACES } from '../shared/territories';
import { loadReading, saveReading, markReading } from './reading-history';
import {
  reviewLabel,
  identifiedEmployer,
  originalPoster,
  shortDate,
} from './compact-presentation';
import { publicSourceLabel, publicOfferDetail } from './public-content-policy';
import { TerritorialRadar } from './territorial-radar';
import { ActivityCenter } from './activity-center';
import { listingShareUrl } from '../shared/listing-links';
import { LEGAL_RESPONSIBLE } from './legal-responsible';
import { COMMERCIAL_PLACES } from '../shared/commercial-policy';
import { OwnedPublicationEditor } from './owned-publication-editor';
import {
  HouseBanner,
  useAdvertising,
  sendHouseEvent,
  completeHouseGoal,
  type HouseAttribution,
} from './house-advertising';
import type { Goal, Slot } from '../shared/house-ads';
import {
  Fragment,
  lazy,
  Suspense,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api, auth, image as appImage, notifications } from '@appdeploy/client';
import { readFeedInventory } from './feed-inventory';
import { readPublicJobCache, writePublicJobCache } from './catalog-cache';
import { readRemaining } from './feed-page-batch';
import {
  AdministratorAccess,
  AdministratorShortcut,
} from './administrator-access';
const RestoreRehearsalProof = lazy(() =>
  import('./restore-rehearsal-proof').then(module => ({
    default: module.RestoreRehearsalProof,
  }))
);
import './ops-dashboard.css';
import './territory-split.css';
import { publishedInventoryCounts, recentInApp } from './feed-presentation';
import './inventory-banner.css';
import {
  NearbyCities,
  LocalAdvertising,
  LaborNewsSection,
} from './territorial-sections';
import {
  matchesTerritorialView,
  officialWorkCommune,
  territorialScopeTotals,
} from './territorial-exploration';
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Bell,
  Briefcase,
  Building2,
  Camera,
  CheckCircle,
  Download,
  Handshake,
  HeartPulse,
  House,
  MapPin,
  Megaphone,
  PlusCircle,
  Radar,
  Radio,
  Search,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Store,
  TreePine,
  Truck,
  UserRoundSearch,
  Users,
  Warehouse,
  Wrench,
  X,
} from 'lucide-react';
import './vnext.css';
import './compact-layout.css';
import './premium-presentation.css';
import './stitch-fidelity.css';
import './public-experience.css';
import './mobile-polish.css';
import './mobile-structure.css';
import './ux-polish-2026-11.css';
import './commercial-card.css';
import './ux-compact-2026-11.css';
import { SiteMenu } from './site-menu';
const LocalDirectory = lazy(() =>
  import('./local-directory').then(module => ({
    default: module.LocalDirectory,
  }))
);
const LocalDirectoryModeration = lazy(() =>
  import('./local-directory').then(module => ({
    default: module.LocalDirectoryModeration,
  }))
);
import './local-directory.css';
import './ux-territorial-cleanup.css';
import './ux-release-consolidated.css';
import './house-campaign-polish.css';
import { compactWorkplaceLabel } from './workplace-label';
function analyticsId() {
  try {
    const existing = sessionStorage.getItem('tc_technical_session');
    if (existing) return existing;
    const next = crypto.randomUUID();
    sessionStorage.setItem('tc_technical_session', next);
    return next;
  } catch {
    return 'tc_session_' + crypto.randomUUID();
  }
}
function track(
  event: string,
  properties: Record<string, string | number | boolean | undefined> = {}
) {
  try {
    if (localStorage.getItem('tc_analytics_consent') !== 'yes') return;
  } catch {
    return;
  }
  void api
    .post('/api/analytics', {
      eventId: crypto.randomUUID(),
      event,
      distinctId: analyticsId(),
      properties,
      consent: true,
    })
    .catch(() => undefined);
}
// Don't render two destination buttons when the application and source URLs lead to the same page.
function sameExternalDestination(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  try {
    const normalize = (value: string) => {
      const url = new URL(value);
      if (url.protocol !== 'https:') return '';
      const ignored = [
        'fbclid',
        'gclid',
        'ref',
        'ref_src',
        'source',
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'utm_term',
        'utm_content',
      ];
      for (const key of ignored) url.searchParams.delete(key);
      url.searchParams.sort();
      return (
        url.hostname.replace(/^www\./, '').toLowerCase() +
        url.pathname.replace(/\/+$/, '') +
        '?' +
        url.searchParams.toString()
      );
    };
    const left = normalize(a),
      right = normalize(b);
    return Boolean(left) && left === right;
  } catch {
    return false;
  }
}
function publicDate(item: Listing) {
  if (item.origin === 'direct')
    return (
      shortDate(item.firstPublishedAt || item.createdAt) || 'Fecha no informada'
    );
  const original = shortDate(item.sourcePublishedAt || '');
  if (original) return original;
  // «Publicado hoy» puede representar incorporación al radar: nunca usar descubrimiento como fecha original.
  return item.date && item.date !== 'Publicado hoy'
    ? item.date
    : 'Fecha original no informada';
}

type Flow = 'ofrezco' | 'trabajadores' | 'servicio' | 'aporte';
type Section = 'opportunities' | 'people' | 'needs' | 'services';
type LegalView = 'privacy' | 'terms' | null;

type Sponsor = {
  id: string;
  businessName: string;
  category: string;
  headline: string;
  detail: string;
  communes: string[];
  url?: string;
  label: 'Publicidad local' | 'Patrocinado';
  scope: 'exact' | 'nearby' | 'regional';
};
type FilterMode = 'work' | 'recruit';
type CommuneStat = {
  jobs: number;
  newJobs24h: number;
  newJobs7d?: number;
  people: number;
  needs: number;
  services: number;
};
type FeedSummary = {
  totalItems: number;
  totalJobOffers: number;
  recentJobOffers7d?: number;
  recentJobOffers24h?: number;
  totalVerifiedJobOffers: number;
  totalProvisionalJobOffers: number;
  communeStats: Record<string, CommuneStat>;
  kindStats: { jobs: number; people: number; needs: number; services: number };
};
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type OpsSummary = {
  updatedAt: string;
  jobs: {
    active: number;
    verified: number;
    publicPending: number;
    direct: number;
    publicVisible: number;
    publicVerified: number;
    publicUpdatedAt: string;
  };
  radar: {
    pendingCandidates: number;
    sourceFailures: number;
    lastSweep: string | null;
  };
  growth: {
    advertiserLeads: number;
    socialDrafts: number;
    activeCampaigns: number;
    advertiserLeadsPartial?: boolean;
    socialDraftsPartial?: boolean;
  };
  privacy: { personalDetailsIncluded: boolean; note: string };
};

type RadarSource = {
  key: string;
  name: string;
  family: string;
  mode: 'public_scan' | 'discovery' | 'community';
  status: 'automatic' | 'active' | 'limited';
  note: string;
  lastChecked?: string;
  lastStatus?: 'ok' | 'blocked' | 'error';
  candidatesFound: number;
  newCandidates: number;
};

type RadarStatus = {
  sources: RadarSource[];
  automatedSources: number;
  pendingCandidates: number;
  secondEngineConfigured: boolean;
  thirdEngineConfigured: boolean;
  searchEngines: number;
  motor2Latest?: {
    checkedAt: string;
    status: 'ok' | 'blocked' | 'error';
    linksSeen: number;
    candidatesFound: number;
    newCandidates: number;
    message?: string;
  };
  motor3Latest?: {
    checkedAt: string;
    status: 'ok' | 'blocked' | 'error';
    linksSeen: number;
    candidatesFound: number;
    newCandidates: number;
    message?: string;
  };
  inventoryDiagnostics?: {
    sampled: number;
    hasMore: boolean;
    precargadas: number;
    automaticas: number;
    socialPublicadas: number;
    bySource: Record<string, number>;
  };
  socialOverview?: {
    sampled: number;
    pending: number;
    processed: number;
    failed: number;
    imagesRead: number;
    jobNotices: number;
    hasMore: boolean;
  };
  territoryCoverage?: Array<{
    place: string;
    officialSources: number;
    communitySources: number;
    automatedSources: number;
    lastChecked?: string;
    gap: string;
  }>;
  lastSweep?: string;
};

type Listing = {
  id: string;
  kind:
    | 'job_offer'
    | 'worker_available'
    | 'worker_need'
    | 'service_request'
    | 'candidate';
  origin: 'radar' | 'direct' | 'community';
  title: string;
  company: string;
  workLocation: string;
  workCommunes: string[];
  recruitmentZones: string[];
  recruitmentCommunes: string[];
  area: string;
  status: string;
  date: string;
  until?: string;
  vacancies?: number;
  apply?: string;
  applicationUrl?: string;
  source: string;
  sourceDomain: string;
  discoveredBy?: string;
  sourcePublishedAt?: string;
  url?: string;
  note: string;
  salary?: string;
  tags: string[];
  visual: string;
  icon: string;
  portalPlace?: string;
  evidence?: string;
  review: boolean;
  verified: boolean;
  createdAt: string;
  firstPublishedAt?: string;
  revalidationDue?: boolean;
  lastVerifiedAt?: string;
  externalVerifiedAt?: string;
  verifiedAt?: string;
  verificationMethod?: string;
  verificationReason?: string;
  evidenceSources?: string[];
  originalPosterUrl?: string;
  sourceImageUrl?: string;
  active?: boolean;
  contact?: string;
  contactLabel?: string;
  hasContact?: boolean;
};

const places = ['Todas', ...PRIMARY_PLACES];
const travelPlaces: readonly string[] = COMPLEMENTARY_PLACES;
const emptyCommuneStat: CommuneStat = {
  jobs: 0,
  newJobs24h: 0,
  people: 0,
  needs: 0,
  services: 0,
};

function getOwnerTokens(): Record<string, string> {
  try {
    return JSON.parse(
      localStorage.getItem('trabajo-cerca-owner-tokens') || '{}'
    ) as Record<string, string>;
  } catch {
    return {};
  }
}

function saveOwnerToken(id: string, token: string) {
  const current = getOwnerTokens();
  current[id] = token;
  try {
    localStorage.setItem('trabajo-cerca-owner-tokens', JSON.stringify(current));
  } catch {
    /* Guardar comprobante de titularidad. */
  }
}

function FormPanel({
  flow,
  onClose,
  onPublished,
  attribution,
}: {
  flow: Flow;
  onClose: () => void;
  onPublished: (kind: Listing['kind']) => void;
  attribution?: HouseAttribution | null;
}) {
  const [preview, setPreview] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [photoSending, setPhotoSending] = useState(false);
  const photoReadingEnabled = true;
  const sharedParams = new URLSearchParams(window.location.search);
  const sharedTitle =
    flow === 'aporte' ? sharedParams.get('share_title') || '' : '';
  const sharedText =
    flow === 'aporte' ? sharedParams.get('share_text') || '' : '';
  const sharedUrl =
    flow === 'aporte' ? sharedParams.get('share_url') || '' : '';
  const sharedEvidence = [sharedTitle, sharedText, sharedUrl].join(' ');
  const sharedPlace =
    places.find(
      value =>
        value !== 'Todas' &&
        sharedEvidence
          .toLocaleLowerCase('es-CL')
          .includes(value.toLocaleLowerCase('es-CL'))
    ) || 'Angol';
  let sharedSource = 'Aporte compartido';
  if (/facebook\.com/i.test(sharedUrl)) sharedSource = 'Facebook';
  else if (/instagram\.com/i.test(sharedUrl)) sharedSource = 'Instagram';
  else if (/whatsapp/i.test(sharedText)) sharedSource = 'WhatsApp';

  const [data, setData] = useState(() => ({
    title: sharedTitle.slice(0, 140),
    name: '',
    place: sharedPlace,
    zones: [sharedPlace] as string[],
    date: '',
    count: '1',
    contact: '',
    detail: sharedText.slice(0, 1200),
    availability: 'Inmediata',
    sourceName: sharedSource,
    sourceUrl: /^https?:\/\//i.test(sharedUrl) ? sharedUrl.slice(0, 600) : '',
  }));

  const started = useRef(false);
  const set = (key: string, value: string) => {
    if (attribution && !started.current) {
      started.current = true;
      sendHouseEvent(attribution, 'form_started');
    }
    setData(d => ({ ...d, [key]: value }));
  };
  const toggleZone = (zone: string) => {
    setData(d => ({
      ...d,
      zones: d.zones.includes(zone)
        ? d.zones.filter(x => x !== zone)
        : [...d.zones, zone],
    }));
  };

  const heading =
    flow === 'ofrezco'
      ? 'Ofrezco mi trabajo'
      : flow === 'trabajadores'
        ? 'Necesito trabajadores'
        : flow === 'servicio'
          ? 'Necesito un servicio'
          : 'Aportar un aviso al Radar';

  const kind: Listing['kind'] =
    flow === 'ofrezco'
      ? 'worker_available'
      : flow === 'trabajadores'
        ? 'worker_need'
        : flow === 'servicio'
          ? 'service_request'
          : 'candidate';

  const cardTitle =
    data.title || (flow === 'aporte' ? 'Aviso aportado al Radar' : heading);
  const requestClose = () => {
    const draft = Boolean(
      data.title.trim() ||
      data.detail.trim() ||
      data.contact.trim() ||
      data.sourceUrl.trim()
    );
    if (!draft || window.confirm('¿Descartar este borrador sin publicar?'))
      onClose();
  };

  const submitPhoto = async (
    file: File,
    sourceName = 'Foto / imagen compartida'
  ) => {
    if (!photoReadingEnabled) {
      setErrorMessage(
        'La lectura de fotos está deshabilitada. Comparte el enlace o texto del aviso.'
      );
      return;
    }
    setPhotoSending(true);
    setErrorMessage('');
    try {
      const prepared = await appImage.resizeIfNeeded(file, {
        maxDimension: 1600,
        maxPixels: 2000000,
        quality: 0.82,
        mimeType: 'image/jpeg',
      });
      const response = await api.post('/api/radar/photo-tip', {
        imageData: prepared.data,
        mimeType: prepared.mimeType,
        sourceName,
        clientToken: analyticsId(),
      });
      track('tc_photo_tip_submitted', {
        public: Boolean(response.data.public),
        duplicate: Boolean(response.data.duplicate),
      });
      onPublished('candidate');
      onClose();
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'No pudimos leer la foto. Intenta nuevamente.'
      );
    } finally {
      setPhotoSending(false);
    }
  };

  useEffect(() => {
    if (flow !== 'aporte') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('share_image') !== '1') return;
    const shareKey = window.location.search;
    if (sessionStorage.getItem('tc_shared_image_processing') === shareKey)
      return;
    sessionStorage.setItem('tc_shared_image_processing', shareKey);
    void fetch('./__shared_job_image__')
      .then(response => {
        if (!response.ok)
          throw new Error('No se encontró la imagen compartida.');
        return response.blob();
      })
      .then(blob =>
        submitPhoto(
          new File([blob], 'aviso-compartido.jpg', {
            type: blob.type || 'image/jpeg',
          }),
          'Imagen compartida desde otra app'
        )
      )
      .catch(err => {
        sessionStorage.removeItem('tc_shared_image_processing');
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'No pudimos procesar la imagen compartida.'
        );
      });
  }, [flow]);

  const publish = async () => {
    setPublishing(true);
    setErrorMessage('');
    try {
      const response = await api.post('/api/listings', {
        kind,
        title: cardTitle,
        name: data.name,
        workLocation: data.place,
        recruitmentZones: data.zones,
        startDate: data.date,
        count: Number(data.count || 1),
        contact: data.contact,
        detail: data.detail,
        sourceName: data.sourceName,
        sourceUrl: data.sourceUrl,
        website,
        consent,
        clientToken: analyticsId(),
        houseAttribution: attribution,
      });
      if (!response.data.item?.id)
        throw new Error('La publicación no fue confirmada.');
      if (kind === 'worker_available') completeHouseGoal('professional');
      if (kind === 'worker_need') completeHouseGoal('employer');
      if (response.data.ownerToken && response.data.item?.id) {
        saveOwnerToken(response.data.item.id, response.data.ownerToken);
      }
      onPublished(kind);
      onClose();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'No se pudo publicar. Intenta nuevamente.';
      setErrorMessage(message);
    } finally {
      setPublishing(false);
    }
  };

  const publicationDialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dialog = publicationDialog.current;
    if (!dialog) return;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const controls = () =>
      [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled)'
        ),
      ].filter(node => node.getClientRects().length > 0);
    (controls()[0] || dialog).focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
      }
      if (event.key === 'Tab') {
        const nodes = controls(),
          first = nodes[0],
          last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [onClose, preview]);

  if (preview) {
    return (
      <div
        className="modal"
        ref={publicationDialog}
        role="dialog"
        aria-modal="true"
        aria-label={preview ? 'Revisa antes de publicar' : heading}
        tabIndex={-1}
      >
        <div className="panel previewPanel">
          <button className="close" onClick={requestClose} aria-label="Cerrar">
            <X />
          </button>
          <span className="lab">PUBLICACIÓN REAL · BASE CENTRAL</span>
          <h2>Revisa antes de publicar</h2>
          <p>
            Al confirmar, el aviso quedará visible en Trabajo Cerca y seguirá
            allí al volver a abrir la app.
          </p>

          <div className={'createdCard ' + flow}>
            <div className="createdVisual">
              {flow === 'trabajadores' ? (
                <Users />
              ) : flow === 'ofrezco' ? (
                <UserRoundSearch />
              ) : flow === 'servicio' ? (
                <Wrench />
              ) : (
                <Radar />
              )}
              <span>
                {flow === 'aporte' ? 'APORTE AL RADAR' : 'PUBLICACIÓN DIRECTA'}
              </span>
            </div>
            <div className="createdBody">
              <small>
                {flow === 'ofrezco'
                  ? 'PERSONA DISPONIBLE'
                  : flow === 'trabajadores'
                    ? 'SE NECESITAN TRABAJADORES'
                    : flow === 'servicio'
                      ? 'SERVICIO SOLICITADO'
                      : 'EN REVISIÓN'}
              </small>
              <h3>{cardTitle}</h3>
              {data.name && <p className="creator">{data.name}</p>}
              <div className="previewGeo">
                <MapPin />
                <b>{data.place}</b>
              </div>
              {data.zones.length > 0 && (
                <div className="previewZones">
                  <Users />
                  <span>
                    {flow === 'ofrezco' ? 'Puede trabajar en' : 'Zona'}:{' '}
                    {data.zones.join(' · ')}
                  </span>
                </div>
              )}
              {data.detail && <p>{data.detail}</p>}
            </div>
          </div>

          {errorMessage && (
            <div className="formError">
              <AlertCircle /> {errorMessage}
            </div>
          )}
          <div className="previewActions">
            <button className="secondary" onClick={() => setPreview(false)}>
              Editar
            </button>
            <button className="primary" onClick={publish} disabled={publishing}>
              <CheckCircle size={17} />{' '}
              {publishing ? 'Publicando…' : 'Publicar ahora'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="modal"
      ref={publicationDialog}
      role="dialog"
      aria-modal="true"
      aria-label={preview ? 'Revisa antes de publicar' : heading}
      tabIndex={-1}
    >
      <div className="panel smartForm">
        <button className="close" onClick={requestClose} aria-label="Cerrar">
          <X />
        </button>
        <span className="lab">TRABAJO CERCA · PUBLICACIÓN PERSISTENTE</span>
        <h2>{heading}</h2>
        <p>
          Solo pedimos lo necesario. No CV, RUT, dirección exacta ni datos
          bancarios.
        </p>

        <form
          onSubmit={event => {
            event.preventDefault();
            setPreview(true);
          }}
        >
          {flow === 'ofrezco' && (
            <>
              <label>
                ¿Qué trabajo u oficio ofreces?
                <input
                  required
                  value={data.title}
                  onChange={e => set('title', e.target.value)}
                  placeholder="Ej. Tractorista, jornalero, carpintero…"
                />
              </label>
            </>
          )}

          {flow === 'trabajadores' && (
            <>
              <label>
                ¿Qué trabajador necesitas?
                <input
                  required
                  value={data.title}
                  onChange={e => set('title', e.target.value)}
                  placeholder="Ej. 8 cosecheros, soldador, ayudante…"
                />
              </label>
              <label>
                Cantidad de personas
                <input
                  type="number"
                  min="1"
                  value={data.count}
                  onChange={e => set('count', e.target.value)}
                />
              </label>
              <label>
                Nombre del empleador o negocio <small>opcional</small>
                <input
                  value={data.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder="Ej. Fundo Santa Ana"
                />
              </label>
            </>
          )}

          {flow === 'servicio' && (
            <label>
              ¿Qué servicio necesitas?
              <input
                required
                value={data.title}
                onChange={e => set('title', e.target.value)}
                placeholder="Ej. Reparación eléctrica domiciliaria"
              />
            </label>
          )}

          {flow === 'aporte' && (
            <>
              <div className="photoTipBox">
                <div>
                  <Camera />
                  <span>
                    <b>¿Encontraste un afiche laboral?</b>
                    <small>
                      Envía una fotografía o captura de Facebook, Instagram,
                      WhatsApp o un cartel. No pedimos tus datos. Se guarda en
                      una cola privada y solo se publica tras revisión. No
                      envíes contenido sexual, discriminatorio, engañoso ni
                      datos personales ajenos que no sean necesarios para
                      postular.
                    </small>
                  </span>
                </div>
                <label
                  className={'photoTipButton ' + (photoSending ? 'busy' : '')}
                >
                  <Camera />{' '}
                  {photoSending
                    ? 'Enviando afiche…'
                    : 'Sacar foto o elegir captura'}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={!photoReadingEnabled || photoSending}
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) void submitPhoto(file, 'Foto / galería');
                      e.currentTarget.value = '';
                    }}
                  />
                </label>
              </div>
              {errorMessage && (
                <div className="formError">
                  <AlertCircle /> {errorMessage}
                </div>
              )}
              <div className="photoOr">
                <span>o, si prefieres, aporta texto o enlace</span>
              </div>
              <label>
                Cargo u oficio que aparece
                <input
                  value={data.title}
                  onChange={e => set('title', e.target.value)}
                  placeholder="Ej. Tractorista / se necesitan temporeros"
                />
              </label>
              <label>
                Texto del aviso
                <textarea
                  required
                  value={data.detail}
                  onChange={e => set('detail', e.target.value)}
                  placeholder="Pega o escribe lo que viste o escuchaste…"
                />
              </label>
              <label>
                ¿Dónde lo encontraste?
                <select
                  value={data.sourceName}
                  onChange={e => set('sourceName', e.target.value)}
                >
                  <option>Facebook</option>
                  <option>Instagram</option>
                  <option>WhatsApp</option>
                  <option>Radio</option>
                  <option>Cartel</option>
                  <option>Sitio web</option>
                  <option>Otra IA / buscador</option>
                  <option>Otro</option>
                </select>
              </label>
              <label>
                Enlace directo <small>si existe</small>
                <input
                  value={data.sourceUrl}
                  onChange={e => set('sourceUrl', e.target.value)}
                  placeholder="https://…"
                />
              </label>
            </>
          )}

          <label>
            {flow === 'ofrezco'
              ? 'Tu localidad'
              : flow === 'servicio'
                ? 'Localidad del servicio'
                : 'Lugar real de trabajo'}
            <select
              value={data.place}
              onChange={e => set('place', e.target.value)}
            >
              {places
                .filter(p => p !== 'Todas')
                .map(p => (
                  <option key={p}>{p}</option>
                ))}
            </select>
          </label>

          <FormEditorialPromotion place={data.place} />

          {(flow === 'trabajadores' || flow === 'ofrezco') && (
            <fieldset>
              <legend>
                {flow === 'ofrezco'
                  ? '¿Dónde puedes trabajar?'
                  : '¿Desde qué comunas aceptas personas?'}{' '}
                <small>elige varias</small>
              </legend>
              <div className="zonePicker">
                {places
                  .filter(p => p !== 'Todas')
                  .map(zone => (
                    <button
                      type="button"
                      key={zone}
                      className={data.zones.includes(zone) ? 'selected' : ''}
                      onClick={() => toggleZone(zone)}
                    >
                      {data.zones.includes(zone) && <CheckCircle size={13} />}{' '}
                      {zone}
                    </button>
                  ))}
              </div>
            </fieldset>
          )}

          {flow !== 'aporte' && (
            <>
              <label>
                Descripción breve
                <textarea
                  value={data.detail}
                  onChange={e => set('detail', e.target.value)}
                  placeholder="Experiencia, horario, disponibilidad, condiciones…"
                />
              </label>
              <label>
                WhatsApp o teléfono de contacto
                <input
                  type="tel"
                  required
                  value={data.contact}
                  onChange={e => set('contact', e.target.value)}
                  placeholder="+56 9…"
                />
              </label>
            </>
          )}

          <label className="hp" aria-hidden="true">
            Sitio
            <input
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={e => setWebsite(e.target.value)}
            />
          </label>
          <label className="consentRow">
            <input
              type="checkbox"
              checked={consent}
              onChange={e => setConsent(e.target.checked)}
              required
            />
            <span>
              {flow === 'aporte'
                ? 'Confirmo que comparto este aviso desde una fuente pública o legítima y que no incluyo datos sensibles innecesarios.'
                : 'Autorizo que los datos que ingresé se publiquen para facilitar contactos laborales. Podré eliminar mi publicación y sus datos desde este dispositivo.'}
            </span>
          </label>
          <div className="privacy">
            <ShieldCheck size={19} />
            <span>
              Solo pedimos lo necesario. Tu contacto no se descarga junto con el
              listado: se revela únicamente cuando alguien decide contactar.
            </span>
          </div>
          <button className="primary">
            Revisar antes de publicar <ArrowRight size={17} />
          </button>
        </form>
      </div>
    </div>
  );
}

function AdvertiserPanel({
  onClose,
  onSent,
  initialCommune = 'Angol',
  attribution,
}: {
  onClose: () => void;
  onSent: () => void;
  initialCommune?: string;
  attribution?: HouseAttribution | null;
}) {
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [consent, setConsent] = useState(false);
  const [advertisingConsent, setAdvertisingConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [slots, setSlots] = useState<string[]>(['search']);
  const [headlineRequested, setHeadlineRequested] = useState('');
  const [previewAd, setPreviewAd] = useState(false);
  const adDialogRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState({
    businessName: '',
    commune: COMMERCIAL_PLACES.includes(initialCommune)
      ? initialCommune
      : 'Angol',
    category: 'Comercio local',
    presence: 'Facebook / Instagram',
    contact: '',
    note: '',
  });
  const [promotion, setPromotion] = useState<{
    days: number;
    kind: string;
    remaining: number;
    message: string;
    conditions: string;
  } | null>(null);
  useEffect(() => {
    let alive = true;
    void api
      .get('/api/growth/promotion')
      .then(r => {
        if (alive) setPromotion(r.data);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const started = useRef(false);
  const set = (key: string, value: string) => {
    if (attribution && !started.current) {
      started.current = true;
      sendHouseEvent(attribution, 'form_started');
    }
    setData(current => ({ ...current, [key]: value }));
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSending(true);
    setErrorMessage('');
    try {
      const response = await api.post('/api/growth/advertiser-leads', {
        ...data,
        placementsRequested: slots,
        headlineRequested,
        consent,
        advertisingConsent,
        website,
        clientToken: analyticsId(),
        houseAttribution: attribution,
      });
      if (!response.data.id && !response.data.duplicate)
        throw new Error('La solicitud no fue confirmada.');
      completeHouseGoal('advertiser');
      track('tc_advertiser_interest_submitted', {
        commune: data.commune,
        category: data.category,
        presence: data.presence,
      });
      onSent();
      onClose();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'No pudimos registrar tu interés.'
      );
    } finally {
      setSending(false);
    }
  };
  useEffect(() => {
    const dialog = adDialogRef.current;
    if (!dialog) return;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const nodes = () =>
      [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)'
        ),
      ].filter(el => el.getClientRects().length > 0);
    (nodes()[0] || dialog).focus();
    const close = () => {
      if (
        window.confirm(
          '¿Cerrar esta solicitud? Se perderán los datos no enviados.'
        )
      )
        onClose();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      const a = nodes(),
        first = a[0],
        last = a[a.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [onClose]);
  return (
    <div className="modal">
      <div
        className="panel advertiserPanel"
        ref={adDialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tc-advertise-title"
        tabIndex={-1}
      >
        <button
          className="close"
          onClick={() => {
            if (window.confirm('¿Cerrar esta solicitud sin enviarla?'))
              onClose();
          }}
          aria-label="Cerrar"
        >
          <X />
        </button>
        <span className="lab">TRABAJO CERCA · COMERCIO LOCAL</span>
        <h2 id="tc-advertise-title">Solicita publicidad para tu negocio</h2>
        <p className="tcAdvertiserGuide">
          <strong>Publicidad destacada, distinta de la ficha gratuita.</strong>
          {' '}Aquí solicitas mostrar un anuncio en espacios promocionales.
          Si solo quieres aparecer gratuitamente en el directorio, utiliza
          «Publicar servicio o negocio». Enviar esta solicitud no genera cobros.
        </p>
        <p>
          <b>
            {promotion
              ? promotion.days
                ? `${promotion.days} días gratuitos desde la aprobación · ${promotion.kind === 'founder' ? 'Fundadores' : 'Prueba estándar'}`
                : promotion.message
              : 'Consultando la promoción vigente…'}
          </b>{' '}
          Revisaremos tu solicitud antes de activarla. No necesitas página web:
          puede ser Facebook, Instagram, WhatsApp o un contacto comercial. No
          existe renovación automática ni se realizará ningún cobro sin
          informarte antes.
        </p>
        {promotion && (
          <p>
            {promotion.conditions}
            {promotion.kind === 'founder' &&
              ` Cupos disponibles: ${promotion.remaining}. La disponibilidad se comprueba al aprobar.`}
          </p>
        )}
        <details className="tcPublishGuideDetails tcAdGuideDetails">
          <summary>¿Qué opción necesito?</summary>
          <p>
            Servicio gratuito: trabajos u oficios que realizas. Negocio
            gratuito: ficha de tienda o emprendimiento en el directorio.
            Publicidad: anuncio opcional con mayor visibilidad por comuna y
            ubicación, sujeto a revisión y vigencia. Las promociones gratuitas
            de lanzamiento son temporales y no sustituyen la ficha gratuita.
          </p>
        </details>
        <form onSubmit={submit}>
          <label>
            Nombre del negocio
            <input
              required
              value={data.businessName}
              onChange={e => set('businessName', e.target.value)}
              placeholder="Ej. Ferretería El Roble"
            />
            <details className="tcInlineHelp"><summary aria-label="Ayuda del campo">ⓘ</summary><small className="tcAdFieldHelp">
              Usa el nombre comercial visible para tus clientes.
            </small></details>
          </label>
          <label>
            Comuna
            <select
              value={data.commune}
              onChange={e => set('commune', e.target.value)}
            >
              {COMMERCIAL_PLACES.map(p => (
                <option key={p}>{p}</option>
              ))}
            </select>
            <details className="tcInlineHelp"><summary aria-label="Ayuda del campo">ⓘ</summary><small className="tcAdFieldHelp">
              Elige dónde deseas promocionarte. Mininco corresponde a Collipulli;
              la cobertura definitiva queda sujeta a revisión.
            </small></details>
          </label>
          <label>
            Rubro
            <select
              value={data.category}
              onChange={e => set('category', e.target.value)}
            >
              <option>Alojamiento y hosterías</option>
              <option>Servicios agrícolas</option>
              <option>Comercio local</option>
              <option>Ferretería / herramientas</option>
              <option>Alimentación</option>
              <option>Transporte</option>
              <option>Servicios técnicos</option>
              <option>EPP / seguridad</option>
              <option>Capacitación</option>
              <option>Otro</option>
            </select>
            <details className="tcInlineHelp"><summary aria-label="Ayuda del campo">ⓘ</summary><small className="tcAdFieldHelp">
              Selecciona el rubro que mejor describa tus productos o servicios.
            </small></details>
          </label>
          <label>
            Presencia principal
            <select
              value={data.presence}
              onChange={e => set('presence', e.target.value)}
            >
              <option>Facebook / Instagram</option>
              <option>WhatsApp</option>
              <option>Sitio web</option>
              <option>Local físico / sin página</option>
              <option>Otro</option>
            </select>
            <details className="tcInlineHelp"><summary aria-label="Ayuda del campo">ⓘ</summary><small className="tcAdFieldHelp">
              No necesitas sitio web: puede ser una red social, WhatsApp
              o la atención en un local.
            </small></details>
          </label>
          <label>
            Correo, WhatsApp o teléfono comercial
            <input
              required
              value={data.contact}
              onChange={e => set('contact', e.target.value)}
              placeholder="Medio para que Trabajo Cerca te contacte"
            />
            <details className="tcInlineHelp"><summary aria-label="Ayuda del campo">ⓘ</summary><small className="tcAdFieldHelp">
              Es solo para responder tu solicitud. No se publicará
              automáticamente como contacto del anuncio.
            </small></details>
          </label>
          <fieldset className="tcAdSlotChoices">
            <legend>¿Dónde prefieres mostrar tu anuncio?</legend>
            <details className="tcInlineHelp"><summary aria-label="Ayuda del campo">ⓘ</summary><small className="tcAdFieldHelp">
              Puedes marcar varios espacios; la ubicación final depende de
              disponibilidad y aprobación, no queda reservada al enviar.
            </small></details>
            {(
              [
                ['search', 'Junto al buscador'],
                ['listing', 'Entre las ofertas'],
                ['featured', 'Destacado territorial'],
                ['form', 'En formularios'],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={slots.includes(key)}
                  onChange={event =>
                    setSlots(old =>
                      event.target.checked
                        ? [...old, key]
                        : old.filter(x => x !== key)
                    )
                  }
                />
                {label}
              </label>
            ))}
          </fieldset>
          <label>
            Mensaje principal del anuncio <small>opcional</small>
            <input
              value={headlineRequested}
              maxLength={130}
              onChange={event => setHeadlineRequested(event.target.value)}
              placeholder="Ej. Herramientas y servicios cerca de ti"
            />
            <details className="tcInlineHelp"><summary aria-label="Ayuda del campo">ⓘ</summary><small className="tcAdFieldHelp">
              Una frase breve que motive a conocer tu negocio. Evita promesas
              que no puedas cumplir.
            </small></details>
          </label>
          <button
            type="button"
            className="tcAdPreviewToggle"
            onClick={() => setPreviewAd(value => !value)}
          >
            {previewAd
              ? 'Ocultar vista previa'
              : 'Ver vista previa del anuncio'}
          </button>
          {previewAd && (
            <div
              className="tcAdLeadPreview"
              aria-label="Vista previa ilustrativa del anuncio"
            >
              <img
                src="/house-creatives/local-business.svg"
                onError={event => { event.currentTarget.style.display = 'none'; }}
                alt=""
                loading="lazy"
              />
              <div>
                <small>VISTA ORIENTATIVA · SUJETA A REVISIÓN</small>
                <strong>{data.businessName || 'Tu negocio local'}</strong>
                <p>
                  {headlineRequested || 'Productos y servicios en tu comuna.'}
                </p>
                <small>
                  {slots.length} espacio(s) solicitado(s) · {data.commune}
                </small>
              </div>
            </div>
          )}
          <p className="tcAdPhotoNotice">
            ¿Tienes una fotografía autorizada del negocio? Podrás incorporarla
            durante la revisión. Si no tienes, prepararemos una ilustración.
          </p>
          <label>
            Cuéntanos qué te interesaría <small>opcional</small>
            <textarea
              value={data.note}
              onChange={e => set('note', e.target.value)}
              placeholder="Ej. promocionar mi ferretería en Collipulli durante un mes"
            />
            <details className="tcInlineHelp"><summary aria-label="Ayuda del campo">ⓘ</summary><small className="tcAdFieldHelp">
              Indica duración o comunas deseadas. Se revisarán las opciones
              y condiciones antes de activar cualquier campaña.
            </small></details>
          </label>
          <label className="hp" aria-hidden="true">
            Sitio
            <input
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={e => setWebsite(e.target.value)}
            />
          </label>
          <label className="consentRow">
            <input
              type="checkbox"
              required
              checked={advertisingConsent}
              onChange={e => setAdvertisingConsent(e.target.checked)}
            />
            <span>
              Autorizo la publicidad del negocio que represento, sujeta a
              revisión. El contacto de esta solicitud permanece privado; no
              acepto cobros.
            </span>
          </label>
          <label className="consentRow">
            <input
              type="checkbox"
              required
              checked={consent}
              onChange={e => setConsent(e.target.checked)}
            />
            <span>
              Autorizo a Trabajo Cerca a usar estos datos únicamente para
              responder esta solicitud comercial. Mi contacto no se publicará
              por enviar este formulario.
            </span>
          </label>
          {errorMessage && (
            <div className="formError">
              <AlertCircle /> {errorMessage}
            </div>
          )}
          <button className="primary" disabled={sending || !slots.length}>
            <Megaphone size={17} />{' '}
            {sending ? 'Enviando…' : 'Enviar solicitud para revisión'}
          </button>
        </form>
      </div>
    </div>
  );
}

function AlertsPanel({
  defaultPlace,
  onClose,
  onSaved,
}: {
  defaultPlace: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const selectable = [
    ...new Set([...places.filter(value => value !== 'Todas'), ...travelPlaces]),
  ];
  const [selected, setSelected] = useState<string[]>(() =>
    selectable.includes(defaultPlace) ? [defaultPlace] : []
  );
  const [keywords, setKeywords] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(auth.isSignedIn());
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [legacyPending, setLegacyPending] = useState(false);
  useEffect(() => {
    if (!auth.isSignedIn()) {
      setLoading(false);
      return;
    }
    api
      .get('/api/notifications/preferences')
      .then(response => {
        const communes = Array.isArray(response.data.communes)
          ? response.data.communes.filter((value: string) =>
              selectable.includes(value)
            )
          : [];
        if (communes.length) setSelected(communes);
        setKeywords(
          Array.isArray(response.data.keywords)
            ? response.data.keywords.join(', ')
            : ''
        );
        setEnabled(Boolean(response.data.active));
        setLegacyPending(response.data.legacyPending === true);
        if (response.data.legacyPending)
          setErrorMessage(
            'Tus preferencias anteriores se están actualizando. Puedes guardarlas de nuevo o desactivarlas desde aquí.'
          );
      })
      .catch(() =>
        setErrorMessage('No fue posible consultar tus preferencias anteriores.')
      )
      .finally(() => setLoading(false));
  }, []);
  const togglePlace = (value: string) => {
    setErrorMessage('');
    setSelected(current =>
      current.includes(value)
        ? current.filter(item => item !== value)
        : current.length >= 5
          ? current
          : [...current, value]
    );
  };
  const parsedKeywords = () =>
    keywords
      .split(',')
      .map(value => value.trim())
      .filter(Boolean)
      .slice(0, 8);
  const activate = async () => {
    if (!selected.length) {
      setErrorMessage('Elige al menos una comuna para recibir avisos.');
      return;
    }
    setSaving(true);
    setErrorMessage('');
    setTestMessage('');
    try {
      if (!auth.isSignedIn()) await auth.signIn();
      const guidance = await notifications.getEnableGuidance();
      if (
        ['permission_denied', 'ios_install_required', 'unsupported'].includes(
          guidance.kind
        )
      ) {
        setErrorMessage(
          [guidance.message, ...guidance.steps].filter(Boolean).join(' · ')
        );
        return;
      }
      await notifications.subscribe({ showUi: false });
      await api.post('/api/notifications/preferences', {
        communes: selected,
        keywords: parsedKeywords(),
      });
      setEnabled(true);
      setLegacyPending(false);
      track('tc_notifications_enabled', {
        commune: selected.join(' · '),
        count: selected.length,
        keyword_count: parsedKeywords().length,
        surface: 'alerts_panel',
      });
      onSaved(
        'Preferencias guardadas. Prueba el envío y comprueba que la notificación aparece en tu teléfono.'
      );
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'No fue posible activar las notificaciones.';
      setErrorMessage(
        message.includes('popup')
          ? 'Completa el inicio de sesión para activar tus avisos.'
          : message
      );
    } finally {
      setSaving(false);
    }
  };
  const testNotification = async () => {
    setSaving(true);
    setErrorMessage('');
    setTestMessage('');
    try {
      const response = await api.post('/api/notifications/test');
      if (!(Number(response.data?.sent) > 0))
        throw Error(
          'El servicio no aceptó el envío. Revisa la suscripción y los permisos antes de volver a probar.'
        );
      track('tc_notifications_test', {
        commune: selected.join(' · '),
        surface: 'alerts_panel',
      });
      setTestMessage(
        'El servicio aceptó la prueba. Comprueba en tu teléfono si apareció; esta respuesta no confirma su recepción física.'
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'No se pudo enviar la prueba.'
      );
    } finally {
      setSaving(false);
    }
  };
  const disable = async () => {
    setSaving(true);
    setErrorMessage('');
    setTestMessage('');
    try {
      if (auth.isSignedIn()) await api.delete('/api/notifications/preferences');
      await notifications.unsubscribe({ showUi: false });
      setEnabled(false);
      setLegacyPending(false);
      track('tc_notifications_disabled', { surface: 'alerts_panel' });
      onSaved(
        'Notificaciones desactivadas. No se enviarán nuevos avisos a tu cuenta.'
      );
    } catch {
      setErrorMessage(
        'No fue posible desactivar los avisos. Vuelve a intentarlo.'
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <div
      className="modal neoAlertsModal tcNotifyBackdrop"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="neoAlertsPanel tcNotifyPanel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tc-notify-heading"
      >
        <button
          className="neoAlertsClose"
          onClick={onClose}
          aria-label="Cerrar avisos"
        >
          <X />
        </button>
        <div className="neoAlertsForm tcNotifyForm">
          <div className="tcNotifyHeading">
            <span className="tcNotifyIcon">
              <Bell aria-hidden="true" />
            </span>
            <div>
              <h2 id="tc-notify-heading">Notificaciones automáticas</h2>
              <p>
                Las alertas son voluntarias. Para recibirlas con la app cerrada
                debes confirmar tu correo y permitir notificaciones.
              </p>
            </div>
          </div>
          {enabled && (
            <div className="tcNotifyActive" role="status">
              <CheckCircle aria-hidden="true" /> Preferencias guardadas
            </div>
          )}
          <label className="tcNotifyMainPlace">
            Comuna principal
            <select
              value={selected[0] || ''}
              onChange={event => {
                const value = event.target.value;
                setSelected(current =>
                  value
                    ? [value, ...current.filter(x => x !== value).slice(0, 4)]
                    : []
                );
              }}
            >
              <option value="">Selecciona una comuna</option>
              {selectable.map(value => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <details className="tcNotifyMore">
            <summary>Más comunas y cargos (opcional)</summary>
            <p>Selecciona hasta cinco comunas en total.</p>
            <div className="neoAlertPlaces">
              {selectable.map(value => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={selected.includes(value)}
                  className={selected.includes(value) ? 'active' : ''}
                  onClick={() => togglePlace(value)}
                >
                  {selected.includes(value) && (
                    <CheckCircle aria-hidden="true" />
                  )}
                  {value}
                </button>
              ))}
            </div>
            <label className="neoAlertKeywords">
              Cargos de interés (opcional)
              <input
                value={keywords}
                onChange={event => setKeywords(event.target.value)}
                placeholder="Ej.: conductor, TENS"
              />
            </label>
          </details>
          <p className="tcNotifyNote">
            Buscar trabajo y consultar novedades es gratis y no requiere cuenta.
            Solo para recibir notificaciones automáticas con la app cerrada, el
            proveedor AppDeploy solicita iniciar sesión una vez y aceptar los
            permisos del teléfono. No tiene cobros. En iPhone puede ser
            necesario instalar la app primero.
          </p>
          {errorMessage && (
            <div className="formError" role="alert">
              <AlertCircle />
              {errorMessage}
            </div>
          )}
          {testMessage && (
            <p className="tcNotifyActive" role="status">
              {testMessage}
            </p>
          )}
          <div className="neoAlertActions tcNotifyActions">
            <button
              type="button"
              className="neoAlertPrimary"
              disabled={saving || loading}
              onClick={() => void activate()}
            >
              <Bell aria-hidden="true" />
              {saving
                ? 'Guardando…'
                : enabled
                  ? 'Actualizar avisos'
                  : auth.isSignedIn()
                    ? 'Activar notificaciones'
                    : 'Confirmar correo y activar'}
            </button>
            {enabled && (
              <button
                type="button"
                className="neoAlertTest"
                disabled={saving || loading}
                onClick={() => void testNotification()}
              >
                Probar envío
              </button>
            )}
            {(enabled || legacyPending) && (
              <button
                type="button"
                className="neoAlertDisable"
                disabled={saving || loading}
                onClick={() => void disable()}
              >
                Desactivar
              </button>
            )}
          </div>
          <small className="neoAlertFoot">
            Solo se notifican publicaciones verificadas que coincidan con tus
            zonas o cargos. Puedes desactivar las alertas cuando quieras.
          </small>
        </div>
      </div>
    </div>
  );
}

export function OperationsPanel() {
  const [summary, setSummary] = useState<OpsSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [proof, setProof] = useState<{
    ingestion: {
      status: string;
      stored: number;
      published: number;
      feedManifestId: string | null;
      receipts: Array<{ publishedId: string | null }>;
    };
    feed: {
      complete: boolean;
      manifestId: string | null;
      buildSource: string | null;
      stagedPages: number;
    };
    visibleIds: string[];
    visibleItems: Record<string, unknown>[];
    feedReadComplete: boolean;
    feedPagesRead: number;
    feedReadError: string | null;
    checkedAt: string;
    documentRevalidation: Record<string, unknown> | null;
    documentRevalidationError: string | null;
  } | null>(null);
  const securityMode =
    new URLSearchParams(window.location.search).get('security-proof') === '1';
  const [securityProof, setSecurityProof] = useState<Record<
    string,
    unknown
  > | null>(null);
  const proofMode =
    new URLSearchParams(window.location.search).get('radar-proof') === '1';
  const localMode =
    new URLSearchParams(window.location.search).get('radar-local-proof') ===
    '1';
  const localCursor =
    new URLSearchParams(window.location.search).get('local-cursor') ||
    undefined;
  const publicMode =
    new URLSearchParams(window.location.search).get('radar-public-proof') ===
    '1';
  const receiverMode =
    new URLSearchParams(window.location.search).get('radar-receiver-proof') ===
    '1';
  const [receiverRunning, setReceiverRunning] = useState(false);
  const [receiverResult, setReceiverResult] = useState<Record<
    string,
    unknown
  > | null>(null);
  const runReviewedDelivery = async () => {
    setReceiverRunning(true);
    setErrorMessage('');
    try {
      const response = await api.post('/api/ops/radar-external/consume', {});
      setReceiverResult(response.data);
    } catch {
      setReceiverResult({
        error: 'No se pudo completar la incorporación del lote revisado.',
      });
      setErrorMessage(
        'No se pudo completar la incorporación; las ofertas guardadas se conservan.'
      );
    } finally {
      setReceiverRunning(false);
    }
  };
  const [publicStatus, setPublicStatus] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [publicRunning, setPublicRunning] = useState(false);
  const [publicResult, setPublicResult] = useState<Record<
    string,
    unknown
  > | null>(null);
  const readPublicStatus = async () => {
    const response = await api.get('/api/ops/free-public-sources');
    setPublicStatus(response.data);
  };
  const runPublicSources = async () => {
    setPublicRunning(true);
    setErrorMessage('');
    try {
      const response = await api.post('/api/ops/free-public-sources/run', {
        requestId:
          'public-ui-' +
          Date.now().toString(36) +
          '-' +
          Math.random().toString(36).slice(2),
      });
      setPublicResult(response.data);
      await readPublicStatus();
    } catch {
      setErrorMessage(
        'No pudimos completar la lectura pública; los datos guardados se conservan.'
      );
    } finally {
      setPublicRunning(false);
    }
  };
  const [localEvidence, setLocalEvidence] = useState<{
    schema: string;
    items: Array<Record<string, unknown>>;
    nextCursor: string | null;
    hasMore: boolean;
    stats: { runsReturned: number; findingsReturned: number };
    readOnly: boolean;
    providerCalls: number;
  } | null>(null);
  useEffect(() => {
    let active = true;
    if (
      !proofMode &&
      !localMode &&
      !publicMode &&
      !receiverMode &&
      !securityMode
    ) {
      api
        .get('/api/ops/summary')
        .then(response => {
          if (active) setSummary(response.data as OpsSummary);
        })
        .catch(() => {
          if (active)
            setErrorMessage('No pudimos cargar el resumen operativo.');
        });
    }
    if (publicMode) {
      api
        .get('/api/ops/free-public-sources')
        .then(response => {
          if (active) setPublicStatus(response.data);
        })
        .catch(() => {
          if (active)
            setErrorMessage('No pudimos consultar las fuentes públicas.');
        });
    }
    if (localMode && !publicMode) {
      const suffix = localCursor
        ? '?cursor=' + encodeURIComponent(localCursor)
        : '';
      api
        .get('/api/ops/local-source-evidence' + suffix)
        .then(response => {
          if (
            response.data.schema !==
              'trabajo-cerca.existing-local-evidence.v1' ||
            !Array.isArray(response.data.items)
          )
            throw new Error('Invalid evidence response');
          if (active) setLocalEvidence(response.data);
        })
        .catch(() => {
          if (active)
            setErrorMessage('No pudimos leer las capturas locales guardadas.');
        });
    }
    if (proofMode && !localMode && !publicMode) {
      void (async () => {
        try {
          const [external, feed, documents] = await Promise.all([
            api.get('/api/ops/radar-external'),
            api.get('/api/ops/radar-feed'),
            api
              .get('/api/ops/document-revalidation')
              .catch(() => ({ data: null })),
          ]);
          const inventory = await readFeedInventory(path => api.get(path));
          const visibleIds = inventory.items.map(item => item.id);
          const feedReadError = inventory.error;
          if (active)
            setProof({
              ingestion: external.data,
              feed: feed.data,
              visibleIds,
              feedReadError,
              visibleItems: inventory.items,
              feedReadComplete: inventory.complete,
              feedPagesRead: inventory.pagesRead,
              documentRevalidation: documents.data,
              documentRevalidationError: documents.data
                ? null
                : 'No se pudo leer la revalidación documental.',
              checkedAt: new Date().toISOString(),
            });
        } catch {
          if (active)
            setErrorMessage('No pudimos consultar el estado de integración.');
        }
      })();
    }
    return () => {
      active = false;
    };
  }, [proofMode, localMode, localCursor, publicMode, receiverMode]);
  useEffect(() => {
    let active = true;
    if (securityMode)
      void (async () => {
        try {
          const policy = await api.get('/api/ops/security-policy');
          if (!active) return;
          if (
            policy.data.revision !== 'security-containment-v2' ||
            policy.data.manualOperations !== false ||
            policy.data.paidProviders !== false ||
            policy.data.remoteAi !== false
          )
            throw new Error('security_policy_not_confirmed');
          const results: Array<Record<string, unknown>> = [];
          for (const [method, path] of [
            ['POST', '/api/ops/radar-external/consume'],
            ['POST', '/api/ops/free-public-sources/run'],
            ['POST', '/api/radar/social-run'],
            ['POST', '/api/radar/social-collect'],
            ['GET', '/api/radar/run-territorial-now'],
            ['POST', '/api/radar/photo-tip'],
            ['POST', '/api/admin/backup/page'],
          ]) {
            try {
              const response =
                method === 'GET'
                  ? await api.get(path)
                  : await api.post(path, {});