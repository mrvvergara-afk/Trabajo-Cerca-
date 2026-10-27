import {StitchBrand} from './stitch-brand';
import {StitchCommunity} from './stitch-community';
import {StitchAdvertising} from './stitch-advertising';
import {LegalContent} from './legal-content';
import {PRIMARY_PLACES,COMPLEMENTARY_PLACES} from '../shared/territories';
import {loadReading,saveReading,markReading} from './reading-history';
import {reviewLabel,lastConfirmedAt,identifiedEmployer,originalPoster,shortDate} from './compact-presentation';
import {TerritorialRadar} from './territorial-radar';
import {ActivityCenter} from './activity-center';
import {listingShareUrl} from '../shared/listing-links';
import {LEGAL_RESPONSIBLE} from './legal-responsible';
import {COMMERCIAL_PLACES} from '../shared/commercial-policy';
import {OwnedPublicationEditor} from './owned-publication-editor';
import { HouseBanner, useAdvertising, sendHouseEvent, completeHouseGoal, type HouseAttribution } from './house-advertising';
import type { Goal, Slot } from '../shared/house-ads';
import { Fragment, type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { api, auth, image as appImage, notifications } from '@appdeploy/client';
import { readFeedInventory } from './feed-inventory';
import { AdministratorAccess, AdministratorShortcut } from './administrator-access';
import { RestoreRehearsalProof } from './restore-rehearsal-proof';
import './ops-dashboard.css';
import { publishedInventoryCounts, recentInApp } from './feed-presentation';
import './inventory-banner.css';
import { NearbyCities, LocalAdvertising, LaborNewsSection } from './territorial-sections';
import { matchesTerritorialView } from './territorial-exploration';
import {
  AlertCircle, ArrowRight, BadgeCheck, Bell, Briefcase, Building2, Camera, CheckCircle, Download, Handshake,
  HeartPulse, House, MapPin, Megaphone, PlusCircle, Radar, Radio, Search, Share2, ShieldCheck, SlidersHorizontal, Sparkles,
  Store, TreePine, Truck, UserRoundSearch, Users, Warehouse, Wrench, X
} from 'lucide-react';
import './vnext.css';
import './compact-layout.css';
import './premium-presentation.css';
import './stitch-fidelity.css';
import { SiteMenu } from './site-menu';
function analyticsId() {
  try {
    const existing = localStorage.getItem('tc_analytics_id');
    if (existing) return existing;
    const next = globalThis.crypto?.randomUUID?.() ?? `tc_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem('tc_analytics_id', next);
    return next;
  } catch {
    return `tc_session_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
}

function track(event:string, properties:Record<string, string | number | boolean | undefined> = {}) {
  void api.post('/api/analytics', { eventId:crypto.randomUUID(), event, distinctId:analyticsId(), properties }).catch(() => undefined);
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
  jobs:{active:number;verified:number;publicPending:number;direct:number};
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
  localStorage.setItem('trabajo-cerca-owner-tokens', JSON.stringify(current));
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
  const photoReadingEnabled = false;
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

  const submitPhoto = async (file: File, sourceName = 'Foto / imagen compartida') => {
    if (!photoReadingEnabled) { setErrorMessage('La lectura de fotos está deshabilitada. Comparte el enlace o texto del aviso.');return; }
    setPhotoSending(true);
    setErrorMessage('');
    try {
      const prepared = await appImage.resizeIfNeeded(file, { maxDimension:1600, maxPixels:2000000, quality:0.82, mimeType:'image/jpeg' });
      const response = await api.post('/api/radar/photo-tip', { imageData:prepared.data, mimeType:prepared.mimeType, sourceName, clientToken:analyticsId() });
      track('tc_photo_tip_submitted', { public:Boolean(response.data.public), duplicate:Boolean(response.data.duplicate) });
      onPublished(response.data.public ? 'job_offer' : 'candidate');
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
        houseAttribution:attribution,
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
      if(event.key==='Escape'){event.preventDefault();onClose();}
      if(event.key==='Tab'){const nodes=controls(),first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
    };
    document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('keydown',key);document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus();};
  },[onClose,preview]);

  if (preview) {
    return (
      <div className='modal' ref={publicationDialog} role='dialog' aria-modal='true' aria-label={preview?'Revisa antes de publicar':heading} tabIndex={-1}>
        <div className='panel previewPanel'>
          <button className='close' onClick={onClose} aria-label='Cerrar'><X /></button>
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
        <button className='close' onClick={onClose} aria-label='Cerrar'><X /></button>
        <span className='lab'>TRABAJO CERCA · PUBLICACIÓN PERSISTENTE</span>
        <h2>{heading}</h2>
        <p>Solo pedimos lo necesario. No CV, RUT, dirección exacta ni datos bancarios.</p>

        <form onSubmit={event => { event.preventDefault(); setPreview(true); }}>
          {flow === 'ofrezco' && (
            <>
              <label>Nombre o nombre abreviado (opcional)
                <input value={data.name} onChange={e => set('name', e.target.value)} placeholder='Ej. Juan M.' />
              </label>
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
                <div><Camera /><span><b>¿Viste un aviso? Comparte su enlace o texto.</b><small>La lectura de fotos está deshabilitada para evitar servicios externos. Puedes aportar el enlace y texto del aviso.</small></span></div>
                <label className={'photoTipButton ' + (photoSending ? 'busy' : '')}>
                  <Camera /> {photoReadingEnabled ? (photoSending ? 'Leyendo aviso…' : 'Sacar foto o elegir imagen') : 'Lectura de fotos deshabilitada'}
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
      const response=await api.post('/api/growth/advertiser-leads', { ...data, consent, advertisingConsent, website, clientToken:analyticsId(), houseAttribution:attribution });
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
  return (
    <div className='modal'>
      <div className='panel advertiserPanel'>
        <button className='close' onClick={onClose} aria-label='Cerrar'><X /></button>
        <span className='lab'>TRABAJO CERCA · COMERCIO LOCAL</span>
        <h2>Promociona tu negocio en Trabajo Cerca</h2>
        <p><b>{promotion ? promotion.days ? `${promotion.days} días gratuitos desde la aprobación · ${promotion.kind==='founder'?'Fundadores':'Prueba estándar'}` : promotion.message : 'Consultando la promoción vigente…'}</b> Revisaremos tu solicitud antes de activarla. No necesitas página web: puede ser Facebook, Instagram, WhatsApp o un contacto comercial. No existe renovación automática ni se realizará ningún cobro sin informarte antes.</p>
        {promotion&&<p>{promotion.conditions}{promotion.kind==='founder'&&` Cupos disponibles: ${promotion.remaining}. La disponibilidad se comprueba al aprobar.`}</p>}
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
          <label>Cuéntanos qué te interesaría <small>opcional</small>
            <textarea value={data.note} onChange={e => set('note', e.target.value)} placeholder='Ej. aparecer en Angol por un mes / destacar ofertas de trabajo…' />
          </label>
          <label className='hp' aria-hidden='true'>Sitio<input tabIndex={-1} autoComplete='off' value={website} onChange={e => setWebsite(e.target.value)} /></label>
          <label className='consentRow'><input type='checkbox' required checked={advertisingConsent} onChange={e=>setAdvertisingConsent(e.target.checked)}/><span>Autorizo la publicidad del negocio que represento, sujeta a revisión. El contacto de esta solicitud permanece privado; no acepto cobros.</span></label>
          <label className='consentRow'><input type='checkbox' required checked={consent} onChange={e => setConsent(e.target.checked)} /><span>Autorizo a Trabajo Cerca a usar estos datos únicamente para responder esta solicitud comercial. Mi contacto no se publicará por enviar este formulario.</span></label>
          {errorMessage && <div className='formError'><AlertCircle /> {errorMessage}</div>}
          <button className='primary' disabled={sending}><Megaphone size={17} /> {sending ? 'Enviando…' : 'Solicitar espacio gratuito'}</button>
        </form>
      </div>
    </div>
  );
}

function AlertsPanel({ defaultPlace, onClose, onSaved }: { defaultPlace:string; onClose:()=>void; onSaved:(message:string)=>void }) {
  const selectable = [...new Set([...places.filter(value => value !== 'Todas'), ...travelPlaces])];
  const [selected, setSelected] = useState<string[]>(() => selectable.includes(defaultPlace) ? [defaultPlace] : []);
  const [keywords, setKeywords] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(auth.isSignedIn());
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [legacyPending,setLegacyPending] = useState(false);
  useEffect(() => {
    if (!auth.isSignedIn()) { setLoading(false); return; }
    api.get('/api/notifications/preferences').then(response => {
      const communes = Array.isArray(response.data.communes) ? response.data.communes.filter((value:string) => selectable.includes(value)) : [];
      if (communes.length) setSelected(communes);
      setKeywords(Array.isArray(response.data.keywords) ? response.data.keywords.join(', ') : '');
      setEnabled(Boolean(response.data.active));
      setLegacyPending(response.data.legacyPending===true);
      if(response.data.legacyPending)setErrorMessage('Tus preferencias anteriores se están actualizando. Puedes guardarlas de nuevo o desactivarlas desde aquí.');
    }).catch(() => setErrorMessage('No fue posible consultar tus preferencias anteriores.')).finally(() => setLoading(false));
  }, []);
  const togglePlace = (value:string) => {
    setErrorMessage('');
    setSelected(current => current.includes(value) ? current.filter(item => item !== value) : current.length >= 5 ? current : [...current,value]);
  };
  const parsedKeywords = () => keywords.split(',').map(value => value.trim()).filter(Boolean).slice(0,8);
  const activate = async () => {
    if (!selected.length) { setErrorMessage('Elige al menos una comuna para recibir avisos.'); return; }
    setSaving(true); setErrorMessage(''); setTestMessage('');
    try {
      if (!auth.isSignedIn()) await auth.signIn();
      const guidance = await notifications.getEnableGuidance();
      if (['permission_denied','ios_install_required','unsupported'].includes(guidance.kind)) {
        setErrorMessage([guidance.message,...guidance.steps].filter(Boolean).join(' · '));
        return;
      }
      await notifications.subscribe({ showUi:false });
      await api.post('/api/notifications/preferences', { communes:selected, keywords:parsedKeywords() });
      setEnabled(true);
      setLegacyPending(false);
      track('tc_notifications_enabled', { commune:selected.join(' · '), count:selected.length, keyword_count:parsedKeywords().length, surface:'alerts_panel' });
      onSaved('Preferencias guardadas. Prueba el envío y comprueba que la notificación aparece en tu teléfono.');
    } catch (err) {
      const message=err instanceof Error ? err.message : 'No fue posible activar las notificaciones.';
      setErrorMessage(message.includes('popup') ? 'Completa el inicio de sesión para activar tus avisos.' : message);
    } finally { setSaving(false); }
  };
  const testNotification = async () => {
    setSaving(true); setErrorMessage(''); setTestMessage('');
    try {
      const response = await api.post('/api/notifications/test');
      if (!(Number(response.data?.sent)>0)) throw Error('El servicio no aceptó el envío. Revisa la suscripción y los permisos antes de volver a probar.');
      track('tc_notifications_test', { commune:selected.join(' · '), surface:'alerts_panel' });
      setTestMessage('El servicio aceptó la prueba. Comprueba en tu teléfono si apareció; esta respuesta no confirma su recepción física.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'No se pudo enviar la prueba.');
    } finally { setSaving(false); }
  };
  const disable = async () => {
    setSaving(true); setErrorMessage(''); setTestMessage('');
    try {
      if (auth.isSignedIn()) await api.delete('/api/notifications/preferences');
      await notifications.unsubscribe({ showUi:false });
      setEnabled(false);
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
        <div className='tcNotifyHeading'><span className='tcNotifyIcon'><Bell aria-hidden='true'/></span><div><h2 id='tc-notify-heading'>Notificaciones automáticas</h2><p>Esta opción voluntaria envía alertas a tu teléfono, incluso si cierras la app.</p></div></div>
        {enabled&&<div className='tcNotifyActive' role='status'><CheckCircle aria-hidden='true'/> Preferencias guardadas</div>}
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
        <div className='neoAlertActions tcNotifyActions'>
          <button type='button' className='neoAlertPrimary' disabled={saving||loading} onClick={()=>void activate()}><Bell aria-hidden='true'/>{saving?'Guardando…':enabled?'Actualizar avisos':auth.isSignedIn()?'Activar notificaciones':'Iniciar sesión y activar'}</button>
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
    window.location.hash = '';
    window.location.reload();
  };
  return (
    <main className='opsShell'>
      <header className='opsHeader'>
        <div className='brand'><div className='brandmark'><img className='tcOfficialBrandIcon' src='/icon-192.png' width='192' height='192' alt='' aria-hidden='true' decoding='async' /></div><div><b>Trabajo Cerca</b><span>PANEL OPERATIVO PRELIMINAR</span></div></div>
        <button onClick={back}>Volver a Trabajo Cerca</button>
      </header>
      {securityMode && <pre id='security-live-check'>{JSON.stringify(securityProof,null,2)}</pre>}
      <section className='opsHero'>
        <span className='overline'>TRABAJO CERCA · LABORATORIO</span>
        <h1>Panel de administración</h1>
        <p>Revisa tu acceso, el inventario y el estado del radar.</p>
      </section>
      <AdministratorAccess />
      {new URLSearchParams(window.location.search).get('restore-proof') === '1' && <RestoreRehearsalProof />}
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
        <section className='opsGrid'>
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
  const [items, setItems] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [feedSummary, setFeedSummary] = useState<FeedSummary>({ totalItems:0, totalJobOffers:0, totalVerifiedJobOffers:0, totalProvisionalJobOffers:0, communeStats:{}, kindStats:{ jobs:0, people:0, needs:0, services:0 } });
  const [loadError, setLoadError] = useState('');
  const [feedState, setFeedState] = useState<'fresh'|'degraded_last_good'|'authoritative_empty'>('fresh');
  const queryParams = new URLSearchParams(window.location.search);
  const requestedPlace = queryParams.get('place') || '';
  const initialPlace = [...places, ...travelPlaces].includes(requestedPlace) ? requestedPlace : 'Todas';
  const [flow, setFlow] = useState<Flow | null>(() => queryParams.get('share_target') === '1' ? 'aporte' : null);
  const [section, setSection] = useState<Section>('opportunities');
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
  const [showAlerts, setShowAlerts] = useState(false);
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
  const [homePlace, setHomePlace] = useState(places.includes(initialPlace) && !travelPlaces.includes(initialPlace) ? initialPlace : 'Todas');
  const [sessionStartedAt,setSessionStartedAt] = useState(() => new Date().toISOString());
  const noveltyCutoff=Date.parse(sessionStartedAt)-7*86400000;

  const load = async (cursor?: string, fresh = false) => {
    const append = Boolean(cursor);
    const generation=append?requestGeneration.current:++requestGeneration.current;
    if (append) setLoadingMore(true);
    else {setResultPage(0);setLoading(true);setLoadingMore(false);setFeedComplete(false);exploredCursors.current.clear();if(fresh)setSessionStartedAt(new Date().toISOString());}
    setLoadError('');
    try {
      const params = new URLSearchParams({ limit:'40' });
      if (cursor) params.set('cursor', cursor);
      if (fresh) params.set('fresh', '1');
      const response = await api.get('/api/listings?' + params.toString());
      if(generation!==requestGeneration.current)return;
      const incoming = response.data.items as Listing[];
      setFeedUpdatedAt(typeof response.data.updatedAt==='string'?response.data.updatedAt:null);
      setFeedComplete(!response.data.nextCursor);
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
        if (!append) return [...new Map(incoming.map(item=>[item.id,item])).values()];
        const merged = new Map<string, Listing>(current.map(item => [item.id, item]));
        for (const item of incoming) merged.set(item.id, item);
        return [...merged.values()];
      });
      setNextCursor(response.data.nextCursor ?? null);
      setFeedSummary({
        totalItems:Number(response.data.totalItems ?? incoming.length),
        recentJobOffers7d:typeof response.data.recentJobOffers7d==='number' ? response.data.recentJobOffers7d : undefined,
        recentJobOffers24h:typeof response.data.recentJobOffers24h==='number' ? response.data.recentJobOffers24h : undefined,
        totalJobOffers:Number(response.data.totalJobOffers ?? incoming.filter(item => item.kind === 'job_offer').length),
        totalVerifiedJobOffers:Number(response.data.totalVerifiedJobOffers ?? incoming.filter(item => item.kind === 'job_offer' && item.verified && !item.review).length),
        totalProvisionalJobOffers:Number(response.data.totalProvisionalJobOffers ?? incoming.filter(item => item.kind === 'job_offer' && item.review).length),
        communeStats:(response.data.communeStats ?? {}) as Record<string, CommuneStat>,
        kindStats:response.data.kindStats ?? { jobs:0, people:0, needs:0, services:0 },
      });
    } catch {
      if(generation!==requestGeneration.current)return;
      setLoadError('No pudimos cargar el Radar central. Intenta nuevamente.');
    } finally {
      if(generation===requestGeneration.current){if (append) setLoadingMore(false);else setLoading(false);}
    }
  };

  useEffect(() => {
    track('tc_app_open', { surface:'pwa_web' });
    void load();
  }, []);
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
    void notifications.configure({ showSystemNotificationOnForeground:false });
    const off = notifications.onMessage(payload => {
      const title = 'notification' in payload ? payload.notification?.title : undefined;
      setNotice(title || 'Llegó una nueva actualización de Trabajo Cerca.');
      void load(undefined, true);
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
      const communeMatch = place === 'Todas'
        ? matchesTerritorialView(item, place, places)
        : (filterMode === 'work' ? item.workCommunes.includes(place) : item.recruitmentCommunes.includes(place));
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
  const sourceCounts = useMemo(() => { const counts = new Map<string,number>(); for (const item of items) { if (item.kind !== 'job_offer' || !item.workCommunes.some(commune => places.includes(commune) && commune !== 'Todas')) continue; const source = item.source || 'Fuente no identificada'; counts.set(source,(counts.get(source)||0)+1); } return [...counts.entries()].sort((a,b)=>b[1]-a[1]); },[items]);
  const availableJobs = feedSummary.totalJobOffers;
  const inventoryCounts=publishedInventoryCounts(feedSummary,place);
  const recentJobs=inventoryCounts.recent7d;
  const verifiedJobs = feedSummary.totalVerifiedJobOffers || items.filter(i => i.kind === 'job_offer' && i.verified && !i.review).length;
  const provisionalJobs = feedSummary.totalProvisionalJobOffers || items.filter(i => i.kind === 'job_offer' && i.review).length;
  const people = feedSummary.kindStats.people || items.filter(i => i.kind === 'worker_available').length;
  const directNeeds = feedSummary.kindStats.needs || items.filter(i => i.kind === 'worker_need').length;
  const selectedStat = place === 'Todas' ? emptyCommuneStat : (feedSummary.communeStats[place] ?? emptyCommuneStat);
  const isTravelView = travelPlaces.includes(place);
  useEffect(() => {
    if (!nextCursor || loading || loadingMore || loadError) return;
    if(exploredCursors.current.has(nextCursor)||exploredCursors.current.size>=100)return;
    exploredCursors.current.add(nextCursor);void load(nextCursor);
  },[nextCursor,loading,loadingMore,loadError]);
  useEffect(()=>{if(!resultFocus)return;const target=document.getElementById('neo-jobs');target?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});target?.focus({preventScroll:true});},[resultFocus]);
  const navigateResults=(next:Section='opportunities',town=place,recent=false,unread=false)=>{setResultPage(0);setSection(next);setPlace(town);setFilterMode('work');setQ('');setArea('Todas');setOnlyNew(recent);setOnlyUnread(unread);setResultFocus(n=>n+1);};
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
    const text = `${item.title} · ${item.workLocation}\nTrabajo Cerca`;
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
    if(goal==='professional') {setFlow('ofrezco');}
    else if(goal==='advertiser') {setShowAdvertiser(true);}
    else if(goal==='employer') {setFlow('trabajadores');}
    else {completeHouseGoal('explore');navigateResults('opportunities');}
  }
  function renderAdvertising(slot:Slot) {
    const selection=advertising.selections[slot];
    if(selection?.type==='HOUSE_AD') return <HouseBanner selection={selection} place={place} onGoal={openHouseGoal} onImpression={advertising.impression}/>;
    if(selection?.type==='COMMERCIAL') {
      const ad=selection.campaign;
      const sponsor:Sponsor={...ad,label:'Publicidad local',scope:ad.communes.includes('Todas')?'regional':'exact'};
      return <LocalAdvertising sponsor={sponsor} place={place} loading={false} onAdvertise={()=>setShowAdvertiser(true)} track={track} placement={slot}/>;
    }
    return advertising.failed ? <p role='status'>No se pudo consultar la publicidad. La búsqueda de ofertas sigue disponible.</p> : null;
  }
  const neoFeatured = items.filter(item => item.kind === 'job_offer').slice(0, 3);

  if (isVNext) {
    return (
      <main className='neoShell tcStitchShell'>
        <header className='neoTopbar'>
          <div className='tcTopbarInner'>
            <button className='neoBrand' aria-label='Trabajo Cerca, inicio' onClick={() => window.scrollTo({ top:0, behavior:'smooth' })}><StitchBrand /></button>
            <span className='tcTerritoryBadge'>Malleco &amp; Biobío</span>
            <nav className='neoTopNav' aria-label='Navegación principal'>
              <button aria-current={section==='opportunities'?'page':undefined} onClick={() => navigateResults('opportunities')}>Empleos</button>
              <button onClick={() => setFlow('ofrezco')}>Ofrecer mi trabajo</button>
              <button onClick={() => navigateResults('services')}>Buscar servicios</button>
              <button onClick={() => setShowAdvertiser(true)}>Publicidad</button>
            </nav>
            <button type='button' className='tcTopPublish' onClick={()=>setFlow('trabajadores')}><PlusCircle aria-hidden='true'/> Publicar oportunidad</button>
            <label className='tcMobilePlace'><MapPin aria-hidden='true'/><span className='tcVisuallyHidden'>Comuna de cabecera</span><select aria-label='Comuna de cabecera' value={place} onChange={e=>chooseLocalPlace(e.target.value)}>{isTravelView&&!places.includes(place)&&<option value={place}>{place}</option>}{places.map(value=><option key={value} value={value}>{value==='Todas'?'Mi territorio':value}</option>)}</select></label>
            <SiteMenu accountIcon onRadar={()=>openSecondary('neo-radar')} onAdvertise={()=>setShowAdvertiser(true)} onAlerts={()=>setShowActivity(true)} onInstall={()=>void installApp()}
              onService={()=>setFlow('servicio')} onContribute={()=>setFlow('aporte')}
              onCities={()=>openSecondary('tc-other-cities')} onNews={()=>openSecondary('actualidad-laboral')}
              onPeople={()=>navigateResults('people')}/>
          </div>
        </header>
        <div className='tcTerritorialStatus'><div><span><Radar aria-hidden='true'/> Radar laboral territorial <span className='tcStatusDetail'> · Oportunidades con fuente y estado visibles</span></span><span><MapPin aria-hidden='true'/> {place==='Todas'?'Malleco y Biobío':place}{feedUpdatedAt?' · Catálogo del '+shortDate(feedUpdatedAt):''}</span></div></div>
        <section className='neoHero neoHeroReborn' id='neo-home'>
          <div className='tcStitchHeroRadar' aria-hidden='true'><svg viewBox='0 0 400 400' fill='none'><circle cx='200' cy='200' r='190' strokeDasharray='6 6'/><circle cx='200' cy='200' r='140'/><circle cx='200' cy='200' r='90' strokeDasharray='4 4'/><circle cx='200' cy='200' r='40'/><path d='M200 10V390M10 200H390'/></svg></div>
          <div className='neoHeroCopy'>
            <span className='tcStitchEyebrow'><Radar aria-hidden='true'/> Red comunitaria de vinculación de cercanía</span>
            <h1>Encuentra trabajo <em>cerca de ti</em></h1>
            <p className='neoHeroLead'>Explora oportunidades formales y oficios en tu comuna inmediata. Conecta de forma directa, transparente y sin burocracia con empleadores y vecinos de tu territorio.</p>
            <form className='neoSearchDock' role='search' aria-label='Buscar trabajo por comuna' onSubmit={event=>{event.preventDefault();setResultPage(0);setSection('opportunities');setArea('Todas');setOnlyNew(false);setOnlyUnread(false);setResultFocus(n=>n+1);}}>
              <label className='tcRoleField'><Search aria-hidden='true'/><span><small>Cargo, oficio o rubro</small><input aria-label='Cargo, oficio o empresa para buscar' value={q} onChange={e=>setQ(e.target.value)} placeholder='Ej. Técnico, Cosecha, Soldador, Asistente'/></span></label>
              <label className='tcCommuneField'><MapPin aria-hidden='true'/><span><small>Comuna base</small><select aria-label='Comuna de búsqueda' value={place} onChange={e=>chooseLocalPlace(e.target.value)}>{isTravelView&&!places.includes(place)&&<option value={place}>{place}</option>}{places.map(value=><option key={value}>{value}</option>)}</select></span></label>
              <button type='submit'><Radar aria-hidden='true'/> Buscar trabajo</button>
              <div className='tcSearchCategories'><span>Explorar por rubro:</span>{areas.filter(value=>value!=='Todas').slice(0,4).map(value=><button key={value} type='button' onClick={()=>{setSection('opportunities');setArea(value);setResultFocus(n=>n+1);}}>{value}</button>)}</div>
            </form>
          </div>
        </section>
        <section className='tcStitchRadarSummary' aria-label='Resumen del catálogo territorial'>
          <div><span><Radar aria-hidden='true'/> Radar laboral territorial</span><b>{scopeCount??'…'} ofertas</b></div>
          <h2>Oportunidades en tu territorio</h2>
          <label><MapPin aria-hidden='true'/><span>Comuna:</span><select aria-label='Localidad del radar' value={place} onChange={e=>chooseLocalPlace(e.target.value)}>{isTravelView&&!places.includes(place)&&<option value={place}>{place}</option>}{places.map(value=><option key={value}>{value}</option>)}</select><button type='button' onClick={()=>{setAdvancedFiltersOpen(value=>!value);document.getElementById('neo-jobs')?.scrollIntoView({behavior:'smooth'});}}>Ajustar <SlidersHorizontal aria-hidden='true'/></button></label>
        </section>
        {advertising.selections.search?.type==='COMMERCIAL'&&renderAdvertising('search')}
        {feedState==='degraded_last_good'&&<p className='tcResultStatus' role='status'>Mostrando el último catálogo disponible. Actualización pendiente.</p>}
        {notice && !flow && !showAdvertiser && <div className='neoNotice'><CheckCircle /><span>{notice}</span><button onClick={() => setNotice('')}><X /></button></div>}

        <section className='neoDiscover' id='neo-jobs' tabIndex={-1} aria-labelledby='tc-results-title' aria-busy={loading||loadingMore}>
          <div className='neoDiscoverHead'>
            <div><h2 id='tc-results-title' aria-label={resultsTitle}><Radar aria-hidden='true'/><span className='tcDesktopText'>{section==='opportunities'?'Radar de Empleos Activos':resultsTitle}</span><span className='tcMobileText'>{section==='opportunities'?'Oportunidades Cerca':resultsTitle}</span></h2><p className='tcDesktopText'>Ofertas con fuente, ubicación y vigencia diferenciadas.</p></div>
            <span className='tcCatalogCount' role='status'>{loading?'Cargando…':`${visible.length} resultados${!feedComplete?' · Parciales':''}`}</span>
            {(q.trim()!==''||place!=='Todas'||area!=='Todas'||onlyNew||onlyUnread||filterMode!=='work')&&<button className='tcClearFilters' onClick={()=>navigateResults('opportunities','Todas')}>Quitar filtros</button>}
          </div>
          <div className='neoControlDeck'>
            <div className='neoFilters'>
              <label className='neoFilterSearch'><Search aria-hidden='true'/><input aria-label='Buscar por cargo, oficio o empresa' value={q} onChange={e=>setQ(e.target.value)} placeholder='Buscar oficio, empleo o faena…'/></label>
              <button type='button' className='tcFiltersToggle' aria-label='Filtros' aria-expanded={advancedFiltersOpen} aria-controls='tc-advanced-filters' onClick={()=>setAdvancedFiltersOpen(value=>!value)}><SlidersHorizontal aria-hidden='true'/><span className='tcDesktopText'>Filtros</span></button>
              <div className='tcAdvancedFilters' id='tc-advanced-filters' data-open={advancedFiltersOpen}>
                <label><span>Comuna de resultados</span><select aria-label='Comuna de resultados' value={place} onChange={e=>chooseLocalPlace(e.target.value)}>{isTravelView&&!places.includes(place)&&<option value={place}>{place}</option>}{places.map(value=><option key={value}>{value}</option>)}</select></label>
                <label><span>Área laboral</span><select aria-label='Área laboral' value={area} onChange={e=>setArea(e.target.value)}>{areas.map(value=><option key={value}>{value}</option>)}</select></label>
                <label><span>Tipo de publicación</span><select aria-label='Tipo de publicación' value={section} onChange={e=>navigateResults(e.target.value as Section)}><option value='opportunities'>Empleos</option><option value='people'>Personas disponibles</option><option value='needs'>Necesitan gente</option><option value='services'>Servicios</option></select></label>
                <label><span>Buscar por ubicación</span><select aria-label='Buscar por ubicación' value={filterMode} onChange={e=>setFilterMode(e.target.value as FilterMode)}><option value='work'>Lugar de trabajo</option><option value='recruit'>Aceptan desde aquí</option></select></label>
                {section==='opportunities'&&<button type='button' aria-pressed={onlyNew} onClick={()=>{setOnlyNew(value=>!value);setOnlyUnread(false);}}><Sparkles aria-hidden='true'/> Incorporadas en 7 días</button>}
              </div>
            </div>
            <div className='tcCommuneRail' aria-label='Filtrar por comuna'>{places.map(value=><button key={value} type='button' aria-pressed={place===value} className={place===value?'active':''} onClick={()=>chooseLocalPlace(value)}>{value}{feedComplete?` (${value==='Todas'?items.filter(item=>item.kind==='job_offer'&&matchesTerritorialView(item,'Todas',places)).length:feedSummary.communeStats[value]?.jobs??0})`:''}</button>)}</div>
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
                      {item.workLocation?.trim()&&<span className='neoJobPlace'><MapPin /> {item.workLocation}</span>}
                      <span className={'neoJobState ' + (reviewLabel(item)==='Verificada'?'verified':reviewLabel(item)==='Vigencia por confirmar'?'pending':'direct')}>{reviewLabel(item)}</span>
                    </div>


                    <h3>{item.title}</h3>
                    {identifiedEmployer(item)&&<p className='neoJobCompany'>{identifiedEmployer(item)}</p>}
                    {item.salary && <strong className='neoSalary'>{item.salary}</strong>}
                    <div className='tcCardTags'>{isFresh(item)&&<span title='Añadida recientemente a Trabajo Cerca; no indica la fecha original'>Recién incorporada</span>}{reading.known&&!reading.read[item.id]&&<span>No leída</span>}{[item.area,...item.tags].filter(Boolean).slice(0,2).map((tag,n)=><span key={n}>{tag}</span>)}</div>
                    <div className='tcOfferActionRow'>
                      <div className='neoJobFacts'>
                        <span><small>{item.date || 'Fecha no informada'}</small><b title={item.source}>{item.source||'Fuente no informada'}</b></span>
                      </div>
                      <div className='neoJobFoot'>
                        <button aria-label={'Ver oferta: '+item.title} onClick={() => setSelected(item)}>Ver oferta <ArrowRight /></button>
                      </div>
                    </div>
                    {own && <div className='neoOwnActions'><button onClick={() => void closeOwn(item)}>Cerrar</button><button onClick={() => void deleteOwn(item)}>Eliminar mis datos</button></div>}
                  </div>
                </article>
                {index === 2 && section === 'opportunities' && advertising.selections.listing?.type==='COMMERCIAL' && renderAdvertising('listing')}
                </Fragment>
              );
            })}
          </div>

          {visible.length>resultsPerPage&&<nav className='tcResultsPagination' aria-label='Páginas de resultados'><button disabled={resultPage===0} onClick={()=>{setResultPage(n=>Math.max(0,n-1));setResultFocus(n=>n+1);}}>Página anterior</button><span>Página {resultPage+1} de {resultPages} · {visible.length} resultados{!feedComplete?' cargados':''}</span><button disabled={resultPage+1>=resultPages} onClick={()=>{setResultPage(n=>n+1);setResultFocus(n=>n+1);}}>Siguiente página</button></nav>}
          {!loading && visible.length === 0 && !loadError && section !== 'opportunities' && <div className='neoEmpty'><b>{nextCursor ? 'Hay más publicaciones por cargar antes de confirmar esta categoría.' : section === 'people' ? 'Todavía no hay profesionales registrados en esta categoría. ¡Sé de los primeros en ofrecer tus servicios!' : '¿Necesitas personal o un servicio en tu comuna? Publica tu oportunidad.'}</b><button onClick={()=>nextCursor?void load(nextCursor):setFlow(section==='people'?'ofrezco':section==='services'?'servicio':'trabajadores')}>{nextCursor?'Cargar más publicaciones':section==='people'?'Publicar mis servicios':'Publicar una oportunidad'}</button></div>}
          {!loading && visible.length === 0 && !loadError && section === 'opportunities' && <div className='neoEmpty'><Radar /><b>{nextCursor ? 'Hay más ofertas por cargar para completar esta búsqueda.' : 'No hay ofertas que coincidan con esta vista.'}</b><span>Eso no significa que no existan empleos: solo mostramos avisos cuya fuente, vigencia y ubicación logramos confirmar.</span><button onClick={() => nextCursor ? void load(nextCursor) : (setOnlyNew(false),setQ(''),setArea('Todas'))}>{nextCursor ? 'Cargar más ofertas' : 'Ver todas las ofertas'}</button></div>}
          {nextCursor && !loadError && <div className='neoLoadMore'><small>{items.filter(item=>item.kind==='job_offer').length} ofertas cargadas de {availableJobs} publicadas</small><button onClick={() => void load(nextCursor)} disabled={loadingMore}>{loadingMore ? 'Cargando…' : 'Cargar más'} <ArrowRight /></button></div>}
        </section>

        <div className='tcStitchAlert'><Bell aria-hidden='true'/><div><b>¿No ves tu oficio en la lista de hoy?</b><span>Consulta novedades y configura tus avisos locales gratuitos.</span></div><button type='button' onClick={()=>setShowActivity(true)}>Ver novedades <ArrowRight aria-hidden='true'/></button></div>
        <StitchCommunity person={items.find(item=>item.kind==='worker_available'&&!item.review&&matchesTerritorialView(item,place,places))} onOffer={()=>setFlow('ofrezco')} onBrowse={()=>navigateResults('people')} onSelect={id=>setSelected(items.find(item=>item.id===id)??null)}/>
        {(advertising.selections.search?.type==='HOUSE_AD'||section==='opportunities'&&advertising.selections.listing?.type==='HOUSE_AD')&&<section className='tcStitchAdvertising' aria-label='Espacio territorial destacado'>
          <header><div><span className='tcStitchEyebrow'>Espacio territorial destacado</span><h2>Comunidad y Desarrollo Regional</h2></div></header>
          <StitchAdvertising campaigns={(['search',...(section==='opportunities'?['listing']:[])] as Slot[]).flatMap(slot=>{const ad=advertising.selections[slot];return ad?.type==='HOUSE_AD'?[{id:slot,label:ad.campaign.goal==='professional'?'Servicios y oficios':ad.campaign.goal==='advertiser'?'Negocios y fundadores':'Empleo y territorio',banner:renderAdvertising(slot)}]:[];})}/>
          <details className='tcStitchPromotionDetails' open={window.matchMedia('(min-width:768px)').matches}><summary>Beneficio fundadores y prueba gratuita</summary><p className='tcFounderNote'><BadgeCheck aria-hidden='true'/><span>Primeros 20 negocios elegibles: 30 días individuales de visibilidad gratuita. Prueba estándar posterior: 14 días. Sin cobros automáticos.</span><button type='button' onClick={()=>setShowAdvertiser(true)}>Inscribir mi negocio <ArrowRight aria-hidden='true'/></button></p></details>
        </section>}
        <section className='tcStitchCities' id='tc-other-cities' aria-labelledby='tc-cities-title'><div><span className='tcStitchEyebrow'>Polos regionales extraterritoriales</span><h2 id='tc-cities-title'>Busca también en otras ciudades</h2>
          <NearbyCities compact stats={feedSummary.communeStats} ready={!loading} failed={Boolean(loadError)} current={place} onExplore={openTravel} onReturn={()=>chooseLocalPlace(homePlace)} origin={homePlace}/>
        </div></section>
        <details className='tcStitchFooterDetails' open={window.matchMedia('(min-width:768px)').matches}><summary>Trabajo Cerca · Información y privacidad</summary>
        <details className='tcSecondary tcStitchRadarDetails'><summary>Explorar el radar territorial</summary><TerritorialRadar stats={feedSummary.communeStats} ready={!loading&&!loadError} failed={Boolean(loadError)} selected={place} updatedAt={feedUpdatedAt} onSelect={town=>navigateResults('opportunities',town)}/></details>
        <details className='tcSecondary' id='actualidad-laboral'><summary>Actualidad laboral y trámites</summary><LaborNewsSection/></details>

        <footer className='neoFooter' aria-label='Información de Trabajo Cerca'>
          <div className='neoBrand tcFooterBrand'>
            <StitchBrand subtitle='Radar territorial' />
          </div>
          <p className='tcFooterTagline'>Conectamos personas, trabajo y servicios locales.</p>
          <a className='tcFooterEmail' href={'mailto:'+LEGAL_RESPONSIBLE.privacyEmail}>{LEGAL_RESPONSIBLE.privacyEmail}</a>
          <nav className='tcFooterLegal' aria-label='Información legal'>
            <button type='button' onClick={() => setLegalView('privacy')}>Privacidad</button>
            <button type='button' onClick={() => setLegalView('terms')}>Términos</button>
          </nav>
        </footer></details>

        {!flow && !showAdvertiser && !showAlerts && !showActivity && !legalView && !selected && <nav className='neoMobileNav' aria-label='Navegación móvil'>
          <button onClick={()=>window.scrollTo({top:0,behavior:'smooth'})}><House aria-hidden='true'/><span>Inicio</span></button>
          <button onClick={()=>navigateResults('opportunities')}><Briefcase aria-hidden='true'/><span>Empleos</span></button>
          <button onClick={()=>navigateResults('services')}><Wrench aria-hidden='true'/><span>Servicios</span></button>
          <button onClick={()=>setFlow('trabajadores')}><PlusCircle aria-hidden='true'/><span>Publicar</span></button>
        </nav>}

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
                  <div><Radio /><span><small>PUBLICACIÓN ORIGINAL</small><b>{shortDate(selected.sourcePublishedAt)||selected.date||'No informada'}</b></span></div>{selected.firstPublishedAt&&<div><Radio/><span><small>INCORPORADA EN TRABAJO CERCA</small><b>{shortDate(selected.firstPublishedAt)}</b></span></div>}
                  {lastConfirmedAt(selected)&&<div><BadgeCheck/><span><small>ÚLTIMA COMPROBACIÓN CON EVIDENCIA</small><b>{shortDate(lastConfirmedAt(selected)!)}</b></span></div>}
                  <div><BadgeCheck /><span><small>FUENTE</small><b>{selected.source}</b></span></div>
                </div>

                {selected.portalPlace && selected.portalPlace !== selected.workLocation && <div className='neoDrawerEvidence'><BadgeCheck /><span><b>Ubicación corregida</b><small>El portal la clasificó como {selected.portalPlace}; el lugar real detectado es {selected.workLocation}.</small></span></div>}

                <div className='neoDrawerSection'>
                  <span className='neoKicker'>DETALLE</span>
                  <h3>Sobre esta oportunidad</h3>
                  <p>{selected.note || 'Sin descripción adicional.'}</p>
                </div>

                {(selected.apply||selected.evidence)&&<div className='neoDrawerSection'><h3>Postulación y evidencia</h3>{selected.apply&&<p>{selected.apply}</p>}{selected.evidence&&<p>{selected.evidence}</p>}</div>}
                <div className='neoDrawerActions'>
                  {selected.applicationUrl&&/^https:\/\//i.test(selected.applicationUrl)&&<a href={selected.applicationUrl} target='_blank' rel='noopener noreferrer'>Ver canal de postulación <ArrowRight/></a>}
                  {selected.url && <a href={selected.url} target='_blank' rel='noreferrer' onClick={() => track('tc_external_offer_click', { listing_id:selected.id, kind:selected.kind, commune:selected.workLocation, origin:selected.origin })}>Ver oferta original <ArrowRight /></a>}
                  {!selected.contact && selected.hasContact && <button className='neoDrawerPrimary' onClick={() => void revealContact(selected)} disabled={revealingContact}>{revealingContact ? 'Cargando contacto…' : 'Mostrar contacto'} <ArrowRight /></button>}
                  {selected.contact && <div className='neoContactReveal'>
                    <span><small>CONTACTO PUBLICADO</small><b>{selected.contact}</b>{selected.contactLabel && <em>{selected.contactLabel}</em>}</span>
                    <a href={'tel:' + selected.contact}>{selected.review ? 'Consultar' : 'Llamar'} <ArrowRight /></a>
                  </div>}
                  {!selected.url && !selected.contact && !selected.hasContact && <span className='neoDrawerPending'>Este aviso aún no tiene un canal útil de contacto confirmado.</span>}
                  <button className='neoDrawerSecondary' onClick={() => void shareListing(selected)}><Share2 /> Compartir oportunidad</button>
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
          <div className='brandmark'><MapPin size={21} /><Radar size={12} /></div>
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
          <div className='heroMetric'><strong>{loading ? '…' : availableJobs}</strong><span><b>oportunidades verificadas</b><small>{(feedSummary.recentJobOffers24h || 0) > 0 ? `+${(feedSummary.recentJobOffers24h || 0)} nuevas en las últimas 24 h · ` : ''}disponibles hasta cierre o vencimiento confirmado</small></span></div>
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
        <div className='resultLine modernResultLine'><b>{loading ? 'Cargando…' : visible.length + ' resultados'}</b><span>Actualización territorial · Radar 3.0</span></div>

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
                  <div><Radio /><span><small>Publicado / vigencia</small><b>{item.date}{item.until ? ' · hasta ' + item.until : ''}</b></span></div>
                </div>
                <div className='cardFooter'>
                  <span className='sourceMini'><BadgeCheck /> {item.source}</span>
                  <button className='viewJob' onClick={() => setSelected(item)}>{person ? 'Ver perfil' : item.kind === 'service_request' ? 'Ver servicio' : 'Ver trabajo'} <ArrowRight /></button>
                </div>
                {own && <div className='ownActions'><button className='closeOwn' onClick={() => void closeOwn(item)}>Cerrar aviso</button><button className='deleteOwn' onClick={() => void deleteOwn(item)}>Eliminar mis datos</button></div>}
              </article>
            );
          })}
        </div>

        {nextCursor && !loadError && <div className='loadMoreWrap'><button className='secondary' onClick={() => void load(nextCursor)} disabled={loadingMore}>{loadingMore ? 'Cargando más…' : 'Cargar más resultados'}</button><span>La app descarga los avisos por páginas para reducir carga y consumo de datos.</span></div>}

        {!loading && visible.length === 0 && !loadError && <div className='empty'><AlertCircle /><b>No hay coincidencias en esta vista.</b><span>Prueba otra comuna, otro oficio o cambia entre lugar real y zona desde donde aceptan personas. Si quedan páginas disponibles, usa “Cargar más resultados”.</span></div>}
      </section>

      <section className='coverageSection compactCoverage' id='cobertura'>
        <div className='sectionHead modernHead'>
          <div><span className='overline'>RADAR 3.1</span><h2>Tres motores, tres trabajos distintos</h2><p>Motor 1 mantiene la base estructurada y oficial. Motor 2 busca brechas en la web. Motor 3 rastrea el movimiento difícil: redes públicas, radios, diarios comunales, OMIL, cámaras, comercios, contratistas y páginas locales. Encontrar no significa publicar: cada hallazgo debe superar deduplicación, territorio, fecha, seguridad y verificación.</p></div>
          <button className='coverageToggle' onClick={() => void loadCoverage()}>{showCoverage ? 'Ocultar' : 'Ver cobertura'} <ArrowRight /></button>
        </div>
        {showCoverage ? <div className='coverageSummary'>
          <div><b>{radarStatus?.searchEngines ?? 3}</b><span>motores de búsqueda activos</span></div>
          <div><b>{radarStatus?.motor2Latest?.newCandidates ?? '—'}</b><span>nuevos aportados por Motor 2</span></div>
          <div><b>{radarStatus?.motor3Latest?.newCandidates ?? '—'}</b><span>nuevos aportados por Motor 3</span></div>
          <div><b>{radarStatus?.pendingCandidates ?? reviewCount}</b><span>candidatos totales en revisión</span></div>
        </div> : <button className='radarTeaser' onClick={() => void loadCoverage()}><span className='radarTeaserIcon'><Radar /></span><span><b>Radar territorial activo</b><small>La cobertura técnica queda resumida hasta que decidas abrirla.</small></span><ArrowRight /></button>}
        {showCoverage && radarStatus?.socialOverview && <div className='coverageSummary'><div><b>{radarStatus.socialOverview.pending}</b><span>capturas sociales pendientes (muestra)</span></div><div><b>{radarStatus.socialOverview.processed}</b><span>capturas procesadas (muestra)</span></div><div><b>{radarStatus.socialOverview.imagesRead}</b><span>imágenes OCR leídas (muestra)</span></div><div><b>{radarStatus.socialOverview.jobNotices}</b><span>afiches laborales detectados (no publicados necesariamente)</span></div>{radarStatus.socialOverview.hasMore && <small>Existen capturas adicionales fuera de la muestra; los conteos no son totales.</small>}</div>}

        {showCoverage && radarStatus?.territoryCoverage && (
          <div className='territoryMatrix'>
            <div className='territoryMatrixHead'><b>Matriz territorial</b><span>Fuentes oficiales + medios comunitarios por zona. Las brechas quedan visibles para reforzarlas.</span></div>
            <div className='territoryMatrixGrid'>
              {radarStatus.territoryCoverage.map(row => (
                <div className={'territoryRow ' + (row.gap === 'Cobertura base activa' ? 'covered' : 'gap')} key={row.place}>
                  <div><b>{row.place}</b><small>{row.gap}</small></div>
                  <span><strong>{row.officialSources}</strong> oficiales</span>
                  <span><strong>{row.communitySources}</strong> comunitarias</span>
                  <span><strong>{row.automatedSources}</strong> automáticas</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {showCoverage && <div className='coverageGrid'>{(radarStatus?.sources ?? []).map(source => (
          <div className={'coverageCard ' + source.status} key={source.key}>
            <span>{source.status === 'automatic' ? 'AUTOMÁTICA' : source.status === 'active' ? 'DESCUBRIMIENTO' : 'COBERTURA LIMITADA'}</span>
            <b>{source.name}</b><p>{source.note}</p>
            <small>{source.lastChecked ? 'Revisada: ' + new Date(source.lastChecked).toLocaleString('es-CL',{dateStyle:'short',timeStyle:'short'}) : source.mode === 'public_scan' ? 'Primer barrido programado' : 'Revisión por descubrimiento / aporte'}</small>
          </div>
        ))}</div>}
      </section>

      <section className='principle cleanPrinciple'>
        <div><Handshake /><h2>Trabajo Cerca conecta.</h2><p>Quien busca trabajo puede encontrar oportunidades. Quien necesita trabajadores puede encontrar personas. Sin convertirlo en una red social ni en una bolsa de CV.</p></div>
        <div className='safety'><ShieldCheck /><div><b>Simple y seguro</b><span>Nunca pagues por postular ni publiques RUT, claves, cuentas bancarias o direcciones exactas.</span></div></div>
      </section>

      <footer className='cleanFooter'>
        <div className='brand'><div className='brandmark'><img className='tcOfficialBrandIcon' src='/icon-192.png' width='192' height='192' alt='' aria-hidden='true' decoding='async' /></div><div><b>Trabajo Cerca</b><span>PERSONAS ↔ TRABAJO</span></div></div>
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
            {selected.portalPlace && selected.portalPlace !== selected.workLocation && <div className='detailEvidence'><BadgeCheck /><span><b>Ubicación corregida</b><small>El portal la clasificó como {selected.portalPlace}, pero el lugar real detectado es {selected.workLocation}.</small></span></div>}
            <div className='detailSection'><h3>Sobre esta oportunidad</h3><p>{selected.note || 'Sin descripción adicional.'}</p></div>
            <div className='detailFacts'>
              <div><small>Publicado</small><b>{selected.date}</b></div>
              {selected.until && <div><small>Vigencia</small><b>Hasta {selected.until}</b></div>}
              {selected.vacancies && <div><small>Vacantes</small><b>{selected.vacancies}</b></div>}
              {selected.apply && <div><small>Postulación</small><b>{selected.apply}</b></div>}
            </div>
            <div className='detailSource'><BadgeCheck /><div><small>FUENTE ORIGINAL</small><b>{selected.source}</b>{selected.discoveredBy && <small>Detectado por {selected.discoveredBy}</small>}</div></div>
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
