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
  HeartPulse, MapPin, Megaphone, PlusCircle, Radar, Radio, Search, Share2, ShieldCheck, Sparkles,
  Store, TreePine, Truck, UserRoundSearch, Users, Warehouse, Wrench, X
} from 'lucide-react';
import './vnext.css';
import './compact-layout.css';
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
  void api.post('/api/analytics', { event, distinctId:analyticsId(), properties }).catch(() => undefined);
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
  contact?: string;
  contactLabel?: string;
  hasContact?: boolean;
};

const places = ['Todas','Angol','Collipulli','Ercilla','Renaico','Mininco','Nacimiento','Negrete','Mulchén','Los Sauces','Purén','Traiguén','Lumaco','Victoria'];
const travelPlaces = ['Los Ángeles','Victoria','Temuco','Lautaro'];
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

  if (preview) {
    return (
      <div className='modal'>
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
    <div className='modal'>
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

  useEffect(() => {
    if (!auth.isSignedIn()) { setLoading(false); return; }
    api.get('/api/notifications/preferences').then(response => {
      const communes = Array.isArray(response.data.communes) ? response.data.communes.filter((value:string) => selectable.includes(value)) : [];
      if (communes.length) setSelected(communes);
      setKeywords(Array.isArray(response.data.keywords) ? response.data.keywords.join(', ') : '');
      setEnabled(Boolean(response.data.active));
    }).catch(() => undefined).finally(() => setLoading(false));
  }, []);

  const togglePlace = (value:string) => {
    setErrorMessage('');
    setSelected(current => {
      if (current.includes(value)) return current.filter(item => item !== value);
      if (current.length >= 5) { setErrorMessage('Puedes seguir hasta 5 comunas para evitar notificaciones excesivas.'); return current; }
      return [...current, value];
    });
  };
  const parsedKeywords = () => keywords.split(',').map(value => value.trim()).filter(Boolean).slice(0, 8);

  const activate = async () => {
    if (!selected.length) { setErrorMessage('Elige al menos una comuna.'); return; }
    setSaving(true); setErrorMessage('');
    try {
      if (!auth.isSignedIn()) await auth.signIn();
      const guidance = await notifications.getEnableGuidance();
      if (guidance.kind === 'permission_denied' || guidance.kind === 'ios_install_required' || guidance.kind === 'unsupported') {
        setErrorMessage([guidance.message, ...guidance.steps].filter(Boolean).join(' · '));
        return;
      }
      await notifications.subscribe({ showUi:false });
      await api.post('/api/notifications/preferences', { communes:selected, keywords:parsedKeywords() });
      setEnabled(true);
      track('tc_notifications_enabled', { commune:selected.join(' · '), count:selected.length, keyword_count:parsedKeywords().length, surface:'alerts_panel' });
      onSaved('Avisos activados. Te notificaremos solo cuando haya ofertas nuevas y verificadas en tus zonas.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No pudimos activar las notificaciones.';
      setErrorMessage(message.includes('popup') ? 'Necesitamos que completes la identificación del dispositivo para activar los avisos.' : message);
    } finally { setSaving(false); }
  };

  const testNotification = async () => {
    setSaving(true); setErrorMessage('');
    try {
      await api.post('/api/notifications/test');
      track('tc_notifications_test', { commune:selected.join(' · '), surface:'alerts_panel' });
      onSaved('Notificación de prueba enviada. Si no aparece, revisa los permisos de Trabajo Cerca en tu teléfono.');
    } catch { setErrorMessage('No pudimos enviar la prueba. Revisa que los avisos estén habilitados en este dispositivo.'); }
    finally { setSaving(false); }
  };

  const disable = async () => {
    setSaving(true); setErrorMessage('');
    try {
      if (auth.isSignedIn()) await api.delete('/api/notifications/preferences');
      await notifications.unsubscribe({ showUi:false });
      setEnabled(false);
      track('tc_notifications_disabled', { surface:'alerts_panel' });
      onSaved('Avisos desactivados en este dispositivo.');
    } catch { setErrorMessage('No pudimos desactivar los avisos. Intenta nuevamente.'); }
    finally { setSaving(false); }
  };

  return <div className='modal neoAlertsModal' role='dialog' aria-modal='true'>
    <div className='neoAlertsPanel'>
      <button className='neoAlertsClose' onClick={onClose} aria-label='Cerrar'><X /></button>
      <div className='neoAlertsVisual'>
        <img src='https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&fm=webp&q=78&w=1200' alt='' />
        <span className='neoAlertsShade' />
        <div><span><Bell /> ALERTAS TRABAJO CERCA</span><h2>Que la oportunidad te encuentre.</h2><p>Activa avisos y mañana, si aparece algo nuevo y verificado en tu zona, Trabajo Cerca te lo hará saber.</p></div>
      </div>
      <div className='neoAlertsForm'>
        <span className='neoKicker'>TUS ZONAS DE INTERÉS</span>
        <h3>¿Dónde quieres que busquemos por ti?</h3>
        <p>Selecciona hasta 5 comunas. El barrido de la mañana notifica solamente ofertas nuevas, verificadas y vigentes.</p>
        <div className='neoAlertPlaces'>{selectable.map(value => <button key={value} className={selected.includes(value) ? 'active' : ''} onClick={() => togglePlace(value)}>{selected.includes(value) && <CheckCircle />} {value}</button>)}</div>
        <label className='neoAlertKeywords'><span>Cargo u oficio <small>opcional</small></span><input value={keywords} onChange={event => setKeywords(event.target.value)} placeholder='Ej. soldador, conductor, TENS' /></label>
        <div className='neoAlertPromise'><ShieldCheck /><span><b>Sin spam.</b><small>Un resumen cuando haya coincidencias nuevas. No enviamos pistas sin verificar.</small></span></div>
        {errorMessage && <div className='formError'><AlertCircle /> {errorMessage}</div>}
        <div className='neoAlertActions'>
          <button className='neoAlertPrimary' onClick={() => void activate()} disabled={saving || loading}><Bell /> {saving ? 'Guardando…' : enabled ? 'Actualizar mis avisos' : 'Activar avisos'}</button>
          {enabled && <button className='neoAlertTest' onClick={() => void testNotification()} disabled={saving}>Probar ahora</button>}
          {enabled && <button className='neoAlertDisable' onClick={() => void disable()} disabled={saving}>Desactivar</button>}
        </div>
        <small className='neoAlertFoot'>Para enviar notificaciones el dispositivo debe quedar identificado una sola vez. Trabajo Cerca guarda únicamente el identificador técnico y tus intereses seleccionados, no tu contraseña.</small>
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
        <div className='brand'><div className='brandmark'><MapPin /><Radar /></div><div><b>Trabajo Cerca</b><span>PANEL OPERATIVO PRELIMINAR</span></div></div>
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
  const [legalView, setLegalView] = useState<LegalView>(null);
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

  const [revealingContact, setRevealingContact] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [homePlace, setHomePlace] = useState(places.includes(initialPlace) && !travelPlaces.includes(initialPlace) ? initialPlace : 'Todas');
  const [sessionStartedAt] = useState(() => new Date().toISOString());
  const noveltyCutoff=Date.parse(sessionStartedAt)-7*86400000;

  const load = async (cursor?: string, fresh = false) => {
    const append = Boolean(cursor);
    if (append) setLoadingMore(true);
    else setLoading(true);
    setLoadError('');
    try {
      const params = new URLSearchParams({ limit:'40' });
      if (cursor) params.set('cursor', cursor);
      if (fresh) params.set('fresh', '1');
      const response = await api.get('/api/listings?' + params.toString());
      const incoming = response.data.items as Listing[];
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
        if (!append) return incoming;
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
      setLoadError('No pudimos cargar el Radar central. Intenta nuevamente.');
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  };

  useEffect(() => {
    track('tc_app_open', { surface:'pwa_web' });
    void load();
  }, []);
  useEffect(() => {
    if (place !== 'Todas') track('tc_commune_selected', { commune:place });
  }, [place]);
  useEffect(() => {
    if (selected) track('tc_listing_opened', { listing_id:selected.id, kind:selected.kind, commune:selected.workLocation, area:selected.area, origin:selected.origin, verified:selected.verified, review:selected.review });
  }, [selected?.id]);
  useEffect(() => {
    localStorage.setItem('trabajo-cerca-last-visit', sessionStartedAt);
  }, [sessionStartedAt]);
  useEffect(() => {
    const beforeInstall = (event:Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const installed = () => {
      setInstallPrompt(null);
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
      if (section === 'opportunities') return item.kind === 'job_offer' || (item.kind === 'worker_need' && !item.review);
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
      const haystack = [item.title,item.company,item.note,item.workLocation,item.recruitmentZones.join(' '),item.portalPlace || '',item.evidence || '',...item.tags].join(' ').toLocaleLowerCase('es-CL');
      return communeMatch && areaMatch && freshnessMatch && haystack.includes(q.toLocaleLowerCase('es-CL'));
    });
  }, [items, section, place, filterMode, q, area, onlyNew, noveltyCutoff]);

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
  useEffect(() => { exploredCursors.current.clear(); }, [place]);
  useEffect(() => {
    if (!isTravelView || !nextCursor || loading || loadingMore || loadError) return;
    if (exploredCursors.current.has(nextCursor) || exploredCursors.current.size >= 100) return;
    exploredCursors.current.add(nextCursor);
    void load(nextCursor);
  }, [place, isTravelView, nextCursor, loading, loadingMore, loadError]);
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
    if (!travelPlaces.includes(place)) setHomePlace(place);
    setSection('opportunities');
    setFilterMode('work');
    setArea('Todas');
    setQ('');
    setOnlyNew(false);
    setPlace(city);
    track('tc_travel_opened', { commune:city, surface:'travel_corridor' });
    setTimeout(() => document.getElementById('neo-jobs')?.scrollIntoView({ behavior:'smooth' }), 0);
  };

  const installApp = async () => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setNotice('Trabajo Cerca ya está instalada en este dispositivo.');
      return;
    }
    track('tc_install_started', { surface:'internal_campaign', commune:place });
    if (!installPrompt) {
      setNotice('Para instalar, abre el menú de tu navegador y elige “Instalar Trabajo Cerca” o “Agregar a pantalla de inicio”.');
      return;
    }
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const goRadar = (next: Section = 'opportunities') => {
    setSection(next);
    setTimeout(() => document.getElementById('radar')?.scrollIntoView({ behavior:'smooth' }), 0);
  };

  const openFresh = (commune?: string) => {
    setSection('opportunities');
    setFilterMode('work');
    setArea('Todas');
    setQ('');
    setPlace(commune || 'Todas');
    setOnlyNew(true);
    setTimeout(() => document.getElementById('radar')?.scrollIntoView({ behavior:'smooth' }), 0);
  };

  const afterPublish = (kind: Listing['kind']) => {
    void load(undefined, true);
    const next: Section = kind === 'worker_available' ? 'people' : kind === 'worker_need' ? 'needs' : kind === 'service_request' ? 'services' : 'opportunities';
    setSection(next);
    setNotice(kind === 'candidate' ? 'Aviso recibido. Quedó en revisión interna del Radar antes de publicarse.' : 'Publicado. Ya quedó guardado y visible en Trabajo Cerca.');
    setTimeout(() => document.getElementById('radar')?.scrollIntoView({ behavior:'smooth' }), 50);
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
    const url = window.location.href.split('#')[0];
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

  const isVNext = true;
  function openHouseGoal(goal:Goal,attribution:HouseAttribution) {
    setHouseAttribution(attribution);
    if(goal==='professional') {setFlow('ofrezco');}
    else if(goal==='advertiser') {setShowAdvertiser(true);}
    else if(goal==='employer') {setFlow('trabajadores');}
    else {completeHouseGoal('explore');setSection('opportunities');document.getElementById('radar')?.scrollIntoView({behavior:'smooth'});document.getElementById('neo-jobs')?.scrollIntoView({behavior:'smooth'});}
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
      <main className='neoShell'>
        <header className='neoTopbar'>
          <button className='neoBrand' onClick={() => window.scrollTo({ top:0, behavior:'smooth' })}>
            <span className='neoBrandMark'><MapPin /><Radar /></span>
            <span><b>Trabajo Cerca</b><small>PERSONAS ↔ TRABAJO</small></span>
          </button>
          <nav className='neoTopNav' aria-label='Navegación vNext'>
            <button onClick={() => document.getElementById('neo-jobs')?.scrollIntoView({ behavior:'smooth' })}>Descubrir</button>
            <button onClick={() => setFlow('trabajadores')}>Publicar</button>
            <button onClick={() => document.getElementById('neo-radar')?.scrollIntoView({ behavior:'smooth' })}>Radar</button>
            <button onClick={() => document.getElementById('actualidad-laboral')?.scrollIntoView({ behavior:'smooth' })}>Actualidad</button>
          </nav>
          <SiteMenu onAdvertise={()=>setShowAdvertiser(true)} onAlerts={()=>setShowAlerts(true)} onInstall={()=>void installApp()}
            onService={()=>setFlow('servicio')} onContribute={()=>setFlow('aporte')}
            onCities={()=>document.getElementById('tc-other-cities')?.scrollIntoView({behavior:'smooth'})}
            onNews={()=>document.getElementById('actualidad-laboral')?.scrollIntoView({behavior:'smooth'})}
            onPeople={()=>{setSection('people');document.getElementById('neo-jobs')?.scrollIntoView({behavior:'smooth'});}}/>
        </header>

        <section className='neoHero neoHeroReborn' id='neo-home'>
          <div className='neoHeroGlow neoGlowA' />
          <div className='neoHeroGlow neoGlowB' />
          <div className='neoHeroCopy'>
            <h1>Trabajo, servicios y oportunidades<br /><em>cerca de ti.</em></h1>
            <p className='neoHeroLead'>Encuentra empleo, ofrece tus servicios, contrata personas y promociona tu negocio. Fácil, cercano y pensado para nuestras comunas.</p>

            <form className='neoSearchDock' role='search' aria-label='Buscar trabajo por comuna' onSubmit={event=>{event.preventDefault();setSection('opportunities');document.getElementById('neo-jobs')?.scrollIntoView({behavior:'smooth'});}}>
              <Search />
              <input aria-label='Cargo, oficio o empresa para buscar' value={q} onChange={e => setQ(e.target.value)} onFocus={() => setSection('opportunities')} placeholder='¿Qué trabajo buscas?' />
              <label><MapPin /><span className='tcVisuallyHidden'>Comuna de búsqueda</span><select value={place} onChange={e => chooseLocalPlace(e.target.value)}>{isTravelView && <option value={place}>{place} · para viajar</option>}{places.filter(value => !travelPlaces.includes(value)).map(value => <option key={value}>{value}</option>)}</select></label>
              <button type='submit'>Buscar <ArrowRight /></button>
            </form>
            <nav className='tcQuickActions' aria-label='Qué necesitas hacer'>
              <button onClick={()=>{setSection('opportunities');document.getElementById('neo-jobs')?.scrollIntoView({behavior:'smooth'});}}><Search aria-hidden='true'/><span>Buscar trabajo</span></button>
              <button onClick={()=>setFlow('ofrezco')}><UserRoundSearch aria-hidden='true'/><span>Ofrezco mi trabajo u oficio</span></button>
              <button onClick={()=>setFlow('trabajadores')}><Users aria-hidden='true'/><span>Necesito contratar</span></button>
              <button onClick={()=>setShowAdvertiser(true)}><ArrowRight aria-hidden='true'/><span>Promocionar mi negocio</span></button>
            </nav>
            <div className='neoHeroMeta'>
              <span><b>{loading || (loadError && !items.length) ? '…' : place === 'Todas' ? availableJobs : selectedStat.jobs}</b><small>{place === 'Todas' ? 'ofertas publicadas · total del radar' : `ofertas publicadas en ${place}`}</small></span>
              <span><b>{loading ? '…' : recentJobs ?? '…'}</b><small>incorporadas en los últimos 7 días</small></span>
              <span className={'neoLive ' + feedState}><i /> {feedState === 'fresh' ? 'Radar actualizado' : feedState === 'degraded_last_good' ? 'Actualización pendiente' : 'Buscando nuevas'}</span>
            </div>
          </div>

          <div className='neoRadarCanvas neoPhotoHero neoHeroCompact neoHeroVisualReborn' aria-label='Radar territorial visual'>
            <img className='neoHeroPhoto neoHeroPhotoMain' src='https://images.unsplash.com/photo-1772852340517-b11ec88979fc?auto=format&fit=crop&fm=webp&q=72&w=1200' alt='' loading='lazy' />
            <div className='neoPhotoShade' />
            <div className='neoMapMesh' />
            <div className='neoRadarCore'><Radar /><span /></div>
            <div className='neoOrbit neoOrbitOne' />
            <div className='neoOrbit neoOrbitTwo' />
            <div className='neoTown neoTownA'><MapPin /><span>Angol</span></div>
            <div className='neoTown neoTownB'><MapPin /><span>Victoria</span></div>
            <div className='neoTown neoTownC'><MapPin /><span>Nacimiento</span></div>

            <div className='neoCanvasLabel'><span>AHORA EN EL RADAR</span><b>Fuentes locales + oportunidades verificadas</b><small>Imágenes referenciales</small></div>
          </div>
        </section>

        {renderAdvertising('search')}

        {place !== 'Todas' && <section className={'neoCitySnapshot ' + (isTravelView ? 'travel' : '')}>
          <div><span>{isTravelView ? 'TAMBIÉN PUEDO VIAJAR' : 'TU CIUDAD'}</span><b>{place}</b></div>
          <strong>{selectedStat.jobs} {selectedStat.jobs === 1 ? 'oferta publicada' : 'ofertas publicadas'}</strong>
          {selectedStat.newJobs24h > 0 && <em><Sparkles /> {selectedStat.newJobs24h} {selectedStat.newJobs24h === 1 ? 'nueva' : 'nuevas'} en 24 h</em>}
          {isTravelView && homePlace !== 'Todas' && <button onClick={() => chooseLocalPlace(homePlace)}>Volver a {homePlace}</button>}
        </section>}

        {!loading && !loadError && <section className='neoRecentArrivals' aria-label='Nuevas ofertas'>
          <span className='neoRecentIcon'><Sparkles /></span>
          <div><strong>{recentJobs===null ? 'Actualizando el recuento de novedades' : `${recentJobs} ${recentJobs===1 ? 'oferta incorporada' : 'ofertas incorporadas'} en los últimos 7 días`}</strong>
            <p>Se suman al total del radar. Las anteriores siguen publicadas hasta su cierre o vencimiento confirmado.</p>
            {inventoryCounts.recent24h!==null && <small>{inventoryCounts.recent24h} incorporadas en las últimas 24 horas{place!=='Todas' ? ` en ${place}` : ''}.</small>}
          </div>
          <button onClick={() => onlyNew ? setOnlyNew(false) : openFresh()}>{onlyNew ? 'Ver todas las ofertas' : 'Ver novedades'} <ArrowRight /></button>
        </section>}

        {notice && <div className='neoNotice'><CheckCircle /><span>{notice}</span><button onClick={() => setNotice('')}><X /></button></div>}

        <section className='neoDiscover' id='neo-jobs'>
          <div className='neoDiscoverHead'>
            <div><span className='neoKicker'>DESCUBRIR</span><h2>{section === 'opportunities' ? 'Oportunidades que importan.' : section === 'people' ? 'Personas listas para trabajar.' : section === 'needs' ? 'Equipos que necesitan gente.' : 'Servicios de la zona.'}</h2></div>
            <div className='neoCount'><b>{loading ? '…' : visible.length}</b><span>{section === 'opportunities' && place === 'Todas' && !q && area === 'Todas' && !onlyNew ? `mostradas · ${availableJobs} disponibles` : 'resultados'}</span></div>
          </div>

          <div className='neoControlDeck'>
            <div className='neoTabs'>
              <button className={section === 'opportunities' ? 'active' : ''} onClick={() => setSection('opportunities')}><Briefcase /> Empleos</button>
              <button className={'neoPeopleTab ' + (section === 'people' ? 'active' : '')} onClick={() => setSection('people')}><UserRoundSearch /> Personas <b>{people}</b></button>
              <button className={section === 'needs' ? 'active' : ''} onClick={() => setSection('needs')}><Users /> Necesitan gente</button>
              <button className={'neoServiceTab ' + (section === 'services' ? 'active' : '')} onClick={() => setSection('services')}><Wrench /> Servicios</button>
            </div>
            <div className='neoFilters'>
              <label className='neoFilterSearch'><Search /><input value={q} onChange={e => setQ(e.target.value)} placeholder='Cargo, oficio o empresa' /></label>
              <label><MapPin /><span className='tcVisuallyHidden'>Comuna de resultados</span><select value={place} onChange={e => chooseLocalPlace(e.target.value)}>{isTravelView && <option value={place}>{place} · para viajar</option>}{places.filter(value => !travelPlaces.includes(value)).map(value => <option key={value}>{value}</option>)}</select></label>
              <label><Building2 /><span className='tcVisuallyHidden'>Área laboral</span><select value={area} onChange={e => setArea(e.target.value)}>{areas.map(value => <option key={value}>{value}</option>)}</select></label>
              <button className={onlyNew ? 'active' : ''} onClick={() => setOnlyNew(value => !value)}><Sparkles /> Nuevas</button>
            </div>
          </div>

          {loadError && <div className='neoEmpty'><AlertCircle /><b>{loadError}</b><button onClick={() => void load()}>Reintentar</button></div>}

          <div className='neoJobsGrid'>
            {visible.map((item, index) => {
              const own = Boolean(ownerTokens[item.id]);
              return (
                <Fragment key={item.id}><article data-offer-id={item.id} className={'neoJobCard neoKind-' + item.kind + ' ' + (selected?.id === item.id ? 'isSelected' : '')} key={item.id}>
                  <NeoArtwork item={item} />
                  <div className='neoJobBody'>
                    <div className='neoJobTop'>
                      <span className='neoJobPlace'><MapPin /> {item.workLocation}</span>
                      <span className={'neoJobState ' + (item.review || item.revalidationDue ? 'pending' : item.verified ? 'verified' : 'direct')}>{item.review ? 'Por confirmar' : item.revalidationDue ? 'Por revalidar' : item.verified ? 'Verificada' : 'Directa'}</span>
                    </div>
                    <span className='neoJobArea'>{item.area}</span>
                    {isFresh(item) && <span className='neoNewOfferBadge'><Sparkles /> NUEVA EN LA APP</span>}
                    <h3>{item.title}</h3>
                    <p className='neoJobCompany'>{item.company}</p>
                    {item.salary && <strong className='neoSalary'>{item.salary}</strong>}
                    <div className='neoJobFacts'>
                      <span><small>Zona</small><b>{item.recruitmentZones.join(' · ')}</b></span>
                      <span><small>Fuente</small><b>{item.source}</b></span>
                    </div>
                    <div className='neoJobFoot'>
                      <span>{item.date}</span>
                      <button onClick={() => setSelected(item)}>Ver oportunidad <ArrowRight /></button>
                    </div>
                    {own && <div className='neoOwnActions'><button onClick={() => void closeOwn(item)}>Cerrar</button><button onClick={() => void deleteOwn(item)}>Eliminar mis datos</button></div>}
                  </div>
                </article>
                {index === 2 && section === 'opportunities' && renderAdvertising('listing')}
                </Fragment>
              );
            })}
          </div>

          {!loading && visible.length === 0 && !loadError && section !== 'opportunities' && <div className='neoEmpty'><b>{nextCursor ? 'Hay más publicaciones por cargar antes de confirmar esta categoría.' : section === 'people' ? 'Todavía no hay profesionales registrados en esta categoría. ¡Sé de los primeros en ofrecer tus servicios!' : '¿Necesitas personal o un servicio en tu comuna? Publica tu oportunidad.'}</b><button onClick={()=>nextCursor?void load(nextCursor):setFlow(section==='people'?'ofrezco':section==='services'?'servicio':'trabajadores')}>{nextCursor?'Cargar más publicaciones':section==='people'?'Publicar mis servicios':'Publicar una oportunidad'}</button></div>}
          {!loading && visible.length === 0 && !loadError && section === 'opportunities' && <div className='neoEmpty'><Radar /><b>{nextCursor ? 'Hay más ofertas por cargar para completar esta búsqueda.' : 'No hay ofertas que coincidan con esta vista.'}</b><span>Eso no significa que no existan empleos: solo mostramos avisos cuya fuente, vigencia y ubicación logramos confirmar.</span><button onClick={() => nextCursor ? void load(nextCursor) : (setOnlyNew(false),setQ(''),setArea('Todas'))}>{nextCursor ? 'Cargar más ofertas' : 'Ver todas las ofertas'}</button></div>}
          {nextCursor && !loadError && <div className='neoLoadMore'><small>{items.filter(item=>item.kind==='job_offer').length} ofertas cargadas de {availableJobs} publicadas</small><button onClick={() => void load(nextCursor)} disabled={loadingMore}>{loadingMore ? 'Cargando…' : 'Cargar más'} <ArrowRight /></button></div>}
        </section>

        <div id='tc-other-cities'>
        <NearbyCities stats={feedSummary.communeStats} ready={!loading} failed={Boolean(loadError)} current={place}
          onExplore={openTravel} onReturn={() => chooseLocalPlace(homePlace)} origin={homePlace} />
        </div>

        <LaborNewsSection />

        <section className='neoRadarSection' id='neo-radar'>
          <div className='neoRadarPanel'>
            <span className='neoKicker'>RADAR TERRITORIAL · MOTOR 3 CONTROLADO</span>
            <h2>Buscamos donde normalmente<br />tendrías que buscar tú.</h2>
            <p>El foco está en las comunas objetivo: redes públicas, OMIL, radios, diarios comunales, páginas locales, empresas y portales. Las ciudades grandes quedan como movilidad complementaria y no contaminan tu búsqueda local.</p>
            <div className='neoRadarStats'>
              <span><b>{radarStatus?.searchEngines ?? 3}</b><small>motores</small></span>
              <span><b>{people}</b><small>personas disponibles</small></span>
              <span><b>{directNeeds}</b><small>necesitan gente</small></span>
            </div>
            <button onClick={() => void loadCoverage()}>{showCoverage ? 'Ocultar cobertura' : 'Ver cómo funciona el Radar'} <ArrowRight /></button>
          </div>
          <div className='neoRadarVisual'>
            <div className='neoScanLine' />
            <Radar />
            <span className='neoPing p1' /><span className='neoPing p2' /><span className='neoPing p3' /><span className='neoPing p4' />
          </div>
          {showCoverage && radarStatus && <div className='neoCoverageGrid'><article><b>Diagnóstico en vivo</b><span>Datos de producción, no estimaciones</span><small>Los cron exitosos no implican nuevas ofertas.</small></article><article><b>{radarStatus.inventoryDiagnostics?.precargadas ?? '—'}</b><span>Ofertas precargadas verificadas (muestra)</span></article><article><b>{radarStatus.inventoryDiagnostics?.automaticas ?? '—'}</b><span>Ofertas no precargadas verificadas (muestra)</span></article><article><b>{radarStatus.inventoryDiagnostics?.socialPublicadas ?? '—'}</b><span>Ofertas visuales sociales publicadas (muestra)</span></article><article><b>{radarStatus.socialOverview?.pending ?? '—'}</b><span>Capturas sociales pendientes (muestra)</span></article><article><b>{radarStatus.socialOverview?.imagesRead ?? '—'}</b><span>Imágenes leídas por OCR (muestra)</span></article><article><b>{radarStatus.socialOverview?.jobNotices ?? '—'}</b><span>Afiches laborales detectados, no necesariamente publicados</span></article><article><b>Fuentes</b><span>{Object.entries(radarStatus.inventoryDiagnostics?.bySource ?? {}).sort((a,b)=>b[1]-a[1]).map(([name,n])=>name+': '+n).join(' · ') || 'Sin datos'}</span><small>{radarStatus.inventoryDiagnostics?.hasMore || radarStatus.socialOverview?.hasMore ? 'Muestra incompleta; cifras no representan el total.' : 'Registros incluidos en la consulta.'}</small></article></div>}
          {showCoverage && <div className='neoCoverageGrid'>
            {(radarStatus?.territoryCoverage ?? []).map(row => <article key={row.place}><b>{row.place}</b><span>{row.officialSources} oficiales · {row.communitySources} comunitarias</span><small>{row.gap}</small></article>)}
          </div>}
        </section>

        <footer className='neoFooter'>
          <div className='neoBrand'><span className='neoBrandMark'><MapPin /><Radar /></span><span><b>Trabajo Cerca</b><small>PERSONAS ↔ TRABAJO</small></span></div>
          <p>Diseñado para conectar territorio, personas y oportunidades. · trabajocerca.malleco.biobio@gmail.com</p>
          <div><button onClick={() => setLegalView('privacy')}>Privacidad</button><button onClick={() => setLegalView('terms')}>Términos</button></div>
        </footer>

        {!flow && !showAdvertiser && !showAlerts && !legalView && !selected && <nav className='neoMobileNav' aria-label='Navegación móvil'>
          <button onClick={()=>window.scrollTo({top:0,behavior:'smooth'})}><Sparkles aria-hidden='true'/><span>Inicio</span></button>
          <button onClick={()=>{setSection('opportunities');document.getElementById('neo-jobs')?.scrollIntoView({behavior:'smooth'});}}><Search aria-hidden='true'/><span>Buscar</span></button>
          <button onClick={()=>setFlow('ofrezco')}><UserRoundSearch aria-hidden='true'/><span>Ofrecerme</span></button>
          <button onClick={()=>setFlow('trabajadores')}><Users aria-hidden='true'/><span>Contratar</span></button>
        </nav>}

        {selected && (
          <div className='neoDrawerBackdrop' role='presentation' onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}>
            <aside className='neoDrawer' role='dialog' aria-modal='true' aria-label={'Detalle de ' + selected.title}>
              <button className='neoDrawerClose' onClick={() => setSelected(null)} aria-label='Cerrar detalle'><X /></button>
              <NeoArtwork item={selected} />
              <div className='neoDrawerScroll'>
                <div className='neoDrawerHeader'>
                  <div className='neoDrawerBadges'>
                    <span className={'neoJobState ' + (selected.review ? 'pending' : selected.verified ? 'verified' : 'direct')}>{selected.review ? 'Por confirmar' : selected.verified ? 'Verificada' : 'Directa'}</span>
                    <span className='neoDrawerArea'>{selected.area}</span>
                  </div>
                  <h2>{selected.title}</h2>
                  <p>{selected.company}</p>
                  {selected.salary && <strong>{selected.salary}</strong>}
                </div>

                <div className='neoDrawerGrid'>
                  <div><MapPin /><span><small>LUGAR / LOCALIDAD</small><b>{selected.workLocation}</b></span></div>
                  <div><Users /><span><small>ZONA</small><b>{selected.recruitmentZones.join(' · ')}</b></span></div>
                  <div><Radio /><span><small>PUBLICADO</small><b>{selected.date}</b></span></div>
                  <div><BadgeCheck /><span><small>FUENTE</small><b>{selected.source}</b></span></div>
                </div>

                {selected.portalPlace && selected.portalPlace !== selected.workLocation && <div className='neoDrawerEvidence'><BadgeCheck /><span><b>Ubicación corregida</b><small>El portal la clasificó como {selected.portalPlace}; el lugar real detectado es {selected.workLocation}.</small></span></div>}

                <div className='neoDrawerSection'>
                  <span className='neoKicker'>DETALLE</span>
                  <h3>Sobre esta oportunidad</h3>
                  <p>{selected.note || 'Sin descripción adicional.'}</p>
                </div>

                <div className='neoDrawerActions'>
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

        {showAlerts && <AlertsPanel defaultPlace={place === 'Todas' ? homePlace : place} onClose={() => setShowAlerts(false)} onSaved={message => { setNotice(message); setShowAlerts(false); }} />}

        {showAdvertiser && <AdvertiserPanel initialCommune={place} attribution={houseAttribution} onClose={() => {setShowAdvertiser(false);setHouseAttribution(null);}} onSent={() => setNotice('Solicitud registrada para revisión. La promoción y su duración se confirmarán al aprobar el anuncio. Tu contacto no fue publicado.')} />}

        {legalView && <div className='modal legalModal' role='dialog' aria-modal='true' aria-labelledby='legal-dialog-title' tabIndex={-1}> 
          <div className='panel legalPanel'>
            <button className='close' onClick={() => setLegalView(null)} aria-label='Cerrar'><X /></button>
            <span className='lab'>TRABAJO CERCA · PILOTO</span>
            {legalView === 'privacy' ? <>
              <h2 id='legal-dialog-title'>Privacidad y tus datos</h2>
              <p className='legalLead'>Trabajo Cerca usa únicamente la información necesaria para conectar personas con trabajo y proteger las publicaciones.</p>
              <h3>Qué datos tratamos</h3><p>Si publicas directamente, usamos los datos que ingresas para mostrar la publicación y facilitar el contacto. No solicitamos CV, RUT, dirección exacta, claves, datos bancarios ni datos sensibles.</p>
              <h3>Contacto protegido</h3><p>El teléfono o WhatsApp no forma parte del listado público masivo y se revela solamente mediante una acción explícita.</p>
              <h3>Avisos personalizados</h3><p>Si activas notificaciones, el sistema requiere identificar el dispositivo/usuario una vez y guarda únicamente un identificador técnico, las comunas y los cargos u oficios que elijas. No usamos esta función para crear perfiles publicitarios personales.</p>
              <h3>Tus derechos</h3><p>Para consultas, correcciones o solicitudes sobre tus datos puedes escribir a trabajocerca.malleco.biobio@gmail.com. La identificación legal completa del responsable se incorporará antes del lanzamiento público.</p>
            </> : <>
              <h2 id='legal-dialog-title'>Términos de uso</h2>
              <p className='legalLead'>Trabajo Cerca conecta personas y oportunidades. No es una agencia de reclutamiento y no garantiza contratación.</p>
              <h3>Publicaciones</h3><p>La información publicada debe ser verdadera, pertinente y lícita. Se retiran avisos vencidos, duplicados, dudosos o denunciados.</p>
              <h3>Publicidad</h3><p>Los espacios comerciales se identifican claramente. Pagar por visibilidad nunca modifica la verificación ni el orden de una oferta laboral.</p>
            </>}
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
              {places.filter(value => !travelPlaces.includes(value)).map(value => <option key={value} value={value}>{value === 'Todas' ? 'Todas las comunas' : value}</option>)}
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
          <button className={section === 'opportunities' ? 'active' : ''} onClick={() => setSection('opportunities')}><Briefcase /> Empleos</button>
          <button className={section === 'people' ? 'active' : ''} onClick={() => setSection('people')}><UserRoundSearch /> Personas</button>
          <button className={section === 'needs' ? 'active' : ''} onClick={() => setSection('needs')}><Users /> Necesitan gente</button>
          <button className={section === 'services' ? 'active' : ''} onClick={() => setSection('services')}><Wrench /> Servicios</button>
        </div>

        {section === 'opportunities' && <div className='sourceOverview' style={{padding:'14px',marginBottom:'14px',background:'var(--surface, #fff)',border:'1px solid #dce5dd',borderRadius:'14px'}}><b>Ofertas por fuente</b><p style={{fontSize:'12px',margin:'5px 0'}}>Distribución de avisos locales cargados. Los Ángeles y Temuco se consultan por separado. Si hay más páginas pendientes, las cifras son parciales.</p><div style={{display:'flex',flexWrap:'wrap',gap:'8px'}}>{sourceCounts.map(([source,count])=><span key={source} style={{padding:'7px 10px',borderRadius:'10px',background:'#eef3ef',fontSize:'12px'}}>{source}: <b>{count}</b></span>)}</div></div>}
        <div className='filterPanel'>
          <div className='searchBox stitchSearch'>
            <Search />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder='Cargo, oficio o empresa' />
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
            <button className={onlyNew ? 'active' : ''} onClick={() => setOnlyNew(value => !value)}><Sparkles /> {onlyNew ? 'Solo novedades' : 'Ver solo novedades'}</button>
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
        <div className='brand'><div className='brandmark'><MapPin /><Radar /></div><div><b>Trabajo Cerca</b><span>PERSONAS ↔ TRABAJO</span></div></div>
        <div className='footerLegal'><button onClick={() => setLegalView('privacy')}>Privacidad y tus datos</button><button onClick={() => setLegalView('terms')}>Términos de uso</button><span>Piloto territorial · Malleco y Biobío norte · trabajocerca.malleco.biobio@gmail.com</span></div>
      </footer>

      <nav className='bottomNav' aria-label='Navegación principal'>
        <button onClick={() => window.scrollTo({top:0,behavior:'smooth'})}><Briefcase /><span>Inicio</span></button>
        <button onClick={() => document.getElementById('novedades')?.scrollIntoView({behavior:'smooth'})}><Sparkles /><span>Novedades</span></button>
        <button className='publishNav' onClick={() => setFlow('trabajadores')}><PlusCircle /><span>Publicar</span></button>
        <button onClick={() => goRadar('people')}><UserRoundSearch /><span>Personas</span></button>
        <button onClick={() => document.getElementById('radar')?.scrollIntoView({behavior:'smooth'})}><Search /><span>Buscar</span></button>
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
          {legalView === 'privacy' ? <>
            <h2 id='legal-dialog-title'>Privacidad y tus datos</h2>
            <p className='legalLead'>Versión preliminar para el piloto. Durante esta etapa, el responsable del tratamiento será la persona natural titular del proyecto Trabajo Cerca. El canal oficial de contacto es trabajocerca.malleco.biobio@gmail.com; la identificación legal completa se incorporará antes del lanzamiento público.</p>
            <h3>Responsable durante el piloto</h3><p>Trabajo Cerca opera actualmente como proyecto de una persona natural, no como sociedad constituida. El correo oficial del proyecto es trabajocerca.malleco.biobio@gmail.com. La identificación legal completa del responsable sigue pendiente de incorporación antes de abrir el servicio al público general.</p>
            <h3>Qué datos tratamos</h3><p>Si publicas directamente, usamos solo los datos que ingresas para conectar personas con trabajo: nombre o nombre abreviado, oficio/cargo, comuna, zonas de disponibilidad, descripción y contacto. Si un negocio solicita información para anunciar, tratamos nombre comercial, comuna, rubro y un contacto comercial para responderle. No solicitamos CV, RUT, dirección exacta, claves, datos bancarios ni datos sensibles.</p>
            <h3>Para qué</h3><p>Para mostrar tu publicación, facilitar contactos laborales, moderar abusos, mantener la vigencia y permitirte cerrar o eliminar el aviso.</p>
            <h3>Contacto protegido</h3><p>El teléfono o WhatsApp no se incluye en la descarga masiva del listado. Se entrega solo cuando una persona abre un aviso y solicita ver el contacto.</p>
            <h3>Conservación y control</h3><p>Las publicaciones directas caducan automáticamente. Desde el mismo dispositivo puedes cerrarlas o eliminarlas definitivamente antes. Los avisos aportados al Radar se revisan antes de publicarse.</p>
            <h3>Fuentes externas</h3><p>El Radar también trabaja con información laboral publicada por empresas, organismos públicos, OMIL, medios y otras fuentes lícitas. Conservamos la fuente y evitamos reproducir datos personales innecesarios.</p>
            <h3>Tus derechos</h3><p>El diseño contempla acceso, corrección y eliminación de datos. Para consultas o solicitudes puedes escribir a trabajocerca.malleco.biobio@gmail.com. Esta versión del laboratorio no debe considerarse todavía el aviso legal definitivo.</p>
            <p className='legalFoot'>Referencia normativa: Ley 19.628 y reforma introducida por Ley 21.719, con vigencia diferida al 1 de diciembre de 2026. La versión final será revisada antes de publicación.</p>
          </> : <>
            <h2 id='legal-dialog-title'>Términos de uso</h2>
            <p className='legalLead'>Trabajo Cerca conecta personas y oportunidades. No es una agencia de reclutamiento, no selecciona candidatos y no garantiza contratación.</p>
            <h3>Publicaciones</h3><p>Quien publica debe entregar información verdadera, pertinente y lícita. Está prohibido publicar estafas, cobros por postular, servicios sexuales, claves, datos bancarios, información sensible innecesaria o contenido que vulnere derechos de terceros.</p>
            <h3>Ofertas externas</h3><p>Los avisos provenientes de terceros mantienen su fuente. La vigencia, requisitos y contratación final dependen del empleador o fuente original. Trabajo Cerca puede retirar avisos vencidos, duplicados, dudosos o denunciados.</p>
            <h3>Seguridad</h3><p>Nunca pagues por postular ni entregues claves, códigos de seguridad o datos bancarios. Verifica siempre la identidad del empleador antes de compartir información adicional.</p>
            <h3>Publicidad y patrocinio</h3><p>Los espacios comerciales estarán identificados claramente como publicidad o patrocinio. Pagar por visibilidad comercial no modifica la verificación, vigencia ni orden de una oferta laboral. Buscar trabajo seguirá siendo gratuito para las personas.</p>
            <h3>Disponibilidad</h3><p>Este servicio está en fase piloto y puede cambiar mientras se realizan pruebas de capacidad, seguridad y cumplimiento antes del lanzamiento público.</p>
          </>}
        </div>
      </div>}

      {flow && <FormPanel flow={flow} attribution={houseAttribution} onClose={() => {setFlow(null);setHouseAttribution(null);}} onPublished={afterPublish} />}
    </main>
  );
}

export default App;

