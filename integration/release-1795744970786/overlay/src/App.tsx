import {StitchBrand} from './stitch-brand';
import { houseSubmissionAttribution } from './house-autonomy';
import {StitchCommunity} from './stitch-community';
import { InlineHousePromotion, FormEditorialPromotion } from './advertising-surfaces';
import {LegalContent} from './legal-content';
import {PRIMARY_PLACES,COMPLEMENTARY_PLACES} from '../shared/territories';
import {loadReading,saveReading,markReading} from './reading-history';
import {reviewLabel,identifiedEmployer,originalPoster,shortDate} from './compact-presentation';
import {publicSourceLabel,publicOfferDetail} from './public-content-policy';
import {TerritorialRadar} from './territorial-radar';
import {ActivityCenter} from './activity-center';
import {listingShareUrl} from '../shared/listing-links';
import {LEGAL_RESPONSIBLE} from './legal-responsible';
import {COMMERCIAL_PLACES} from '../shared/commercial-policy';
import {OwnedPublicationEditor} from './owned-publication-editor';
import { HouseBanner, useAdvertising, sendHouseEvent, completeHouseGoal, type HouseAttribution } from './house-advertising';
import type { Goal, Slot } from '../shared/house-ads';
import { Fragment, lazy, Suspense, type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { api, auth, image as appImage, notifications } from '@appdeploy/client';
import { readFeedInventory } from './feed-inventory';
import {readPublicJobCache,writePublicJobCache} from './catalog-cache';
import {readRemaining} from './feed-page-batch';
import { AdministratorAccess, AdministratorShortcut } from './administrator-access';
const RestoreRehearsalProof = lazy(() => import('./restore-rehearsal-proof').then(module => ({ default: module.RestoreRehearsalProof })));
import './ops-dashboard.css';
import './territory-split.css';
import { publishedInventoryCounts, recentInApp } from './feed-presentation';
import './inventory-banner.css';
import { NearbyCities, LocalAdvertising, LaborNewsSection } from './territorial-sections';
import { matchesTerritorialView, officialWorkCommune, territorialScopeTotals } from './territorial-exploration';
import {
  AlertCircle, ArrowRight, BadgeCheck, Bell, Briefcase, Building2, Camera, CheckCircle, Download, Handshake,
  HeartPulse, House, MapPin, Megaphone, PlusCircle, Radar, Radio, Search, Share2, ShieldCheck, SlidersHorizontal, Sparkles,
  Store, TreePine, Truck, UserRoundSearch, Users, Warehouse, Wrench, X
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
const LocalDirectory = lazy(() => import('./local-directory').then(module => ({ default: module.LocalDirectory })));
import './local-directory.css';
import './ux-territorial-cleanup.css';
import './ux-release-consolidated.css';
import './house-campaign-polish.css';
import {compactWorkplaceLabel} from './workplace-label';
function analyticsId() {
  try {
    const existing = sessionStorage.getItem('tc_technical_session');
    if (existing) return existing;
    const next = crypto.randomUUID();
    sessionStorage.setItem('tc_technical_session', next);
    return next;
  } catch { return 'tc_session_' + crypto.randomUUID(); }
}
function track(event:string, properties:Record<string, string | number | boolean | undefined> = {}) {
  try{if(localStorage.getItem('tc_analytics_consent')!=='yes')return;}catch{return;}
  void api.post('/api/analytics', { eventId:crypto.randomUUID(), event, distinctId:analyticsId(), properties, consent:true }).catch(() => undefined);
}
// Don't render two destination buttons when the application and source URLs lead to the same page.
function sameExternalDestination(a?:string,b?:string):boolean {
  if(!a||!b)return false;
  try {
    const normalize=(value:string)=>{
      const url=new URL(value);
      if(url.protocol!=='https:')return '';
      const ignored=['fbclid','gclid','ref','ref_src','source','utm_source','utm_medium','utm_campaign','utm_term','utm_content'];
      for(const key of ignored)url.searchParams.delete(key);
      url.searchParams.sort();
      return url.hostname.replace(/^www\./,'').toLowerCase()+url.pathname.replace(/\/+$/,'')+'?'+url.searchParams.toString();
    };
    const left=normalize(a),right=normalize(b);
    return Boolean(left)&&left===right;
  }catch{return false;}
}
function publicDate(item:Listing) {
  if (item.origin === 'direct') return shortDate(item.firstPublishedAt || item.createdAt) || 'Fecha no informada';
  const original = shortDate(item.sourcePublishedAt || '');
  if (original) return original;
  // «Publicado hoy» puede representar incorporación al radar: nunca usar descubrimiento como fecha original.
  return item.date && item.date !== 'Publicado hoy' ? item.date : 'Fecha original no informada';
}

type Flow = 'ofrezco' | 'trabajadores' | 'servicio' | 'aporte';
type Section = 'opportunities' | 'people' | 'needs' | 'services';
type LegalView = 'privacy' | 'terms' | null;

type Sponsor = {
  id:string;
  businessName:string;
  category:string;
  headline:string;
  detail:string;
  communes:string[];
  url?:string;
  label:'Publicidad local'|'Patrocinado';
  scope:'exact'|'nearby'|'regional';
};
type FilterMode = 'work' | 'recruit';
type CommuneStat = { jobs:number; newJobs24h:number; newJobs7d?:number; people:number; needs:number; services:number };
type FeedSummary = {
  totalItems:number;
  totalJobOffers:number;
  recentJobOffers7d?:number;
  recentJobOffers24h?:number;
  totalVerifiedJobOffers:number;
  totalProvisionalJobOffers:number;
  communeStats:Record<string, CommuneStat>;
  kindStats:{ jobs:number; people:number; needs:number; services:number };
};
type InstallPromptEvent = Event & {
  prompt:()=>Promise<void>;
  userChoice:Promise<{ outcome:'accepted'|'dismissed' }>;
};

type OpsSummary = {
  updatedAt:string;
  jobs:{active:number;verified:number;publicPending:number;direct:number;publicVisible:number;publicVerified:number;publicUpdatedAt:string};
  radar:{pendingCandidates:number;sourceFailures:number;lastSweep:string|null};
  growth:{advertiserLeads:number;socialDrafts:number;activeCampaigns:number;advertiserLeadsPartial?:boolean;socialDraftsPartial?:boolean};
  privacy:{personalDetailsIncluded:boolean;note:string};
};

type RadarSource = {
  key:string;
  name:string;
  family:string;
  mode:'public_scan'|'discovery'|'community';
  status:'automatic'|'active'|'limited';
  note:string;
  lastChecked?:string;
  lastStatus?:'ok'|'blocked'|'error';
  candidatesFound:number;
  newCandidates:number;
};

type RadarStatus = {
  sources:RadarSource[];
  automatedSources:number;
  pendingCandidates:number;
  secondEngineConfigured:boolean;
  thirdEngineConfigured:boolean;
  searchEngines:number;
  motor2Latest?:{
    checkedAt:string;
    status:'ok'|'blocked'|'error';
    linksSeen:number;
    candidatesFound:number;
    newCandidates:number;
    message?:string;
  };
  motor3Latest?:{
    checkedAt:string;
    status:'ok'|'blocked'|'error';
    linksSeen:number;
    candidatesFound:number;
    newCandidates:number;
    message?:string;
  };
  inventoryDiagnostics?:{sampled:number;hasMore:boolean;precargadas:number;automaticas:number;socialPublicadas:number;bySource:Record<string,number>};
  socialOverview?:{sampled:number;pending:number;processed:number;failed:number;imagesRead:number;jobNotices:number;hasMore:boolean};
  territoryCoverage?:Array<{
    place:string;
    officialSources:number;
    communitySources:number;
    automatedSources:number;
    lastChecked?:string;
    gap:string;
  }>;
  lastSweep?:string;
};

type Listing = {
  id: string;
  kind: 'job_offer' | 'worker_available' | 'worker_need' | 'service_request' | 'candidate';
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
  applicationUrl?:string;
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
  firstPublishedAt?:string;
  revalidationDue?:boolean;
  lastVerifiedAt?:string; externalVerifiedAt?:string; verifiedAt?:string; verificationMethod?:string; verificationReason?:string; evidenceSources?:string[];
  originalPosterUrl?:string;
  sourceImageUrl?:string;
  active?:boolean;
  contact?: string;
  contactLabel?: string;
  hasContact?: boolean;
};

const places = ['Todas',...PRIMARY_PLACES];
const travelPlaces:readonly string[] = COMPLEMENTARY_PLACES;
const emptyCommuneStat:CommuneStat = { jobs:0, newJobs24h:0, people:0, needs:0, services:0 };

function getOwnerTokens(): Record<string,string> {
  try {
    return JSON.parse(localStorage.getItem('trabajo-cerca-owner-tokens') || '{}') as Record<string,string>;
  } catch {
    return {};
  }
}

function saveOwnerToken(id: string, token: string) {
  const current = getOwnerTokens();
  current[id] = token;
  try{localStorage.setItem('trabajo-cerca-owner-tokens',JSON.stringify(current));}catch{/* Guardar comprobante de titularidad. */}
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
  const sharedTitle = flow === 'aporte' ? (sharedParams.get('share_title') || '') : '';
  const sharedText = flow === 'aporte' ? (sharedParams.get('share_text') || '') : '';
  const sharedUrl = flow === 'aporte' ? (sharedParams.get('share_url') || '') : '';
  const sharedEvidence = [sharedTitle, sharedText, sharedUrl].join(' ');
  const sharedPlace = places.find(value => value !== 'Todas' && sharedEvidence.toLocaleLowerCase('es-CL').includes(value.toLocaleLowerCase('es-CL'))) || 'Angol';
  let sharedSource = 'Aporte compartido';
  if (/facebook\.com/i.test(sharedUrl)) sharedSource = 'Facebook';
  else if (/instagram\.com/i.test(sharedUrl)) sharedSource = 'Instagram';
  else if (/whatsapp/i.test(sharedText)) sharedSource = 'WhatsApp';

  const [data, setData] = useState(() => ({
    title:sharedTitle.slice(0,140),
    name:'',
    place:sharedPlace,
    zones:[sharedPlace] as string[],
    date:'',
    count:'1',
    contact:'',
    detail:sharedText.slice(0,1200),
    availability:'Inmediata',
    sourceName:sharedSource,
    sourceUrl:/^https?:\/\//i.test(sharedUrl) ? sharedUrl.slice(0,600) : '',
  }));

  const started = useRef(false);
  const set = (key: string, value: string) => {
    if(attribution&&!started.current){started.current=true;sendHouseEvent(attribution,'form_started');}
    setData(d => ({ ...d, [key]: value }));
  };
  const toggleZone = (zone: string) => {
    setData(d => ({
      ...d,
      zones: d.zones.includes(zone) ? d.zones.filter(x => x !== zone) : [...d.zones, zone],
    }));
  };

  const heading = flow === 'ofrezco'
    ? 'Ofrezco mi trabajo'
    : flow === 'trabajadores'
      ? 'Necesito trabajadores'
      : flow === 'servicio'
        ? 'Necesito un servicio'
        : 'Aportar un aviso al Radar';

  const kind: Listing['kind'] = flow === 'ofrezco'
    ? 'worker_available'
    : flow === 'trabajadores'
      ? 'worker_need'
      : flow === 'servicio'
        ? 'service_request'
        : 'candidate';

  const cardTitle = data.title || (flow === 'aporte' ? 'Aviso aportado al Radar' : heading);
  const requestClose=()=>{const draft=Boolean(data.title.trim()||data.detail.trim()||data.contact.trim()||data.sourceUrl.trim());if(!draft||window.confirm('¿Descartar este borrador sin publicar?'))onClose();};

  const submitPhoto = async (file: File, sourceName = 'Foto / imagen compartida') => {
    if (!photoReadingEnabled) { setErrorMessage('La lectura de fotos está deshabilitada. Comparte el enlace o texto del aviso.');return; }
    setPhotoSending(true);
    setErrorMessage('');
    try {
      const prepared = await appImage.resizeIfNeeded(file, { maxDimension:1600, maxPixels:2000000, quality:0.82, mimeType:'image/jpeg' });
      const response = await api.post('/api/radar/photo-tip', { imageData:prepared.data, mimeType:prepared.mimeType, sourceName, clientToken:analyticsId() });
      track('tc_photo_tip_submitted', { public:Boolean(response.data.public), duplicate:Boolean(response.data.duplicate) });
      onPublished('candidate');
      onClose();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'No pudimos leer la foto. Intenta nuevamente.');
    } finally {
      setPhotoSending(false);
    }
  };

  useEffect(() => {
    if (flow !== 'aporte') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('share_image') !== '1') return;
    const shareKey = window.location.search;
    if (sessionStorage.getItem('tc_shared_image_processing') === shareKey) return;
    sessionStorage.setItem('tc_shared_image_processing', shareKey);
    void fetch('./__shared_job_image__').then(response => {
      if (!response.ok) throw new Error('No se encontró la imagen compartida.');
      return response.blob();
    }).then(blob => submitPhoto(new File([blob], 'aviso-compartido.jpg', { type:blob.type || 'image/jpeg' }), 'Imagen compartida desde otra app')).catch(err => {
      sessionStorage.removeItem('tc_shared_image_processing');
      setErrorMessage(err instanceof Error ? err.message : 'No pudimos procesar la imagen compartida.');
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
        clientToken:analyticsId(),
        houseAttribution:houseSubmissionAttribution(attribution),
      });
      if (!response.data.item?.id) throw new Error('La publicación no fue confirmada.');
      if (kind === 'worker_available') completeHouseGoal('professional');
      if (kind === 'worker_need') completeHouseGoal('employer');
      if (response.data.ownerToken && response.data.item?.id) {
        saveOwnerToken(response.data.item.id, response.data.ownerToken);
      }
      onPublished(kind);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo publicar. Intenta nuevamente.';
      setErrorMessage(message);
    } finally {
      setPublishing(false);
    }
  };

  const publicationDialog=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const dialog=publicationDialog.current;if(!dialog)return;
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
    const controls=()=>[...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')].filter(node=>node.getClientRects().length>0);
    (controls()[0]||dialog).focus();
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();requestClose();}
      if(event.key==='Tab'){const nodes=controls(),first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
    };
    document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('keydown',key);document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus();};
  },[onClose,preview]);

  if (preview) {
    return (
      <div className='modal' ref={publicationDialog} role='dialog' aria-modal='true' aria-label={preview?'Revisa antes de publicar':heading} tabIndex={-1}>
        <div className='panel previewPanel'>
          <button className='close' onClick={requestClose} aria-label='Cerrar'><X /></button>
          <span className='lab'>PUBLICACIÓN REAL · BASE CENTRAL</span>
          <h2>Revisa antes de publicar</h2>
          <p>Al confirmar, el aviso quedará visible en Trabajo Cerca y seguirá allí al volver a abrir la app.</p>

          <div className={'createdCard ' + flow}>
            <div className='createdVisual'>
              {flow === 'trabajadores' ? <Users /> : flow === 'ofrezco' ? <UserRoundSearch /> : flow === 'servicio' ? <Wrench /> : <Radar />}
              <span>{flow === 'aporte' ? 'APORTE AL RADAR' : 'PUBLICACIÓN DIRECTA'}</span>
            </div>
            <div className='createdBody'>
              <small>{flow === 'ofrezco' ? 'PERSONA DISPONIBLE' : flow === 'trabajadores' ? 'SE NECESITAN TRABAJADORES' : flow === 'servicio' ? 'SERVICIO SOLICITADO' : 'EN REVISIÓN'}</small>
              <h3>{cardTitle}</h3>
              {data.name && <p className='creator'>{data.name}</p>}
              <div className='previewGeo'><MapPin /><b>{data.place}</b></div>
              {data.zones.length > 0 && <div className='previewZones'><Users /><span>{flow === 'ofrezco' ? 'Puede trabajar en' : 'Zona'}: {data.zones.join(' · ')}</span></div>}
              {data.detail && <p>{data.detail}</p>}
            </div>
          </div>

          {errorMessage && <div className='formError'><AlertCircle /> {errorMessage}</div>}
          <div className='previewActions'>
            <button className='secondary' onClick={() => setPreview(false)}>Editar</button>
            <button className='primary' onClick={publish} disabled={publishing}>
              <CheckCircle size={17} /> {publishing ? 'Publicando…' : 'Publicar ahora'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className='modal' ref={publicationDialog} role='dialog' aria-modal='true' aria-label={preview?'Revisa antes de publicar':heading} tabIndex={-1}>
      <div className='panel smartForm'>
        <button className='close' onClick={requestClose} aria-label='Cerrar'><X /></button>
        <span className='lab'>TRABAJO CERCA · PUBLICACIÓN PERSISTENTE</span>
        <h2>{heading}</h2>
        <p>Solo pedimos lo necesario. No CV, RUT, dirección exacta ni datos bancarios.</p>

        <form onSubmit={event => { event.preventDefault(); setPreview(true); }}>
          {flow === 'ofrezco' && (
            <>
              <label>¿Qué trabajo u oficio ofreces?
                <input required value={data.title} onChange={e => set('title', e.target.value)} placeholder='Ej. Tractorista, jornalero, carpintero…' />
              </label>
            </>
          )}

          {flow === 'trabajadores' && (
            <>
              <label>¿Qué trabajador necesitas?
                <input required value={data.title} onChange={e => set('title', e.target.value)} placeholder='Ej. 8 cosecheros, soldador, ayudante…' />
              </label>
              <label>Cantidad de personas
                <input type='number' min='1' value={data.count} onChange={e => set('count', e.target.value)} />
              </label>
              <label>Nombre del empleador o negocio <small>opcional</small>
                <input value={data.name} onChange={e => set('name', e.target.value)} placeholder='Ej. Fundo Santa Ana' />
              </label>
            </>
          )}

          {flow === 'servicio' && (
            <label>¿Qué servicio necesitas?
              <input required value={data.title} onChange={e => set('title', e.target.value)} placeholder='Ej. Reparación eléctrica domiciliaria' />
            </label>
          )}

          {flow === 'aporte' && (
            <>
              <div className='photoTipBox'>
                <div><Camera /><span><b>¿Encontraste un afiche laboral?</b><small>Envía una fotografía o captura de Facebook, Instagram, WhatsApp o un cartel. No pedimos tus datos. Se guarda en una cola privada y solo se publica tras revisión. No envíes contenido sexual, discriminatorio, engañoso ni datos personales ajenos que no sean necesarios para postular.</small></span></div>
                <label className={'photoTipButton ' + (photoSending ? 'busy' : '')}>
                  <Camera /> {photoSending ? 'Enviando afiche…' : 'Sacar foto o elegir captura'}
                  <input type='file' accept='image/*' disabled={!photoReadingEnabled || photoSending} onChange={e => { const file=e.target.files?.[0]; if (file) void submitPhoto(file, 'Foto / galería'); e.currentTarget.value=''; }} />
                </label>
              </div>
              {errorMessage && <div className='formError'><AlertCircle /> {errorMessage}</div>}
              <div className='photoOr'><span>o, si prefieres, aporta texto o enlace</span></div>
              <label>Cargo u oficio que aparece
                <input value={data.title} onChange={e => set('title', e.target.value)} placeholder='Ej. Tractorista / se necesitan temporeros' />
              </label>
              <label>Texto del aviso
                <textarea required value={data.detail} onChange={e => set('detail', e.target.value)} placeholder='Pega o escribe lo que viste o escuchaste…' />
              </label>
              <label>¿Dónde lo encontraste?
                <select value={data.sourceName} onChange={e => set('sourceName', e.target.value)}>
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
              <label>Enlace directo <small>si existe</small>
                <input value={data.sourceUrl} onChange={e => set('sourceUrl', e.target.value)} placeholder='https://…' />
              </label>
            </>
          )}

          <label>{flow === 'ofrezco' ? 'Tu localidad' : flow === 'servicio' ? 'Localidad del servicio' : 'Lugar real de trabajo'}
            <select value={data.place} onChange={e => set('place', e.target.value)}>
              {places.filter(p => p !== 'Todas').map(p => <option key={p}>{p}</option>)}
            </select>
          </label>

          <FormEditorialPromotion place={data.place} />

          {(flow === 'trabajadores' || flow === 'ofrezco') && (
            <fieldset>
              <legend>{flow === 'ofrezco' ? '¿Dónde puedes trabajar?' : '¿Desde qué comunas aceptas personas?'} <small>elige varias</small></legend>
              <div className='zonePicker'>
                {places.filter(p => p !== 'Todas').map(zone => (
                  <button type='button' key={zone} className={data.zones.includes(zone) ? 'selected' : ''} onClick={() => toggleZone(zone)}>
                    {data.zones.includes(zone) && <CheckCircle size={13} />} {zone}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {flow !== 'aporte' && (
            <>
              <label>Descripción breve
                <textarea value={data.detail} onChange={e => set('detail', e.target.value)} placeholder='Experiencia, horario, disponibilidad, condiciones…' />
              </label>
              <label>WhatsApp o teléfono de contacto
                <input type='tel' required value={data.contact} onChange={e => set('contact', e.target.value)} placeholder='+56 9…' />
              </label>
            </>
          )}

          <label className='hp' aria-hidden='true'>Sitio<input tabIndex={-1} autoComplete='off' value={website} onChange={e => setWebsite(e.target.value)} /></label>
          <label className='consentRow'>
            <input type='checkbox' checked={consent} onChange={e => setConsent(e.target.checked)} required />
            <span>{flow === 'aporte' ? 'Confirmo que comparto este aviso desde una fuente pública o legítima y que no incluyo datos sensibles innecesarios.' : 'Autorizo que los datos que ingresé se publiquen para facilitar contactos laborales. Podré eliminar mi publicación y sus datos desde este dispositivo.'}</span>
          </label>
          <div className='privacy'><ShieldCheck size={19} /><span>Solo pedimos lo necesario. Tu contacto no se descarga junto con el listado: se revela únicamente cuando alguien decide contactar.</span></div>
          <button className='primary'>Revisar antes de publicar <ArrowRight size={17} /></button>
        </form>
      </div>
    </div>
  );
}

function AdvertiserPanel({ onClose, onSent, initialCommune='Angol', attribution }: { onClose:()=>void; onSent:()=>void; initialCommune?:string; attribution?:HouseAttribution|null }) {
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [consent, setConsent] = useState(false);
  const [advertisingConsent,setAdvertisingConsent]=useState(false);
  const [website, setWebsite] = useState('');
  const [slots,setSlots]=useState<string[]>(['search']);
  const [headlineRequested,setHeadlineRequested]=useState('');
  const [previewAd,setPreviewAd]=useState(false);
  const adDialogRef=useRef<HTMLDivElement>(null);
  const [data, setData] = useState({
    businessName:'',
    commune:COMMERCIAL_PLACES.includes(initialCommune)?initialCommune:'Angol',
    category:'Comercio local',
    presence:'Facebook / Instagram',
    contact:'',
    note:'',
  });
  const [promotion,setPromotion]=useState<{days:number;kind:string;remaining:number;message:string;conditions:string}|null>(null);
  useEffect(()=>{let alive=true;void api.get('/api/growth/promotion').then(r=>{if(alive)setPromotion(r.data);}).catch(()=>{});return()=>{alive=false;};},[]);
  const started=useRef(false);
  const set = (key:string, value:string) => {
    if(attribution&&!started.current){started.current=true;sendHouseEvent(attribution,'form_started');}
    setData(current => ({ ...current, [key]:value }));
  };
  const submit = async (event:FormEvent) => {
    event.preventDefault();
    setSending(true);
    setErrorMessage('');
    try {
      const response=await api.post('/api/growth/advertiser-leads', { ...data, placementsRequested:slots, headlineRequested, consent, advertisingConsent, website, clientToken:analyticsId(), houseAttribution:houseSubmissionAttribution(attribution) });
      if (!response.data.id && !response.data.duplicate) throw new Error('La solicitud no fue confirmada.');
      completeHouseGoal('advertiser');
      track('tc_advertiser_interest_submitted', { commune:data.commune, category:data.category, presence:data.presence });
      onSent();
      onClose();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'No pudimos registrar tu interés.');
    } finally {
      setSending(false);
    }
  };
  useEffect(()=>{
    const dialog=adDialogRef.current;if(!dialog)return;
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
    const nodes=()=>[...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')].filter(el=>el.getClientRects().length>0);
    (nodes()[0]||dialog).focus();
    const close=()=>{if(window.confirm('¿Cerrar esta solicitud? Se perderán los datos no enviados.'))onClose();};
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();close();return;}if(event.key!=='Tab')return;const a=nodes(),first=a[0],last=a[a.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}};
    document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('keydown',key);document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus();};
  },[onClose]);
  return (
    <div className='modal'>
      <div className='panel advertiserPanel' ref={adDialogRef} role='dialog' aria-modal='true' aria-labelledby='tc-advertise-title' tabIndex={-1}>
        <button className='close' onClick={()=>{if(window.confirm('¿Cerrar esta solicitud sin enviarla?'))onClose();}} aria-label='Cerrar'><X /></button>
        <span className='lab'>TRABAJO CERCA · COMERCIO LOCAL</span>
        <h2 id='tc-advertise-title'>Solicita publicidad para tu negocio</h2>
        <p className='tcAdvertiserGuide'><strong>Publicidad destacada, distinta de la ficha gratuita.</strong> Aquí solicitas mostrar un anuncio en espacios promocionales. Si solo quieres aparecer gratuitamente en el directorio, utiliza «Publicar servicio o negocio». Enviar esta solicitud no genera cobros.</p>
        <p><b>{promotion ? promotion.days ? `${promotion.days} días gratuitos desde la aprobación · ${promotion.kind==='founder'?'Fundadores':'Prueba estándar'}` : promotion.message : 'Consultando la promoción vigente…'}</b> Revisaremos tu solicitud antes de activarla. No necesitas página web: puede ser Facebook, Instagram, WhatsApp o un contacto comercial. No existe renovación automática ni se realizará ningún cobro sin informarte antes.</p>
        {promotion&&<p>{promotion.conditions}{promotion.kind==='founder'&&` Cupos disponibles: ${promotion.remaining}. La disponibilidad se comprueba al aprobar.`}</p>}
        <details className='tcPublishGuideDetails tcAdGuideDetails'>
          <summary>¿Qué opción necesito?</summary>
          <p>Servicio gratuito: trabajos u oficios que realizas. Negocio gratuito: ficha de tienda o emprendimiento en el directorio. Publicidad: anuncio opcional con mayor visibilidad por comuna y ubicación, sujeto a revisión y vigencia.</p>
        </details>
        <form onSubmit={submit}>
          <label>Nombre del negocio
            <input required value={data.businessName} onChange={e => set('businessName', e.target.value)} placeholder='Ej. Ferretería El Roble' />
          </label>
          <label>Comuna
            <select value={data.commune} onChange={e => set('commune', e.target.value)}>{COMMERCIAL_PLACES.map(p => <option key={p}>{p}</option>)}</select>
          </label>
          <label>Rubro
            <select value={data.category} onChange={e => set('category', e.target.value)}>
              <option>Alojamiento y hosterías</option><option>Servicios agrícolas</option><option>Comercio local</option><option>Ferretería / herramientas</option><option>Alimentación</option><option>Transporte</option><option>Servicios técnicos</option><option>EPP / seguridad</option><option>Capacitación</option><option>Otro</option>
            </select>
          </label>
          <label>Presencia principal
            <select value={data.presence} onChange={e => set('presence', e.target.value)}><option>Facebook / Instagram</option><option>WhatsApp</option><option>Sitio web</option><option>Local físico / sin página</option><option>Otro</option></select>
          </label>
          <label>Correo, WhatsApp o teléfono comercial
            <input required value={data.contact} onChange={e => set('contact', e.target.value)} placeholder='Medio para que Trabajo Cerca te contacte' />
          </label>
          <fieldset className='tcAdSlotChoices'><legend>¿Dónde prefieres mostrar tu anuncio?</legend>{([['search','Junto al buscador'],['listing','Entre las ofertas'],['featured','Destacado territorial'],['form','En formularios']] as const).map(([key,label])=><label key={key}><input type='checkbox' checked={slots.includes(key)} onChange={event=>setSlots(old=>event.target.checked?[...old,key]:old.filter(x=>x!==key))}/>{label}</label>)}</fieldset>
          <label>Mensaje principal del anuncio <small>opcional</small><input value={headlineRequested} maxLength={130} onChange={event=>setHeadlineRequested(event.target.value)} placeholder='Ej. Herramientas y servicios cerca de ti'/></label>
          <button type='button' className='tcAdPreviewToggle' onClick={()=>setPreviewAd(value=>!value)}>{previewAd?'Ocultar vista previa':'Ver vista previa del anuncio'}</button>
          {previewAd&&<div className='tcAdLeadPreview' aria-label='Vista previa ilustrativa del anuncio'><img src='/house-creatives/local-business.svg' alt='' loading='lazy'/><div><small>VISTA ORIENTATIVA · SUJETA A REVISIÓN</small><strong>{data.businessName||'Tu negocio local'}</strong><p>{headlineRequested||'Productos y servicios en tu comuna.'}</p><small>{slots.length} espacio(s) solicitado(s) · {data.commune}</small></div></div>}
          <p className='tcAdPhotoNotice'>¿Tienes una fotografía autorizada del negocio? Podrás incorporarla durante la revisión. Si no tienes, prepararemos una ilustración.</p>
          <label>Cuéntanos qué te interesaría <small>opcional</small>
            <textarea value={data.note} onChange={e => set('note', e.target.value)} placeholder='Ej. aparecer en Angol por un mes / destacar ofertas de trabajo…' />
          </label>
          <label className='hp' aria-hidden='true'>Sitio<input tabIndex={-1} autoComplete='off' value={website} onChange={e => setWebsite(e.target.value)} /></label>
          <label className='consentRow'><input type='checkbox' required checked={advertisingConsent} onChange={e=>setAdvertisingConsent(e.target.checked)}/><span>Autorizo la publicidad del negocio que represento, sujeta a revisión. El contacto de esta solicitud permanece privado; no acepto cobros.</span></label>
          <label className='consentRow'><input type='checkbox' required checked={consent} onChange={e => setConsent(e.target.checked)} /><span>Autorizo a Trabajo Cerca a usar estos datos únicamente para responder esta solicitud comercial. Mi contacto no se publicará por enviar este formulario.</span></label>
          {errorMessage && <div className='formError'><AlertCircle /> {errorMessage}</div>}
          <button className='primary' disabled={sending||!slots.length}><Megaphone size={17} /> {sending ? 'Enviando…' : 'Enviar solicitud para revisión'}</button>
        </form>
      </div>
    </div>
  );
}

type PushTest = { id: string; status: 'sending' | 'waiting' | 'timed_out' | 'received' };

function AlertsPanel({ defaultPlace, onClose, onSaved }: { defaultPlace:string; onClose:()=>void; onSaved:(message:string)=>void }) {
  const selectable = [...new Set([...places.filter(value => value !== 'Todas'), ...travelPlaces])];
  const [selected, setSelected] = useState<string[]>(() => selectable.includes(defaultPlace) ? [defaultPlace] : []);
  const [keywords, setKeywords] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [deviceReady, setDeviceReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [pushTest, setPushTest] = useState<PushTest | null>(null);
  const [localResult, setLocalResult] = useState('');
  useEffect(() => {
    const received = (event: Event) => {
      const data = (event as CustomEvent).detail;
      const testId = data?.testId;
      if (data?.kind !== 'notification_test' || typeof testId !== 'string') return;
      setPushTest(current => current?.id === testId ? { ...current, status: 'received' } : current);
    };
    window.addEventListener('tc-push-received', received);
    return () => window.removeEventListener('tc-push-received', received);
  }, []);
  const waitingId = pushTest?.status === 'waiting' ? pushTest.id : null;
  useEffect(() => {
    if (!waitingId) return;
    const timeout = window.setTimeout(() => {
      setPushTest(current => current?.id === waitingId && current.status === 'waiting'
        ? { ...current, status: 'timed_out' } : current);
    }, 30_000);
    return () => window.clearTimeout(timeout);
  }, [waitingId]);
  const [legacyPending,setLegacyPending] = useState(false);
  useEffect(() => {
    let active = true;
    let draft: { communes?: string[]; keywords?: string } | null = null;
    try {
      const raw = sessionStorage.getItem('tc_alerts_intent');
      if (raw) draft = JSON.parse(raw);
    } catch {}
    const restore = async () => {
      try {
        const user = await auth.getUser();
        if (!active) return;
        setSignedIn(Boolean(user));
        if (user) {
          const { data } = await api.get('/api/notifications/preferences');
          if (!active) return;
          const communes = Array.isArray(data.communes) ? data.communes.filter((value:string) => selectable.includes(value)).slice(0,5) : [];
          if (communes.length) setSelected(communes);
          setKeywords(Array.isArray(data.keywords) ? data.keywords.join(', ') : '');
          setEnabled(data.active === true);
          setLegacyPending(data.legacyPending === true);
        }
      } catch {
        if (active) setErrorMessage('No fue posible consultar tus preferencias. Revisa tu conexión y vuelve a intentar.');
      } finally {
        if (active) {
          if (draft) {
            if (Array.isArray(draft.communes)) setSelected(draft.communes.filter(value => selectable.includes(value)).slice(0,5));
            if (typeof draft.keywords === 'string') setKeywords(draft.keywords.slice(0,500));
            try { sessionStorage.removeItem('tc_alerts_intent'); } catch {}
          }
          setLoading(false);
        }
      }
    };
    void restore();
    return () => { active = false; };
  }, []);
  const togglePlace = (value:string) => {
    setErrorMessage('');
    setSelected(current => current.includes(value) ? current.filter(item => item !== value) : current.length >= 5 ? current : [...current,value]);
  };
  const parsedKeywords = () => keywords.split(',').map(value => value.trim()).filter(Boolean).slice(0,8);
  const activate = async () => {
    if (!selected.length) { setErrorMessage('Elige al menos una comuna para recibir avisos.'); return; }
    setSaving(true); setErrorMessage(''); setTestMessage(''); setPushTest(null);
    let stage = 'sesión';
    try {
      if (!(await auth.getUser())) {
        try { sessionStorage.setItem('tc_alerts_intent', JSON.stringify({ communes:selected, keywords })); } catch {}
        await auth.signInWithRedirect();
        return;
      }
      setSignedIn(true);
      stage = 'permisos';
      const guidance = await notifications.getEnableGuidance();
      if (['permission_denied','ios_install_required','unsupported'].includes(guidance.kind)) {
        setErrorMessage([guidance.message,...guidance.steps].filter(Boolean).join(' · '));
        return;
      }
      if (guidance.kind === 'sign_in_required') {
        setErrorMessage('No se pudo recuperar tu sesión. Cierra este formulario e inicia sesión nuevamente.');
        return;
      }
      stage = 'registro del dispositivo';
      setDeviceReady(false);
      await notifications.subscribe({ showUi:false });
      setDeviceReady(true);
      stage = 'guardado de preferencias';
      const { data } = await api.post('/api/notifications/preferences', { communes:selected, keywords:parsedKeywords() });
      if (data?.active !== true) throw new Error('No se confirmó el guardado.');
      setEnabled(true);
      setLegacyPending(false);
      track('tc_notifications_enabled', { commune:selected.join(' · '), count:selected.length, keyword_count:parsedKeywords().length, surface:'alerts_panel' });
      setTestMessage('Dispositivo registrado y preferencias guardadas. Pulsa Probar envío para comprobar la recepción.');
    } catch (err) {
      const message=err instanceof Error ? err.message : 'No fue posible activar las notificaciones.';
      const network = /failed to fetch|network|fetch failed|networkerror/i.test(message);
      setErrorMessage(network ? 'No se pudo conectar durante el ' + stage + '. Revisa tu conexión y vuelve a intentar.' : 'No se pudo completar: ' + stage + '. Revisa los permisos de notificaciones e inténtalo nuevamente.');
    } finally { setSaving(false); }
  };
  const testNotification = async () => {
    const id = crypto.randomUUID();
    setSaving(true); setErrorMessage(''); setTestMessage(''); setPushTest({ id, status: 'sending' });
    try {
      const response = await api.post('/api/notifications/test', { testId: id });
      if (!(Number(response.data?.sent)>0)) throw Error('El servicio no aceptó el envío. Revisa la suscripción y los permisos antes de volver a probar.');
      track('tc_notifications_test', { commune:selected.join(' · '), surface:'alerts_panel' });
      setTestMessage('Proveedor aceptó ' + Number(response.data.sent) + ' envío(s). Fallidos: ' + Number(response.data.failed || 0) + '.');
      setPushTest(current => current?.id === id && current.status === 'sending' ? { ...current, status: 'waiting' } : current);
    } catch (error) {
      setPushTest(current => current?.id === id && current.status !== 'received' ? null : current);
      const message = error instanceof Error ? error.message : '';
      const status = (error as { response?: { status?: number } } | null)?.response?.status;
      setErrorMessage(status === 429 ? 'Has alcanzado el límite de pruebas. Inténtalo más tarde.' : /failed to fetch|network/i.test(message) ? 'No se pudo conectar para enviar la prueba. Revisa tu conexión.' : message.includes('servicio no aceptó') ? message : 'No se pudo enviar la prueba. Actualiza los avisos y verifica tus permisos.');
    } finally { setSaving(false); }
  };
  const testLocalNotification = async () => {
    setLocalResult('');
    try {
      const env = await notifications.getEnvironment();
      if (env.permission !== 'granted') { setLocalResult('Permiso del teléfono no concedido. Activa las notificaciones en los ajustes del navegador o de la app.'); return; }
      const reg = await navigator.serviceWorker.getRegistration('./');
      if (!reg?.active) { setLocalResult('No hay un servicio local activo. Cierra y vuelve a abrir la app.'); return; }
      await reg.showNotification('Trabajo Cerca · prueba local', { body:'Prueba del sistema de este teléfono; no utiliza el servidor de avisos.', tag:'tc-local-diagnostic' });
      setLocalResult('El teléfono aceptó mostrar un aviso local. Si no lo ves, revisa los ajustes de Android o iOS. Esta prueba no acredita entrega push.');
    } catch { setLocalResult('El sistema no pudo mostrar la prueba local. Revisa los permisos del dispositivo.'); }
  };
  const disable = async () => {
    setSaving(true); setErrorMessage(''); setTestMessage(''); setPushTest(null);
    try {
      if (await auth.getUser()) await api.delete('/api/notifications/preferences');
      setEnabled(false);
      setDeviceReady(false);
      await notifications.unsubscribe({ showUi:false });
      setLegacyPending(false);
      track('tc_notifications_disabled',{surface:'alerts_panel'});
      onSaved('Notificaciones desactivadas. No se enviarán nuevos avisos a tu cuenta.');
    } catch { setErrorMessage('No fue posible desactivar los avisos. Vuelve a intentarlo.'); }
    finally { setSaving(false); }
  };
  return <div className='modal neoAlertsModal tcNotifyBackdrop' role='presentation' onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <div className='neoAlertsPanel tcNotifyPanel' role='dialog' aria-modal='true' aria-labelledby='tc-notify-heading'>
      <button className='neoAlertsClose' onClick={onClose} aria-label='Cerrar avisos'><X/></button>
      <div className='neoAlertsForm tcNotifyForm'>
        <div className='tcNotifyHeading'><span className='tcNotifyIcon'><Bell aria-hidden='true'/></span><div><h2 id='tc-notify-heading'>Notificaciones automáticas</h2><p>Las alertas son voluntarias. Para recibirlas con la app cerrada debes confirmar tu correo y permitir notificaciones.</p></div></div>
        {enabled&&<div className='tcNotifyActive' role='status'><CheckCircle aria-hidden='true'/> Preferencias guardadas en tu cuenta{deviceReady?' · dispositivo registrado':''}</div>}
        <label className='tcNotifyMainPlace'>Comuna principal
          <select value={selected[0]||''} onChange={event=>{const value=event.target.value;setSelected(current=>value?[value,...current.filter(x=>x!==value).slice(0,4)]:[]);}}>
            <option value=''>Selecciona una comuna</option>
            {selectable.map(value=><option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <details className='tcNotifyMore'>
          <summary>Más comunas y cargos (opcional)</summary>
          <p>Selecciona hasta cinco comunas en total.</p>
          <div className='neoAlertPlaces'>{selectable.map(value=><button type='button' key={value} aria-pressed={selected.includes(value)} className={selected.includes(value)?'active':''} onClick={()=>togglePlace(value)}>{selected.includes(value)&&<CheckCircle aria-hidden='true'/>}{value}</button>)}</div>
          <label className='neoAlertKeywords'>Cargos de interés (opcional)
            <input value={keywords} onChange={event=>setKeywords(event.target.value)} placeholder='Ej.: conductor, TENS' />
          </label>
        </details>
        <p className='tcNotifyNote'>Buscar trabajo y consultar novedades es gratis y no requiere cuenta. Solo para recibir notificaciones automáticas con la app cerrada, el proveedor AppDeploy solicita iniciar sesión una vez y aceptar los permisos del teléfono. No tiene cobros. En iPhone puede ser necesario instalar la app primero.</p>
        {errorMessage&&<div className='formError' role='alert'><AlertCircle/>{errorMessage}</div>}
        {testMessage&&<p className='tcNotifyActive' role='status'>{testMessage}</p>}
        {pushTest?.status === 'waiting' && <p className='tcNotifyNote' role='status'>Esperando confirmación de este dispositivo…</p>}
        {pushTest?.status === 'timed_out' && <p className='tcNotifyNote' role='status'>Este dispositivo no confirmó la recepción en 30 segundos. Usa «Comprobar aviso local» para revisar el permiso del teléfono.</p>}
        {pushTest?.status === 'received' && <p className='tcNotifyActive' role='status'>Prueba push recibida por esta aplicación. Revisa también el aviso del sistema.</p>}
        {localResult&&<p className='tcNotifyNote' role='status'>{localResult}</p>}
        {enabled&&<button type='button' className='neoAlertTest' onClick={()=>void testLocalNotification()}>Comprobar aviso local</button>}
        <div className='neoAlertActions tcNotifyActions'>
          <button type='button' className='neoAlertPrimary' disabled={saving||loading} onClick={()=>void activate()}><Bell aria-hidden='true'/>{saving?'Guardando…':enabled?'Actualizar avisos':signedIn?'Activar notificaciones':'Confirmar correo y activar'}</button>
          {enabled&&<button type='button' className='neoAlertTest' disabled={saving||loading} onClick={()=>void testNotification()}>Probar envío</button>}
          {(enabled||legacyPending)&&<button type='button' className='neoAlertDisable' disabled={saving||loading} onClick={()=>void disable()}>Desactivar</button>}
        </div>
        <small className='neoAlertFoot'>Solo se notifican publicaciones verificadas que coincidan con tus zonas o cargos. Puedes desactivar las alertas cuando quieras.</small>
      </div>
    </div>
  </div>;
}

export function OperationsPanel() {
  const [summary, setSummary] = useState<OpsSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [proof, setProof] = useState<{
    ingestion:{ status:string; stored:number; published:number; feedManifestId:string | null; receipts:Array<{ publishedId:string | null }> };
    feed:{ complete:boolean; manifestId:string | null; buildSource:string | null; stagedPages:number };
    visibleIds:string[]; visibleItems:Record<string,unknown>[]; feedReadComplete:boolean; feedPagesRead:number;
    feedReadError:string | null; checkedAt:string;
    documentRevalidation:Record<string,unknown> | null; documentRevalidationError:string | null;
  } | null>(null);
  const securityMode = new URLSearchParams(window.location.search).get('security-proof') === '1';
  const [securityProof,setSecurityProof] = useState<Record<string,unknown> | null>(null);
  const proofMode = new URLSearchParams(window.location.search).get('radar-proof') === '1';
  const localMode = new URLSearchParams(window.location.search).get('radar-local-proof') === '1';
  const localCursor = new URLSearchParams(window.location.search).get('local-cursor') || undefined;
  const publicMode = new URLSearchParams(window.location.search).get('radar-public-proof') === '1';
  const receiverMode = new URLSearchParams(window.location.search).get('radar-receiver-proof') === '1';
  const [receiverRunning,setReceiverRunning] = useState(false);
  const [receiverResult,setReceiverResult] = useState<Record<string,unknown> | null>(null);
  const runReviewedDelivery = async () => {
    setReceiverRunning(true);setErrorMessage('');
    try {
      const response=await api.post('/api/ops/radar-external/consume',{});
      setReceiverResult(response.data);
    } catch {
      setReceiverResult({error:'No se pudo completar la incorporación del lote revisado.'});
      setErrorMessage('No se pudo completar la incorporación; las ofertas guardadas se conservan.');
    } finally {setReceiverRunning(false);}
  };
  const [publicStatus,setPublicStatus] = useState<Record<string,unknown> | null>(null);
  const [publicRunning,setPublicRunning] = useState(false);
  const [publicResult,setPublicResult] = useState<Record<string,unknown> | null>(null);
  const readPublicStatus = async () => {
    const response=await api.get('/api/ops/free-public-sources');
    setPublicStatus(response.data);
  };
  const runPublicSources = async () => {
    setPublicRunning(true);setErrorMessage('');
    try {
      const response=await api.post('/api/ops/free-public-sources/run',{ requestId:'public-ui-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2) });
      setPublicResult(response.data);await readPublicStatus();
    } catch { setErrorMessage('No pudimos completar la lectura pública; los datos guardados se conservan.'); }
    finally { setPublicRunning(false); }
  };
  const [localEvidence, setLocalEvidence] = useState<{
    schema:string; items:Array<Record<string, unknown>>; nextCursor:string | null; hasMore:boolean;
    stats:{ runsReturned:number; findingsReturned:number }; readOnly:boolean; providerCalls:number;
  } | null>(null);
  useEffect(() => {
    let active = true;
    if (!proofMode && !localMode && !publicMode && !receiverMode && !securityMode) {
      api.get('/api/ops/summary')
        .then(response => { if (active) setSummary(response.data as OpsSummary); })
        .catch(() => { if (active) setErrorMessage('No pudimos cargar el resumen operativo.'); });
    }
    if (publicMode) {
      api.get('/api/ops/free-public-sources')
        .then(response => { if (active) setPublicStatus(response.data); })
        .catch(() => { if (active) setErrorMessage('No pudimos consultar las fuentes públicas.'); });
    }
    if (localMode && !publicMode) {
      const suffix = localCursor ? '?cursor=' + encodeURIComponent(localCursor) : '';
      api.get('/api/ops/local-source-evidence' + suffix)
        .then(response => {
          if (response.data.schema !== 'trabajo-cerca.existing-local-evidence.v1' || !Array.isArray(response.data.items)) throw new Error('Invalid evidence response');
          if (active) setLocalEvidence(response.data);
        })
        .catch(() => { if (active) setErrorMessage('No pudimos leer las capturas locales guardadas.'); });
    }
    if (proofMode && !localMode && !publicMode) {
      void (async () => {
        try {
          const [external, feed, documents] = await Promise.all([
            api.get('/api/ops/radar-external'), api.get('/api/ops/radar-feed'),
            api.get('/api/ops/document-revalidation').catch(() => ({ data:null })),
          ]);
          const inventory=await readFeedInventory(path => api.get(path));
          const visibleIds=inventory.items.map(item=>item.id);
          const feedReadError=inventory.error;
          if (active) setProof({ ingestion:external.data, feed:feed.data, visibleIds, feedReadError,
            visibleItems:inventory.items,feedReadComplete:inventory.complete,feedPagesRead:inventory.pagesRead,
            documentRevalidation:documents.data, documentRevalidationError:documents.data ? null : 'No se pudo leer la revalidación documental.',
            checkedAt:new Date().toISOString() });
        } catch { if (active) setErrorMessage('No pudimos consultar el estado de integración.'); }
      })();
    }
    return () => { active = false; };
  }, [proofMode, localMode, localCursor, publicMode, receiverMode]);
  useEffect(() => {
    let active=true;
    if (securityMode) void (async () => {
      try {
        const policy=await api.get('/api/ops/security-policy');
        if (!active) return;
        if (policy.data.revision!=='security-containment-v2' || policy.data.manualOperations!==false ||
            policy.data.paidProviders!==false || policy.data.remoteAi!==false) throw new Error('security_policy_not_confirmed');
        const results:Array<Record<string,unknown>>=[];
        for (const [method,path] of [
          ['POST','/api/ops/radar-external/consume'],['POST','/api/ops/free-public-sources/run'],
          ['POST','/api/radar/social-run'],['POST','/api/radar/social-collect'],
          ['GET','/api/radar/run-territorial-now'],['POST','/api/radar/photo-tip'],
          ['POST','/api/admin/backup/page'],
        ]) {
          try {
            const response=method==='GET' ? await api.get(path) : await api.post(path,{});
            results.push({method,path,unexpectedSuccess:true,data:response.data});
          } catch (cause) {
            const failure=cause as {status?:number;statusCode?:number;response?:{status?:number};message?:string};
            results.push({method,path,status:failure.response?.status ?? failure.status ?? failure.statusCode ?? null,
              message:failure.message || 'Request denied'});
          }
        }
        const analytics=await api.post('/api/analytics',{event:'tc_app_open',distinctId:'security-proof-client'});
        if (active) setSecurityProof({policy:policy.data,results,analytics:analytics.data,checkedAt:new Date().toISOString()});
      } catch (cause) {if (active) setSecurityProof({error:cause instanceof Error?cause.message:'security_check_failed'});}
    })();
    return () => {active=false;};
  },[securityMode]);
  const back = () => {
    const target = new URL(window.location.href);
    target.searchParams.delete('panel');
    target.hash = '';
    window.location.assign('./');
  };
  return (
    <main className='opsShell'>
      <header className='opsHeader'>
        <div className='brand'><div className='brandmark'><img className='tcOfficialBrandIcon' src='/brand/trabajo-cerca-simbolo.svg' width='64' height='64' alt='' aria-hidden='true' decoding='async' /></div><div><b>Trabajo Cerca</b><span>CENTRO DE ADMINISTRACIÓN</span></div></div>
        <button className='tcAdminBackCompact' type='button' onClick={back} aria-label='Volver a Trabajo Cerca'>← Volver</button>
      </header>
      {securityMode && <pre id='security-live-check'>{JSON.stringify(securityProof,null,2)}</pre>}
      <section className='opsHero'>
        <h1>Panel de administración</h1>
      </section>
      <AdministratorAccess summary={summary ? {
        jobs:summary.jobs.active,
        publicVisible:summary.jobs.publicVisible,
        verified:summary.jobs.verified,
        pending:summary.radar.pendingCandidates,
        requests:summary.growth.advertiserLeads,
        campaigns:summary.growth.activeCampaigns,
        lastSweep:summary.radar.lastSweep,
      }:undefined}/>
      <details className='opsTechnicalDetails' id='ops-diagnostico' open={securityMode||proofMode||localMode||publicMode||receiverMode}>
        <summary>Diagnóstico técnico</summary>
      {new URLSearchParams(window.location.search).get('restore-proof') === '1' && <Suspense fallback={<p role='status'>Preparando comprobación de respaldo…</p>}><RestoreRehearsalProof /></Suspense>}
      <section className='opsReadiness' aria-label='Preparación para producción'>
        <ShieldCheck aria-hidden='true' />
        <div><b>Preparación para producción</b><p>El respaldo integral sigue pendiente. Las operaciones manuales del radar permanecen deshabilitadas.</p></div>
        <span>Pendiente</span>
      </section>
      {errorMessage && <div className='opsError'><AlertCircle /> {errorMessage}</div>}
      {!receiverMode && !summary && !proof && !localEvidence && !publicStatus && !errorMessage && <div className='opsLoading'>Cargando indicadores…</div>}
      {receiverMode && <section className='opsCard'>
        <span className='overline'>PUBLICACIONES REVISADAS</span>
        <p>Completa la incorporación del lote revisado y consulta el resultado.</p>
        <button id='reviewed-receiver-run' onClick={() => void runReviewedDelivery()} disabled={receiverRunning}>{receiverRunning ? 'Aplicando…' : 'Aplicar ofertas revisadas'}</button>
        <pre id='radar-receiver-check' style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify({result:receiverResult,running:receiverRunning},null,2)}</pre>
      </section>}
      {publicMode && <section className='opsCard'>
        <span className='overline'>FUENTES PÚBLICAS · ÚLTIMOS 45 DÍAS</span>
        <p>Consulta portales y archivos locales. Los resultados incompletos quedan pendientes; una oferta guardada se confirma cuando aparece en el Radar.</p>
        <button id='free-source-run' onClick={() => void runPublicSources()} disabled={publicRunning}>{publicRunning ? 'Leyendo fuentes…' : 'Leer fuentes públicas'}</button>
        <button onClick={() => void readPublicStatus().catch(() => setErrorMessage('No pudimos actualizar la comprobación.'))}>Actualizar comprobación</button>
        <p>{publicStatus?.initialized ? 'Hay una lectura registrada.' : 'La primera lectura está pendiente.'} La cobertura histórica completa todavía debe comprobarse.</p>
        <pre id='radar-public-check' style={{ whiteSpace:'pre-wrap',overflowWrap:'anywhere' }}>{JSON.stringify({ state:publicStatus,result:publicResult,running:publicRunning },null,2)}</pre>
      </section>}
      {localEvidence && <>
        <section className='opsGrid'>
          <article><span>CAPTURAS CONSULTADAS</span><b>{localEvidence.stats.runsReturned}</b><small>solo esta página del historial</small></article>
          <article><span>AVISOS DEVUELTOS</span><b>{localEvidence.stats.findingsReturned}</b><small>evidencia guardada por los recolectores</small></article>
        </section>
        <section className='opsCard'><span className='overline'>EVIDENCIA DE FUENTES LOCALES</span><p>Esta consulta lee capturas públicas ya guardadas. No inicia búsquedas ni OCR. La página consultada no acredita cobertura completa de las fuentes.</p><pre id='radar-local-check' style={{ whiteSpace:'pre-wrap', overflowWrap:'anywhere' }}>{JSON.stringify(localEvidence, null, 2)}</pre></section>
      </>}
      {proof && <>
        <section className='opsGrid'>
          <article><span>OFERTAS EXTERNAS GUARDADAS</span><b>{proof.ingestion.stored}</b><small>último lote recibido</small></article>
          <article><span>PUBLICACIONES CONFIRMADAS</span><b>{proof.ingestion.published}</b><small>con ID en el feed visible</small></article>
          <article><span>ESTADO DEL FEED</span><b>{proof.feed.complete ? 'Completo' : 'En construcción'}</b><small>{proof.feed.stagedPages} páginas preparadas</small></article>
        </section>
        {proof.feedReadError && <div className='opsError'>{proof.feedReadError}</div>}
        <section className='opsCard'><span className='overline'>COMPROBACIÓN DE LECTURA</span><p>Esta vista no ejecuta motores ni publica avisos.</p><pre id='radar-live-check' style={{ whiteSpace:'pre-wrap', overflowWrap:'anywhere' }}>{JSON.stringify(proof, null, 2)}</pre></section>
      </>}
      {summary && <>
        <button type='button' onClick={()=>{void api.get('/api/ops/summary').then(r=>{setSummary(r.data as OpsSummary);setErrorMessage('');}).catch(()=>setErrorMessage('No se pudo actualizar el resumen.'));}}>Actualizar cifras del panel</button>
        <section className='opsGrid'>
          <article><span>OFERTAS EN PORTADA</span><b>{summary.jobs.publicVisible}</b><small>catálogo público; misma fuente de datos que Inicio</small></article>
          <article><span>REGISTROS ACTIVOS</span><b>{summary.jobs.active}</b><small>{summary.jobs.verified} marcados como verificados en el sistema</small></article>
          <article><span>POR CONFIRMAR</span><b>{summary.jobs.publicPending}</b><small>pistas públicas del Radar</small></article>
          <article><span>REVISIÓN INTERNA</span><b>{summary.radar.pendingCandidates}</b><small>candidatos aún no publicados</small></article>
          <article><span>PUBLICACIONES DIRECTAS</span><b>{summary.jobs.direct}</b><small>personas y empleadores</small></article>
        </section>
        <p className='opsInventoryNote'>Conteos internos del sistema. No equivalen al total de vacantes vigentes verificadas en la portada.</p>
        <section className='opsColumns'>
          <div className='opsCard'>
            <span className='overline'>SALUD DEL RADAR</span>
            <div className='opsLine'><div><Radar /><span>Fuentes que requieren atención</span></div><b>{summary.radar.sourceFailures}</b></div>
            <div className='opsLine'><div><CheckCircle /><span>Último barrido registrado</span></div><b>{summary.radar.lastSweep ? new Date(summary.radar.lastSweep).toLocaleString('es-CL',{dateStyle:'short',timeStyle:'short'}) : 'Pendiente'}</b></div>
          </div>
          <div className='opsCard'>
            <span className='overline'>CRECIMIENTO Y COMERCIAL</span>
            <div className='opsLine'><div><Store /><span>Solicitudes de anunciantes</span></div><b>{summary.growth.advertiserLeadsPartial?'Al menos ':''}{summary.growth.advertiserLeads}</b></div>
            <div className='opsLine'><div><Megaphone /><span>Borradores sociales</span></div><b>{summary.growth.socialDraftsPartial?'Al menos ':''}{summary.growth.socialDrafts}</b></div>
            <div className='opsLine'><div><BadgeCheck /><span>Campañas activas</span></div><b>{summary.growth.activeCampaigns}</b></div>
          </div>
        </section>
        <section className='opsPrivacy'><ShieldCheck /><div><b>Resumen sin datos personales</b><span>{summary.privacy.note}</span></div></section>
        <footer className='opsUpdated'>Actualizado {new Date(summary.updatedAt).toLocaleString('es-CL',{dateStyle:'short',timeStyle:'short'})}</footer>
      </>}
      </details>
    </main>
  );
}


const NEO_VISUAL_IMAGES: Record<string,string> = {
  forest:'https://images.unsplash.com/photo-1511497584788-876760111969?auto=format&fit=crop&fm=webp&q=74&w=900',
  fire:'https://images.unsplash.com/photo-1511497584788-876760111969?auto=format&fit=crop&fm=webp&q=74&w=900',
  health:'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&fm=webp&q=74&w=900',
  retail:'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&fm=webp&q=74&w=900',
  construction:'https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?auto=format&fit=crop&fm=webp&q=74&w=900',
  mechanic:'https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?auto=format&fit=crop&fm=webp&q=74&w=900',
  transport:'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&fm=webp&q=74&w=900',
  toll:'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&fm=webp&q=74&w=900',
  warehouse:'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&fm=webp&q=74&w=900',
  industry:'https://images.unsplash.com/photo-1565793298595-6a879b1d9492?auto=format&fit=crop&fm=webp&q=74&w=900',
  service:'https://images.unsplash.com/photo-1749532125405-70950966b0e5?auto=format&fit=crop&fm=webp&q=74&w=900',
  people:'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&fm=webp&q=74&w=900',
};

function NeoArtwork({ item }: { item: Listing }) {
  const VisualIcon = item.visual === 'forest' || item.visual === 'fire'
    ? TreePine
    : item.visual === 'transport' || item.visual === 'toll'
      ? Truck
      : item.visual === 'warehouse' || item.visual === 'industry'
        ? Warehouse
        : item.visual === 'health'
          ? HeartPulse
          : item.visual === 'retail'
            ? Store
            : item.visual === 'construction' || item.visual === 'mechanic'
              ? Wrench
              : item.kind === 'worker_available'
                ? UserRoundSearch
                : item.kind === 'service_request'
                  ? Wrench
                  : MapPin;
  const imageKey = item.kind === 'worker_available'
    ? 'people'
    : item.kind === 'service_request'
      ? 'service'
      : item.visual;
  const imageUrl = NEO_VISUAL_IMAGES[imageKey] || NEO_VISUAL_IMAGES.people;
  return (
    <div className={'neoArtwork neoArt-' + item.visual}>
      <img className='neoArtPhoto' src={imageUrl} alt='' loading='lazy' onError={event => { const image = event.currentTarget; if (image.dataset.fallbackApplied === '1') return; image.dataset.fallbackApplied = '1'; image.src = NEO_VISUAL_IMAGES.retail; }} />
      <span className='neoArtPhotoShade' />
      <div className='neoArtIcon'><VisualIcon /></div>
      <small>{item.kind === 'worker_available' ? 'PERSONA DISPONIBLE' : item.kind === 'service_request' ? 'SERVICIO LOCAL' : item.area}</small>
    </div>
  );
}

// Visual identity only: use the actual work locality, never source or recruiter locality.
// All tones are extremely light and stable across listings, filters and pagination.
const CARD_TOWN_TONES: Record<string,string> = {
  angol:'angol', collipulli:'collipulli', ercilla:'ercilla',
  renaico:'renaico', mininco:'mininco', 'los sauces':'los-sauces',
  puren:'puren', traiguen:'traiguen', lumaco:'lumaco',
  nacimiento:'nacimiento', negrete:'negrete', mulchen:'mulchen',
  victoria:'victoria',
};
function listingTownTone(workCommunes:string[],workLocation?:string):string {
  const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-CL').trim();
  const actual=normalize(workLocation||'');
  for(const [town,key] of Object.entries(CARD_TOWN_TONES)) {
    if(actual===town || actual.startsWith(town+' ') || actual.endsWith(' '+town) || actual.includes(', '+town)) return key;
  }
  for(const commune of workCommunes||[]) {
    const key=CARD_TOWN_TONES[normalize(commune)];
    if(key)return key;
  }
  return 'neutral';
}

function App() {
  const [initialCache]=useState(()=>readPublicJobCache<Listing>());
  const [items, setItems] = useState<Listing[]>(()=>initialCache?.items??[]);
  const [cachedView,setCachedView]=useState(Boolean(initialCache?.items.length));
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [feedSummary, setFeedSummary] = useState<FeedSummary>(()=>initialCache?.summary as FeedSummary || {
    totalItems:0,totalJobOffers:0,totalVerifiedJobOffers:0,totalProvisionalJobOffers:0,
    communeStats:{},kindStats:{jobs:0,people:0,needs:0,services:0}
  });
  const [loadError, setLoadError] = useState('');
  const [feedState, setFeedState] = useState<'fresh'|'degraded_last_good'|'authoritative_empty'>('fresh');
  const queryParams = new URLSearchParams(window.location.search);
  const requestedPlace = queryParams.get('place') || '';
  const initialPlace = [...places, ...travelPlaces].includes(requestedPlace) ? requestedPlace : 'Todas';
  const [flow, setFlow] = useState<Flow | null>(() => queryParams.get('share_target') === '1' ? 'aporte' : null);
  const [section, setSection] = useState<Section>('opportunities');
  const [directoryMode, setDirectoryMode] = useState<'all' | 'service' | 'business' | null>(null);
  const [directoryOpenForm,setDirectoryOpenForm] = useState(false);
  const [showHiringChoices, setShowHiringChoices] = useState(false);
  const [showPublishChoices, setShowPublishChoices] = useState(false);
  const publishDialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!showPublishChoices) return;
    const dialog=publishDialogRef.current;
    if (!dialog) return;
    const previousFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const previousOverflow=document.body.style.overflow;
    const focusables=()=>[...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,select,textarea')]
      .filter(el=>el.getClientRects().length>0);
    document.body.style.overflow='hidden';
    (focusables()[0]||dialog).focus();
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();setShowPublishChoices(false);return;}
      if(event.key!=='Tab')return;
      const nodes=focusables(),first=nodes[0],last=nodes[nodes.length-1];
      if(!nodes.length){event.preventDefault();dialog.focus();}
      else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    };
    document.addEventListener('keydown',onKey);
    return()=>{
      document.removeEventListener('keydown',onKey);
      document.body.style.overflow=previousOverflow;
      if(previousFocus?.isConnected)previousFocus.focus();
    };
  }, [showPublishChoices]);
  const [analyticsChoice, setAnalyticsChoice] = useState<string | null>(()=>{try{return localStorage.getItem('tc_analytics_consent')||'no';}catch{return 'no';}});
  const [place, setPlace] = useState(initialPlace);
  const [filterMode, setFilterMode] = useState<FilterMode>('work');
  const [q, setQ] = useState('');
  const [area, setArea] = useState('Todas');
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [showCoverage, setShowCoverage] = useState(false);
  const [notice, setNotice] = useState('');
  const [radarStatus, setRadarStatus] = useState<RadarStatus | null>(null);
  const [onlyNew, setOnlyNew] = useState(queryParams.get('new') === '1');
  const [selected, setSelected] = useState<Listing | null>(null);
  const advertising=useAdvertising(place,area,section==='opportunities'?'home':section);
  const [houseAttribution,setHouseAttribution]=useState<HouseAttribution|null>(null);
  const exploredCursors = useRef(new Set<string>());
  const [showAdvertiser, setShowAdvertiser] = useState(false);
  const [showAlerts, setShowAlerts] = useState(() => { try { return Boolean(sessionStorage.getItem('tc_alerts_intent')); } catch { return false; } });
  const [showActivity,setShowActivity]=useState(false);
  const [onlyUnread,setOnlyUnread]=useState(false);
  const [resultPage,setResultPage]=useState(0);
  const [reading,setReading]=useState(()=>{try{return loadReading(localStorage);}catch{return {version:1 as const,known:false,previousVisitAt:null,read:{}};}});
  const [feedUpdatedAt,setFeedUpdatedAt]=useState<string|null>(null);
  const [feedComplete,setFeedComplete]=useState(false);
  const requestGeneration=useRef(0);
  const [resultFocus,setResultFocus]=useState(0);
  const [legalView, setLegalView] = useState<LegalView>(()=>{const value=new URLSearchParams(window.location.search).get('legal');return value==='privacy'||value==='terms'?value:null;});

  useEffect(() => {
    if (!legalView) return;
    const dialog = document.querySelector<HTMLElement>('.legalModal');
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]')).filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0);
    document.body.style.overflow = 'hidden';
    (controls()[0] || dialog).focus();
    const keepFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialog.contains(event.target)) (controls()[0] || dialog).focus();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setLegalView(null);
      } else if (event.key === 'Tab') {
        const elements = controls();
        const first = elements[0] || dialog;
        const last = elements[elements.length - 1] || dialog;
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKey, true);
    document.addEventListener('focusin', keepFocus);
    return () => {
      document.removeEventListener('keydown', handleKey, true);
      document.removeEventListener('focusin', keepFocus);
      document.body.style.overflow = previousOverflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [legalView]);

  useEffect(()=>{
    if(!selected)return;const dialog=document.querySelector<HTMLElement>('.neoDrawer');if(!dialog)return;
    const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;document.body.style.overflow='hidden';
    const controls=()=>[...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,select,textarea')].filter(e=>e.getClientRects().length>0);
    (controls()[0]||dialog).focus();const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();setSelected(null);}else if(e.key==='Tab'){const nodes=controls(),first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('keydown',key);document.body.style.overflow=overflow;previous?.isConnected&&previous.focus();};
  },[selected?.id]);

  const [revealingContact, setRevealingContact] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installHelp,setInstallHelp] = useState(false);
  // Visible once per browsing session, never forced over a shared listing.
  const [showInstallInvitation,setShowInstallInvitation] = useState(()=>{
    try{return sessionStorage.getItem('tc_install_invite_dismissed')!=='1';}catch{return true;}
  });
  const dismissInstallInvitation=()=>{
    try{sessionStorage.setItem('tc_install_invite_dismissed','1');}catch{}
    setShowInstallInvitation(false);
  };
  useEffect(()=>{
    if(!installHelp)return;
    const dialog=document.querySelector<HTMLElement>('.tcInstallGuide');if(!dialog)return;
    const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
    const controls=()=>[...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),a[href]')].filter(e=>e.getClientRects().length>0);
    document.body.style.overflow='hidden';(controls()[0]||dialog).focus();
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();setInstallHelp(false);}else if(e.key==='Tab'){const nodes=controls(),first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};
    document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('keydown',key);document.body.style.overflow=overflow;previous?.isConnected&&previous.focus();};
  },[installHelp]);
  const [isStandalone,setIsStandalone] = useState(()=>window.matchMedia('(display-mode: standalone)').matches || (window.navigator as Navigator & {standalone?:boolean}).standalone===true);
  const [homePlace, setHomePlace] = useState(places.includes(initialPlace) && !travelPlaces.includes(initialPlace) ? initialPlace : 'Angol');
  const [sessionStartedAt,setSessionStartedAt] = useState(() => new Date().toISOString());
  const noveltyCutoff=Date.parse(sessionStartedAt)-7*86400000;

  const load = async (cursor?: string, fresh = false) => {
    const append = Boolean(cursor);
    const generation=++requestGeneration.current;
    // Keep the existing catalogue visible while refreshing every page as one snapshot.
    // Clearing it to the first 40 entries creates a visible 274 -> 40 -> 274 flash.
    const refreshExisting = !append && items.length > 0;
    if (append) setLoadingMore(true);
    else {
      if (!refreshExisting) {
        setResultPage(0);
        setLoading(true);
        setFeedComplete(false);
        exploredCursors.current.clear();
      }
      setLoadingMore(false);
      if (fresh) setSessionStartedAt(new Date().toISOString());
    }
    if (!refreshExisting) setLoadError('');
    try {
      const params = new URLSearchParams({ limit:'40' });
      if (cursor) params.set('cursor', cursor);
      if (fresh) params.set('fresh', '1');
      // During a fresh deployment the immutable public-feed manifest may not yet
      // be available. Retry boundedly, without overwriting verified inventory.
      let response: Awaited<ReturnType<typeof api.get>>;
      for (let attempt=0;;attempt++) {
        try {
          response=await api.get('/api/listings?' + params.toString());
          break;
        } catch (cause) {
          const status=Number((cause as {response?:{status?:number}})?.response?.status ?? 0);
          if (status!==503 || attempt>=3) throw cause;
          await new Promise(resolve=>setTimeout(resolve,750*(attempt+1)));
          if(generation!==requestGeneration.current)return;
        }
      }
      if(generation!==requestGeneration.current)return;
      if (!Array.isArray(response.data.items)) throw new Error('Invalid catalogue response');
      const incoming = response.data.items as Listing[];
      // A transient subset is never an authoritative inventory.
      if (response.data.degraded === true || response.data.feedRebuilding === true ||
          response.data.feedState === 'degraded_last_good') {
        setFeedState('degraded_last_good');
        setFeedComplete(false);
        if (items.length) setCachedView(false);
        else setLoadError('El catálogo se está recuperando. No significa que no existan ofertas. Vuelve a intentar.');
        return;
      }
      // A refresh is applied atomically only after its immutable cursor pages arrive.
      // This preserves all published entries during the refresh without leaving stale
      // rows mixed with new ones after successful completion.
      let refreshed = incoming;
      let refreshedCursor:string|null = response.data.nextCursor ?? null;
      if (refreshExisting) {
        const more=refreshedCursor?await readRemaining<Listing>(
          refreshedCursor,Number(response.data.totalItems||0),Number(response.data.pageSize||40),
          async next=>(await api.get('/api/listings?cursor='+encodeURIComponent(next)+'&limit=40')).data,
          ()=>generation===requestGeneration.current
        ):[];
        if(generation!==requestGeneration.current)return;
        refreshed=[...incoming,...more];
        refreshedCursor=null;
      }
      if (!append && incoming.length===0 && response.data.feedState==='degraded_last_good') {
        // Do not erase already loaded verified jobs when the server is rebuilding its manifest.
        setFeedState('degraded_last_good');
        if(!items.length)setLoadError('Catálogo en actualización. Esto no significa que no existan ofertas. Reintenta en unos momentos.');
        else setNotice('El inventario se está reconstruyendo. Se conservan las ofertas cargadas anteriormente.');
        return;
      }
      setFeedUpdatedAt(typeof response.data.updatedAt==='string'?response.data.updatedAt:null);
      setFeedComplete(refreshExisting || !response.data.nextCursor);
      if(refreshExisting||!response.data.nextCursor)setCachedView(false);
      setFeedState((response.data.feedState || (Number(response.data.totalVerifiedJobOffers ?? 0) === 0 ? 'authoritative_empty' : 'fresh')) as 'fresh'|'degraded_last_good'|'authoritative_empty');
      if (false && !append && !fresh && Number(response.data.totalVerifiedJobOffers ?? 0) === 0) {
        const today = new Date().toISOString().slice(0, 10);
        if (localStorage.getItem('trabajo-cerca-empty-recovery-v3') !== today) {
          localStorage.setItem('trabajo-cerca-empty-recovery-v3', today);
          setNotice('El Radar está revalidando las fuentes porque el feed quedó vacío. Esto puede tardar unos segundos.');
          try {
            await api.post('/api/radar/recover-empty');
            await load(undefined, true);
            return;
          } catch {
            setNotice('El Radar terminó su revisión, pero todavía no hay ofertas que cumplan el estándar de publicación.');
          }
        }
      }
      setItems(current => {
        if (!append) {
          const unique = [...new Map(refreshed.map(item=>[item.id,item])).values()];
          if (current.length === unique.length && current.every((item,index) => JSON.stringify(item) === JSON.stringify(unique[index]))) return current;
          return unique;
        }
        const merged = new Map<string, Listing>(current.map(item => [item.id, item]));
        for (const item of incoming) merged.set(item.id, item);
        return [...merged.values()];
      });
      setNextCursor(refreshExisting ? null : response.data.nextCursor ?? null);
      const nextSummary:FeedSummary={
        totalItems:Number(response.data.totalItems ?? incoming.length),
        recentJobOffers7d:typeof response.data.recentJobOffers7d==='number' ? response.data.recentJobOffers7d : undefined,
        recentJobOffers24h:typeof response.data.recentJobOffers24h==='number' ? response.data.recentJobOffers24h : undefined,
        totalJobOffers:Number(response.data.totalJobOffers ?? incoming.filter(item => item.kind === 'job_offer').length),
        totalVerifiedJobOffers:Number(response.data.totalVerifiedJobOffers ?? incoming.filter(item => item.kind === 'job_offer' && item.verified && !item.review).length),
        totalProvisionalJobOffers:Number(response.data.totalProvisionalJobOffers ?? incoming.filter(item => item.kind === 'job_offer' && item.review).length),
        communeStats:(response.data.communeStats ?? {}) as Record<string, CommuneStat>,
        kindStats:response.data.kindStats ?? { jobs:0, people:0, needs:0, services:0 },
      };
      setFeedSummary(nextSummary);
      if(!append&&(refreshExisting||!response.data.nextCursor)){
        const stable=refreshed;
        window.setTimeout(()=>writePublicJobCache(stable as unknown as Record<string,unknown>[],
          nextSummary as unknown as Record<string,unknown>),250);
      }
    } catch {
      if(generation!==requestGeneration.current)return;
      if(refreshExisting){setFeedState('degraded_last_good');setCachedView(false);}
      else setLoadError('No pudimos cargar el Radar central. Intenta nuevamente.');
    } finally {
      if(generation===requestGeneration.current){if (append) setLoadingMore(false);else setLoading(false);}
    }
  };

  useEffect(() => {
    track('tc_app_open', { surface:'pwa_web' });
    void load();
  }, []);
  useEffect(()=>{const online=()=>{if(loadError||feedState==='degraded_last_good')void load();};window.addEventListener('online',online);return()=>window.removeEventListener('online',online);},[loadError,feedState]);
  useEffect(()=>{
    const id=new URLSearchParams(window.location.search).get('listing');
    if(!id||!/^[A-Za-z0-9_-]{1,128}$/.test(id))return;
    let active=true;
    void api.get('/api/listings/'+encodeURIComponent(id)).then(response=>{if(active)setSelected(response.data.item);}).catch(()=>{if(active)setNotice('Esta publicación no está disponible. Puedes explorar otras oportunidades.');});
    return()=>{active=false;};
  },[]);
  useEffect(() => {
    if (place !== 'Todas') track('tc_commune_selected', { commune:place });
  }, [place]);
  useEffect(() => {
    if(selected){const next=markReading(reading,selected.id);setReading(next);try{saveReading(localStorage,next);}catch{}}
    if (selected) track('tc_listing_opened', { listing_id:selected.id, kind:selected.kind, commune:selected.workLocation, area:selected.area, origin:selected.origin, verified:selected.verified, review:selected.review });
  }, [selected?.id]);
  useEffect(() => {
    try{saveReading(localStorage,reading);}catch{}
  }, [sessionStartedAt]);
  useEffect(() => {
    const beforeInstall = (event:Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
      track('tc_install_prompt_available',{surface:'pwa'});
    };
    const installed = () => {
      setInstallPrompt(null);
      setIsStandalone(true);
      track('tc_app_installed', { surface:'pwa' });
      setNotice('Trabajo Cerca quedó instalada en tu dispositivo.');
    };
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);
  useEffect(() => {
    void notifications.configure({ showSystemNotificationOnForeground:true }).catch(() => undefined);
    const off = notifications.onMessage(payload => {
      const title = 'notification' in payload ? payload.notification?.title : undefined;
      setNotice(title || 'Llegó una nueva actualización de Trabajo Cerca.');
      const data = 'data' in payload ? payload.data : undefined;
      window.dispatchEvent(new CustomEvent('tc-push-received', { detail:data || {} }));
      if (data?.kind !== 'notification_test') void load(undefined, true);
    });
    return off;
  }, []);

  const isFresh = (item: Listing) => {
    return recentInApp(item,Date.parse(sessionStartedAt));
  };

  const freshOpportunities = useMemo(() => items.filter(item =>
    (item.kind === 'job_offer' || (item.kind === 'worker_need' && !item.review)) && isFresh(item)
  ), [items, noveltyCutoff]);

  const freshByPlace = useMemo(() => Object.entries(feedSummary.communeStats)
    .filter(([,stat]) => typeof stat.newJobs7d==='number' && stat.newJobs7d>0)
    .map(([commune,stat]) => [commune,stat.newJobs7d!] as [string,number])
    .sort((a,b) => b[1]-a[1]), [feedSummary.communeStats]);

  const areas = useMemo(() => ['Todas', ...Array.from(new Set(items.filter(i => i.kind === 'job_offer').map(i => i.area)))], [items]);

  const visible = useMemo(() => {
    const base = items.filter(item => {
      if (section === 'opportunities') return item.kind === 'job_offer';
      if (section === 'people') return item.kind === 'worker_available' && !item.review;
      if (section === 'needs') return item.kind === 'worker_need' && !item.review;
      return item.kind === 'service_request' && !item.review;
    });

    return base.filter(item => {
      // Las ofertas laborales se filtran SIEMPRE por comuna de ejecución.
      // El filtro de reclutamiento permanece solo para perfiles/solicitudes comunitarias.
      const communeMatch = place!=='Todas' && filterMode==='recruit' && section!=='opportunities'
        ? item.recruitmentCommunes.some(city=>officialWorkCommune(city)===place)
        : matchesTerritorialView(item, place, places);
      const areaMatch = area === 'Todas' || item.area === area;
      const freshnessMatch = !onlyNew || isFresh(item);
      const readMatch = !onlyUnread || (reading.known && !reading.read[item.id]);
      const haystack = [item.title,item.company,item.note,item.workLocation,item.recruitmentZones.join(' '),item.portalPlace || '',item.evidence || '',...item.tags].join(' ').toLocaleLowerCase('es-CL');
      return communeMatch && areaMatch && freshnessMatch && readMatch && haystack.includes(q.toLocaleLowerCase('es-CL'));
    });
  }, [items, section, place, filterMode, q, area, onlyNew, onlyUnread, reading, noveltyCutoff]);

  useEffect(()=>setResultPage(0),[section,place,filterMode,q,area,onlyNew,onlyUnread]);
  // Match the approved 6-card desktop / 4-card mobile composition; keep every result paginated.
  const [resultsPerPage,setResultsPerPage]=useState(()=>window.matchMedia('(max-width:767px)').matches?4:6);
  useEffect(()=>{
    const media=window.matchMedia('(max-width:767px)');
    const resize=()=>{setResultsPerPage(media.matches?4:6);setResultPage(0);};
    media.addEventListener('change',resize);
    return()=>media.removeEventListener('change',resize);
  },[]);
  const shownResults=visible.slice(resultPage*resultsPerPage,resultPage*resultsPerPage+resultsPerPage);
  const resultPages=Math.max(1,Math.ceil(visible.length/resultsPerPage));
  const sourceCounts = useMemo(() => { const counts = new Map<string,number>(); for (const item of items) { if (item.kind !== 'job_offer' || !matchesTerritorialView(item,'Todas',places)) continue; const source = item.source || 'Fuente no identificada'; counts.set(source,(counts.get(source)||0)+1); } return [...counts.entries()].sort((a,b)=>b[1]-a[1]); },[items]);
  const availableJobs = feedSummary.totalJobOffers;
  const inventoryCounts=publishedInventoryCounts(feedSummary,place);
  const recentJobs=inventoryCounts.recent7d;
  const verifiedJobs = feedSummary.totalVerifiedJobOffers || items.filter(i => i.kind === 'job_offer' && i.verified && !i.review).length;
  const provisionalJobs = feedSummary.totalProvisionalJobOffers || items.filter(i => i.kind === 'job_offer' && i.review).length;
  const people = feedSummary.kindStats.people || items.filter(i => i.kind === 'worker_available').length;
  const directNeeds = feedSummary.kindStats.needs || items.filter(i => i.kind === 'worker_need').length;
  const selectedStat = place === 'Todas' ? emptyCommuneStat : (feedSummary.communeStats[place] ?? emptyCommuneStat);
  const normalizedRadarStats=useMemo(()=>{
    if(!feedComplete)return feedSummary.communeStats;
    // Never display a stale source count after a territorial review excludes a job.
    const next={...feedSummary.communeStats};
    for(const commune of PRIMARY_PLACES){
      const jobs=items.filter(item=>item.kind==='job_offer'&&item.verified===true&&
        !item.review&&matchesTerritorialView(item,commune,places)).length;
      next[commune]={...(feedSummary.communeStats[commune]??emptyCommuneStat),jobs};
    }
    return next;
  },[feedSummary.communeStats,feedComplete,items]);
  const primaryRadarTotal=useMemo(
    ()=>territorialScopeTotals(items.filter(item=>item.verified===true&&!item.review)).primary,
    [items]
  );
  const isTravelView = travelPlaces.includes(place);
  // Completar el inventario en segundo plano sin añadir fichas una a una.
  // Un lote único evita que el listado salte de 40 a 80 a 93 durante el arranque.
  useEffect(() => {
    if (!nextCursor || loading || loadingMore || loadError || document.visibilityState !== 'visible') return;
    const connection = (navigator as Navigator & {connection?:{saveData?:boolean;effectiveType?:string}}).connection;
    if (connection?.saveData || /2g/.test(connection?.effectiveType ?? '')) return;
    let active=true;
    const generation=requestGeneration.current;
    const timer=window.setTimeout(() => {
      void (async () => {
        let more:Listing[];
        try{
          more=await readRemaining<Listing>(
            nextCursor,Number(feedSummary.totalItems||0),40,
            async cursor=>(await api.get('/api/listings?cursor='+encodeURIComponent(cursor)+'&limit=40')).data,
            ()=>active&&generation===requestGeneration.current&&document.visibilityState==='visible'
          );
        }catch{return;}
        if(!active||generation!==requestGeneration.current)return;
        const merged=new Map(items.map(item=>[item.id,item]));
        for(const item of more)merged.set(item.id,item);
        const full=[...merged.values()];
        setItems(full);setNextCursor(null);setFeedComplete(true);setCachedView(false);
        window.setTimeout(()=>writePublicJobCache(full as unknown as Record<string,unknown>[],
          feedSummary as unknown as Record<string,unknown>),250);
      })();
    },1050);
    return()=>{active=false;window.clearTimeout(timer);};
  },[nextCursor,loading,loadingMore,loadError]);
  useEffect(()=>{if(!resultFocus)return;const target=document.getElementById('neo-jobs');target?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});target?.focus({preventScroll:true});},[resultFocus]);
  const navigateResults=(next:Section='opportunities',town=place,recent=false,unread=false)=>{setDirectoryMode(null);setResultPage(0);setSection(next);setPlace(town);setFilterMode('work');setQ('');setArea('Todas');setOnlyNew(recent);setOnlyUnread(unread);setResultFocus(n=>n+1);};
  const territoryTotals=useMemo(()=>territorialScopeTotals(items),[items]);
  const scopedJobs=items.filter(item=>item.kind==='job_offer'&&matchesTerritorialView(item,place,places));
  const scopedRecent=scopedJobs.filter(isFresh);
  const scopeCount=feedComplete?scopedJobs.length:null;
  const scopeRecent=feedComplete?scopedRecent.length:null;
  const scopeUnread=feedComplete?scopedRecent.filter(item=>!reading.read[item.id]).length:0;
  const resultsTitle=(section==='opportunities'?'Empleos':section==='people'?'Personas disponibles':section==='needs'?'Necesitan gente':'Servicios')+' · '+(place==='Todas'?'zona local':place)+(onlyNew?' · Incorporadas en 7 días':'')+(onlyUnread?' · No leídas':'')+(q?' · '+q:'')+(area!=='Todas'?' · '+area:'');
  const reviewCount = provisionalJobs;
  const ownerTokens = getOwnerTokens();
  useEffect(()=>{
    const owned=getOwnerTokens();
    if(items.some(item=>owned[item.id]&&item.kind==='worker_available')) completeHouseGoal('professional');
    if(items.some(item=>owned[item.id]&&item.kind==='worker_need')) completeHouseGoal('employer');
  },[items]);

  const chooseLocalPlace = (nextPlace:string) => {
    if (!travelPlaces.includes(nextPlace)) setHomePlace(nextPlace);
    setPlace(nextPlace);
    setFilterMode('work');
  };

  const openTravel = (city:string) => {
    if(!travelPlaces.includes(place))setHomePlace(place);
    navigateResults('opportunities',city);
    track('tc_travel_opened',{commune:city,surface:'travel_corridor'});
  };

  const installApp = async () => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setNotice('Trabajo Cerca ya está instalada en este dispositivo.');
      return;
    }
    track('tc_install_started', { surface:'internal_campaign', commune:place });
    if (!installPrompt) {
      setInstallHelp(true);
      return;
    }
    try{await installPrompt.prompt();const choice=await installPrompt.userChoice;track(choice.outcome==='accepted'?'tc_install_prompt_accepted':'tc_install_prompt_dismissed',{surface:'pwa'});}catch{setNotice('No se pudo abrir la instalación. Puedes usar el menú de tu navegador.');}finally{setInstallPrompt(null);}
  };

  const goRadar = (next:Section='opportunities') => navigateResults(next);
  const openLocalDirectory = (kind:'all'|'service'|'business'='all', withForm=false) => {
    setDirectoryOpenForm(withForm);
    setDirectoryMode(kind);
    window.setTimeout(() => document.getElementById('local-directory')?.scrollIntoView({behavior:'auto',block:'start'}), 40);
  };
  // Resume the selected rating after returning from passwordless email sign-in.
  // Browsing/publishing never requires a session.
  useEffect(()=>{
    let active=true;
    try{
      if(!sessionStorage.getItem('tc_review_intent'))return;
    }catch{return;}
    void auth.getUser().then(user=>{
      if(active&&user?.email)openLocalDirectory('all');
    }).catch(()=>undefined);
    return()=>{active=false;};
  },[]);
  const chooseAnalytics = (choice:'yes'|'no') => {
    try{localStorage.setItem('tc_analytics_consent',choice);if(choice==='no')localStorage.removeItem('tc_analytics_id');}catch{}
    setAnalyticsChoice(choice);
  };

  const openFresh = (commune?:string) => navigateResults('opportunities',commune||place,true);

  const afterPublish = (kind: Listing['kind']) => {
    void load(undefined, true);
    const next: Section = kind === 'worker_available' ? 'people' : kind === 'worker_need' ? 'needs' : kind === 'service_request' ? 'services' : 'opportunities';
    navigateResults(next);
    setNotice(kind === 'candidate' ? 'Aviso recibido. Quedó en revisión interna del Radar antes de publicarse.' : 'Publicado. Ya quedó guardado y visible en Trabajo Cerca.');

  };

  const closeOwn = async (item: Listing) => {
    const ownerToken = ownerTokens[item.id];
    if (!ownerToken) return;
    try {
      await api.post('/api/listings/' + item.id + '/close', { ownerToken });
      setNotice('Publicación cerrada correctamente.');
      await load(undefined, true);
    } catch {
      setNotice('No pudimos cerrar la publicación. Intenta nuevamente.');
    }
  };

  const deleteOwn = async (item: Listing) => {
    const ownerToken = ownerTokens[item.id];
    if (!ownerToken || !window.confirm('¿Eliminar definitivamente esta publicación y sus datos asociados?')) return;
    try {
      await api.post('/api/listings/' + item.id + '/delete', { ownerToken });
      const current = getOwnerTokens();
      delete current[item.id];
      localStorage.setItem('trabajo-cerca-owner-tokens', JSON.stringify(current));
      setSelected(null);
      setNotice('Publicación y datos eliminados definitivamente.');
      await load(undefined, true);
    } catch {
      setNotice('No pudimos eliminar la publicación. Intenta nuevamente.');
    }
  };

  const revealContact = async (item: Listing) => {
    setRevealingContact(true);
    try {
      const response = await api.post('/api/listings/' + item.id + '/contact', { clientToken:analyticsId() });
      track('tc_contact_revealed', { listing_id:item.id, kind:item.kind, commune:item.workLocation, origin:item.origin });
      setSelected(current => current?.id === item.id ? { ...current, contact:response.data.contact, contactLabel:response.data.contactLabel } : current);
    } catch {
      setNotice('No pudimos mostrar el contacto de este aviso.');
    } finally {
      setRevealingContact(false);
    }
  };

  const shareListing = async (item: Listing) => {
    const url = listingShareUrl(window.location.href,item.id);
    const text = `${item.title} · ${item.workLocation}\nTrabajo Cerca · Empleos y servicios locales.\nAbre el enlace para ver esta oferta. Si quieres tener Trabajo Cerca en tu teléfono, puedes instalar la app gratis desde la página.`;
    track('tc_listing_shared', { listing_id:item.id, kind:item.kind, commune:item.workLocation, origin:item.origin });
    try {
      if (navigator.share) {
        await navigator.share({ title:item.title, text, url });
        return;
      }
    } catch {
      return;
    }
    window.open('https://wa.me/?text=' + encodeURIComponent(text + '\n' + url), '_blank', 'noopener,noreferrer');
  };

  const loadCoverage = async () => {
    if (showCoverage) {
      setShowCoverage(false);
      return;
    }
    setShowCoverage(true);
    try {
      const response = await api.get('/api/radar/status');
      setRadarStatus(response.data as RadarStatus);
    } catch {
      setRadarStatus(null);
    }
  };

  function openSecondary(id:string){const node=document.getElementById(id);if(node){if(node instanceof HTMLDetailsElement)node.open=true;let parent=node.parentElement?.closest('details');while(parent){parent.open=true;parent=parent.parentElement?.closest('details');}node.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}}
  const isVNext = true;
  function openHouseGoal(goal:Goal,attribution:HouseAttribution) {
    setHouseAttribution(attribution);
    if(goal==='professional') {
      if(attribution.campaignId==='house-inclusion')openLocalDirectory('all',true);
      else setFlow('ofrezco');
    }
    else if(goal==='advertiser') {setShowAdvertiser(true);}
    else if(goal==='employer') {setFlow('trabajadores');}
    else {completeHouseGoal('explore');navigateResults('opportunities');}
  }
  function renderAdvertising(slot:Exclude<Slot,'form'>) {
    // La primera carga no muestra un anuncio provisional que luego cambia.
    // Se reserva el mismo espacio mientras se confirma el inventario comercial.
    if(advertising.loading) return <div className='tcAdStartupPlaceholder' data-placement={slot}
      role='status' aria-label='Cargando contenido local'><span>Preparando contenido de tu zona…</span></div>;
    const selection=advertising.selections[slot];
    if(selection?.type==='HOUSE_AD') {
      if(slot==='featured') return <HouseBanner selection={selection} place={place} onGoal={openHouseGoal} onImpression={advertising.impression}/>;
      return <InlineHousePromotion selection={selection} place={place} slot={slot} onGoal={openHouseGoal}/>;
    }
    if(selection?.type==='COMMERCIAL') {
      const ad=selection.campaign;
      const sponsor:Sponsor={...ad,label:'Publicidad local',scope:ad.communes.includes('Todas')?'regional':'exact'};
      return <LocalAdvertising sponsor={sponsor} place={place} loading={false} onAdvertise={()=>setShowAdvertiser(true)} track={track} placement={slot}/>;
    }
    return <InlineHousePromotion selection={null} place={place} slot={slot} onGoal={openHouseGoal}/>;
  }
  const neoFeatured = items.filter(item => item.kind === 'job_offer').slice(0, 3);

  if (isVNext) {
    return (
      <main className='neoShell tcStitchShell' data-directory-open={directoryMode ? 'true' : 'false'}>
        {analyticsChoice === null && <aside className='tcAnalyticsChoice' role='region' aria-label='Preferencias de medición'><span>Ayúdanos a mejorar Trabajo Cerca permitiendo estadísticas básicas de uso. Es opcional y está desactivado por defecto.</span><button type='button' onClick={() => chooseAnalytics('no')}>Mantener desactivado</button><button type='button' onClick={() => chooseAnalytics('yes')}>Aceptar medición</button></aside>}
        <header className='neoTopbar'>
          <div className='tcTopbarInner'>
            <button className='neoBrand' aria-label='Trabajo Cerca, inicio' onClick={() => window.scrollTo({ top:0, behavior:'smooth' })}><StitchBrand /></button>
            <span className='tcTerritoryBadge'>Malleco &amp; Biobío</span>
            <nav className='neoTopNav' aria-label='Navegación principal'>
              <button aria-current={section==='opportunities'&&!directoryMode?'page':undefined} onClick={() => navigateResults('opportunities')}>Empleos</button>
              <button aria-current={section==='people'&&!directoryMode?'page':undefined} onClick={() => navigateResults('people')}>Personas disponibles</button>
              <button aria-current={directoryMode?'page':undefined} onClick={() => openLocalDirectory('all')}>Servicios y negocios</button>
            </nav>
            <button type='button' className='tcTopPublish' onClick={()=>setShowPublishChoices(true)}><PlusCircle aria-hidden='true'/> Publicar gratis</button>
            <label className='tcMobilePlace'><MapPin aria-hidden='true'/><span className='tcMobilePlaceValue' aria-hidden='true'>{place==='Todas'?'Todas las comunas':place}</span><span className='tcVisuallyHidden'>Seleccionar comuna</span><select aria-label='Seleccionar comuna' value={place} onChange={e=>chooseLocalPlace(e.target.value)}>{isTravelView&&!places.includes(place)&&<option value={place}>{place}</option>}{places.map(value=><option key={value} value={value}>{value==='Todas'?'Todas':value}</option>)}</select></label>
            <SiteMenu onRadar={()=>openSecondary('neo-radar')} onAdvertise={()=>setShowAdvertiser(true)} onAlerts={()=>setShowActivity(true)} onInstall={()=>void installApp()}
              onService={()=>setFlow('servicio')} onContribute={()=>setFlow('aporte')}
              onCities={()=>openSecondary('tc-other-cities')} onNews={isStandalone?undefined:()=>openSecondary('actualidad-laboral')}
              onPeople={()=>navigateResults('people')}/>
          </div>
        </header>
        {!isStandalone && showInstallInvitation && !installHelp && <aside className='tcInstallInvite' role='region' aria-label='Invitación a instalar Trabajo Cerca'>
          <img src='/brand/trabajo-cerca-oficial.svg' alt='' width='36' height='36' decoding='async'/>
          <div className='tcInstallInviteCopy'><strong>Trabajo Cerca en tu celular</strong><span>{queryParams.get('listing') ? 'Mira la oferta compartida y ten acceso rápido a otras oportunidades.' : 'Consulta ofertas y servicios locales desde tu pantalla de inicio.'}</span></div>
          <button className='tcInstallInviteAction' type='button' onClick={()=>void installApp()}><Download aria-hidden='true'/> Instalar gratis</button>
          <button className='tcInstallInviteClose' type='button' aria-label='Ocultar invitación para esta visita' onClick={dismissInstallInvitation}><X aria-hidden='true'/></button>
        </aside>}
        <div className='tcTerritorialStatus'><div><span><Radar aria-hidden='true'/> Radar laboral territorial <span className='tcStatusDetail'> · Oportunidades con fuente y estado visibles</span></span><span><MapPin aria-hidden='true'/> {place==='Todas'?'Malleco y Biobío':place}{feedUpdatedAt?' · Catálogo del '+shortDate(feedUpdatedAt):''}</span></div></div>
        <div className='tcHomeVerifiedCount' role='status' aria-live='polite'>
          <Briefcase aria-hidden='true' size={22}/>
          {feedState==='fresh' && !cachedView && !loading && !loadError && feedComplete
            ? <span><strong>{place==='Todas'?primaryRadarTotal:normalizedRadarStats[place]?.jobs??0}</strong> ofertas en {place==='Todas'?'las 12 comunas':place}</span>
            : <span>Ofertas: <strong>actualizando…</strong></span>}
        </div>
        <section className='neoHero neoHeroReborn' id='neo-home'>
          <div className='tcStitchHeroRadar' aria-hidden='true'><svg viewBox='0 0 400 400' fill='none'><circle cx='200' cy='200' r='190' strokeDasharray='6 6'/><circle cx='200' cy='200' r='140'/><circle cx='200' cy='200' r='90' strokeDasharray='4 4'/><circle cx='200' cy='200' r='40'/><path d='M200 10V390M10 200H390'/></svg></div>
          <div className='neoHeroCopy'>
            <span className='tcStitchEyebrow'><Radar aria-hidden='true'/> Red comunitaria de vinculación de cercanía</span>
            <h1>Encuentra trabajo <em>cerca de ti</em></h1>
            <p className='neoHeroLead'>Encuentra oportunidades laborales en tu comuna y localidades cercanas. Conecta con empresas que buscan trabajadores, profesionales y personas que ofrecen sus oficios y servicios en tu zona.</p>
            <form className='neoSearchDock' role='search' aria-label='Buscar trabajo por comuna' onSubmit={event=>{event.preventDefault();setResultPage(0);setSection('opportunities');setArea('Todas');setOnlyNew(false);setOnlyUnread(false);setResultFocus(n=>n+1);}}>
              <label className='tcRoleField'><Search aria-hidden='true'/><span><small>Cargo, oficio o rubro</small><input aria-label='Cargo, oficio o empresa para buscar' value={q} onChange={e=>setQ(e.target.value)} placeholder='Ej. Técnico, Cosecha, Soldador, Asistente'/></span></label>
              <label className='tcCommuneField'><MapPin aria-hidden='true'/><span><small>Comuna base</small><select aria-label='Comuna de búsqueda' value={place} onChange={e=>chooseLocalPlace(e.target.value)}>{isTravelView&&!places.includes(place)&&<option value={place}>{place}</option>}{places.map(value=><option key={value}>{value}</option>)}</select></span></label>
              <button type='submit'><Radar aria-hidden='true'/> Buscar trabajo</button>
            </form>
            {!isStandalone && <div className='tcHeroInstallRow'><button type='button' onClick={()=>void installApp()} aria-label='Instalar Trabajo Cerca en este dispositivo'><Download aria-hidden='true'/> Instalar app</button><span>Acceso rápido desde tu celular, sin costo.</span></div>}
          </div>
        </section>
        <section className='tcPurposeGateway' aria-labelledby='tc-purpose-title'>
          <h2 id='tc-purpose-title'>¿Qué necesitas hacer hoy?</h2>
          <p>Empleos, trabajadores, oficios y negocios de nuestra comunidad. Elige una opción:</p>
          <div className='tcPurposeGrid'>
            <button type='button' onClick={() => navigateResults('opportunities')}><Briefcase aria-hidden='true'/><strong>Buscar empleo</strong><span>Ofertas locales identificadas por comuna y fuente.</span></button>
            <button type='button' onClick={() => setFlow('ofrezco')}><UserRoundSearch aria-hidden='true'/><strong>Ofrecer mi trabajo</strong><span>Publica gratis tu oficio o disponibilidad, sin currículum.</span></button>
            <button type='button' onClick={() => openLocalDirectory('all')}><Wrench aria-hidden='true'/><strong>Servicios y negocios</strong><span>Contrata servicios o conoce negocios de tu comuna.</span></button>
            <button type='button' onClick={() => openLocalDirectory('all',true)}><Store aria-hidden='true'/><strong>Publicar mi servicio o negocio</strong><span>Soldadura, pastelería, reparaciones y otros.</span></button>
          </div>
          <button type='button' className='tcDirectorySecondaryAction' onClick={() => openLocalDirectory('all',true)}>¿Ofreces soldadura, pastelería u otro servicio? Publícalo en el directorio</button>
          {showHiringChoices && <div className='tcHirePanel' role='group' aria-label='Opciones para contratar'><strong>¿Cómo deseas contratar?</strong><button onClick={() => setFlow('trabajadores')}>Publicar necesidad de trabajadores</button><button onClick={() => navigateResults('people')}>Ver personas disponibles</button></div>}
        </section>
        {directoryMode && <Suspense fallback={<div id='local-directory' className='tcLocalDirectory' role='status' aria-live='polite'>Cargando directorio local…</div>}><LocalDirectory place={place} initialKind={directoryMode} startWithForm={directoryOpenForm} onClose={() => {setDirectoryMode(null);setDirectoryOpenForm(false);}}/></Suspense>}
        <section className='tcStitchRadarSummary' aria-label='Resumen del catálogo territorial'>
          <div><span><MapPin aria-hidden='true'/> Empleos y servicios en tu zona</span></div>
          <h2>Oportunidades en tu territorio</h2>
          <label><MapPin aria-hidden='true'/><span>Comuna:</span><select aria-label='Localidad del radar' value={place} onChange={e=>chooseLocalPlace(e.target.value)}>{isTravelView&&!places.includes(place)&&<option value={place}>{place}</option>}{places.map(value=><option key={value}>{value}</option>)}</select><button type='button' onClick={()=>{setAdvancedFiltersOpen(value=>!value);document.getElementById('neo-jobs')?.scrollIntoView({behavior:'smooth'});}}>Ajustar <SlidersHorizontal aria-hidden='true'/></button></label>
          {!isStandalone && <button type='button' className='tcInstallShortcut' onClick={()=>void installApp()} aria-label='Instalar Trabajo Cerca en este dispositivo'><Download aria-hidden='true'/> Instalar app gratis</button>}
          <p className='tcLocalOnlyNote'>Encuentra oportunidades en tu comuna y localidades cercanas.</p>
        </section>
        {renderAdvertising('search')}
        {feedState==='degraded_last_good'&&<p className='tcResultStatus' role='status'>Mostrando el último catálogo disponible. Actualización pendiente.</p>}
        {notice && !flow && !showAdvertiser && <div className='neoNotice'><CheckCircle /><span>{notice}</span><button onClick={() => setNotice('')}><X /></button></div>}

        <section className='neoDiscover' id='neo-jobs' tabIndex={-1} aria-labelledby='tc-results-title' aria-busy={loading||loadingMore}>
          <div className='neoDiscoverHead'>
            <div><h2 id='tc-results-title' aria-label={resultsTitle}><Radar aria-hidden='true'/><span className='tcDesktopText'>{section==='opportunities'?'Radar de Empleos Activos':resultsTitle}</span><span className='tcMobileText'>{section==='opportunities'?'Oportunidades Cerca':resultsTitle}</span></h2><p className='tcDesktopText'>Ofertas con fuente, ubicación y vigencia diferenciadas.</p></div>
            <div className='tcDiscoverActions'>{(cachedView||loading||!feedComplete||feedState==='degraded_last_good')&&<span className='tcCatalogCount' role='status'>{feedState==='degraded_last_good'?'Últimos avisos disponibles · pendiente de sincronización':cachedView?'Verificando vigencia…':loading&&!items.length?'Cargando ofertas…':'Actualizando ofertas…'}</span>}
            {(q.trim()!==''||place!=='Todas'||area!=='Todas'||onlyNew||onlyUnread||filterMode!=='work')&&<button className='tcClearFilters' onClick={()=>navigateResults('opportunities','Todas')}>Quitar filtros</button>}
            <span className='tcDesktopText'><button type='button' className='tcFiltersToggle' aria-label='Filtros' aria-expanded={advancedFiltersOpen} aria-controls='tc-advanced-filters' onClick={()=>setAdvancedFiltersOpen(value=>!value)}><SlidersHorizontal aria-hidden='true'/> Filtros</button></span></div>
          </div>
          <div className='neoControlDeck'>
            <div className='neoFilters'>
              <label className='neoFilterSearch'><Search aria-hidden='true'/><input aria-label='Buscar por cargo, oficio o empresa' value={q} onChange={e=>setQ(e.target.value)} placeholder='Buscar oficio, empleo o faena…'/></label>
              <span className='tcMobileText'><button type='button' className='tcFiltersToggle' aria-label='Filtros' aria-expanded={advancedFiltersOpen} aria-controls='tc-advanced-filters' onClick={()=>setAdvancedFiltersOpen(value=>!value)}><SlidersHorizontal aria-hidden='true'/></button></span>
              <div className='tcAdvancedFilters' id='tc-advanced-filters' data-open={advancedFiltersOpen}>
                <label><span>Comuna de resultados</span><select aria-label='Comuna de resultados' value={place} onChange={e=>chooseLocalPlace(e.target.value)}>{isTravelView&&!places.includes(place)&&<option value={place}>{place}</option>}{places.map(value=><option key={value}>{value}</option>)}</select></label>
                <label><span>Tipo de publicación</span><select aria-label='Tipo de publicación' value={section} onChange={e=>navigateResults(e.target.value as Section)}><option value='opportunities'>Empleos</option><option value='people'>Personas disponibles</option><option value='needs'>Necesitan gente</option><option value='services'>Servicios</option></select></label>
                {section==='opportunities'&&<button type='button' aria-pressed={onlyNew} onClick={()=>{setOnlyNew(value=>!value);setOnlyUnread(false);}}><Sparkles aria-hidden='true'/> Incorporadas en 7 días</button>}
              </div>
            </div>
            <div className='tcCommuneRail' aria-label='Filtrar por comuna'>{places.map(value=><button key={value} type='button' aria-pressed={place===value} className={place===value?'active':''} onClick={()=>chooseLocalPlace(value)}>{value}</button>)}</div>
            <div className='tcCategoryRail' aria-label='Filtrar por rubro'>{areas.map(value=><button key={value} type='button' className={area===value?'active':''} aria-pressed={area===value} onClick={()=>setArea(value)}>{value==='Todas'?'Todos':value}</button>)}</div>
          </div>
          {loadError && <div className='neoEmpty'><AlertCircle /><b>{loadError}</b><button onClick={() => void load()}>Reintentar</button></div>}

          <div className='neoJobsGrid'>
            {shownResults.map((item, index) => {
              const own = Boolean(ownerTokens[item.id]);
              return (
                <Fragment key={item.id}><article data-offer-id={item.id} data-tone={listingTownTone(item.workCommunes,item.workLocation)} className={'neoJobCard neoKind-' + item.kind + ' ' + (selected?.id === item.id ? 'isSelected' : '')} key={item.id}>
                  {originalPoster(item,window.location.href)&&<button className='tcPosterThumb' onClick={()=>setSelected(item)} aria-label={'Ver afiche de '+item.title}><img src={originalPoster(item,window.location.href)!} alt={'Afiche original de '+item.title} loading='lazy' referrerPolicy='no-referrer'/></button>}
                  <div className='neoJobBody'>
                    <div className='neoJobTop'>
                      {item.workLocation?.trim()&&<span className='neoJobPlace' title={item.workLocation}><MapPin aria-hidden='true'/><span className='tcWorkplaceLabel'>{compactWorkplaceLabel(item.workLocation,item.workCommunes)}</span></span>}
                      <span className={'neoJobState ' + (reviewLabel(item)==='Verificada'?'verified':reviewLabel(item)==='Vigencia por confirmar'?'pending':'direct')}>{reviewLabel(item)}</span>
                    </div>


                    <h3>{item.title}</h3>
                    {identifiedEmployer(item)&&<p className='neoJobCompany'>{identifiedEmployer(item)}</p>}
                    {item.salary && <strong className='neoSalary'>{item.salary}</strong>}
                    <div className='tcCardTags'>{isFresh(item)&&<span title='Añadida recientemente a Trabajo Cerca; no indica la fecha original'>Recién incorporada</span>}{reading.known&&!reading.read[item.id]&&<span>No leída</span>}{[item.area,...item.tags].filter(Boolean).slice(0,2).map((tag,n)=><span key={n}>{tag}</span>)}</div>
                    <div className='tcOfferActionRow'>
                      <div className='neoJobFacts'>
                        <span><small>{publicDate(item)}</small><b>{publicSourceLabel(item.source)}</b></span>
                      </div>
                      <div className='neoJobFoot'>
                        <button aria-label={(item.kind==='job_offer'?'Ver oferta: ':'Ver detalle: ')+item.title} onClick={() => setSelected(item)}>{item.kind==='job_offer'?'Ver oferta':'Ver detalle'} <ArrowRight /></button>
                      </div>
                    </div>
                    {own && <details className='neoOwnActions tcOwnedActions'><summary>Gestionar mi publicación</summary><div><button onClick={() => void closeOwn(item)}>Cerrar publicación</button><button onClick={() => void deleteOwn(item)}>Eliminar mis datos</button></div></details>}
                  </div>
                </article>
                </Fragment>
              );
            })}
          </div>
          {advertising.selections.listing?.type==='COMMERCIAL'&&renderAdvertising('listing')}

          {visible.length>resultsPerPage&&<nav className='tcResultsPagination' aria-label='Páginas de resultados'><button disabled={resultPage===0} onClick={()=>{setResultPage(n=>Math.max(0,n-1));setResultFocus(n=>n+1);}}>Página anterior</button><span>Página {resultPage+1} de {resultPages}</span><button disabled={resultPage+1>=resultPages} onClick={()=>{setResultPage(n=>n+1);setResultFocus(n=>n+1);}}>Siguiente página</button></nav>}
          {!loading && visible.length === 0 && !loadError && feedState!=='degraded_last_good' && section !== 'opportunities' && <div className='neoEmpty'><b>{nextCursor ? 'Hay más publicaciones por cargar antes de confirmar esta categoría.' : section === 'people' ? 'Todavía no hay profesionales registrados en esta categoría. ¡Sé de los primeros en ofrecer tus servicios!' : '¿Necesitas personal o un servicio en tu comuna? Publica tu oportunidad.'}</b><button onClick={()=>nextCursor?void load(nextCursor):setFlow(section==='people'?'ofrezco':section==='services'?'servicio':'trabajadores')}>{nextCursor?'Cargar más publicaciones':section==='people'?'Publicar mis servicios':'Publicar una oportunidad'}</button></div>}
          {!loading && visible.length === 0 && !loadError && feedState!=='degraded_last_good' && section === 'opportunities' && <div className='neoEmpty'><Radar /><b>{nextCursor ? 'Hay más ofertas por cargar para completar esta búsqueda.' : 'No hay ofertas que coincidan con esta vista.'}</b><span>Eso no significa que no existan empleos: solo mostramos avisos cuya fuente, vigencia y ubicación logramos confirmar.</span><button onClick={() => nextCursor ? void load(nextCursor) : (setOnlyNew(false),setQ(''),setArea('Todas'))}>{nextCursor ? 'Cargar más ofertas' : 'Ver todas las ofertas'}</button></div>}
          {nextCursor && !loadError && <div className='neoLoadMore'><button onClick={() => void load(nextCursor)} disabled={loadingMore}>{loadingMore ? 'Cargando…' : 'Cargar más'} <ArrowRight /></button></div>}
        </section>

        <div className='tcStitchAlert'><Bell aria-hidden='true'/><div><b>¿No ves tu oficio en la lista de hoy?</b><span>Consulta novedades y configura tus avisos locales gratuitos.</span></div><button type='button' onClick={()=>setShowActivity(true)}>Ver novedades <ArrowRight aria-hidden='true'/></button></div>
        <StitchCommunity person={items.find(item=>item.kind==='worker_available'&&!item.review&&matchesTerritorialView(item,place,places))} onOffer={()=>setFlow('ofrezco')} onBrowse={()=>navigateResults('people')} onSelect={id=>setSelected(items.find(item=>item.id===id)??null)}/>
        <section className='tcStitchAdvertising tcAdvertisingFeaturedSlot'
          aria-label={advertising.selections.featured?.type==='COMMERCIAL'?'Publicidad territorial destacada':'Autopublicidad territorial de Trabajo Cerca'}>
          <header><div>
            <span className='tcStitchEyebrow'>
              {advertising.selections.featured?.type==='COMMERCIAL'?'PUBLICIDAD LOCAL DESTACADA':'TRABAJO CERCA'}
            </span>
            <h2>{advertising.selections.featured?.type==='COMMERCIAL'?'Negocios de tu territorio':'Comunidad y Desarrollo Regional'}</h2>
          </div></header>
          {/* El contador del catálogo se muestra una sola vez, en la cabecera principal. */}
          {renderAdvertising('featured')}
          {advertising.selections.featured?.type!=='COMMERCIAL'&&Boolean(advertising.promotion?.days)&&
            <div className='tcStitchPromotionDetails' aria-label='Beneficio de fundadores y prueba gratuita'>
              <div className='tcFounderCard'>
                <div className='tcFounderImage' aria-hidden='true'>
                  <img src='/house-creatives/advertisers.svg' alt='' loading='lazy'/>
                </div>
                <div className='tcFounderMessage'>
                  <small>{advertising.promotion?.kind==='founder'?'BENEFICIO FUNDADORES':'PROMOCIÓN VIGENTE'}</small>
                  <h3>{advertising.promotion?.days} días gratis para dar a conocer tu negocio</h3>
                  <p>Sujeto a aprobación y disponibilidad.</p>
                  <span>✓ Sin cobros automáticos · Sujeto a aprobación</span>
                </div>
                <button type='button' className='tcFounderCta' onClick={()=>setShowAdvertiser(true)}>
                  Inscribir mi negocio <ArrowRight aria-hidden='true'/>
                </button>
              </div>
            </div>}
        </section>
        <section className='tcStitchCities' id='tc-other-cities' aria-labelledby='tc-cities-title'><div><span className='tcStitchEyebrow'>Polos regionales extraterritoriales</span><h2 id='tc-cities-title'>Busca también en otras ciudades</h2>
          <NearbyCities compact stats={feedSummary.communeStats} ready={!loading} failed={Boolean(loadError)} current={place} onExplore={openTravel} onReturn={()=>chooseLocalPlace(homePlace)} origin={homePlace}/>
        </div></section>
        <section className='tcRadarCompactRegion' aria-label='Radar territorial'>
          <TerritorialRadar stats={normalizedRadarStats} ready={!loading&&!loadError&&feedComplete}
            failed={Boolean(loadError)} selected={place} updatedAt={feedUpdatedAt}
            onSelect={town=>navigateResults('opportunities',town)}/>
        </section>
        {!isStandalone&&<details className='tcSecondary tcWebsiteNewsOnly' id='actualidad-laboral'>
          <summary>Actualidad laboral y trámites</summary><LaborNewsSection/>
        </details>}
        <details className='tcStitchFooterDetails' open={window.matchMedia('(min-width:768px)').matches}>
          <summary>Información y privacidad</summary>
          <footer className='neoFooter tcCompactFooter' aria-label='Información de Trabajo Cerca'>
            <div className='neoBrand tcFooterBrand'><StitchBrand subtitle='Radar territorial'/></div>
            <p className='tcFooterTagline'>Conectamos personas con oportunidades locales.</p>
            <a className='tcFooterEmail' href={'mailto:'+LEGAL_RESPONSIBLE.privacyEmail}>{LEGAL_RESPONSIBLE.privacyEmail}</a>
            <nav className='tcFooterLegal' aria-label='Información legal'>
              <button type='button' onClick={() => setLegalView('privacy')}>Privacidad</button>
              <button type='button' onClick={() => setLegalView('terms')}>Términos</button>
              <button type='button' onClick={() => { localStorage.removeItem('tc_analytics_consent'); setAnalyticsChoice(null); }}>Preferencias de medición</button>
            </nav>
          </footer>
        </details>

        {!flow && !showAdvertiser && !showAlerts && !showActivity && !legalView && !selected && <>
          <nav className='neoMobileNav' aria-label='Navegación móvil de cuatro espacios'>
            <button type='button' aria-current={section==='opportunities'&&!directoryMode?'page':undefined} onClick={()=>navigateResults('opportunities')}><Briefcase aria-hidden='true'/><span>Empleos</span></button>
            <button type='button' aria-current={section==='people'&&!directoryMode?'page':undefined} onClick={()=>navigateResults('people')}><UserRoundSearch aria-hidden='true'/><span>Personas</span></button>
            <button type='button' aria-current={directoryMode?'page':undefined} onClick={()=>openLocalDirectory('all')}><Store aria-hidden='true'/><span>Directorio</span></button>
            <button type='button' onClick={()=>setShowPublishChoices(true)} aria-label='Publicar gratis en Trabajo Cerca'><PlusCircle aria-hidden='true'/><span>Publicar</span></button>
          </nav>
        </>}
        {showPublishChoices && <div className='tcPublishBackdrop' role='presentation' onMouseDown={event=>{if(event.target===event.currentTarget)setShowPublishChoices(false);}}>
          <section className='tcPublishDialog' role='dialog' aria-modal='true' aria-labelledby='tc-publish-title' ref={publishDialogRef} tabIndex={-1}>
            <div className='tcPublishDialogHeader'><h2 id='tc-publish-title'>¿Qué necesitas hacer?</h2><button type='button' onClick={()=>setShowPublishChoices(false)} aria-label='Cerrar opciones de publicación'><X aria-hidden='true'/></button></div>
            <p>Elige una opción:</p>
            <button type='button' onClick={()=>{setShowPublishChoices(false);openLocalDirectory('all',true);}}><Wrench aria-hidden='true'/><span><strong>Ofrezco un servicio o tengo un negocio</strong><small>Publica gratis tu servicio o negocio.</small></span></button>
            <button type='button' onClick={()=>{setShowPublishChoices(false);setFlow('ofrezco');}}><UserRoundSearch aria-hidden='true'/><span><strong>Busco trabajo</strong><small>Crea tu perfil para que quienes necesiten trabajadores puedan contactarte.</small></span></button>
            <button type='button' onClick={()=>{setShowPublishChoices(false);openLocalDirectory('all');}}><Wrench aria-hidden='true'/><span><strong>Necesito un servicio</strong><small>Encuentra servicios y negocios de tu comuna en nuestro directorio.</small></span></button>
            <button type='button' onClick={()=>{setShowPublishChoices(false);setFlow('trabajadores');}}><Users aria-hidden='true'/><span><strong>Necesito trabajadores</strong><small>Publica tu necesidad de personal para un trabajo o faena específica.</small></span></button>
            <button type='button' onClick={()=>{setShowPublishChoices(false);setFlow('aporte');}}><Briefcase aria-hidden='true'/><span><strong>Compartir una oferta laboral</strong><small>¿Viste un aviso de trabajo? Tómale una foto y compártelo aquí.</small></span></button>
          </section>
        </div>}

        {selected && (
          <div className='neoDrawerBackdrop' role='presentation' onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}>
            <aside className='neoDrawer' tabIndex={-1} role='dialog' aria-modal='true' aria-label={'Detalle de ' + selected.title}>
              <button className='neoDrawerClose' onClick={() => setSelected(null)} aria-label='Cerrar detalle'><X /></button>
              {originalPoster(selected,window.location.href)&&<a className='tcDetailPoster' href={originalPoster(selected,window.location.href)!} target='_blank' rel='noopener noreferrer'><img src={originalPoster(selected,window.location.href)!} alt={'Afiche original de '+selected.title} referrerPolicy='no-referrer'/>Abrir afiche completo</a>}
              <div className='neoDrawerScroll'>
                <div className='neoDrawerHeader'>
                  <div className='neoDrawerBadges'>
                    <span className={'neoJobState ' + (reviewLabel(selected)==='Verificada'?'verified':reviewLabel(selected)==='Vigencia por confirmar'?'pending':'direct')}>{reviewLabel(selected)}</span>
                    <span className='neoDrawerArea'>{selected.area}</span>
                  </div>
                  <h2>{selected.title}</h2>
                  <p>{selected.company}</p>
                  {selected.salary && <strong>{selected.salary}</strong>}
                </div>

                <div className='neoDrawerGrid'>
                  <div><MapPin /><span><small>LUGAR / LOCALIDAD</small><b>{selected.workLocation}</b></span></div>
                  {selected.recruitmentZones.length>0&&<div><Users /><span><small>ZONA</small><b>{selected.recruitmentZones.join(' · ')}</b></span></div>}
                  <div><Radio /><span><small>PUBLICACIÓN ORIGINAL</small><b>{publicDate(selected)}</b></span></div>
                  
                  <div><BadgeCheck /><span><small>FUENTE</small><b>{publicSourceLabel(selected.source)}</b></span></div>
                </div>

                

                {publicOfferDetail(selected.note)&&<div className='neoDrawerSection'>
                  <span className='neoKicker'>DETALLE</span>
                  <h3>Sobre esta oportunidad</h3>
                  <p>{publicOfferDetail(selected.note)}</p>
                </div>}

                {publicOfferDetail(selected.apply)&&<div className='neoDrawerSection'><h3>Cómo postular</h3><p>{publicOfferDetail(selected.apply)}</p></div>}
                <div className='neoDrawerActions'>
                  {selected.applicationUrl&&/^https:\/\//i.test(selected.applicationUrl)&&<a href={selected.applicationUrl} target='_blank' rel='noopener noreferrer' onClick={() => track('tc_external_offer_click', { listing_id:selected.id, kind:selected.kind, commune:selected.workLocation, origin:selected.origin })}>{sameExternalDestination(selected.applicationUrl,selected.url)?'Ver oferta y postular':'Ver canal de postulación'} <ArrowRight/></a>}
                  {selected.url && !sameExternalDestination(selected.applicationUrl,selected.url) && <a href={selected.url} target='_blank' rel='noopener noreferrer' onClick={() => track('tc_external_offer_click', { listing_id:selected.id, kind:selected.kind, commune:selected.workLocation, origin:selected.origin })}>Ver oferta original <ArrowRight /></a>}
                  {!selected.contact && selected.hasContact && <button className='neoDrawerPrimary' onClick={() => void revealContact(selected)} disabled={revealingContact}>{revealingContact ? 'Cargando contacto…' : 'Mostrar contacto'} <ArrowRight /></button>}
                  {selected.contact && <div className='neoContactReveal'>
                    <span><small>CONTACTO PUBLICADO</small><b>{selected.contact}</b>{selected.contactLabel && <em>{selected.contactLabel}</em>}</span>
                    <a href={'tel:' + selected.contact}>{selected.review ? 'Consultar' : 'Llamar'} <ArrowRight /></a>
                  </div>}
                  {!selected.url && !selected.contact && !selected.hasContact && <span className='neoDrawerPending'>Este aviso aún no tiene un canal útil de contacto confirmado.</span>}
                  <button className='neoDrawerSecondary' onClick={() => void shareListing(selected)}><Share2 /> Compartir oportunidad</button>
                  {!isStandalone && <button type='button' className='tcShareInstallButton' onClick={()=>void installApp()}><Download aria-hidden='true'/> Instalar Trabajo Cerca gratis</button>}
                  {ownerTokens[selected.id]&&selected.origin==='direct'&&<OwnedPublicationEditor key={selected.id} item={selected} ownerToken={ownerTokens[selected.id]} onSaved={()=>{setSelected(null);setNotice('Publicación actualizada gratuitamente.');void load(undefined,true);}}/>}
                  {ownerTokens[selected.id] && <button className='neoDrawerDanger' onClick={() => void deleteOwn(selected)}>Eliminar mi publicación y datos</button>}
                </div>
              </div>
            </aside>
          </div>
        )}

        {showActivity&&<ActivityCenter places={places} place={place} count={scopedRecent.length} unread={scopeUnread} known={reading.known} complete={feedComplete} failed={Boolean(loadError)} onPlace={chooseLocalPlace} onOpen={unread=>{setShowActivity(false);navigateResults('opportunities',place,true,unread);}} onRefresh={()=>void load(undefined,true)} onPush={()=>{setShowActivity(false);setShowAlerts(true);}} onClose={()=>setShowActivity(false)}/>}
        {showAlerts && <AlertsPanel defaultPlace={place === 'Todas' ? homePlace : place} onClose={() => setShowAlerts(false)} onSaved={message => { setNotice(message); setShowAlerts(false); }} />}
        {installHelp&&<div className='modal tcInstallBackdrop' role='presentation' onMouseDown={event=>{if(event.target===event.currentTarget)setInstallHelp(false);}}><div className='tcInstallGuide' tabIndex={-1} role='dialog' aria-modal='true' aria-labelledby='tc-install-title'><button className='tcInstallClose' aria-label='Cerrar instrucciones' onClick={()=>setInstallHelp(false)}><X/></button><h2 id='tc-install-title'>Instala Trabajo Cerca</h2><p>Accede desde el icono de tu celular, como cualquier aplicación.</p><div><b>Android · Chrome</b><p>Abre esta página en Chrome, toca el menú ⋮ y elige «Instalar app» o «Agregar a pantalla principal».</p></div><div><b>iPhone · Safari</b><p>Abre la página en Safari, toca Compartir y selecciona «Agregar a pantalla de inicio».</p></div><small>Si estás en un navegador integrado, primero elige «Abrir en navegador». La instalación depende de las opciones disponibles en tu teléfono.</small><button className='tcInstallDone' onClick={()=>setInstallHelp(false)}>Entendido</button></div></div>}

        {showAdvertiser && <AdvertiserPanel initialCommune={place} attribution={houseAttribution} onClose={() => {setShowAdvertiser(false);setHouseAttribution(null);}} onSent={() => setNotice('Solicitud registrada para revisión. La promoción y su duración se confirmarán al aprobar el anuncio. Tu contacto no fue publicado.')} />}

        {legalView && <div className='modal legalModal' role='dialog' aria-modal='true' aria-labelledby='legal-dialog-title' tabIndex={-1}>
          <div className='panel legalPanel'>
            <button className='close' onClick={() => setLegalView(null)} aria-label='Cerrar'><X /></button>
            <span className='lab'>TRABAJO CERCA · PILOTO</span>
            <LegalContent view={legalView}/>
          </div>
        </div>}

        {flow && <FormPanel flow={flow} attribution={houseAttribution} onClose={() => { setFlow(null); setHouseAttribution(null); if (new URLSearchParams(window.location.search).has('share_target')) window.history.replaceState({}, '', window.location.pathname + window.location.hash); }} onPublished={afterPublish} />}
      </main>
    );
  }

  return (
    <main className='appShell'>
      <header className='topbar' id='inicio'>
        <button className='brand brandButton' onClick={() => window.scrollTo({ top:0, behavior:'smooth' })}>
          <div className='brandmark'><img className='tcOfficialBrandIcon' src='/brand/trabajo-cerca-simbolo.svg' width='64' height='64' alt='' decoding='async'/></div>
          <div><b>Trabajo Cerca</b><span>PERSONAS ↔ TRABAJO</span></div>
        </button>
        <div className='topbarActions'>
          <AdministratorShortcut />
          <label className='communePicker'>
            <MapPin size={15} />
            <span className='communeLabel'>Comuna</span>
            <select value={place} onChange={e => { setPlace(e.target.value); setFilterMode('work'); }}>
              {places.map(value => <option key={value} value={value}>{value === 'Todas' ? 'Todas las comunas' : value}</option>)}
            </select>
          </label>
          <span className='radarLive'><span /> Radar activo</span>
        </div>
      </header>

      <section className='homeHero'>
        <div className='homeCopy'>
          <span className='overline'>TRABAJO CERCA · MALLECO Y BIOBÍO NORTE</span>
          <h1>El trabajo<br className='mobileBreak' /> cerca de ti.</h1>
          <p>Encuentra oportunidades nuevas, ofrece tu oficio o conecta directamente con personas que necesitan trabajadores.</p>
          <div className='heroSearch'>
            <Search size={20} />
            <input value={q} onChange={e => setQ(e.target.value)} onFocus={() => setSection('opportunities')} placeholder='Buscar tractorista, TENS, soldador, cosecha…' />
            {q && <button onClick={() => setQ('')} aria-label='Limpiar búsqueda'><X size={17} /></button>}
          </div>
          <div className='quickChips'>
            {['Tractorista','Cosecha','Soldador','TENS'].map(term => (
              <button key={term} onClick={() => { setQ(term); goRadar('opportunities'); }}>{term}</button>
            ))}
          </div>
        </div>

        <aside className='heroSummary'>
          <div className='heroScene' aria-hidden='true'>
            <span className='scenePulse'><Radar /></span>
            <span className='sceneJob sceneJobA'><Briefcase /><b>Angol</b></span>
            <span className='sceneJob sceneJobB'><Users /><b>Nacimiento</b></span>
            <span className='sceneRoute' />
          </div>
          <div className='heroSummaryTop'><div className='pulseIcon'><Radar /></div><span>RADAR TERRITORIAL</span></div>
          <div className='heroMetric'><span><b>Oportunidades de tu zona</b><small>Explora ofertas laborales por localidad.</small></span></div>
          <button onClick={() => goRadar('opportunities')}>Explorar oportunidades <ArrowRight /></button>
        </aside>
      </section>

      <section className='newNow' id='novedades'>
        <div className='newNowIntro'>
          <span>{'INCORPORADAS EN LOS ÚLTIMOS 7 DÍAS'}</span>
          <h2>{freshOpportunities.length > 0 ? freshOpportunities.length + (freshOpportunities.length === 1 ? ' oportunidad nueva' : ' oportunidades nuevas') : 'Sin novedades nuevas por ahora'}</h2>
          <p>{'Las novedades se suman a las ofertas que ya estaban publicadas.'}</p>
          <button className='textAction' onClick={() => openFresh()} disabled={freshOpportunities.length === 0}>Ver solo lo nuevo <ArrowRight /></button>
        </div>
        <div className='newCityGrid'>
          {freshByPlace.length > 0 ? freshByPlace.slice(0,6).map(([commune,count]) => (
            <button key={commune} onClick={() => openFresh(commune)}>
              <span className='cityPin'><MapPin /></span>
              <span><b>{commune}</b><small>{count} {count === 1 ? 'nueva' : 'nuevas'}</small></span>
              <ArrowRight />
            </button>
          )) : <div className='newEmpty'><Radar /><div><b>El Radar sigue revisando</b><span>Cuando aparezca algo nuevo, lo verás aquí primero.</span></div></div>}
        </div>
      </section>

      <section className='participate'>
        <div className='sectionTitle'>
          <span className='overline'>PERSONAS ↔ TRABAJO</span>
          <h2>¿Cómo quieres participar hoy?</h2>
          <p>Buscar, ofrecer tu trabajo o publicar una necesidad toma pocos pasos.</p>
        </div>
        <div className='participateGrid'>
          <button onClick={() => goRadar('opportunities')}><span><Briefcase /></span><b>Busco trabajo</b><small>Vacantes locales verificadas</small><ArrowRight /></button>
          <button onClick={() => setFlow('ofrezco')}><span><UserRoundSearch /></span><b>Ofrezco mi trabajo</b><small>Publica tu oficio. Sin CV.</small><ArrowRight /></button>
          <button onClick={() => setFlow('trabajadores')}><span><Users /></span><b>Necesito trabajadores</b><small>Conecta con personas de la zona</small><ArrowRight /></button>
          <button onClick={() => setFlow('servicio')}><span><Wrench /></span><b>Necesito un servicio</b><small>Encuentra un oficio local</small><ArrowRight /></button>
        </div>
        <button className='communityContribution' onClick={() => setFlow('aporte')}>
          <PlusCircle />
          <span><b>¿Viste un aviso en Facebook, WhatsApp, radio u otra página?</b><small>Apórtalo al Radar y lo revisamos antes de publicarlo.</small></span>
          <ArrowRight />
        </button>
      </section>

      {renderAdvertising('search')}

      {notice && <div className='globalNotice'><CheckCircle /><span>{notice}</span><button onClick={() => setNotice('')}><X /></button></div>}

      <section className='radar modernRadar' id='radar'>
        <div className='sectionHead modernHead'>
          <div>
            <span className='overline'>EXPLORAR</span>
            <h2>{section === 'opportunities' ? 'Oportunidades cerca de ti' : section === 'people' ? 'Personas disponibles' : section === 'needs' ? 'Necesitan trabajadores' : 'Servicios solicitados'}</h2>
            <p>{section === 'people' ? 'Oficios y personas que se ofrecen directamente para trabajar.' : 'Mostramos ofertas verificadas y también avisos útiles aún por confirmar, siempre diferenciados claramente.'}</p>
          </div>
          <div className='trust'><BadgeCheck /> Fuente y estado visibles</div>
        </div>

        <div className='sectionTabs modernTabs'>
          <button className={section === 'opportunities' ? 'active' : ''} onClick={() => navigateResults('opportunities')}><Briefcase /> Empleos</button>
          <button className={section === 'people' ? 'active' : ''} onClick={() => navigateResults('people')}><UserRoundSearch /> Personas</button>
          <button className={section === 'needs' ? 'active' : ''} onClick={() => navigateResults('needs')}><Users /> Necesitan gente</button>
          <button className={section === 'services' ? 'active' : ''} onClick={() => navigateResults('services')}><Wrench /> Servicios</button>
        </div>

        {section === 'opportunities' && <div className='sourceOverview' style={{padding:'14px',marginBottom:'14px',background:'var(--surface, #fff)',border:'1px solid #dce5dd',borderRadius:'14px'}}><b>Ofertas por fuente</b><p style={{fontSize:'12px',margin:'5px 0'}}>Distribución de avisos locales cargados. Los Ángeles y Temuco se consultan por separado. Si hay más páginas pendientes, las cifras son parciales.</p><div style={{display:'flex',flexWrap:'wrap',gap:'8px'}}>{sourceCounts.map(([source,count])=><span key={source} style={{padding:'7px 10px',borderRadius:'10px',background:'#eef3ef',fontSize:'12px'}}>{source}: <b>{count}</b></span>)}</div></div>}
        <div className='filterPanel'>
          <div className='searchBox stitchSearch'>
            <Search />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder='Cargo u oficio' />
            <select value={area} onChange={e => setArea(e.target.value)}>
              {areas.map(value => <option key={value}>{value}</option>)}
            </select>
          </div>
          <div className='locationControls'>
            <div className='chips'>
              {places.map(value => <button key={value} className={place === value ? 'active' : ''} onClick={() => setPlace(value)}>{value === 'Todas' ? 'Todas' : value}</button>)}
            </div>
            <div className='filterMode'>
              <button className={filterMode === 'work' ? 'active' : ''} onClick={() => setFilterMode('work')}><MapPin /> {section === 'people' ? 'Vive aquí' : 'Trabajo aquí'}</button>
              <button className={filterMode === 'recruit' ? 'active' : ''} onClick={() => setFilterMode('recruit')}><Users /> {section === 'people' ? 'Puede trabajar aquí' : 'Aceptan desde aquí'}</button>
            </div>
          </div>
          <div className='freshFilterBar'>
            <button className={onlyNew ? 'active' : ''} onClick={() => {setOnlyNew(value => !value);setOnlyUnread(false);}}><Sparkles /> {onlyNew ? 'Solo novedades' : 'Ver solo novedades'}</button>
            {onlyNew && <span>{recentJobs ?? '…'} incorporadas en 7 días</span>}
          </div>
        </div>

        {loadError && <div className='empty'><AlertCircle /><b>{loadError}</b><button className='secondary' onClick={() => void load()}>Reintentar</button></div>}

        {section === 'opportunities' && <div className='provisionalNote'><AlertCircle /><span><b>Información útil sin esperar perfección.</b> Los avisos con “Vigencia por confirmar” o “Lugar por confirmar” son pistas laborales reales todavía incompletas; no cuentan como verificados y se retiran automáticamente si no logran confirmarse.</span></div>}
        {loading&&<div className='resultLine modernResultLine' role='status'>Cargando oportunidades…</div>}

        <div className='jobGrid stitchCards'>
          {visible.map(item => {
            const own = Boolean(ownerTokens[item.id]);
            const direct = item.origin === 'direct';
            const person = item.kind === 'worker_available';
            return (
              <article key={item.id} className={'stitchCard ' + (direct ? 'directListing ' : '') + (item.review ? 'reviewListing' : '')}>
                <div className='cardTopline'>
                  <div className='cardLocation'><MapPin /><span>{item.workLocation}</span></div>
                  <div className='cardStatuses'>
                    {isFresh(item) && !item.review && <span className='freshBadge static'>NUEVO PARA TI</span>}
                    <span className={'status static ' + (item.review ? 'review' : direct ? 'direct' : item.status.toLocaleLowerCase('es-CL').replace(' ',''))}>{item.review ? (item.kind === 'job_offer' ? (item.workCommunes.length ? 'Vigencia por confirmar' : 'Lugar por confirmar') : 'En revisión') : direct ? 'Publicación directa' : item.status}</span>
                  </div>
                </div>
                <div className='cardMain'>
                  <span className='cardArea'>{item.area}</span>
                  <h3>{item.title}</h3>
                  <p className='company'>{item.company}</p>
                  {item.salary && <strong className='salaryMain'>{item.salary}</strong>}
                </div>
                <div className='cardMeta'>
                  <div><Users /><span><small>{person ? 'Puede trabajar en' : 'Aceptan desde'}</small><b>{item.recruitmentZones.join(' · ')}</b></span></div>
                  <div><Radio /><span><small>Publicado / vigencia</small><b>{publicDate(item)}{item.until ? ' · hasta ' + item.until : ''}</b></span></div>
                </div>
                <div className='cardFooter'>
                  <span className='sourceMini'><BadgeCheck /> {publicSourceLabel(item.source)}</span>
                  <button className='viewJob' onClick={() => setSelected(item)}>{person ? 'Ver perfil' : item.kind === 'service_request' ? 'Ver servicio' : 'Ver trabajo'} <ArrowRight /></button>
                </div>
                {own && <div className='ownActions'><button className='closeOwn' onClick={() => void closeOwn(item)}>Cerrar aviso</button><button className='deleteOwn' onClick={() => void deleteOwn(item)}>Eliminar mis datos</button></div>}
              </article>
            );
          })}
        </div>

        {nextCursor && !loadError && <div className='loadMoreWrap'><button className='secondary' onClick={() => void load(nextCursor)} disabled={loadingMore}>{loadingMore ? 'Cargando más…' : 'Cargar más resultados'}</button></div>}

        {!loading && visible.length === 0 && !loadError && <div className='empty'><AlertCircle /><b>No hay coincidencias en esta vista.</b><span>Prueba otra comuna, otro oficio o cambia entre lugar real y zona desde donde aceptan personas. Si quedan páginas disponibles, usa “Cargar más resultados”.</span></div>}
      </section>

      <section className='principle cleanPrinciple'>
        <div><Handshake /><h2>Trabajo Cerca conecta.</h2><p>Quien busca trabajo puede encontrar oportunidades. Quien necesita trabajadores puede encontrar personas. Sin convertirlo en una red social ni en una bolsa de CV.</p></div>
        <div className='safety'><ShieldCheck /><div><b>Simple y seguro</b><span>Nunca pagues por postular ni publiques RUT, claves, cuentas bancarias o direcciones exactas.</span></div></div>
      </section>

      <footer className='cleanFooter'>
        <div className='brand'><div className='brandmark'><img className='tcOfficialBrandIcon' src='/brand/trabajo-cerca-simbolo.svg' width='64' height='64' alt='' aria-hidden='true' decoding='async' /></div><div><b>Trabajo Cerca</b><span>PERSONAS ↔ TRABAJO</span></div></div>
        <div className='footerLegal'><button onClick={() => setLegalView('privacy')}>Privacidad y tus datos</button><button onClick={() => setLegalView('terms')}>Términos de uso</button><span>Piloto territorial · Malleco y Biobío norte · trabajocerca.malleco.biobio@gmail.com</span></div>
      </footer>

      <nav className='bottomNav' aria-label='Navegación principal'>
        <button onClick={() => window.scrollTo({top:0,behavior:'smooth'})}><Briefcase /><span>Inicio</span></button>
        <button onClick={() => document.getElementById('novedades')?.scrollIntoView({behavior:'smooth'})}><Sparkles /><span>Novedades</span></button>
        <button className='publishNav' onClick={() => setFlow('trabajadores')}><PlusCircle /><span>Publicar</span></button>
        <button onClick={() => goRadar('people')}><UserRoundSearch /><span>Personas</span></button>
        <button onClick={() => document.getElementById('neo-jobs')?.scrollIntoView({behavior:'smooth'})}><Search /><span>Buscar</span></button>
      </nav>

      {selected && (
        <div className='modal detailModal' role='dialog' aria-modal='true'>
          <div className='detailSheet'>
            <button className='close detailClose' onClick={() => setSelected(null)} aria-label='Cerrar'><X /></button>
            <div className='detailHeader'>
              <span className='detailStatus'>{selected.review ? (selected.kind === 'job_offer' ? (selected.workCommunes.length ? 'VIGENCIA POR CONFIRMAR' : 'LUGAR POR CONFIRMAR') : 'EN REVISIÓN') : selected.origin === 'direct' ? 'PUBLICACIÓN DIRECTA' : selected.status.toUpperCase()}</span>
              <span className='detailArea'>{selected.area}</span>
              <h2>{selected.title}</h2>
              <p>{selected.company}</p>
              {selected.salary && <strong>{selected.salary}</strong>}
            </div>
            <div className='detailGrid'>
              <div className='detailBlock'><MapPin /><span><small>{selected.kind === 'worker_available' ? 'LOCALIDAD BASE' : 'LUGAR REAL'}</small><b>{selected.workLocation}</b></span></div>
              <div className='detailBlock'><Users /><span><small>{selected.kind === 'worker_available' ? 'PUEDE TRABAJAR EN' : 'ACEPTAN PERSONAS DE'}</small><b>{selected.recruitmentZones.join(' · ')}</b></span></div>
            </div>
            {publicOfferDetail(selected.note)&&<div className='detailSection'><h3>Sobre esta oportunidad</h3><p>{publicOfferDetail(selected.note)}</p></div>}
            <div className='detailFacts'>
              <div><small>Publicado</small><b>{publicDate(selected)}</b></div>
              {selected.until && <div><small>Vigencia</small><b>Hasta {selected.until}</b></div>}
              {selected.vacancies && <div><small>Vacantes</small><b>{selected.vacancies}</b></div>}
              {publicOfferDetail(selected.apply) && <div><small>Postulación</small><b>{publicOfferDetail(selected.apply)}</b></div>}
            </div>
            <div className='detailSource'><BadgeCheck /><div><small>FUENTE</small><b>{publicSourceLabel(selected.source)}</b></div></div>
            <div className='detailActions'>
              {selected.url && <a href={selected.url} target='_blank' rel='noreferrer' onClick={() => track('tc_external_offer_click', { listing_id:selected.id, kind:selected.kind, commune:selected.workLocation, origin:selected.origin })}>Ver oferta original <ArrowRight /></a>}
              {selected.contact && <>
                {selected.contactLabel && <div className='contactContext'><AlertCircle /><span>{selected.contactLabel}</span></div>}
                <a href={'tel:' + selected.contact}>{selected.review ? 'Consultar vigencia / postulación' : 'Contactar'} <ArrowRight /></a>
              </>}
              {!selected.contact && selected.hasContact && <button className='revealContact' onClick={() => void revealContact(selected)} disabled={revealingContact}>{revealingContact ? 'Cargando contacto…' : 'Mostrar contacto'} <ArrowRight /></button>}
              {!selected.url && !selected.contact && !selected.hasContact && <span>Este aviso tiene datos pendientes de confirmación y aún no tiene un canal útil de contacto.</span>}
              <button className='shareDetail' onClick={() => void shareListing(selected)}><Share2 /> Compartir esta oportunidad</button>
              {ownerTokens[selected.id] && <button className='deleteDetail' onClick={() => void deleteOwn(selected)}>Eliminar mi publicación y datos</button>}
            </div>
          </div>
        </div>
      )}

      {showAdvertiser && <AdvertiserPanel initialCommune={place} attribution={houseAttribution} onClose={() => {setShowAdvertiser(false);setHouseAttribution(null);}} onSent={() => setNotice('Solicitud registrada para revisión. La promoción y su duración se confirmarán al aprobar el anuncio. Tu contacto no fue publicado.')} />}

      {legalView && <div className='modal legalModal' role='dialog' aria-modal='true' aria-labelledby='legal-dialog-title' tabIndex={-1}>
        <div className='panel legalPanel'>
          <button className='close' onClick={() => setLegalView(null)} aria-label='Cerrar'><X /></button>
          <span className='lab'>TRABAJO CERCA · PREPARACIÓN PARA PUBLICACIÓN</span>
          <LegalContent view={legalView}/>
        </div>
      </div>}

      {flow && <FormPanel flow={flow} attribution={houseAttribution} onClose={() => {setFlow(null);setHouseAttribution(null);}} onPublished={afterPublish} />}
    </main>
  );
}

export default App;
