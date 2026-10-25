import {sendPosthogEvent,ANALYTICS_PROPERTY_KEYS} from './analytics-delivery';
import {createHash} from 'node:crypto';
import {recordUsageEvent,readUsageMetrics} from './usage-metrics';
import {getAlertPreference,saveAlertPreference,disableAlertPreference,runNotificationDispatch} from './notification-dispatch';
import {PRIMARY_PLACES,COMPLEMENTARY_PLACES,WORK_PLACES} from '../shared/territories';
import {withSecurityHeaders} from './security-headers';
import {COMMERCIAL_PLACES} from '../shared/commercial-policy';
import {ownedPublicationPatch} from '../shared/owned-publication';
import { advertisingCatalog, saveHouseConfiguration, uploadHouseCreative, houseClientEvent, houseDashboard, houseConversion, trialApplications, activateFreeTrial, commercialAdmin, commercialCampaigns, publicPromotion, commercialInventory, commercialClientEvent, commercialMetrics } from './house-marketing';
import { db, router, json, error, secrets, storage, ai, notifications, requireAuth, requireAdminEmailAllowlist } from '@appdeploy/sdk';
import { adminBackupPage } from './admin-backup';
import { recheckPriority } from '../shared/offer-public-state';
import { confirmedOfferDeadline, offerRetentionReason, offerRecheckDue, latestOfferCheckAt } from './offer-retention';
import { advancePublicFeed, readPublicFeedPage, readPublicFeedItem, readPublicFeedEntry, readPublicFeedSummary, publicFeedProgress, trackedFeedAdd, trackedFeedUpdate, trackedFeedDelete } from './public-feed';
import { isOriginalVerificationSlot } from './verification-schedule';
import { readLocalSourceEvidence } from './local-source-evidence';
import { captionSocialFinding, socialPosterFinding, originalSocialDate, prepareSocialEvidence, socialSourceDate, socialVerificationBlock, sameSocialPost, type SocialEvidence } from './social-evidence';
import { storeSocialFindings, hydrateSocialFindings } from './social-evidence-store';
import { socialExplicitClosure } from './social-evidence';
import { checkSocialApplication } from './social-application';
import { publicSourceAdapter, publicJobExclusion } from './public-source-adapters';
import { knownFirstPublication } from './first-publication';
import { evaluatePublicJob, type PublicVerification } from './public-source-verifier';
import { fetchPublicPage } from './public-source-http';
import { freePublicSourceStatus, runFreePublicSources, verifiedPublicRecord, type FreeSource } from './free-public-sources';
import { pullRadarBatch, confirmRadarPublications, externalRadarStatus, revalidateLocalContactOffers, type VerifiedOffer } from './radar-ingestion';
import { revalidateReviewedDocuments, documentRevalidationStatus } from './document-revalidation';
import { reviewedReceiver } from './reviewed-receiver';
import { SECURITY_POLICY, denyRemoteCapabilities, checkedLegacyFetch, opaqueOwnerToken } from './security-policy';
import { publicQuota } from './security-quota';

const guardedAi = denyRemoteCapabilities(ai);
const fetch = checkedLegacyFetch;


type SeedJob = {
  title: string;
  company: string;
  place: string;
  recruit: string;
  area: string;
  status: 'Nueva' | 'Activa' | 'Por vencer';
  date: string;
  until?: string;
  vacancies?: number;
  apply: 'Sencilla' | 'Intermedia' | 'Extensa';
  source: string;
  sourceDomain: string;
  url?: string;
  note: string;
  salary?: string;
  tags: string[];
  visual: string;
  icon: string;
  portalPlace?: string;
  evidence?: string;
  contact?: string;
  contactLabel?: string;
  contactPublicationConsent?:boolean;
  contactConsentAt?:string;
  review?: boolean;
};

type ListingRecord = {
  seedKey?: string;
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
  expiresAt?: string;
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
  evidenceImagePath?: string;
  review: boolean;
  verified: boolean;
  verificationCheckedAt?: string;
  verificationReason?: string;
  verificationMethod?: string;
  verificationVersion?: string;
  enrichmentCheckedAt?: string;
  radarJobId?: string;
  verifiedAt?: string;
  firstVerifiedAt?: string;
  lastVerifiedAt?: string;
  lastSeenAt?: string;
  evidenceSources?: string[];
  active: boolean;
  createdAt: string;
  contact?: string;
  contactLabel?: string;
  contactPublicationConsent?:boolean;
  contactConsentAt?:string;
  ownerToken?: string;
  socialEvidence?: SocialEvidence;
  sourceValidThrough?:string | null;
  validityMethod?:string;
};

type SourceRecord = {
  key: string;
  name: string;
  family: string;
  mode: 'public_scan' | 'discovery' | 'community';
  status: 'automatic' | 'active' | 'limited';
  scanUrl?: string;
  priority?: 'A+' | 'A' | 'B' | 'C' | 'D';
  cadenceHours?: number;
  territories: string[];
  note: string;
  active: boolean;
  updatedAt: string;
};

type SourceAudit = {
  sourceKey: string;
  checkedAt: string;
  status: 'ok' | 'blocked' | 'error';
  linksSeen: number;
  candidatesFound: number;
  newCandidates: number;
  refreshedExisting?: number;
  skippedUnchanged?: number;
  message?: string;
};

type SourceScanState = {
  id?: string;
  sourceKey: string;
  fingerprint: string;
  lastCheckedAt: string;
  lastChangedAt: string;
  lastLinksSeen: number;
  lastCandidatesFound: number;
};

type GrowthCampaign = {
  businessName: string;
  category: string;
  headline: string;
  detail: string;
  communes: string[];
  url?: string;
  startAt: string;
  endAt: string;
  status: 'active' | 'paused';
  label: 'Publicidad local' | 'Patrocinado';
  priority: number;
  createdAt: string;
};

type AdvertiserLead = {
  businessName: string;
  commune: string;
  category: string;
  presence: string;
  contact: string;
  note: string;
  source: 'self_service';
  status: 'new';
  createdAt: string;
};

type SocialDraft = {
  sourceId: string;
  place: string;
  title: string;
  text: string;
  channel: 'facebook_instagram';
  status: 'draft';
  createdAt: string;
};

type NotificationPreference = {
  id?: string;
  userId: string;
  communes: string[];
  keywords: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type NotificationDispatchState = {
  lastRunAt: string;
  updatedAt: string;
};

const ANALYTICS_EVENTS = new Set([
  'tc_app_open', 'tc_commune_selected', 'tc_listing_opened', 'tc_contact_revealed',
  'tc_external_offer_click', 'tc_listing_shared', 'tc_sponsor_impression', 'tc_sponsor_click',
  'tc_sponsor_viewable_impression', 'tc_photo_tip_submitted', 'tc_advertiser_interest_submitted', 'tc_install_started', 'tc_app_installed', 'tc_travel_opened',
  'tc_install_prompt_available', 'tc_install_prompt_accepted', 'tc_install_prompt_dismissed',
  'tc_notifications_enabled', 'tc_notifications_disabled', 'tc_notifications_test',
]);


type RateBucket = { windowStart:number; count:number };
const rateBuckets = new Map<string, RateBucket>();

function cleanClientToken(value: unknown) {
  const candidate = normalizeText(value).slice(0, 160);
  return /^[A-Za-z0-9_-]{12,160}$/.test(candidate) ? candidate : '';
}

function allowBurst(scope:string, clientToken:string, limit:number, windowMs:number) {
  const now = Date.now();
  if (rateBuckets.size > 5000) {
    for (const [key, bucket] of rateBuckets) {
      if (now - bucket.windowStart > 86400000) rateBuckets.delete(key);
    }
  }
  const key = `${scope}:${clientToken}`;
  const current = rateBuckets.get(key);
  if (!current || now - current.windowStart >= windowMs) {
    rateBuckets.set(key, { windowStart:now, count:1 });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

function cleanAnalyticsProperties(input: unknown): Record<string, string | number | boolean> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const cleaned: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!ANALYTICS_PROPERTY_KEYS.has(key)) continue;
    if (typeof value === 'string') cleaned[key] = value.slice(0, 160);
    else if (typeof value === 'boolean') cleaned[key] = value;
    else if (typeof value === 'number' && Number.isFinite(value)) cleaned[key] = value;
  }
  return cleaned;
}

async function relayAnalytics(event: string, distinctId: string, properties: Record<string, string | number | boolean>) {
  if (!SECURITY_POLICY.externalAnalytics) return false;
  const enabled=await secrets.readSecret('POSTHOG_ENABLE_INGESTION').catch(()=> '');
  if(enabled!=='free-tier-confirmed')return false;
  const projectKey=await secrets.readSecret('POSTHOG_PROJECT_KEY');
  if(!projectKey)return false;
  return sendPosthogEvent(projectKey,event,distinctId,properties);
}

const SEED_VERSION = '2026-10-06-v17-live-benchmark';
const SOURCE_VERSION = '2026-10-06-radar-v17-web-discovery';
const PILOT:string[] = [...PRIMARY_PLACES];
const TRAVEL_HUBS = COMPLEMENTARY_PLACES;
const MARKET_PLACES = WORK_PLACES;
const SOURCE_HUBS = ['Los Ángeles','Temuco','Lautaro','Concepción','Chillán'] as const;
const CORE_CORRIDORS = {
  mallecoWest:['Angol','Renaico','Collipulli','Mininco','Ercilla'],
  mallecoEast:['Victoria','Traiguén','Lumaco','Purén','Los Sauces'],
  biobioNorth:['Nacimiento','Negrete','Mulchén'],
} as const;

function sourceSlug(value:string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-CL').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function chileTrabajosSource(place:string, travel=false): Omit<SourceRecord, 'updatedAt'> {
  return {
    key:`chiletrabajos-${travel ? 'travel' : 'core'}-${sourceSlug(place)}`,
    name:`ChileTrabajos · ${place}`,
    family:'Portal laboral directo',
    mode:'public_scan',
    status:'automatic',
    scanUrl:`https://www.chiletrabajos.cl/encuentra-un-empleo/?2=${encodeURIComponent(place)}&f=2`,
    priority:'B',
    cadenceHours:24,
    territories:[place],
    note:travel ? `Mercado de movilidad secundario: avisos recientes asociados a ${place}.` : `Fuente directa prioritaria para descubrir avisos recientes asociados a ${place}.`,
    active:true,
  };
}

const LABOR_TERMS = [
  'oferta laboral','oportunidad laboral','empleo','vacante','trabajo','pega','pituto','cupos','contratacion','reclutamiento','postulacion','reemplazo','turno','temporada','faena','obra','cosecha','packing','personal para','se necesita','se busca','se contrata','buscamos personal','buscamos gente','necesitamos personal','recepcion de cv','enviar cv','disponibilidad inmediata',
  'jornalero','jornal','temporero','cosechero','podador','motosierrista','desbrozador','roce','tractorista','ordeñador','agricola','trabajador agricola','operario agricola','capataz','mayordomo','cuidador de parcela','forestal','brigadista','viverista','aserradero','astillador','silvicultura',
  'maestro','maestro primera','maestro segunda','ayudante','jornal construccion','carpintero','albanil','enfierrador','soldador','oxicortista','herrero','cerrajero','gasfiter','electricista','electrico','electromecanico','instrumentista','mecanico','mecanico automotriz','mecanico industrial','mantenedor','tornero','fresador','montajista','rigger','senalero','paletero','topografo','ito','fto','prevencionista','supervisor','jefe de faena',
  'conductor','chofer','pioneta','peoneta','repartidor','delivery','operador','operador maquinaria','retroexcavadora','excavadora','grua horquilla','camion pluma','camion tolva','camion aljibe','bodeguero','auxiliar bodega','picker','reponedor','inventario','despachador','logistica','cargador',
  'cajero','vendedor','promotor','reponedor','mercaderista','visual merchandising','atencion cliente','ejecutivo ventas','guardia','vigilante','conserje','nochero','auxiliar aseo','aseador','copero','garzon','garzona','cocinero','cocinera','ayudante cocina','manipulador alimentos','panadero','pastelero','barista','recepcionista','mucama','gobernanta',
  'asesora de hogar','asesor de hogar','nana','cuidador adulto mayor','cuidadora adulto mayor','cuidador de adultos','cuidador de menores','cuidadora de ninos','babysitter','tens','enfermero','enfermera','tecnico enfermeria','paramedico','auxiliar farmacia','quimico farmaceutico','kinesiologo','fonoaudiologo','terapeuta ocupacional','psicologo','trabajador social','educador diferencial','tecnico parvulos','parvularia',
  'tecnico','tecnico electrico','tecnico mecanico','tecnico mantenimiento','tecnico telecomunicaciones','tecnico informatico','soporte tecnico','administrativo','secretaria','asistente administrativo','digitador','contador','analista','ingeniero','ingeniero civil','ingeniero electrico','ingeniero mecanico','ingeniero forestal','ingeniero industrial','constructor civil','arquitecto','dibujante tecnico','docente','profesor','director','coordinador','jefe','subjefe','subgerente','administrador contrato','inspector','fiscalizador','encargado calidad','planificador','programador','operador planta','instrumentacion','automatizacion',
  'zapatero','talabartero','tapicero','mueblista','vidriero','pintor','jardinero','paisajista','peluquero','barbero','manicurista','costurera','modista','sastre','fotografo','cuidador','auxiliar','junior','estafeta',
  'recolector residuos','recolector basura','reciclador','pescador','artesano','operador cnc','maquinista','armador','calderero','canero','soldador tig','soldador mig','vulcanizador','desabollador','pintor automotriz','lavador vehiculos','lubricador','carnicero','fiambrero','maestro panadero','maestro pastelero','bartender','copero','anfitrion','botones','conserje noche','cuidador nocturno','medico','dentista','asistente dental','tecnologo medico','matrona','nutricionista','terapeuta','educador parvulos','asistente educacion','inspector patio','psicopedagogo','bibliotecario','abogado','asesor legal','community manager','disenador grafico','desarrollador','programador web','analista datos','soporte ti','tecnico redes','tecnico fibra optica','instalador','instalador sanitario','instalador solar','operador caldera','operador sala control','control calidad','laboratorista','muestreador','bodeguero nocturno','preparador pedidos','estibador','gruero','digitador','cobrador','ejecutivo comercial','ejecutivo atencion','encuestador','promotor terreno','recaudador'
] as const;
const NEARBY: Record<string,string[]> = {
  Angol:['Renaico','Collipulli','Los Sauces'],
  Collipulli:['Mininco','Angol','Renaico','Ercilla'],
  Ercilla:['Collipulli','Victoria','Traiguén'],
  Renaico:['Angol','Collipulli','Mininco','Negrete'],
  Mininco:['Collipulli','Renaico'],
  Nacimiento:['Negrete','Mulchén'],
  Negrete:['Nacimiento','Renaico','Mulchén'],
  Mulchén:['Negrete','Nacimiento'],
  'Los Sauces':['Angol','Purén','Traiguén'],
  Purén:['Los Sauces','Lumaco','Traiguén'],
  Traiguén:['Victoria','Lumaco','Purén','Los Sauces'],
  Lumaco:['Purén','Traiguén','Los Sauces'],
  Victoria:['Ercilla','Traiguén','Collipulli'],
};
const FREE_LOCAL_SOURCES:FreeSource[] = [
  { key:'omil-angol', name:'Municipalidad / OMIL Angol', url:'https://noticias.angol.cl/index.php/noticias', territory:'Angol' },
  { key:'omil-lumaco', name:'Municipalidad / OMIL Lumaco', url:'https://www.munilumaco.cl/', territory:'Lumaco' },
  { key:'omil-los-sauces', name:'Municipalidad / OMIL Los Sauces', url:'https://www.munilossauces.cl/noticias', territory:'Los Sauces' },
  { key:'omil-traiguen', name:'Municipalidad / OMIL Traiguén', url:'https://mtraiguen.cl/direccion-de-fomento-productivo/', territory:'Traiguén' },
  { key:'omil-renaico', name:'Municipalidad / OMIL Renaico', url:'https://municipalidadrenaico.cl/concursos-publicos/', territory:'Renaico' },
  { key:'omil-nacimiento', name:'Municipalidad / OMIL Nacimiento', url:'https://www.nacimiento.cl/noticias', territory:'Nacimiento' },
  { key:'omil-negrete', name:'Municipalidad / OMIL Negrete', url:'https://www.muninegrete.cl/', territory:'Negrete' },
  { key:'omil-mulchen', name:'Municipalidad / OMIL Mulchén', url:'https://www.munimulchen.cl/?s=oferta+laboral', territory:'Mulchén' },
  { key:'omil-collipulli', name:'Municipalidad / OMIL Collipulli', url:'https://municipalidadcollipulli.cl/concursos-publicos/', territory:'Collipulli' },
  { key:'malleco7', name:'Malleco 7', url:'https://www.malleco7.cl/', territory:'Malleco' },
  { key:'malleco7-ediciones', name:'Malleco 7 · ediciones digitales', url:'https://www.malleco7.cl/ediciones-digitales-malleco7/', territory:'Malleco' },
  { key:'radio-nativa', name:'Radio Nativa', url:'https://www.radionativa.cl/', territory:'Lumaco' },
  { key:'cmpc-empleo-csod', name:'CMPC · portal de empleo', url:'https://cmpc.csod.com/ux/ats/careersite/4/home?c=cmpc', territory:'zona forestal' },
  { key:'arauco-empleo', name:'Arauco · portal de empleo', url:'https://jobs.arauco.com/Chile/search/', territory:'zona forestal' },
];
const FREE_PORTAL_SEARCHES = [
  { key:'indeed', name:'Indeed', search:'https://cl.indeed.com/jobs?q=&l={place}&fromage=45' },
  { key:'computrabajo', name:'Computrabajo', search:'https://cl.computrabajo.com/trabajo-en-{slug}' },
  { key:'linkedin', name:'LinkedIn', search:'https://www.linkedin.com/jobs/search/?keywords=&location={place}%2C%20Chile&f_TPR=r3888000' },
  { key:'laborum', name:'Laborum', search:'https://www.laborum.cl/empleos-busqueda-{slug}.html' },
  { key:'opcionempleo', name:'Opción Empleo', search:'https://www.opcionempleo.cl/empleo-en-{slug}.html' },
  { key:'chiletrabajos', name:'ChileTrabajos', search:'https://www.chiletrabajos.cl/encuentra-un-empleo/?2={place}' },
];
const FREE_TARGET_TOWNS = PRIMARY_PLACES;
const FREE_PUBLIC_SOURCES:FreeSource[] = (() => {
  const searches = FREE_TARGET_TOWNS.flatMap(place => FREE_PORTAL_SEARCHES.map(portal => ({
    key:portal.key+'-'+place, name:portal.name+' · '+place, territory:place,
    url:portal.search.replace('{place}',encodeURIComponent(place)).replace('{slug}',place.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,'-')),
  })));
  const secondary = COMPLEMENTARY_PLACES.flatMap(place => FREE_PORTAL_SEARCHES.map(portal => ({
    key:portal.key+'-secondary-'+place, name:portal.name+' · '+place, territory:place, discoveryPriority:'secondary' as const, discoveryGroup:'portal' as const,
    url:portal.search.replace('{place}',encodeURIComponent(place)).replace('{slug}',sourceSlug(place)),
  })));
  const result:FreeSource[] = [...secondary];
  for (let index=0;index<Math.max(FREE_LOCAL_SOURCES.length,searches.length);index++) {
    if (FREE_LOCAL_SOURCES[index]) result.push({ ...FREE_LOCAL_SOURCES[index], discoveryGroup:'local' });
    if (searches[index]) result.push(searches[index]);
  }
  result.push({ key:'bne-negrete-pilot-2026-109726',name:'Bolsa Nacional de Empleo · Negrete',url:'https://www.bne.gob.cl/oferta/2026-109726',territory:'Negrete',bootstrap:true });
  result.push({ key:'bne',name:'Bolsa Nacional de Empleo',url:'https://www.bne.gob.cl/ofertas',territory:'territorio piloto' });
  result.push({ key:'radio-viaducto',name:'Radio Viaducto',url:'https://radioviaducto.cl/',territory:'Collipulli',discoveryGroup:'local' });
  result.push({ key:'las-noticias-malleco',name:'Las Noticias de Malleco',url:'https://lasnoticiasdemalleco.cl/',territory:'Malleco',discoveryGroup:'local' });
  result.push({ key:'ssan-indice',name:'Servicio de Salud Araucanía Norte',url:'https://ssan.redsalud.gob.cl/trabaje-con-nosotros/',territory:'Malleco',discoveryGroup:'local' });
  result.push({ key:'negrete-feed',name:'Municipalidad de Negrete · novedades',url:'https://www.muninegrete.cl/feed/',territory:'Negrete',discoveryGroup:'local' });
  result.push({ key:'mulchen-feed',name:'Municipalidad de Mulchén · novedades',url:'https://www.munimulchen.cl/?feed=rss2&s=oferta+laboral',territory:'Mulchén',discoveryGroup:'local' });
  result.push({ key:'empleos-publicos',name:'Servicio Civil · Empleos Públicos',url:'https://www.empleospublicos.cl/pub/convocatorias/convocatorias.aspx',territory:'Chile',discoveryGroup:'portal' });
  return result;
})();

const SOURCE_DEFS: Omit<SourceRecord, 'updatedAt'>[] = [
  ...PILOT.map(place => chileTrabajosSource(place, false)),
  ...TRAVEL_HUBS.map(place => chileTrabajosSource(place, true)),
  { key:'portal-empleo-biobio', name:'Portal Empleo Biobío', family:'Portal laboral territorial', mode:'public_scan', status:'automatic', scanUrl:'https://portalempleobiobio.cl/', priority:'A', cadenceHours:12, territories:['Los Ángeles'], note:'Portal territorial que publica ofertas laborales de la Región del Biobío y declara actualización diaria.', active:true },
  { key:'cvtrabajos-los-angeles', name:'CV Trabajos · Los Ángeles', family:'Página local de empleo', mode:'public_scan', status:'automatic', scanUrl:'https://cvtrabajos.github.io/trabajo-en-los-angeles/', priority:'A', cadenceHours:12, territories:['Los Ángeles'], note:'Página laboral territorial vinculada a Instagram; se rastrea directamente para reutilizar sus avisos sin redescubrir la fuente.', active:true },
  { key:'omil-los-angeles-ofertas', name:'OMIL Los Ángeles · Ofertas', family:'OMIL y municipios', mode:'public_scan', status:'automatic', scanUrl:'https://sites.google.com/losangeles.cl/omil-losangeles/ofertas-laborales', priority:'A+', cadenceHours:8, territories:['Los Ángeles'], note:'Canal oficial de ofertas OMIL Los Ángeles; complementa BNE y los canales de difusión de la oficina.', active:true },
  { key:'los-angeles-trabaja', name:'Municipalidad de Los Ángeles · Trabaja con Nosotros', family:'OMIL y municipios', mode:'public_scan', status:'automatic', scanUrl:'https://www.losangeles.cl/trabaja-con-nosotros/', priority:'A', cadenceHours:12, territories:['Los Ángeles'], note:'Concursos y procesos de selección vigentes de la Municipalidad y servicios asociados.', active:true },
  { key:'omil-temuco-portal', name:'OMIL Temuco · Portal de Empleo', family:'OMIL y municipios', mode:'public_scan', status:'automatic', scanUrl:'https://temuco.omil.cl/', priority:'A+', cadenceHours:8, territories:['Temuco'], note:'Portal oficial de empleo OMIL Temuco; la municipalidad informa actualización diaria de ofertas.', active:true },
  { key:'omil-concepcion', name:'OMIL Concepción', family:'OMIL y municipios', mode:'public_scan', status:'automatic', scanUrl:'https://concepcion.cl/informacion-e-inscripciones-en-linea-omil/', priority:'A', cadenceHours:12, territories:['Concepción'], note:'Canal municipal OMIL para vacantes, postulantes y procesos de intermediación laboral.', active:true },
  { key:'omil-chillan-ofertas', name:'OMIL Chillán · Ofertas laborales', family:'OMIL y municipios', mode:'public_scan', status:'automatic', scanUrl:'https://www.municipalidadchillan.cl/sitio/menu/tramites/ofertas-laborales.php', priority:'A', cadenceHours:12, territories:['Chillán'], note:'Página municipal de ofertas laborales y acceso a información OMIL Chillán.', active:true },
  { key:'omil-mulchen-web', name:'OMIL / Municipalidad de Mulchén', family:'OMIL y municipios', mode:'public_scan', status:'automatic', scanUrl:'https://www.munimulchen.cl/?s=oferta+laboral', priority:'A+', cadenceHours:8, territories:['Mulchén'], note:'Búsqueda municipal específica de ofertas laborales y llamados difundidos por OMIL Mulchén.', active:true },
  { key:'omil-angol-web', name:'OMIL / Municipalidad de Angol', family:'OMIL y municipios', mode:'public_scan', status:'automatic', scanUrl:'https://noticias.angol.cl/index.php/noticias', territories:['Angol'], note:'Prensa municipal pública: llamados, vacantes, OMIL y reclutamientos.', active:true },
  { key:'collipulli-web', name:'Municipalidad de Collipulli', family:'OMIL y municipios', mode:'public_scan', status:'automatic', scanUrl:'https://municipalidadcollipulli.cl/', territories:['Collipulli','Mininco'], note:'Sitio municipal público y publicaciones vinculadas a UDEL/OMIL.', active:true },
  { key:'collipulli-concursos', name:'Collipulli · concursos públicos', family:'OMIL y municipios', mode:'public_scan', status:'automatic', scanUrl:'https://municipalidadcollipulli.cl/concursos-publicos/', territories:['Collipulli','Mininco'], note:'Convocatorias municipales y cargos públicos.', active:true },
  { key:'ercilla-web', name:'Municipalidad de Ercilla', family:'OMIL y municipios', mode:'public_scan', status:'automatic', scanUrl:'https://muniercilla.cl/', territories:['Ercilla'], note:'Portal municipal con concursos públicos y convocatorias laborales.', active:true },
  { key:'renaico-concursos', name:'Municipalidad de Renaico · concursos', family:'OMIL y municipios', mode:'public_scan', status:'automatic', scanUrl:'https://municipalidadrenaico.cl/concursos-publicos/', territories:['Renaico'], note:'Concursos y convocatorias municipales de Renaico.', active:true },
  { key:'puren-concursos', name:'Municipalidad de Purén · concursos', family:'OMIL y municipios', mode:'public_scan', status:'automatic', scanUrl:'https://munipuren.cl/llamados-a-concurso-2026/', territories:['Purén'], note:'Página pública de concursos; cada hallazgo entra primero como candidato.', active:true },
  { key:'lumaco-web', name:'Municipalidad de Lumaco', family:'OMIL y municipios', mode:'public_scan', status:'automatic', scanUrl:'https://www.munilumaco.cl/', territories:['Lumaco'], note:'Portal municipal público con OMIL, noticias y concursos.', active:true },
  { key:'victoria-omil', name:'Victoria · OMIL', family:'OMIL y municipios', mode:'public_scan', status:'automatic', scanUrl:'https://victoriachile.cl/category/omil/', territories:['Victoria'], note:'Categoría pública OMIL/UDEL del municipio de Victoria.', active:true },
  { key:'traiguen-web', name:'Municipalidad de Traiguén · Fomento/OMIL', family:'OMIL y municipios', mode:'public_scan', status:'automatic', scanUrl:'https://mtraiguen.cl/direccion-de-fomento-productivo/', territories:['Traiguén'], note:'Dirección de Fomento Productivo y OMIL de Traiguén.', active:true },
  { key:'nacimiento-noticias', name:'Municipalidad de Nacimiento', family:'OMIL y municipios', mode:'public_scan', status:'automatic', scanUrl:'https://www.nacimiento.cl/noticias', territories:['Nacimiento'], note:'Noticias municipales públicas; filtramos señales de empleo y OMIL.', active:true },
  { key:'negrete-web', name:'Municipalidad de Negrete · OMIL', family:'OMIL y municipios', mode:'public_scan', status:'automatic', scanUrl:'https://www.muninegrete.cl/', territories:['Negrete'], note:'Portal municipal público con OMIL y convocatorias.', active:true },
  { key:'los-sauces-noticias', name:'Municipalidad de Los Sauces', family:'OMIL y municipios', mode:'public_scan', status:'automatic', scanUrl:'https://www.munilossauces.cl/noticias', territories:['Los Sauces'], note:'Noticias públicas municipales; buscamos concursos y llamados laborales.', active:true },
  { key:'motor-tavily', name:'Tavily · barrido de brechas', family:'Motor complementario', mode:'discovery', status:'active', territories:MARKET_PLACES, note:'Motor complementario de baja frecuencia. Ya no compite a diario con las fuentes directas: revisa semanalmente brechas y oportunidades que la red territorial pudiera haber omitido.', active:true },
  { key:'motor-territorial-controlled', name:'Radar Web Territorial', family:'Motor Social/Local', mode:'discovery', status:'automatic', priority:'A+', cadenceHours:2, territories:PILOT, note:'Motor 3.3: descubrimiento web territorial rotativo por comuna; la matriz directa queda como segunda capa y la verificación/publicación se ejecuta aparte.', active:true },
  { key:'los-angeles-bridge', name:'Los Ángeles · ciudad fuente', family:'Fuente complementaria', mode:'discovery', status:'active', territories:PILOT, note:'Ciudad fuente: solo aporta avisos cuyo lugar real de trabajo o reclutamiento corresponda a una comuna objetivo.', active:true },
  { key:'temuco-bridge', name:'Temuco · ciudad fuente', family:'Fuente complementaria', mode:'discovery', status:'active', territories:PILOT, note:'Ciudad fuente regional. Se descartan avisos cuyo destino real no corresponda a una comuna objetivo de Trabajo Cerca.', active:true },
  { key:'concepcion-bridge', name:'Concepción · ciudad fuente', family:'Fuente complementaria', mode:'discovery', status:'active', territories:PILOT, note:'Ciudad fuente regional para empleadores y portales que reclutan hacia Biobío norte y Malleco; no entra como territorio objetivo.', active:true },
  { key:'chillan-bridge', name:'Chillán · ciudad fuente', family:'Fuente complementaria', mode:'discovery', status:'active', territories:PILOT, note:'Ciudad fuente complementaria; solo se conservan avisos con destino explícito en una comuna objetivo.', active:true },
  { key:'bne', name:'Bolsa Nacional de Empleo', family:'Portales y bolsas', mode:'discovery', status:'active', territories:PILOT, note:'Fuente prioritaria; se contrasta cada oportunidad con su publicación original.', active:true },
  { key:'chiletrabajos', name:'ChileTrabajos', family:'Portales y bolsas', mode:'discovery', status:'active', territories:PILOT, note:'Descubrimiento amplio; la ciudad del portal nunca reemplaza el lugar real del trabajo.', active:true },
  { key:'aggregators', name:'Indeed · Jooble · Jobsora · KitEmpleo', family:'Agregadores', mode:'discovery', status:'active', territories:PILOT, note:'Sirven para descubrir; Trabajo Cerca intenta rastrear el origen y deduplicar.', active:true },
  { key:'laborum', name:'Laborum', family:'Portales y bolsas', mode:'discovery', status:'active', territories:PILOT, note:'Fuente de descubrimiento para cargos operativos, técnicos, administrativos y profesionales.', active:true },
  { key:'trabajando', name:'Trabajando.com', family:'Portales y bolsas', mode:'discovery', status:'active', territories:PILOT, note:'Portal adicional de búsqueda; se valida siempre el destino real del trabajo.', active:true },
  { key:'local-job-pages', name:'Páginas locales de datos laborales', family:'Redes y comunidad', mode:'community', status:'active', territories:PILOT, note:'Incluye páginas pequeñas y cuentas locales de empleo, por ejemplo Trabaja Los Ángeles, cuando sus publicaciones son públicas/indexables o llegan mediante aporte comunitario.', active:true },
  { key:'computrabajo', name:'Computrabajo', family:'Portales y bolsas', mode:'discovery', status:'limited', territories:PILOT, note:'Fuente importante con barreras técnicas de acceso automatizado; cobertura se audita por rutas alternativas.', active:true },
  { key:'social-public', name:'Facebook · Instagram · TikTok públicos', family:'Redes sociales', mode:'community', status:'limited', territories:PILOT, note:'Busca contenido público/indexable, incluidos posts, reels, videos y avisos públicos de Marketplace cuando el buscador puede indexarlos. El contenido privado se incorpora solo mediante aporte comunitario o Compartir → Trabajo Cerca.', active:true },
  { key:'linkedin', name:'LinkedIn', family:'Redes profesionales', mode:'discovery', status:'limited', territories:PILOT, note:'Usado para descubrir/verificar enlaces públicos, sin scraping automatizado no autorizado.', active:true },
  { key:'mi-mininco', name:'Mi Mininco', family:'Medios y comunidad local', mode:'community', status:'active', territories:['Mininco','Collipulli'], note:'Página comunitaria hiperlocal. Sus avisos laborales se contrastan con OMIL, empresa u organismo antes de marcarlos como verificados.', active:true },
  { key:'radio-mininco', name:'Radio Mininco', family:'Medios y comunidad local', mode:'community', status:'active', territories:['Mininco','Collipulli'], note:'Medio local prioritario para detectar ofertas que circulan primero en la comunidad. Sin scraping no autorizado: se incorporan mediante evidencia pública o aporte.', active:true },
  { key:'teleangol', name:'Teleangol Radio', family:'Medios y comunidad local', mode:'community', status:'active', territories:['Angol','Renaico','Collipulli','Los Sauces','Purén','Lumaco','Traiguén'], note:'Medio regional con cobertura en varias comunas de Malleco; se usa como ruta de descubrimiento comunitario.', active:true },
  { key:'radio-montecarlo-angol', name:'Radio Montecarlo Sur · Angol', family:'Medios y comunidad local', mode:'community', status:'active', territories:['Angol'], note:'Radio local de Angol incorporada a la matriz para detectar avisos y llamados comunitarios.', active:true },
  { key:'radio-surena-collipulli', name:'Radio Sureña · Collipulli', family:'Medios y comunidad local', mode:'public_scan', status:'automatic', scanUrl:'https://www.radiodelsur.cl/', priority:'A', cadenceHours:12, territories:['Collipulli','Mininco','Ercilla'], note:'Radio y medio territorial con web pública; rastreo directo de publicaciones y señales laborales de Collipulli, Mininco y Ercilla.', active:true },
  { key:'millaray-collipulli', name:'Radio Millaray · Collipulli', family:'Medios y comunidad local', mode:'community', status:'active', territories:['Collipulli','Mininco'], note:'Radio local con presencia web/Facebook; ruta de descubrimiento comunitario.', active:true },
  { key:'radio-ercilla', name:'Radio Ercilla 106.7 FM', family:'Medios y comunidad local', mode:'community', status:'active', territories:['Ercilla'], note:'Medio local de Ercilla registrado para ampliar avisos hiperlocales.', active:true },
  { key:'renaico-fm', name:'Renaico FM', family:'Medios y comunidad local', mode:'community', status:'active', territories:['Renaico'], note:'Radio local de Renaico con noticias y contenido comunal; fuente prioritaria de señales laborales.', active:true },
  { key:'radio-nativa-lumaco', name:'Radio Nativa · Lumaco', family:'Medios y comunidad local', mode:'public_scan', status:'automatic', scanUrl:'https://www.radionativa.cl/', priority:'A', cadenceHours:12, territories:['Lumaco','Purén','Traiguén'], note:'Radio territorial con web pública y redes; rastreo directo de publicaciones laborales e hiperlocales de Lumaco y comunas cercanas.', active:true },
  { key:'radio-victoria', name:'Radio Victoria', family:'Medios y comunidad local', mode:'community', status:'active', territories:['Victoria'], note:'Radio local de Victoria incorporada al Radar comunitario.', active:true },
  { key:'radio-colonos-victoria', name:'Radio Los Colonos · Victoria', family:'Medios y comunidad local', mode:'community', status:'active', territories:['Victoria'], note:'Medio local de Victoria con presencia social; ruta de descubrimiento de avisos locales.', active:true },
  { key:'millaray-puren-sauces', name:'Millaray Radio · Purén / Los Sauces', family:'Medios y comunidad local', mode:'community', status:'active', territories:['Purén','Los Sauces'], note:'Radio territorial que cubre Purén y Los Sauces; se usa para descubrir avisos comunitarios.', active:true },
  { key:'cordialisima-sauces', name:'Radio Cordialísima · Los Sauces', family:'Medios y comunidad local', mode:'community', status:'active', territories:['Los Sauces','Purén'], note:'Radio comunitaria/local incorporada a la matriz de Los Sauces y Purén.', active:true },
  { key:'alfarero-nacimiento', name:'El Alfarero Radio · Nacimiento', family:'Medios y comunidad local', mode:'community', status:'active', territories:['Nacimiento'], note:'Radio local de Nacimiento con presencia web/social, incorporada como fuente comunitaria.', active:true },
  { key:'dinastia-mulchen', name:'Radio Dinastía · Mulchén', family:'Medios y comunidad local', mode:'community', status:'active', territories:['Mulchén'], note:'Radio local de Mulchén con presencia web/Facebook; ruta complementaria a OMIL.', active:true },
  { key:'community', name:'Radio local · páginas comunitarias · WhatsApp · carteles · otra IA', family:'Comunidad', mode:'community', status:'active', territories:PILOT, note:'Capa hiperlocal complementaria a los tres motores. Los aportes se contrastan antes de considerarse verificados.', active:true },
];
const seedJobs: SeedJob[] = [

 {title:'Conductor',company:'Empresa de distribución',place:'Angol',recruit:'Angol',area:'Transporte/Logística',status:'Nueva',date:'28 sep',apply:'Intermedia',source:'ChileTrabajos',sourceDomain:'chiletrabajos.cl',url:'https://www.chiletrabajos.cl/ciudad/angol.html',note:'Traslado y entrega de mercadería entre bodegas y sucursales. Licencia vigente y experiencia previa.',tags:['conductor','chofer','logística','licencia'],visual:'transport',icon:'truck'},
 {title:'Asistente Dental Full Time',company:'Red de clínicas odontológicas',place:'Angol',recruit:'Angol',area:'Salud/Cuidados',status:'Nueva',date:'25 sep',apply:'Intermedia',source:'ChileTrabajos',sourceDomain:'chiletrabajos.cl',url:'https://www.chiletrabajos.cl/encuentra-un-empleo/?2=angol',note:'Oportunidad full time en atención odontológica publicada recientemente para Angol.',tags:['dental','salud','asistente'],visual:'health',icon:'health'},
 {title:'Psicólogo/a Clínico · Comuna de Ercilla',company:'Confidencial',place:'Ercilla',recruit:'Ercilla',area:'Salud/Cuidados',status:'Nueva',date:'23 sep',until:'7 dic',apply:'Sencilla',source:'ChileTrabajos',sourceDomain:'chiletrabajos.cl',url:'https://www.chiletrabajos.cl/trabajo/psicologo-a-clinico-comuna-de-ercilla-3902679',note:'Modalidad freelance para intervenciones individuales y grupales. Residencia en Ercilla es requisito excluyente.',tags:['psicólogo','ercilla','freelance','salud'],visual:'health',icon:'health'},
 {title:'Trabajador/a Social · Comuna de Ercilla',company:'Confidencial',place:'Ercilla',recruit:'Ercilla',area:'Profesionales/Técnicos',status:'Nueva',date:'23 sep',until:'7 dic',apply:'Sencilla',source:'ChileTrabajos',sourceDomain:'chiletrabajos.cl',url:'https://www.chiletrabajos.cl/trabajo/trabajador-a-social-comuna-ercilla-3902639',note:'Modalidad freelance para actividades e intervenciones grupales. Residencia en Ercilla es requisito excluyente.',tags:['trabajador social','ercilla','freelance','profesional'],visual:'field',icon:'map'},
 {title:'Jefe de Turno · Centro de Distribución',company:'Talentfinder',place:'Victoria',recruit:'Victoria y alrededores',area:'Transporte/Logística',status:'Nueva',date:'27 sep',until:'11 dic',apply:'Intermedia',source:'ChileTrabajos',sourceDomain:'chiletrabajos.cl',url:'https://www.chiletrabajos.cl/trabajo/jefe-de-turno-3904674',note:'Liderazgo y coordinación de operación diaria en centro de distribución de Victoria.',salary:'$850.000 informado',tags:['jefe turno','logística','victoria','distribución'],visual:'warehouse',icon:'warehouse'},
 {title:'Fiscalizador Técnico de Obras (FTO)',company:'Inspecciones Ildygardy EIRL',place:'Angol y Victoria',recruit:'Angol · Victoria',area:'Construcción',status:'Nueva',date:'21 sep',apply:'Intermedia',source:'ChileTrabajos',sourceDomain:'chiletrabajos.cl',url:'https://www.chiletrabajos.cl/ciudad/angol.html',note:'Fiscalización técnica de obras para territorio Angol–Victoria.',tags:['fto','obras','construcción','inspección'],visual:'construction',icon:'build'},
 {title:'Operador/a de Astillador · Planta de Astillado',company:'Forestal Antilemu Ltda',place:'Angol',recruit:'Angol',area:'Forestal',status:'Activa',date:'26 ago',until:'7 oct',vacancies:6,apply:'Intermedia',source:'Bolsa Nacional de Empleo',sourceDomain:'bne.gob.cl',url:'https://www.bne.gob.cl/oferta/2026-099161',note:'Operación segura de equipos de astillado. Requiere experiencia comprobable de 2 años.',tags:['forestal','astillador','operador','maquinaria'],visual:'forest',icon:'forest'},
 {title:'Jefe/a de Tienda',company:'ABC S.A.',place:'Collipulli',recruit:'Collipulli',area:'Comercio/Ventas',status:'Activa',date:'21 sep',until:'16 nov',vacancies:1,apply:'Intermedia',source:'Indeed · origen BNE',sourceDomain:'indeed.com',url:'https://cl.indeed.com/q-collipulli-empleos.html',note:'Gestión integral de tienda, liderazgo de equipo e indicadores comerciales.',salary:'$910.001–$1.060.000',tags:['jefatura','retail','ventas','tienda'],visual:'retail',icon:'retail'},
 {title:'Prevencionista de Riesgos · Planta Mininco',company:'Aramark',place:'Mininco · Collipulli',recruit:'Collipulli y alrededores',area:'Industria/Mantenimiento',status:'Nueva',date:'25 sep',apply:'Intermedia',source:'Kit Empleo',sourceDomain:'kitempleo.cl',url:'https://www.kitempleo.cl/empleo/105615927/prevencionista-de-riesgos-planta-mininco-turno-lunes-a-viernes-renta-1-000-000-liquido-aramark-collipulli',note:'Prevención de riesgos laborales en planta Mininco. Jornada lunes a viernes.',salary:'$1.000.000 líquido informado',tags:['prevención','riesgos','mininco','aramark'],visual:'industry',icon:'build'},
 {title:'Verificador/a de Domicilios en Terreno',company:'Rocketpin',portalPlace:'Angol',evidence:'El título del aviso indica Renaico y el trabajo exige desplazarse dentro de esa comuna.',place:'Renaico',recruit:'Renaico y sectores cercanos',area:'Servicios',status:'Activa',date:'3 sep',until:'17 nov',apply:'Sencilla',source:'ChileTrabajos',sourceDomain:'chiletrabajos.cl',url:'https://www.chiletrabajos.cl/trabajo/verificador-a-de-domicilios-en-terreno-renaico-3893607',note:'Trabajo part time flexible en terreno. Requiere Android, internet y locomoción propia.',tags:['terreno','verificador','part time','renaico'],visual:'field',icon:'map'},
 {title:'Cajeros/as Peaje Coihue',company:'O & C Servicios Generales SpA',place:'Negrete · Coihue',recruit:'Negrete · sector Coihue',area:'Servicios',status:'Activa',date:'15 sep',until:'17 nov',vacancies:20,apply:'Intermedia',source:'Bolsa Nacional de Empleo',sourceDomain:'bne.gob.cl',url:'https://www.bne.gob.cl/oferta/2026-109726',note:'Turnos rotativos. Transporte contemplado; publicación exige residencia en Negrete/Coihue.',salary:'$590.000 líquido full time informado',tags:['cajero','peaje','turnos','negrete'],visual:'toll',icon:'retail'},
 {title:'Mecánico Automotriz · rubro forestal',company:'Empresa en Nacimiento',place:'Nacimiento',recruit:'Nacimiento',area:'Industria/Mantenimiento',status:'Nueva',date:'16 sep',apply:'Sencilla',source:'ChileTrabajos',sourceDomain:'chiletrabajos.cl',url:'https://www.chiletrabajos.cl/trabajo/mecanico-automotriz-nacimiento-3899926',note:'Mantención preventiva y correctiva de vehículos y equipos. Formación técnica y licencia B.',tags:['mecánico','automotriz','forestal','mantenimiento'],visual:'mechanic',icon:'car'},
 {title:'Mecánico/a Soldador/a · rubro forestal',company:'Empresa en Nacimiento',place:'Nacimiento',recruit:'Nacimiento',area:'Oficios',status:'Nueva',date:'16 sep',apply:'Sencilla',source:'ChileTrabajos',sourceDomain:'chiletrabajos.cl',url:'https://www.chiletrabajos.cl/encuentra-un-empleo?8=Empresa+en+Nacimiento',note:'Oportunidad de oficio técnico en empresa del rubro forestal.',tags:['soldador','mecánico','forestal','oficio'],visual:'mechanic',icon:'build'},
 {title:'Brigadistas · Jefaturas · Motosierristas CONAF',company:'CONAF · temporada 2026–2027',place:'Mulchén / convocatoria nacional',recruit:'Postulación asistida por OMIL Mulchén',area:'Forestal',status:'Activa',date:'sep 2026',apply:'Sencilla',source:'Municipalidad de Mulchén · OMIL',sourceDomain:'munimulchen.cl',url:'https://www.munimulchen.cl/oferta-laboral-convocatoria-conaf-temporada-2026-2027/',note:'Convocatoria temporada de incendios: brigadistas, jefes de brigada/cuadrilla y motosierristas.',tags:['conaf','brigadista','motosierrista','forestal','temporada'],visual:'fire',icon:'fire'},
 {title:'Profesional Área Construcción · Oficina Técnica',company:'Empresa de ingeniería',place:'Mulchén',recruit:'Mulchén',area:'Construcción',status:'Nueva',date:'sep 2026',apply:'Sencilla',source:'Municipalidad de Mulchén · OMIL',sourceDomain:'munimulchen.cl',url:'https://www.munimulchen.cl/oferta-laboral-profesional-area-construccion-oficina-tecnica-mulchen/',note:'Constructor Civil, Ingeniero Constructor, Ingeniero Civil OO.CC. o Arquitecto. Experiencia superior a 5 años.',tags:['constructor','ingeniero','arquitecto','oficina técnica'],visual:'construction',icon:'build'},
 {title:'Coordinador/a Visual Merchandising',company:'ABC S.A.',place:'Traiguén',recruit:'Traiguén',area:'Comercio/Ventas',status:'Nueva',date:'22 sep',until:'17 nov',vacancies:1,apply:'Intermedia',source:'Bolsa Nacional de Empleo',sourceDomain:'bne.gob.cl',url:'https://www.bne.gob.cl/oferta/2026-112312',note:'Diseño y supervisión de exhibiciones, apoyo a operación de tienda y jefatura.',tags:['visual','merchandising','retail','diseño'],visual:'retail',icon:'palette'},
 {title:'Auxiliar de Farmacia',company:'Farmacias del Dr. Simi',place:'Purén',recruit:'Purén',area:'Salud/Cuidados',status:'Activa',date:'verificada 24 sep',apply:'Intermedia',source:'Indeed',sourceDomain:'indeed.com',url:'https://cl.indeed.com/l-pur%C3%A9n%2C-araucan%C3%ADa-empleos.html',note:'Atención y orientación de clientes en sucursal de Purén. Requiere certificación SEREMI.',tags:['farmacia','auxiliar','salud','purén'],visual:'health',icon:'health'},
 {title:'Auxiliar de Bodega · Licencia D',company:'Talentfinder / Infruta',place:'Victoria',recruit:'Victoria y alrededores',area:'Transporte/Logística',status:'Nueva',date:'24 sep',apply:'Intermedia',source:'ChileTrabajos',sourceDomain:'chiletrabajos.cl',url:'https://www.chiletrabajos.cl/trabajo/auxiliar-de-bodega-victoria-licencia-d-3903500',note:'Recepción, almacenamiento, despacho e inventarios. Turnos rotativos.',salary:'$660.000 líquidos aprox. informado',tags:['bodega','licencia d','logística','victoria'],visual:'warehouse',icon:'warehouse'},
 {title:'TENS · Cuidados domiciliarios (publicación reciente)',company:'Layner',portalPlace:'Temuco',evidence:'Título y descripción dicen explícitamente TENS en Lumaco.',place:'Lumaco',recruit:'Lumaco',area:'Salud/Cuidados',status:'Nueva',date:'23 sep',until:'7 dic',apply:'Sencilla',source:'ChileTrabajos',sourceDomain:'chiletrabajos.cl',url:'https://www.chiletrabajos.cl/trabajo/tens-para-cuidados-pacientes-domiciliarios-lumaco-3902931',note:'Nueva publicación para atención domiciliaria en Lumaco, aunque el portal la clasifica como Temuco.',tags:['tens','lumaco','temuco','salud'],visual:'health',icon:'health'},
 {title:'Educadora Diferencial · Reemplazo',company:'Liceo Agrícola de Negrete',portalPlace:'Los Ángeles',evidence:'La descripción declara: Lugar de trabajo: Liceo Agrícola de Negrete.',place:'Negrete',recruit:'Negrete y alrededores',area:'Profesionales/Técnicos',status:'Activa',date:'1 sep',until:'15 nov',apply:'Intermedia',source:'ChileTrabajos',sourceDomain:'chiletrabajos.cl',url:'https://www.chiletrabajos.cl/trabajo/educadora-diferencial-3755360',note:'Reemplazo de 38 horas semanales en el Liceo Agrícola de Negrete.',tags:['educadora','diferencial','negrete','educación'],visual:'field',icon:'map'},
 {title:'Supervisor Técnico de Obra',company:'Aguas Andinas / Ecoriles',portalPlace:'Los Ángeles',evidence:'El título del aviso identifica explícitamente Mulchén como destino del cargo.',place:'Mulchén',recruit:'Mulchén y alrededores',area:'Construcción',status:'Nueva',date:'21 sep',apply:'Intermedia',source:'ChileTrabajos',sourceDomain:'chiletrabajos.cl',url:'https://www.chiletrabajos.cl/encuentra-un-empleo/?13=&14=&2=&5=&8=Aguas+Andinas&categoria=&filterSearch=Buscar',note:'Cargo técnico de obra para Mulchén detectado dentro de resultados clasificados por el portal como Los Ángeles.',tags:['supervisor','obra','mulchén','ecoriles'],visual:'construction',icon:'build'},
 {title:'Vendedor Empresas · Sucursal Angol',company:'Ferretería Madesur',place:'Angol',recruit:'Angol y alrededores',area:'Comercio/Ventas',status:'Nueva',date:'sep 2026',apply:'Sencilla',source:'LinkedIn · Ferretería Madesur',sourceDomain:'linkedin.com',url:'https://cl.linkedin.com/jobs/view/vendedor-empresa-at-ferreter%C3%ADa-madesur-4440158674',note:'Cargo presencial de lunes a sábado. La publicación indica tres vacantes de Vendedor Empresas para Parral, San Carlos y Angol.',tags:['vendedor','ventas','madesur','angol','se busca','vacante'],visual:'retail',icon:'retail'},
 {title:'Inquilino · Labores agrícolas y cuidado de parcela',company:'Empleador difundido por OMIL Mulchén',place:'Mulchén · sector Malven',recruit:'Mulchén y alrededores',area:'Agricultura',status:'Nueva',date:'postulación desde 26 sep',apply:'Sencilla',source:'Municipalidad de Mulchén · OMIL',sourceDomain:'munimulchen.cl',url:'https://www.munimulchen.cl/oferta-laboral-labores-agricolas-y-cuidado-de-parcela/',note:'Labores agrícolas y cuidado de parcela. Puede postular una persona o matrimonio; se ofrece casa y contrato de trabajo. Postulación hasta completar cupo.',tags:['agrícola','campo','inquilino','parcela','se requiere','mulchén'],visual:'field',icon:'map'},
 {title:'Cosecheros/as · Temporada 2026–2027',company:'Agrícola S&A Rinconada',place:'Negrete · Fundo Santa Ana de Rihue',recruit:'Renaico · Negrete y comunas cercanas',area:'Agricultura',status:'Nueva',date:'captura reciente',apply:'Sencilla',source:'OMIL Renaico · Facebook · aporte al Radar',sourceDomain:'facebook.com',review:true,contact:'+56981588792',contactLabel:'Contacto general de Agrícola S&A Rinconada · consultar vigencia y forma de postulación',evidence:'El teléfono está publicado por la empresa en su sitio web oficial. No está confirmado como número exclusivo de reclutamiento.',note:'Aviso de reclutamiento agrícola de temporada detectado en OMIL Renaico. La empresa confirma operación de arándanos en Negrete y contratación desde múltiples comunas de Biobío y La Araucanía. El contacto disponible es general de la empresa: úsalo para consultar si el proceso sigue vigente y cómo postular.',tags:['cosecha','cosechero','temporada','arándanos','agrícola','reclutamiento','renaico','negrete'],visual:'field',icon:'map'},
 {title:'Maestro Liniero',company:'Empresa difundida por OMIL Renaico',place:'Ubicación por confirmar',recruit:'Renaico',area:'Electricidad/Energía',status:'Nueva',date:'captura reciente',apply:'Sencilla',source:'OMIL Renaico · Facebook · aporte al Radar',sourceDomain:'facebook.com',review:true,contact:'+56452598300',contactLabel:'OMIL Renaico · consultar vigencia y empresa contratante',evidence:'SENCE publica a OMIL Renaico en Comercio 287, teléfono 45 259 8300. No se ha confirmado aún que ese teléfono sea el canal específico de esta vacante.',note:'Aviso laboral detectado en la página de OMIL Renaico. El Radar conserva Renaico como zona de reclutamiento y no inventa el lugar de faena mientras no exista confirmación adicional. OMIL Renaico puede orientar sobre vigencia, empresa y forma de postulación.',tags:['maestro liniero','liniero','electricidad','energía','se necesita','renaico'],visual:'construction',icon:'build'},
 {title:'Prevencionista de Riesgos · Planta de Astillado',company:'Forestal Antilemu Ltda',place:'Angol',recruit:'Angol',area:'Forestal',status:'Activa',date:'26 ago',until:'7 oct',vacancies:1,apply:'Intermedia',source:'Bolsa Nacional de Empleo',sourceDomain:'bne.gob.cl',url:'https://www.bne.gob.cl/oferta/2026-099187',note:'Prevención de riesgos en nueva planta de astillado. Requiere formación del área y experiencia comprobable en plantas de astillado.',tags:['prevencionista','forestal','astillado','angol','seguridad'],visual:'forest',icon:'forest'},
 {title:'Operador/a de Grúa · Planta de Astillado',company:'Forestal Antilemu Ltda',place:'Angol',recruit:'Angol',area:'Forestal',status:'Activa',date:'26 ago',until:'7 oct',vacancies:6,apply:'Intermedia',source:'Bolsa Nacional de Empleo',sourceDomain:'bne.gob.cl',url:'https://www.bne.gob.cl/oferta/2026-099182',note:'Operación de grúa sobre camión y autopropulsada en planta de astillado, con experiencia y acreditación para los equipos.',tags:['grúa','operador','forestal','astillado','angol'],visual:'forest',icon:'forest'},
 {title:'Jefe/a de Turno · Planta de Astillado',company:'Forestal Antilemu Ltda',place:'Angol',recruit:'Angol',area:'Forestal',status:'Activa',date:'26 ago',until:'7 oct',vacancies:1,apply:'Intermedia',source:'Bolsa Nacional de Empleo',sourceDomain:'bne.gob.cl',url:'https://www.bne.gob.cl/oferta/2026-099150',note:'Supervisión y coordinación de turno en nueva planta de astillado. Requiere experiencia en operación y liderazgo de equipos.',tags:['jefe turno','forestal','astillado','supervisión','angol'],visual:'forest',icon:'forest'},
 {title:'Ejecutivo/a Omnicanal · Líder Bci',company:'Líder Bci',place:'Angol',recruit:'Angol',area:'Comercio/Ventas',status:'Activa',date:'15 sep',until:'13 oct',vacancies:1,apply:'Intermedia',source:'Bolsa Nacional de Empleo',sourceDomain:'bne.gob.cl',url:'https://www.bne.gob.cl/oferta/2026-109382',note:'Venta y asesoría de productos financieros para sucursal Angol durante periodo de verano.',tags:['ventas','financiero','ejecutivo','lider bci','angol'],visual:'retail',icon:'retail'},
 {title:'Operativo/a Tienda Sodimac HC · FT42',company:'Sodimac S.A.',place:'Angol',recruit:'Angol',area:'Comercio/Ventas',status:'Activa',date:'9 sep',until:'14 oct',vacancies:1,apply:'Intermedia',source:'Bolsa Nacional de Empleo',sourceDomain:'bne.gob.cl',url:'https://www.bne.gob.cl/oferta/2026-107065',note:'Recepción, clasificación, traslado y apoyo al despacho de productos en Sodimac HC Angol.',tags:['sodimac','operativo','tienda','retail','angol'],visual:'retail',icon:'retail'},
 {title:'Vendedor/a Sodimac HC · PT20',company:'Sodimac Chile',place:'Angol',recruit:'Angol',area:'Comercio/Ventas',status:'Activa',date:'sep 2026',vacancies:2,apply:'Intermedia',source:'Bolsa Nacional de Empleo · Trabajando',sourceDomain:'bne.gob.cl',url:'https://www.bne.gob.cl/oferta/2026-104155',note:'Atención y asesoría de clientes en tienda Sodimac HC Angol, jornada parcial de 20 horas.',tags:['sodimac','vendedor','retail','part time','angol'],visual:'retail',icon:'retail'},
 {title:'Asistente de Bodega Alto Valor · Falabella',company:'Falabella',place:'Angol',recruit:'Angol',area:'Transporte/Logística',status:'Nueva',date:'verificada 29 sep',apply:'Intermedia',source:'Indeed · Falabella',sourceDomain:'indeed.com',url:'https://cl.indeed.com/viewjob?jk=4f351d21902da00a',note:'Recepción, almacenamiento, inventario y entrega de productos de alto valor en tienda Falabella Angol.',tags:['bodega','falabella','inventario','logística','angol'],visual:'warehouse',icon:'warehouse'},
 {title:'Asistente Administrativa/o',company:'EQUANS Chile',place:'Angol',recruit:'Angol',area:'Administración',status:'Nueva',date:'sep 2026',apply:'Intermedia',source:'LinkedIn · EQUANS',sourceDomain:'linkedin.com',url:'https://cl.linkedin.com/jobs/view/asistente-administrativa-o-at-equans-4463591259',note:'Apoyo administrativo, SAP, control de asistencia, facturación y gestión documental para operación en Angol.',tags:['administración','equans','sap','excel','angol'],visual:'field',icon:'map'},
 {title:'Prevencionista de Riesgos · Hospital de Nacimiento',company:'Constructora ALJO',portalPlace:'Angol',evidence:'El aviso está publicado bajo Angol, pero la descripción declara que el proyecto es el Hospital de Nacimiento.',place:'Nacimiento',recruit:'Nacimiento y alrededores',area:'Construcción',status:'Nueva',date:'25 sep',until:'9 dic',apply:'Sencilla',source:'ChileTrabajos',sourceDomain:'chiletrabajos.cl',url:'https://www.chiletrabajos.cl/trabajo/se-busca-prevencionista-de-riesgos-3904247',note:'Prevención de riesgos para proyecto de construcción Hospital de Nacimiento, con experiencia en obras y normativa de seguridad.',tags:['prevencionista','hospital','nacimiento','construcción','seguridad'],visual:'construction',icon:'build'},
 {title:'Analista Control Procesos',company:'CMPC',place:'Collipulli',recruit:'Collipulli',area:'Industria/Mantenimiento',status:'Nueva',date:'sep 2026',apply:'Intermedia',source:'LinkedIn · CMPC',sourceDomain:'linkedin.com',url:'https://cl.linkedin.com/jobs/view/analista-control-procesos-at-cmpc-4466082791',note:'Análisis y control de variables de proceso, calidad y cumplimiento de especificaciones productivas en operación CMPC Collipulli.',tags:['cmpc','analista','procesos','calidad','collipulli'],visual:'industry',icon:'build'},
 {title:'Profesional de Participación Ciudadana · Licitación 3628',company:'Ingeniería Cuatro S.A.',portalPlace:'Temuco',evidence:'El proyecto corresponde a Planes Maestros de Aguas Lluvias de Collipulli y Lautaro.',place:'Collipulli · Lautaro',recruit:'Collipulli · Lautaro · Araucanía',area:'Profesionales/Técnicos',status:'Activa',date:'28 jul',until:'11 oct',apply:'Intermedia',source:'ChileTrabajos',sourceDomain:'chiletrabajos.cl',url:'https://www.chiletrabajos.cl/trabajo/3873594',note:'Apoyo local en participación ciudadana y vínculo con organizaciones para estudio de aguas lluvias.',tags:['participación ciudadana','collipulli','licitación','social','profesional'],visual:'field',icon:'map'},
 {title:'Profesional Drenaje Urbano · Licitación 3628',company:'Ingeniería Cuatro S.A.',portalPlace:'Temuco',evidence:'El proyecto corresponde a Planes Maestros de Aguas Lluvias de Collipulli y Lautaro.',place:'Collipulli · Lautaro',recruit:'Collipulli · Lautaro · Araucanía',area:'Profesionales/Técnicos',status:'Activa',date:'28 jul',until:'11 oct',apply:'Intermedia',source:'ChileTrabajos',sourceDomain:'chiletrabajos.cl',url:'https://www.chiletrabajos.cl/trabajo/3873595',note:'Trabajo técnico de terreno e inspección de sistemas de drenaje durante eventos de lluvia.',tags:['drenaje','collipulli','licitación','terreno','hidráulica'],visual:'field',icon:'map'},
 {title:'Encargado/a Estudios Hidrológicos · Licitación 3628',company:'Ingeniería Cuatro S.A.',portalPlace:'Temuco',evidence:'El proyecto corresponde a Planes Maestros de Aguas Lluvias de Collipulli y Lautaro.',place:'Collipulli · Lautaro',recruit:'Collipulli · Lautaro · Araucanía',area:'Profesionales/Técnicos',status:'Activa',date:'28 jul',until:'11 oct',apply:'Intermedia',source:'ChileTrabajos · LinkedIn',sourceDomain:'chiletrabajos.cl',url:'https://www.chiletrabajos.cl/trabajo/se-busca-coordinador-a-para-integrar-el-equipo-profesional-que-sera-presentado-3873581',note:'Desarrollo y validación de estudios hidrológicos para proyecto de drenaje urbano Collipulli–Lautaro.',tags:['hidrología','collipulli','ingeniero','licitación','aguas lluvias'],visual:'field',icon:'map'},
 {title:'Ayudante Reproceso',company:'CMPC',place:'Nacimiento',recruit:'Nacimiento y alrededores',area:'Industria/Mantenimiento',status:'Nueva',date:'23 sep aprox.',apply:'Intermedia',source:'LinkedIn · CMPC',sourceDomain:'linkedin.com',url:'https://cl.linkedin.com/jobs/view/ayudante-reproceso-nacimiento-at-cmpc-4468166430',note:'Apoyo a operación, clasificación y evacuación de maderas, continuidad productiva y estándares de seguridad en Nacimiento.',tags:['cmpc','ayudante','reproceso','madera','nacimiento'],visual:'industry',icon:'build'},
 {title:'Químico Farmacéutico · Director/a Técnico/a',company:'Farmacias Vitasur',place:'Traiguén',recruit:'Traiguén',area:'Salud/Cuidados',status:'Nueva',date:'sep 2026',apply:'Intermedia',source:'LinkedIn · Farmacias Vitasur',sourceDomain:'linkedin.com',url:'https://cl.linkedin.com/jobs/view/qu%C3%ADmico-farmac%C3%A9utico-traigu%C3%A9n-at-farmacias-vitasur-4462091230',note:'Dirección técnica de farmacia en Traiguén, cumplimiento sanitario y gestión técnica, operativa y administrativa.',tags:['químico farmacéutico','farmacia','traiguén','director técnico'],visual:'health',icon:'health'},
 {title:'Labores de campo y cuidado de parcela',company:'Empleador difundido por OMIL Mulchén',place:'Mulchén · sector Sol de Septiembre',recruit:'Mulchén y alrededores',area:'Agricultura',status:'Nueva',date:'verificada 29 sep',apply:'Sencilla',source:'Municipalidad de Mulchén · OMIL',sourceDomain:'munimulchen.cl',url:'https://www.munimulchen.cl/oferta-laboral-labores-de-campo-y-cuidado-de-parcela/',note:'Labores de campo y cuidado de parcela. Se ofrece casa y remuneración líquida informada de $560.000.',salary:'$560.000 líquido informado',tags:['campo','agrícola','parcela','mulchén','omil'],visual:'field',icon:'map'},
 {title:'Supervisor/a Técnico/a de Obra · Proyecto',company:'ATCOM Chile',place:'Mulchén',recruit:'Mulchén y alrededores',area:'Construcción',status:'Nueva',date:'sep 2026',apply:'Intermedia',source:'LinkedIn · ATCOM',sourceDomain:'linkedin.com',url:'https://cl.linkedin.com/jobs/view/supervisor-a-t%C3%A9cnico-a-de-obra-proyecto-at-atcom-chile-4471137982',note:'Supervisión de proyecto industrial, ingeniería y montaje electromecánico en terreno, contrato por proyecto.',salary:'$1.250.000 informado',tags:['supervisor','obra','proyecto','montaje','mulchén'],visual:'construction',icon:'build'},
 {title:'Profesional de Programas Generales · LAE Angol',company:'Fundación Tierra de Esperanza',place:'Angol',recruit:'Angol',area:'Profesionales/Técnicos',status:'Nueva',date:'25 sep',until:'9 dic',apply:'Intermedia',source:'ChileTrabajos',sourceDomain:'chiletrabajos.cl',url:'https://www.chiletrabajos.cl/trabajo/profesional-de-programas-generales-lae-angol-reemplazo-3904472',note:'Reemplazo de 40 horas para programa LAE Angol. Requiere formación profesional del área social o educación y experiencia con población adolescente.',salary:'$1.498.266 informado',tags:['profesional','lae','reinserción','angol','fundación'],visual:'field',icon:'map'},
 {title:'Psicólogo/a · Programa Específico LAE Angol',company:'Fundación Tierra de Esperanza',place:'Angol',recruit:'Angol',area:'Salud/Cuidados',status:'Nueva',date:'22 sep',until:'6 dic',apply:'Intermedia',source:'ChileTrabajos',sourceDomain:'chiletrabajos.cl',url:'https://www.chiletrabajos.cl/trabajo/profesional-de-programa-especifico-psicologo-lae-angol-3901933',note:'Cargo de 40 horas para psicólogo/a con experiencia clínica en justicia juvenil, tratamiento de adicciones o áreas afines.',salary:'$1.498.266 informado',tags:['psicólogo','lae','justicia juvenil','angol','salud'],visual:'health',icon:'health'},
 {title:'Vendedora de Mesón · Clínica Veterinaria',company:'Resource & Recourse',place:'Angol',recruit:'Angol',area:'Comercio/Ventas',status:'Nueva',date:'verificada 30 sep',vacancies:1,apply:'Intermedia',source:'Bolsa Nacional de Empleo',sourceDomain:'bne.gob.cl',url:'https://www.bne.gob.cl/oferta/2026-113100',note:'Atención presencial y telefónica, venta de alimentos, medicamentos, accesorios e insumos veterinarios en clínica de Angol.',tags:['vendedora','mesón','veterinaria','ventas','angol'],visual:'retail',icon:'retail'},
 {title:'Apoyo Cyber Octubre 2026 · Falabella Express',company:'Falabella Retail',portalPlace:'Temuco',evidence:'El título de la oferta identifica explícitamente Falabella Express Angol.',place:'Angol',recruit:'Angol',area:'Comercio/Ventas',status:'Nueva',date:'sep 2026',vacancies:1,apply:'Intermedia',source:'Trabajando · Falabella',sourceDomain:'trabajando.cl',url:'https://www.trabajando.cl/trabajo/6119706-apoyo-cyber-octubre-2026-jornada-fulltime-42-horas-5x2-rotativo-falabella-express-angol',note:'Apoyo temporal al proceso Cyber: stock, retiro de productos, inventario y orden de bodega. Jornada full time 42 horas.',tags:['falabella','cyber','retail','bodega','angol'],visual:'retail',icon:'retail'},
 {title:'Administrativo/a de Tesorería · PT Tienda Angol',company:'Falabella',place:'Angol',recruit:'Angol',area:'Administración',status:'Nueva',date:'verificada 30 sep',apply:'Intermedia',source:'LinkedIn · Falabella',sourceDomain:'linkedin.com',url:'https://cl.linkedin.com/jobs/view/administrativo-a-de-tesorer%C3%ADa-jornada-pt-tienda-angol-at-falabella-4461259756',note:'Tesorería de tienda: recaudación, caja de seguridad, cuadratura de valores, reportes y registro de ventas.',tags:['tesorería','administrativo','falabella','part time','angol'],visual:'field',icon:'map'},
 {title:'Especialista SGI · Planta Laja y Pacífico',company:'CMPC',place:'Mininco · Collipulli / Laja',recruit:'Collipulli · Mininco · Laja',area:'Industria/Mantenimiento',status:'Nueva',date:'30 sep',apply:'Intermedia',source:'LinkedIn · CMPC',sourceDomain:'linkedin.com',url:'https://cl.linkedin.com/jobs/view/especialista-sgi-planta-laja-y-pacifico-at-cmpc-4473591727',note:'Implementación, mantención y mejora del Sistema Integrado de Gestión para Planta Laja y Planta Pacífico. Contrato indefinido.',tags:['sgi','cmpc','mininco','collipulli','calidad','auditoría'],visual:'industry',icon:'build'},
 {title:'Mantenedor Electrocontrol Turno · Planta Santa Fe',company:'CMPC',place:'Nacimiento · Planta Santa Fe',recruit:'Nacimiento y alrededores',area:'Industria/Mantenimiento',status:'Nueva',date:'verificada 30 sep',apply:'Intermedia',source:'LinkedIn · CMPC',sourceDomain:'linkedin.com',url:'https://www.linkedin.com/jobs/view/4456391320/',note:'Mantenimiento eléctrico e instrumentación en Planta Santa Fe. Requiere experiencia industrial y disponibilidad para turnos rotativos.',tags:['electrocontrol','eléctrico','instrumentación','cmpc','nacimiento'],visual:'industry',icon:'build'},
 {title:'Supervisor/a Mantención · Planta Nacimiento',company:'CMPC',place:'Nacimiento · Planta Aserradero',recruit:'Nacimiento y alrededores',area:'Industria/Mantenimiento',status:'Nueva',date:'verificada 30 sep',apply:'Intermedia',source:'LinkedIn · CMPC',sourceDomain:'linkedin.com',url:'https://cl.linkedin.com/jobs/view/supervisor-a-mantenci%C3%B3n-planta-nacimiento-at-cmpc-4460504983',note:'Supervisión de mantenimiento programado y contingencias, coordinación de recursos y cumplimiento de seguridad, medio ambiente y calidad.',tags:['supervisor','mantención','cmpc','nacimiento','sap pm'],visual:'industry',icon:'build'},
 {title:'Ingeniero/a Senior de Procesos y Excelencia',company:'CMPC',place:'Nacimiento',recruit:'Nacimiento y alrededores',area:'Industria/Mantenimiento',status:'Nueva',date:'verificada 30 sep',apply:'Intermedia',source:'LinkedIn · CMPC',sourceDomain:'linkedin.com',url:'https://cl.linkedin.com/jobs/view/ingeniero-a-senior-de-procesos-y-excelencia-at-cmpc-4468287681',note:'Gestión de variables críticas, KPI, plan operativo y mejora continua para optimizar procesos productivos de planta.',tags:['ingeniero','procesos','excelencia','cmpc','nacimiento'],visual:'industry',icon:'build'},
 {title:'Analista Vibraciones',company:'CMPC',place:'Nacimiento · Planta Santa Fe',recruit:'Nacimiento y alrededores',area:'Industria/Mantenimiento',status:'Nueva',date:'30 sep',apply:'Intermedia',source:'LinkedIn · CMPC',sourceDomain:'linkedin.com',url:'https://cl.linkedin.com/jobs/view/analista-vibraciones-at-cmpc-4457519373',note:'Monitoreo y diagnóstico predictivo de equipos mediante análisis de vibraciones. Requiere certificación Nivel II y experiencia industrial.',tags:['vibraciones','mantenimiento predictivo','cmpc','nacimiento','sap pm'],visual:'industry',icon:'build'},
 {title:'Jefe/a Mantenimiento Predictivo',company:'CMPC',place:'Nacimiento · Planta Santa Fe',recruit:'Nacimiento y alrededores',area:'Industria/Mantenimiento',status:'Nueva',date:'verificada 30 sep',apply:'Intermedia',source:'Jobtome · CMPC',sourceDomain:'jobtome.com',url:'https://cl.jobtome.com/empleo/jefea-mantenimiento-predictivo/1ca9e1b6113d2097442da129809b2e81',note:'Planificación y supervisión del monitoreo de condición y análisis sintomático de equipos de Planta Santa Fe.',tags:['jefe','mantenimiento predictivo','vibraciones','cmpc','nacimiento'],visual:'industry',icon:'build'},
 {title:'Soldador · Base Coihue',company:'JCS Logística & Transporte',place:'Negrete · Coihue',recruit:'Negrete · Nacimiento · Renaico · Mulchén',area:'Oficios',status:'Nueva',date:'verificada 30 sep',apply:'Intermedia',source:'LinkedIn · JCS Logística',sourceDomain:'linkedin.com',url:'https://cl.linkedin.com/jobs/view/soldador-at-jcs-log%C3%ADstica-transporte-4447715202',note:'Soldadura, corte y reparación de estructuras metálicas en taller de mantenimiento de flota forestal de base Coihue.',tags:['soldador','coihue','negrete','forestal','mantenimiento'],visual:'mechanic',icon:'build'},
 {title:'Técnico Electromecánico · Base Coihue',company:'JCS Logística & Transporte',place:'Negrete · Coihue',recruit:'Negrete · Nacimiento · Renaico · Mulchén',area:'Industria/Mantenimiento',status:'Nueva',date:'verificada 30 sep',apply:'Intermedia',source:'LinkedIn · JCS Logística',sourceDomain:'linkedin.com',url:'https://cl.linkedin.com/jobs/view/t%C3%A9cnico-electromec%C3%A1nico-at-jcs-log%C3%ADstica-transporte-4453106229',note:'Mantenimiento preventivo y correctivo de flota de camiones, diagnóstico técnico y reparación de sistemas mecánicos, eléctricos, hidráulicos y neumáticos.',tags:['electromecánico','coihue','negrete','camiones','mantenimiento'],visual:'mechanic',icon:'car'},
 {title:'Cajeros/as Multifuncionales Full Time',company:'Upa y Shell',place:'Victoria',recruit:'Victoria',area:'Comercio/Ventas',status:'Nueva',date:'verificada 30 sep',apply:'Intermedia',source:'Indeed · Upa y Shell',sourceDomain:'indeed.com',url:'https://cl.indeed.com/viewjob?jk=7d020a6b48c50c2d',note:'Atención de clientes, operación y cuadratura de caja, reposición y orden de tienda. Turnos rotativos.',tags:['cajero','shell','upa','victoria','retail'],visual:'retail',icon:'retail'},
 {title:'Reponedor/a · Auditor en Terreno / Rutero',company:'EXTERNA',place:'Victoria',recruit:'Victoria',area:'Comercio/Ventas',status:'Nueva',date:'verificada 30 sep',apply:'Sencilla',source:'Indeed · EXTERNA',sourceDomain:'indeed.com',url:'https://cl.indeed.com/q-victoria-empleos.html',note:'Ruta semanal por tiendas de barrio y minimarkets para verificar exhibición de productos y registrar información mediante celular.',tags:['reponedor','auditor','terreno','rutero','victoria'],visual:'retail',icon:'retail'},
 {title:'Médico Especialista en Psiquiatría Infanto Juvenil',company:'Hospital San José de Victoria · SSAN',place:'Victoria',recruit:'Victoria',area:'Salud/Cuidados',status:'Por vencer',date:'22 sep',until:'30 sep · 17:00',vacancies:1,apply:'Extensa',source:'Trabajo Público · origen Empleos Públicos',sourceDomain:'trabajopublico.cl',url:'https://trabajopublico.cl/medico-especialista-en-psquiatria-infanto-juvenil-140875',note:'Reemplazo para unidad de Salud Mental del Hospital San José de Victoria. Cierre de postulación hoy 30 de septiembre.',salary:'$2.160.515 bruto informado',tags:['médico','psiquiatría','salud mental','victoria','hospital'],visual:'health',icon:'health'},
 {title:'Paramédico/a · Traiguén',company:'Xinerlink',portalPlace:'Temuco',evidence:'El aviso declara expresamente que el centro médico y el trabajo se encuentran en Traiguén.',place:'Traiguén',recruit:'Traiguén y alrededores',area:'Salud/Cuidados',status:'Activa',date:'31 ago',until:'14 nov',apply:'Sencilla',source:'ChileTrabajos',sourceDomain:'chiletrabajos.cl',url:'https://www.chiletrabajos.cl/trabajo/paramedico-a-traiguen-3891189',note:'Técnico/a en enfermería para centro médico en Traiguén. Requiere título TENS, registro SIS y vacunas HB.',salary:'$600.000 bruto informado',tags:['paramédico','tens','traiguén','salud'],visual:'health',icon:'health'},
 {title:'Programa de empleo · Prevención de incendios forestales',company:'CONAF · Programa de Empleo para Prevención y Mitigación de Incendios Forestales',place:'Collipulli · villas, sectores rurales y comunidades',recruit:'Collipulli · postulación vía OMIL Collipulli',area:'Forestal',status:'Nueva',date:'publicado hoy en Mi Mininco',apply:'Sencilla',source:'CONAF + Mi Mininco · OMIL Collipulli',sourceDomain:'conaf.cl',url:'https://www.conaf.cl/cerca-de-2-mil-empleos-reforzaran-la-prevencion-de-incendios-en-la-araucania/',contact:'+56452886323',contactLabel:'OMIL Collipulli · consultar cupos, documentación, fechas de postulación e inscripción',evidence:'Mi Mininco difundió la convocatoria local para Collipulli. CONAF confirmó 2.000 empleos en las 32 comunas de La Araucanía entre octubre y diciembre de 2026. SENCE publica OMIL Collipulli en Av. Saavedra Sur 1355, teléfono 45 288 6323.',note:'Empleos temporales para reforzar labores de prevención y mitigación de incendios forestales durante octubre a diciembre. Requisitos difundidos: ser mayor de 18 años, estar cesante, contar con salud compatible y presentar la documentación solicitada. La consulta y postulación se canaliza mediante OMIL Collipulli.',tags:['conaf','prevención','incendios forestales','collipulli','mininco','omil','empleo temporal','octubre','diciembre'],visual:'fire',icon:'fire'},
 {title:'Psicólogo Consultor de Riesgos Psicosociales · Reemplazo',company:'Fundación Científica y Tecnológica (FUCYT)',place:'Angol',recruit:'Angol',area:'Salud/Cuidados',status:'Nueva',date:'verificada 30 sep',apply:'Intermedia',source:'LinkedIn · FUCYT',sourceDomain:'linkedin.com',url:'https://cl.linkedin.com/jobs/view/psic%C3%B3logo-consultor-de-riesgos-psicosociales-angol-reemplazo-at-fundaci%C3%B3n-cient%C3%ADfica-y-tecnol%C3%B3gica-fucyt-4470077195',note:'Reemplazo profesional en Angol para asesoría e implementación de protocolos de riesgos psicosociales. Requiere título de Psicología y experiencia afín.',tags:['psicólogo','riesgos psicosociales','angol','reemplazo','salud'],visual:'health',icon:'health'},
 {title:'Conductor profesional · Base Coihue',company:'JCS Logística & Transporte',portalPlace:'Talcahuano',evidence:'La publicación pública aparece clasificada en Talcahuano, pero declara expresamente como lugar de trabajo la Base Coihue, comuna de Negrete.',place:'Negrete · Coihue',recruit:'Negrete · Renaico · Angol · Collipulli · Tijeral',area:'Transporte/Logística',status:'Nueva',date:'verificada 30 sep',apply:'Intermedia',source:'LinkedIn · JCS Logística & Transporte',sourceDomain:'linkedin.com',url:'https://cl.linkedin.com/jobs/view/conductor-profesional-at-jcs-log%C3%ADstica-transporte-4471141755',note:'Conducción profesional para transporte de astillas desde Base Coihue, Negrete. Requiere licencia A2 o A5, credencial CORMA y experiencia en camión astillero.',tags:['conductor','camión','astillas','coihue','negrete','jcs'],visual:'transport',icon:'truck'},
 {title:'Subgerente/a Producción · Planta Pacífico',company:'CMPC',place:'Mininco · Collipulli',recruit:'Collipulli · Mininco y alrededores',area:'Industria/Mantenimiento',status:'Nueva',date:'verificada 30 sep',apply:'Extensa',source:'LinkedIn · CMPC',sourceDomain:'linkedin.com',url:'https://cl.linkedin.com/jobs/view/subgerente-a-producci%C3%B3n-at-cmpc-4464625409',note:'Liderazgo de producción en Planta Pacífico, con foco en producción, calidad, seguridad, medio ambiente, costos y mejora continua. La publicación solicita Ingeniería Civil y experiencia extensa en celulosa.',tags:['subgerente','producción','cmpc','collipulli','mininco','industria'],visual:'industry',icon:'build'},
 {title:'Técnico Electromecánico · Base Coihue',company:'Grupo JCS',place:'Negrete · Coihue',recruit:'Negrete · Nacimiento · Mulchén · Renaico · Los Ángeles',area:'Industria/Mantenimiento',status:'Nueva',date:'04 oct',until:'03 nov',apply:'Sencilla',source:'Kit Empleo · Grupo JCS',sourceDomain:'kitempleo.cl',url:'https://www.kitempleo.cl/empleo/107033448/tecnico-electromecanico-negrete',evidence:'Publicación fechada 04-oct-2026 y rastreada 06-oct-2026. Declara Base Coihue, Negrete como lugar de trabajo.',note:'Mantenimiento preventivo y correctivo de flota de camiones. Requiere técnico medio o superior afín y mínimo 2 años de experiencia.',tags:['electromecánico','mantenimiento','camiones','negrete','coihue'],visual:'industry',icon:'build'},
 {title:'Conductor profesional · Transporte de astillas',company:'Grupo JCS',place:'Negrete · Coihue',recruit:'Renaico · Tijeral · Angol · Collipulli',area:'Transporte/Logística',status:'Nueva',date:'27 sep',until:'27 oct',apply:'Sencilla',source:'Kit Empleo · Grupo JCS',sourceDomain:'kitempleo.cl',url:'https://www.kitempleo.cl/empleo/105933628/conductor-profesional-transporte-de-astillas-negrete',evidence:'Publicación fechada 27-sep-2026 y rastreada durante la última semana. Lugar de trabajo declarado: Base Coihue, Negrete.',note:'Conducción de camión astillero. Solicita licencia A2 o A5, credencial CORMA y experiencia comprobable.',tags:['conductor','camión','astillas','negrete','coihue'],visual:'transport',icon:'truck'},
 {title:'Jefe/a de Tienda · Collipulli',company:'ABC S.A.',place:'Collipulli',recruit:'Collipulli y alrededores',area:'Comercio/Ventas',status:'Nueva',date:'21 sep',until:'16 nov',vacancies:1,apply:'Sencilla',source:'BNE · ABC S.A.',sourceDomain:'bne.gob.cl',url:'https://www.bne.gob.cl/oferta/2026-111282',evidence:'Oferta BNE 2026-111282. Publicada 21-sep-2026 y vigente hasta 16-nov-2026.',note:'Jefatura integral de tienda con foco en operación, metas comerciales, administración y experiencia de clientes. Requiere experiencia en retail y liderazgo.',salary:'$910.001–$1.060.000 informado en fuente replicada',tags:['jefe tienda','retail','collipulli','ventas','liderazgo'],visual:'commerce',icon:'store'},
];

function normalizeText(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizedMatchText(value: unknown) {
  return normalizeText(value).toLocaleLowerCase('es-CL').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const TERRITORIAL_ALIASES: Record<string, string[]> = {
  Angol:['angol','nahuelbuta angol'],
  Collipulli:['collipulli'],
  Ercilla:['ercilla','pidima','pailahueque'],
  Renaico:['renaico','tijeral'],
  Mininco:['mininco','villa mininco','planta plywood','planta pacifico'],
  Nacimiento:['nacimiento'],
  Negrete:['negrete','coihue','base coihue','yanequen'],
  Mulchén:['mulchen'],
  'Los Sauces':['los sauces'],
  Purén:['puren'],
  Traiguén:['traiguen'],
  Lumaco:['lumaco','capitan pastene','capitán pastene'],
  Victoria:['victoria','selva oscura','quino'],
};

function extractCommunes(text: string) {
  const haystack = ' ' + normalizedMatchText(text) + ' ';
  const found = new Set(MARKET_PLACES.filter(place => haystack.includes(' ' + normalizedMatchText(place) + ' ')));
  for (const [commune, aliases] of Object.entries(TERRITORIAL_ALIASES)) if (aliases.some(alias => haystack.includes(' ' + normalizedMatchText(alias) + ' '))) found.add(commune);
  return [...found];
}

function extractPilotCommunes(text: string) {
  return extractCommunes(text).filter(place => PILOT.includes(place));
}

function parseUntil(until?: string) {
  if (!until) return undefined;
  const m = until.toLocaleLowerCase('es-CL').match(/(\d{1,2})\s+(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)(?:\s*·\s*(\d{1,2}):(\d{2}))?/);
  if (!m) return undefined;
  const months: Record<string, string> = {ene:'01',feb:'02',mar:'03',abr:'04',may:'05',jun:'06',jul:'07',ago:'08',sep:'09',oct:'10',nov:'11',dic:'12'};
  const day = m[1].padStart(2, '0');
  const time = m[3] ? `${m[3].padStart(2, '0')}:${m[4]}:00` : '23:59:59';
  const now = new Date();
  let year = now.getFullYear();
  const candidate = new Date(`${year}-${months[m[2]]}-${day}T${time}-03:00`);
  if (candidate.getTime() < now.getTime() - 180 * 86400000) year += 1;
  return `${year}-${months[m[2]]}-${day}T${time}-03:00`;
}

function seedKey(job: SeedJob) {
  return job.url || `${job.title}|${job.company}|${job.place}`;
}

function toRadarRecord(job: SeedJob): ListingRecord {
  return {
    seedKey: seedKey(job),
    kind: 'job_offer',
    origin: 'radar',
    title: job.title,
    company: job.company,
    workLocation: job.place,
    workCommunes: extractCommunes(job.place),
    recruitmentZones: [job.recruit],
    recruitmentCommunes: extractCommunes(job.recruit),
    area: job.area,
    status: job.status,
    date: job.date,
    until: job.until,
    expiresAt: parseUntil(job.until),
    vacancies: job.vacancies,
    apply: job.apply,
    source: job.source,
    sourceDomain: job.sourceDomain,
    url: job.url,
    note: job.note,
    salary: job.salary,
    tags: job.tags,
    visual: job.visual,
    icon: job.icon,
    portalPlace: job.portalPlace,
    evidence: job.evidence,
    contact: job.contact,
    contactLabel: job.contactLabel,
    review: Boolean(job.review),
    verified: !job.review,
    active: true,
    createdAt: new Date().toISOString(),
  };
}

async function ensureSeed() {
  const meta = await db.list<{ version: string }>('radar_meta', { limit: 1 });
  if (meta.items[0]?.version === SEED_VERSION) return;

  const current = await db.list<ListingRecord>('radar_jobs', { limit: 200 });
  const byKey = new Map(current.items.filter(item => item.seedKey && !/^(tavily:|exa:|motor1:)/.test(item.seedKey)).map(item => [item.seedKey, item]));
  const expectedKeys = new Set(seedJobs.map(seedKey));
  const adds: Record<string, unknown>[] = [];
  const updates: Array<{ id: string; record: Record<string, unknown> }> = [];

  for (const job of seedJobs) {
    const record = toRadarRecord(job);
    const existing = byKey.get(record.seedKey);
    if (existing) {
      updates.push({ id: existing.id, record:{ ...record, sourcePublishedAt:existing.sourcePublishedAt || record.sourcePublishedAt, verifiedAt:existing.verifiedAt, firstVerifiedAt:existing.firstVerifiedAt || existing.verifiedAt, lastVerifiedAt:existing.lastVerifiedAt, verificationCheckedAt:existing.verificationCheckedAt, verificationReason:existing.verificationReason, verificationMethod:existing.verificationMethod, verificationVersion:existing.verificationVersion, lastSeenAt:existing.lastSeenAt, evidenceSources:existing.evidenceSources, active:existing.active, review:existing.review, verified:existing.verified, createdAt:existing.createdAt || record.createdAt } });
    } else {
      adds.push(record);
    }
  }

  for (const old of current.items) {
    if (old.seedKey?.startsWith('static:') && !expectedKeys.has(old.seedKey)) {
      const { id, ...record } = old;
      updates.push({ id, record:{ ...record, active:false } });
    }
  }

  if (adds.length) {
    const ids = await trackedFeedAdd('radar_jobs', adds);
    if (ids.some(id => !id)) throw new Error('No se pudo completar la migración de oportunidades.');
  }
  if (updates.length) {
    const ok = await trackedFeedUpdate('radar_jobs', updates);
    if (ok.some(value => !value)) throw new Error('No se pudo actualizar el Radar.');
  }

  if (meta.items[0]) {
    await db.update('radar_meta', [{ id: meta.items[0].id, record: { version: SEED_VERSION, updatedAt: new Date().toISOString() } }]);
  } else {
    await db.add('radar_meta', [{ version: SEED_VERSION, updatedAt: new Date().toISOString() }]);
  }
}

function isCurrentlyActive(item: ListingRecord) {
  if (!item.active) return false;
  const now = Date.now();
  if (item.kind === 'job_offer' && item.review) {
    const created = Date.parse(item.createdAt);
    if (Number.isFinite(created) && now - created > 7 * 86400000) return false;
  }
  if (!item.expiresAt) return true;
  return now <= Date.parse(item.expiresAt);
}

function publicRecord<T extends ListingRecord & { id: string }>(item: T) {
  const { ownerToken: _ownerToken, contact, evidenceImagePath: _evidenceImagePath, socialEvidence: _socialEvidence, ...safe } = item;
  const projected={...safe} as Record<string,unknown>;
  for (const field of ['localContactEvidence','cmpcPrimaryReview','primarySourceEvidence','documentUnitProof']) delete projected[field];
  return { ...safe, ...Object.fromEntries(Object.keys(safe).map(key=>[key,projected[key]])), hasContact: Boolean(contact) };
}

function cacheable(data: unknown, seconds = 45) {
  const response = json(data);
  response.headers['Cache-Control'] = `public, max-age=${seconds}, stale-while-revalidate=${seconds * 4}`;
  return response;
}

type CommuneStats = { jobs:number; newJobs24h:number; people:number; needs:number; services:number };
type KindStats = { jobs:number; people:number; needs:number; services:number };

type PublicFeedPage = {
  items: Array<ReturnType<typeof publicRecord>>;
  updatedAt: string;
  hasMore: boolean;
  nextCursor?: string;
  pageSize: number;
  totalItems: number;
  totalJobOffers: number;
  totalVerifiedJobOffers: number;
  totalProvisionalJobOffers: number;
  communeStats: Record<string, CommuneStats>;
  kindStats: KindStats;
};

type PublicFeedControl = {
  pageCount: number;
  updatedAt: string;
};

const PUBLIC_FEED_PAGE_SIZE = 40;

function publicFeedTable(page: number) {
  return `public_feed_page_${page}`;
}

async function writeSingleRecord(table: string, record: Record<string, unknown>) {
  const current = await db.list<Record<string, unknown>>(table, { limit:1 });
  if (current.items[0]) {
    const [ok] = await db.update(table, [{ id:current.items[0].id, record }]);
    if (!ok) throw new Error(`No se pudo actualizar ${table}.`);
  } else {
    const [id] = await db.add(table, [record]);
    if (!id) throw new Error(`No se pudo crear ${table}.`);
  }
}

function cleanAlertCommunes(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeText).filter(place => MARKET_PLACES.includes(place)))].slice(0, 5);
}

function cleanAlertKeywords(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizedMatchText).filter(Boolean).map(term => term.slice(0, 60)))].slice(0, 8);
}

function notificationPreferenceMatches(item: ListingRecord, pref: NotificationPreference) {
  if (!pref.communes.some(place => item.workCommunes.includes(place))) return false;
  if (!pref.keywords.length) return true;
  const haystack = normalizedMatchText([item.title, item.company, item.area, item.note, item.tags.join(' ')].join(' '));
  return pref.keywords.some(keyword => haystack.includes(keyword));
}

async function getNotificationPreference(userId:string){return getAlertPreference(userId);}
async function saveNotificationPreference(userId:string,communes:string[],keywords:string[]){return saveAlertPreference(userId,communes,keywords);}
async function disableNotificationPreference(userId:string){return disableAlertPreference(userId);}
async function runNotificationSweep(){return runNotificationDispatch();}

function projectFeedListing(value:Record<string, unknown> & { id:string }) {
  const item=value as unknown as ListingRecord & { id:string };
  if (item.kind!=='job_offer') return ['worker_available','worker_need','service_request'].includes(item.kind) && !item.review && isCurrentlyActive(item) ? publicRecord(item) : null;
  if (offerRetentionReason(value)) return null;
  if (publicJobExclusion(value)) return null;
  const projectionPlaces = value.secondaryMarket === true && value.discoveredBy === 'free-public-sources-v1' ? MARKET_PLACES : PILOT;
  if (!item.workCommunes?.some(commune=>projectionPlaces.some(target=>normalizeText(target).toLocaleLowerCase('es-CL')===normalizeText(commune).toLocaleLowerCase('es-CL')))) return null;
  const evidence=[item.title,item.company,item.note,item.url,item.sourceDomain].filter(Boolean).join(' ');
  if (unsafeContentReason(evidence,item.url)) return null;
  const published=parseDiscoveryDate(item.sourcePublishedAt || item.date);
  if (!published || published>Date.now()) return null;
  return { ...publicRecord(item),firstPublishedAt:knownFirstPublication(value),revalidationDue:offerRecheckDue(value) };
}

function feedRefreshAt(item:Record<string, unknown>) {
  const now=Date.now(),deadline=confirmedOfferDeadline(item);
  const candidates:number[]=[];
  if (deadline!==null) candidates.push(deadline+1);
  const checked=latestOfferCheckAt(item);
  if (Number.isFinite(checked)) candidates.push(checked+86400000+1);
  const first=Date.parse(String(item.firstPublishedAt || item.createdAt || ''));
  if (Number.isFinite(first)) candidates.push(first+86400000+1,first+7*86400000+1);
  const upcoming=candidates.filter(time=>Number.isFinite(time)&&time>now);
  return upcoming.length ? Math.min(...upcoming) : null;
}

async function readFeedRows() {
  const feed = await readPublicFeedPage();
  return { items:feed ? [feed as unknown as PublicFeedPage] : [] };
}

async function rebuildPublicFeed() {
  // Only verify-publish advances the durable writer. Read/manual/collector paths keep the visible snapshot.
  return readPublicFeedSummary();
}

async function refreshSocialDraftQueue() {
  const [feed, existing] = await Promise.all([
    readFeedRows(),
    db.list<SocialDraft>('growth_social_queue', { limit:100 }),
  ]);
  const now = Date.now();
  const known = new Set(existing.items.map(item => item.sourceId));
  const eligible = (feed.items[0]?.items ?? [])
    .filter(item => item.kind === 'job_offer' && item.verified && !item.review)
    .filter(item => {
      const created = Date.parse(item.createdAt);
      return Number.isFinite(created) && now - created <= 7 * 86400000;
    })
    .slice(0, 5);
  const adds: Record<string, unknown>[] = [];
  for (const item of eligible) {
    if (known.has(item.id)) continue;
    adds.push({
      sourceId:item.id,
      place:item.workLocation,
      title:item.title,
      text:`Nueva oportunidad en ${item.workLocation}: ${item.title} · ${item.company}. Revisa requisitos, vigencia y fuente en Trabajo Cerca.`,
      channel:'facebook_instagram',
      status:'draft',
      createdAt:new Date().toISOString(),
    });
  }
  if (adds.length) await db.add('growth_social_queue', adds);
  const stale = existing.items
    .filter(item => now - Date.parse(item.createdAt) > 14 * 86400000)
    .map(item => item.id);
  if (stale.length) await db.delete('growth_social_queue', stale);
  return { created:adds.length, pending:Math.max(0, existing.items.length + adds.length - stale.length) };
}

function token() {
  return opaqueOwnerToken();
}

function moderate(text: string) {
  return !unsafeContentReason(text);
}

async function ensureSourceRegistry() {
  const meta = await db.list<{ version: string }>('source_meta', { limit: 1 });
  if (meta.items[0]?.version === SOURCE_VERSION) return;
  const current = await db.list<SourceRecord>('radar_sources', { limit: 120 });
  const byKey = new Map(current.items.map(item => [item.key, item]));
  const updates: Array<{ id: string; record: Record<string, unknown> }> = [];
  const adds: Record<string, unknown>[] = [];
  const updatedAt = new Date().toISOString();
  for (const source of SOURCE_DEFS) {
    const record: SourceRecord = { ...source, updatedAt };
    const existing = byKey.get(source.key);
    if (existing) updates.push({ id: existing.id, record });
    else adds.push(record);
  }
  const validKeys = new Set(SOURCE_DEFS.map(source => source.key));
  const retired = current.items.filter(item => !validKeys.has(item.key)).map(item => {
    const { id, ...record } = item;
    return { id, record:{ ...record, active:false, status:'limited' as const, note:`${record.note} · Fuente reemplazada por la matriz local-first.`, updatedAt } };
  });
  if (adds.length) await db.add('radar_sources', adds);
  if (updates.length) await db.update('radar_sources', updates);
  if (retired.length) await db.update('radar_sources', retired);
  if (meta.items[0]) await db.update('source_meta', [{ id: meta.items[0].id, record: { version: SOURCE_VERSION, updatedAt } }]);
  else await db.add('source_meta', [{ version: SOURCE_VERSION, updatedAt }]);
}

function cleanHtml(text: string) {
  return text.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/\s+/g, ' ').trim();
}

const ADULT_BLOCKED_DOMAINS = [
  'xnxx.com','xvideos.com','pornhub.com','redtube.com','youporn.com','onlyfans.com',
  'chaturbate.com','stripchat.com','livejasmin.com','adultfriendfinder.com',
];
const DISCOVERY_MAX_AGE_DAYS = 45;
const RECENT_PRIORITY_DAYS = 21;
const STANDARD_WINDOW_DAYS = 30;

function urlHost(url?:string) {
  if (!url) return '';
  try { return new URL(url).hostname.replace(/^www\./, '').toLocaleLowerCase('es-CL'); } catch { return ''; }
}

function unsafeContentReason(text:string, url?:string) {
  const host = urlHost(url);
  if (host && ADULT_BLOCKED_DOMAINS.some(domain => host === domain || host.endsWith('.' + domain))) return 'Fuente de contenido adulto o sexual bloqueada.';
  const normalized = normalizedMatchText(text + ' ' + (url || ''));
  if (/\b(porn|porno|pornografia|xxx|xnxx|xvideos|pornhub|redtube|youporn|onlyfans|escort|servicio sexual|servicios sexuales|masaje erotico|masajes eroticos|contenido adulto|sexo explicito|camgirl|webcam sexual|sugar baby|sugar daddy)\b/.test(normalized)) return 'Contenido sexual o erótico no permitido.';
  if (/\b(supremacia racial|supremacista|raza superior|raza inferior|limpieza etnica|odio racial|odio racista)\b/.test(normalized)) return 'Contenido racista o de odio no permitido.';
  if (/\b(matar a|golpear a|humillar a|amenazar a)\b/.test(normalized)) return 'Contenido agresivo o degradante no permitido.';
  if (/\b(paga\w* para postular|clave bancaria|codigo de seguridad)\b/.test(normalized)) return 'Señal de fraude o solicitud insegura.';
  return '';
}

function parseDiscoveryDate(value:string) {
  const original = socialSourceDate(value);
  return original ? Date.parse(original) : undefined;
}

function staleDiscoveryDate(value:string, maxAgeDays=DISCOVERY_MAX_AGE_DAYS) {
  const parsed = parseDiscoveryDate(value);
  if (!parsed) return false;
  const age = Date.now() - parsed;
  return age > maxAgeDays * 86400000 || age < 0;
}

function sourceDateLabel(value:string) {
  const parsed = parseDiscoveryDate(value);
  if (!parsed) return 'Fecha por confirmar';
  const d = new Date(parsed);
  return String(d.getUTCDate()).padStart(2,'0') + '-' + String(d.getUTCMonth()+1).padStart(2,'0') + '-' + d.getUTCFullYear();
}

function sourceLabelForUrl(url:string, fallback='Fuente web') {
  const host = urlHost(url);
  if (!host) return fallback;
  const labels:Array<[string,string]> = [
    ['bne.gob.cl','Bolsa Nacional de Empleo'],['chiletrabajos.cl','ChileTrabajos'],['computrabajo.cl','Computrabajo'],['computrabajo.com','Computrabajo'],['laborum.cl','Laborum'],['trabajando.cl','Trabajando.com'],['indeed.com','Indeed'],['linkedin.com','LinkedIn'],['facebook.com','Facebook'],['instagram.com','Instagram'],['tiktok.com','TikTok'],['jobsora.com','Jobsora'],['jooble.org','Jooble'],['kitempleo.cl','KitEmpleo'],
  ];
  const match = labels.find(([domain]) => host === domain || host.endsWith('.' + domain));
  return match ? match[1] : host;
}

function cleanDiscoveryText(value:unknown) {
  return normalizeText(value).replace(/[#*_`]+/g, ' ').replace(/\bSee more\b/gi, ' ').replace(/May be an image of[^.]{0,180}/gi, ' ').replace(/\s+/g, ' ').trim();
}

function isLikelyJobOpportunity(text:string, url?:string) {
  if (unsafeContentReason(text, url)) return false;
  const normalized = normalizedMatchText(text);
  const nonJob = /\b(fondo social|fondos concursables|fondo concursable|postula tu proyecto|proyecto comunitario|subsidio|beca|capacitacion|curso|taller|seminario|practica profesional|practica laboral|oferta de practica|voluntariado|capital semilla|emprendimiento)\b/.test(normalized);
  if (nonJob) return false;
  const hiringIntent = /\b(oferta laboral|oportunidad laboral|vacante|vacantes|se necesita|se necesitan|se buscan|se busca|se contrata|contratamos|contratar personal|buscamos personal|buscamos gente|necesitamos personal|solicitamos personal|requerimos personal|envia tu cv|enviar cv|recepcion de cv|trabaja con nosotros|reclutamiento de personal|contratacion de personal|full time|part time)\b/.test(normalized);
  const host = urlHost(url);
  const knownJobPortal = ['bne.gob.cl','chiletrabajos.cl','computrabajo.cl','computrabajo.com','laborum.cl','trabajando.cl','indeed.com','linkedin.com','jobsora.com','jooble.org','kitempleo.cl'].some(domain => host === domain || host.endsWith('.' + domain));
  const generic = new Set(['trabajo','empleo','pega','pituto','obra','turno','cupos','postulacion','reclutamiento','contratacion','personal para']);
  const roleSignal = LABOR_TERMS.some(term => !generic.has(term) && normalized.includes(normalizedMatchText(term)));
  return hiringIntent || (knownJobPortal && roleSignal);
}

function relevantEmploymentSignal(text: string) {
  const normalized = text.toLocaleLowerCase('es-CL').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  return LABOR_TERMS.some(term => normalized.includes(term.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-CL'))) || /(concurso|omil|full\s*time|part\s*time|freelance|busco\s+trabajo|me\s+ofrezco|ofrezco\s+servicios|disponible\s+para\s+trabajar)/i.test(text);
}

function redactSensitive(text: string) {
  return text
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[contacto oculto]')
    .replace(/(?:\+?56\s*)?(?:9\s*)?\d{4}[\s.-]?\d{4}/g, '[teléfono oculto]')
    .replace(/\b\d{1,2}\.\d{3}\.\d{3}-[\dkK]\b/g, '[RUT oculto]')
    .slice(0, 650);
}

function candidateSignature(title: string, communes: string[], company?: string) {
  const clean = title.toLocaleLowerCase('es-CL').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(oferta|laboral|empleo|trabajo|chile|indeed|linkedin|jobsora|jooble|kitempleo|computrabajo)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  const employer = normalizedMatchText(company || '').replace(/\b(spa|s a|sa|ltda|limitada|chile)\b/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return clean + '|' + employer + '|' + [...communes].sort().join(',').toLocaleLowerCase('es-CL');
}

function hardBlocksRediscovery(item:ListingRecord) {
  if (item.active) return true;
  const reason = normalizedMatchText([item.status, item.verificationReason].filter(Boolean).join(' '));
  return /no disponible|404|410|cerrad|vencid|expirad|retirad|eliminad|contenido adulto|contenido sexual|riesgo|publicacion antigua|supera la antiguedad|maximo de 21 dias/.test(reason);
}

function terminalRediscoveryBlock(item:ListingRecord) {
  if (item.active) return false;
  const reason = normalizedMatchText([item.status, item.verificationReason].filter(Boolean).join(' '));
  return /no disponible|404|410|cerrad|vencid|expirad|retirad|eliminad|contenido adulto|contenido sexual|riesgo|publicacion antigua|supera la antiguedad|maximo de 21 dias/.test(reason);
}

type ExistingListingRef = { table:'radar_candidates' | 'radar_jobs'; item:ListingRecord & { id:string } };
type RediscoveryUpdate = { table:'radar_candidates' | 'radar_jobs'; id:string; record:Record<string, unknown> };

function existingListingIndexes(candidateRows:ListingRecord[], jobRows:ListingRecord[]) {
  const refs:ExistingListingRef[] = [
    ...candidateRows.map(item => ({ table:'radar_candidates' as const, item:item as ListingRecord & { id:string } })),
    ...jobRows.map(item => ({ table:'radar_jobs' as const, item:item as ListingRecord & { id:string } })),
  ];
  const byUrl = new Map<string, ExistingListingRef>();
  const bySignature = new Map<string, ExistingListingRef>();
  for (const ref of refs) {
    if (ref.item.url && !byUrl.has(ref.item.url)) byUrl.set(ref.item.url, ref);
    const signature = candidateSignature(ref.item.title, ref.item.workCommunes, ref.item.company);
    if (!bySignature.has(signature)) bySignature.set(signature, ref);
  }
  return { byUrl, bySignature };
}

function mergeRediscoveredEvidence(
  ref:ExistingListingRef,
  updates:Map<string, RediscoveryUpdate>,
  incoming:{ checkedAt:string; source:string; discoveredBy:string; publishedAt?:string; workCommunes:string[]; recruitmentCommunes?:string[]; evidence?:string },
) {
  if (terminalRediscoveryBlock(ref.item)) return false;
  const current = ref.item;
  const { id, ...base } = current;
  const parsedIncoming = incoming.publishedAt ? parseDiscoveryDate(incoming.publishedAt) : undefined;
  const freshIncoming = parsedIncoming && !staleDiscoveryDate(new Date(parsedIncoming).toISOString()) ? new Date(parsedIncoming).toISOString() : undefined;
  const keepVerifiedLocation = base.verified && base.workCommunes.length > 0;
  const workCommunes = keepVerifiedLocation ? base.workCommunes : [...new Set([...base.workCommunes, ...incoming.workCommunes])];
  const recruitmentCommunes = [...new Set([...base.recruitmentCommunes, ...(incoming.recruitmentCommunes || incoming.workCommunes)])];
  const evidenceSources = [...new Set([...(base.evidenceSources || []), incoming.source])].slice(0, 8);
  const discoveredBy = [...new Set([base.discoveredBy, incoming.discoveredBy].filter(Boolean))].join(' · ').slice(0, 180);
  const evidence = [base.evidence, incoming.evidence].filter(Boolean).join(' · ').slice(0, 650) || undefined;
  const reactivated = !base.active;
  const record:ListingRecord = {
    ...base,
    workCommunes,
    workLocation:base.workCommunes.length ? base.workLocation : (workCommunes.length ? workCommunes.join(' · ') : base.workLocation),
    recruitmentCommunes,
    recruitmentZones:[...new Set([...base.recruitmentZones, ...recruitmentCommunes])],
    sourcePublishedAt:base.sourcePublishedAt || freshIncoming,
    evidence,
    evidenceSources,
    discoveredBy,
    lastSeenAt:incoming.checkedAt,
    active:reactivated ? true : base.active,
    review:reactivated ? true : base.review,
    verified:reactivated ? false : base.verified,
    status:reactivated ? 'Por confirmar' : base.status,
    verificationVersion:base.verified ? base.verificationVersion : undefined,
    verificationCheckedAt:base.verified ? base.verificationCheckedAt : undefined,
  };
  ref.item = { ...record, id };
  updates.set(`${ref.table}:${id}`, { table:ref.table, id, record });
  return true;
}

async function flushRediscoveryUpdates(updates:Map<string, RediscoveryUpdate>) {
  const candidateUpdates = [...updates.values()].filter(item => item.table === 'radar_candidates').map(({ id, record }) => ({ id, record }));
  const jobUpdates = [...updates.values()].filter(item => item.table === 'radar_jobs').map(({ id, record }) => ({ id, record }));
  if (candidateUpdates.length) await db.update('radar_candidates', candidateUpdates);
  if (jobUpdates.length) await trackedFeedUpdate('radar_jobs', jobUpdates);
  return candidateUpdates.length + jobUpdates.length;
}

function isSpecificJobResult(title: string, url: string) {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return false; }
  const host = parsed.hostname.replace(/^www\./, '').toLocaleLowerCase('es-CL');
  const path = parsed.pathname.toLocaleLowerCase('es-CL');
  const lowerTitle = title.toLocaleLowerCase('es-CL').trim();

  if (host.includes('linkedin.com')) return path.includes('/jobs/view/');
  if (host.includes('facebook.com')) return path.includes('/posts/') || path.includes('/permalink/') || path.includes('/photo') || path.includes('/reel/') || path.includes('/marketplace/item/') || path.includes('/share/p/');
  if (host.includes('instagram.com')) return path.includes('/p/') || path.includes('/reel/');
  if (host.includes('tiktok.com')) return path.includes('/video/');
  if (host.includes('threads.net')) return path.includes('/post/');
  if (host.includes('computrabajo.com') && (path.startsWith('/trabajo-de-') || path.startsWith('/empleos-en-'))) return false;
  if (host === 'omilempleos.infolicencia.cl') return false;
  if (/^(trabajo|trabajos|empleo|empleos)\s+(de|en)\b/.test(lowerTitle)) return false;
  if (/bolsa\s+empleo|omil\s+empleos/.test(lowerTitle)) return false;
  return path.length > 1 || parsed.search.length > 1;
}

const OFFICIAL_VERIFICATION_DOMAINS = ['bne.gob.cl','trabajopublico.cl','empleospublicos.cl','empleaxchile.cl','cftla.cl','sence.gob.cl','conaf.cl','munimulchen.cl','angol.cl','municipalidadcollipulli.cl','muniercilla.cl','municipalidadrenaico.cl','munipuren.cl','munilumaco.cl','victoriachile.cl','mtraiguen.cl','nacimiento.cl','muninegrete.cl','munilossauces.cl','losangeles.cl','concepcion.cl','municipalidadchillan.cl'];
const PORTAL_VERIFICATION_DOMAINS = ['chiletrabajos.cl','trabajando.cl','linkedin.com','indeed.com','laborum.cl','computrabajo.cl','computrabajo.com','portalempleobiobio.cl','cvtrabajos.github.io','temuco.omil.cl'];
const SOCIAL_VERIFICATION_DOMAINS = ['facebook.com','instagram.com','tiktok.com','threads.net'];
const SECONDARY_VERIFICATION_DOMAINS = ['kitempleo.cl','jobsora.com','jooble.org','jobtome.com'];
const VERIFICATION_VERSION = '2026-10-04-v14-source-aware-stable';
const EMPTY_RECOVERY_VERSION = '2026-10-03-v3-fast-recovery';

function verificationHost(url?:string, sourceDomain?:string) {
  if (url) {
    try { return new URL(url).hostname.replace(/^www\./, '').toLocaleLowerCase('es-CL'); } catch { /* use sourceDomain */ }
  }
  return normalizeText(sourceDomain).replace(/^www\./, '').toLocaleLowerCase('es-CL');
}

function hostIn(host:string, domains:string[]) {
  return domains.some(domain => host === domain || host.endsWith('.' + domain));
}

function sourceVerificationTier(host:string) {
  if (hostIn(host, OFFICIAL_VERIFICATION_DOMAINS)) return 'official';
  if (hostIn(host, PORTAL_VERIFICATION_DOMAINS)) return 'portal';
  if (hostIn(host, SOCIAL_VERIFICATION_DOMAINS)) return 'social';
  if (hostIn(host, SECONDARY_VERIFICATION_DOMAINS)) return 'secondary';
  return 'other';
}

function verificationTargets(item:ListingRecord) {
  return [...new Set([...item.workCommunes, ...item.recruitmentCommunes].filter(place => MARKET_PLACES.includes(place)))];
}

function hasTargetEvidence(text:string, item:ListingRecord) {
  const detected = new Set(extractCommunes(text));
  return verificationTargets(item).some(place => detected.has(place));
}

function expiredSourceSignal(text:string) {
  return /(oferta|vacante|proceso|postulaci[oó]n|cargo|puesto).{0,60}(cerrad|finalizad|vencid|expirad|retirad|eliminad|cubierto)|ya\s+no\s+(?:est[aá]\s+)?disponible|no\s+se\s+encuentra\s+disponible|esta\s+oferta\s+ya\s+no\s+est[aá]\s+disponible|job\s+(?:is\s+)?no\s+longer\s+available|position\s+(?:has\s+been\s+)?filled|expired\s+job|vacante\s+cerrada|puesto\s+cubierto/i.test(text);
}

function unavailableSourceSignal(text:string) {
  return /p[aá]gina\s+no\s+encontrada|contenido\s+no\s+disponible|publicaci[oó]n\s+no\s+disponible|publication\s+not\s+found|page\s+not\s+found|content\s+is\s+unavailable|this\s+job\s+is\s+no\s+longer\s+available/i.test(text);
}

function structuredJobSignal(raw:string) {
  return /["']@type["']\s*:\s*["']JobPosting["']/i.test(raw) || /schema\.org\/JobPosting/i.test(raw) || /["']datePosted["']\s*:/i.test(raw) && /["']jobLocation["']\s*:/i.test(raw);
}

async function verifyPendingOffer(item:ListingRecord & { id:string }) {
  const checkedAt = new Date().toISOString();
  const { id, ...record } = item;
  const pending = (reason:string, method='Revisión automática') => ({ id, record:{ ...record, review:true, verified:false, status:'Por confirmar', verificationCheckedAt:checkedAt, verificationReason:reason, verificationMethod:method, verificationVersion:VERIFICATION_VERSION } });
  const inconclusive = (reason:string, method='Revalidación técnica') => {
    const canKeep = record.verified === true && record.review === false && Boolean(record.verifiedAt) && Boolean(record.sourcePublishedAt) && !offerRetentionReason(record as unknown as Record<string,unknown>);
    if (canKeep) return { id, record:{ ...record, active:true, review:false, verified:true, status:'Verificada', verificationCheckedAt:checkedAt, verificationReason:reason, verificationMethod:method, verificationVersion:VERIFICATION_VERSION } };
    return pending(reason, method);
  };
  const reject = (reason:string) => ({ id, record:{ ...record, review:false, verified:false, active:false, status:'Descartada', verificationCheckedAt:checkedAt, verificationReason:reason, verificationMethod:'Revisión automática', verificationVersion:VERIFICATION_VERSION } });
  const verify = (reason:string, method:string, publishedAt:string) => ({ id, record:{ ...record, area:/por confirmar|señal/i.test(record.area) ? 'Oferta laboral verificada' : record.area, date:sourceDateLabel(publishedAt), sourcePublishedAt:publishedAt, review:false, verified:true, active:true, status:'Verificada', verificationCheckedAt:checkedAt, verificationReason:reason, verificationMethod:method, verificationVersion:VERIFICATION_VERSION, verifiedAt:record.verifiedAt || record.firstVerifiedAt || checkedAt, firstVerifiedAt:record.firstVerifiedAt || record.verifiedAt || checkedAt, lastVerifiedAt:checkedAt } });

  const qualityReason=publicJobExclusion(record as unknown as Record<string,unknown>);
  if (qualityReason) return pending('Procedencia o ubicación por revisar: '+qualityReason,'Validación de fuente individual');
  const safetyEvidence = [record.title, record.company, record.note, record.source, record.sourceDomain, record.url].filter(Boolean).join(' ');
  const unsafeReason = unsafeContentReason(safetyEvidence, record.url);
  if (unsafeReason) return reject(unsafeReason);
  if (!isLikelyJobOpportunity(safetyEvidence, record.url)) return reject('La publicación no corresponde a una oferta de trabajo concreta.');
  const publicAdapter=record.url ? publicSourceAdapter(record.url) : null;
  if (publicAdapter) {
    const page=await fetchPublicPage(record.url!,record.url!);
    const checked=page.error ? { status:'pending',reason:page.error } as PublicVerification : evaluatePublicJob(record.url!,page.raw,page.url,page.status);
    if (checked.status==='rejected') return reject(checked.reason);
    if (checked.status!=='verified') return inconclusive(checked.reason,'Fuente pública · revalidación pendiente');
    return { id,record:{ ...record,...verifiedPublicRecord(checked) as unknown as ListingRecord,
      date:sourceDateLabel(checked.source_published_at!),createdAt:record.createdAt,
      firstVerifiedAt:record.firstVerifiedAt || record.verifiedAt || checkedAt,
      verificationVersion:VERIFICATION_VERSION,verificationCheckedAt:checkedAt } };
  }
  const sourceDateEvidence = record.sourcePublishedAt || record.date || '';
  if (!record.verifiedAt && parseDiscoveryDate(sourceDateEvidence) && staleDiscoveryDate(sourceDateEvidence)) return reject('La publicación supera la antigüedad máxima de 45 días.');
  if (record.expiresAt && Date.parse(record.expiresAt) < Date.now()) return reject('La fecha de postulación o vigencia ya terminó.');
  const targets = verificationTargets(record);
  if (!targets.length) return pending('Falta confirmar una comuna objetivo como lugar de trabajo o reclutamiento.');
  const visualEvidence = Boolean(record.socialEvidence) || /radar-social-(?:visual|text)/.test(record.discoveredBy || '');
  if (visualEvidence) {
    if (record.socialEvidence && socialExplicitClosure(record.socialEvidence.text)) return reject('La publicación indica que la postulación está cerrada.');
    const deadline=socialSourceDate(record.socialEvidence?.deadline,true);
    if (deadline && Date.parse(deadline)<=Date.now()) return reject('La fecha de postulación informada ya terminó.');
    const blocked=socialVerificationBlock(record,extractCommunes);
    if (blocked) return inconclusive(blocked,'Afiche y texto · evidencia incompleta');
    const application=await checkSocialApplication(record.socialEvidence!,url=>fetchPublicPage(url));
    if (application.status==='closed') return reject(application.reason);
    if (application.status!=='ready') return inconclusive(application.reason,'Destino de postulación pendiente');
    return verify(application.reason,'Afiche y texto de la publicación · postulación documentada',record.socialEvidence!.postDate!);
  }
  if (!record.url) return pending(record.evidenceImagePath ? 'El aviso fotográfico es útil, pero todavía falta una fuente pública o confirmación de vigencia.' : 'Falta un enlace público específico para confirmar la publicación.');
  if (!isSpecificJobResult(record.title, record.url)) {
    const trusted = sourceVerificationTier(verificationHost(record.url, record.sourceDomain));
    const publishedTs = parseDiscoveryDate(record.sourcePublishedAt || '');
    if ((trusted === 'official' || trusted === 'portal') && typeof publishedTs === 'number' && !staleDiscoveryDate(record.sourcePublishedAt || '') && Boolean(record.title) && Boolean(record.note) && Boolean(record.contact) && moderate(safetyEvidence)) return verify('Aviso accionable en fuente institucional o portal reconocido; fecha, comuna y contacto documentados, aunque no exista página individual.', 'Fuente reconocida · evidencia estructurada', new Date(publishedTs).toISOString());
    return pending('El enlace apunta a una página general o listado, no a una publicación individual.');
  }

  const host = verificationHost(record.url, record.sourceDomain);
  const tier = sourceVerificationTier(host);
  const indexedEvidence = [record.title, record.note, record.url].filter(Boolean).join(' ');
  const indexedTarget = hasTargetEvidence(indexedEvidence, record);
  const indexedJob = isLikelyJobOpportunity(indexedEvidence, record.url) && moderate(indexedEvidence);
  const ageMs = Date.now() - Date.parse(record.createdAt);
  const verifyTrustedIndexed = () => {
    if ((tier !== 'official' && tier !== 'portal') || !indexedJob || !indexedTarget || !record.sourcePublishedAt || !record.url) return null;
    const publishedTs = parseDiscoveryDate(record.sourcePublishedAt);
    if (!publishedTs) return null;
    const publishedAt = new Date(publishedTs).toISOString();
    if (staleDiscoveryDate(publishedAt)) return null;
    const sourceType = tier === 'official' ? 'Fuente oficial' : 'Portal laboral';
    return verify(`${sourceType} temporalmente limitada para lectura automática; URL específica, cargo, comuna y fecha reciente ya estaban confirmados por evidencia indexada del hallazgo.`, `${sourceType} · evidencia indexada reforzada`, publishedAt);
  };
  let scrapeFallback: Promise<ReturnType<typeof verify> | ReturnType<typeof reject> | null> | null = null;
  const verifyViaScrape = () => {
    if (visualEvidence) return Promise.resolve(null);
    if (scrapeFallback) return scrapeFallback;
    scrapeFallback = (async () => {
      try {
        const scraped = await guardedAi.scrape({ url:record.url! });
        if (scraped.status === 404 || scraped.status === 410) return reject('La publicación original ya no está disponible en la fuente.');
        if (scraped.status >= 400 || !scraped.text) return null;
        const scrapeText = [scraped.title, scraped.text, record.url].filter(Boolean).join(' ').slice(0, 220000);
        if (unavailableSourceSignal(scrapeText)) return reject('La publicación original ya no está disponible en la fuente.');
        if (expiredSourceSignal(scrapeText)) return reject('La fuente indica que la oferta o postulación está cerrada o vencida.');
        const scrapeUnsafeReason = unsafeContentReason(scrapeText, record.url);
        if (scrapeUnsafeReason) return reject(scrapeUnsafeReason);
        if (!moderate(scrapeText)) return reject('La publicación contiene una señal de riesgo o una condición incompatible con las reglas de Trabajo Cerca.');
        if (!isLikelyJobOpportunity(scrapeText, record.url)) return null;
        if (!hasTargetEvidence(scrapeText, record)) return null;
        const publishedTs = parseDiscoveryDate(record.sourcePublishedAt || record.date) ?? parseDiscoveryDate(scrapeText.slice(0, 70000));
        if (!publishedTs) return null;
        const publishedAt = new Date(publishedTs).toISOString();
        if (staleDiscoveryDate(publishedAt)) return reject('La publicación supera la antigüedad máxima de 45 días.');
        if (tier === 'official') return verify('Fuente pública/oficial comprobada mediante extracción reforzada; cargo, comuna y fecha reciente confirmados.', 'Fuente oficial · lectura reforzada', publishedAt);
        if (tier === 'portal') return verify('Portal laboral reconocido comprobado mediante extracción reforzada; cargo, comuna y fecha reciente confirmados.', 'Portal laboral · lectura reforzada', publishedAt);
        if (tier === 'social' && ageMs <= DISCOVERY_MAX_AGE_DAYS * 86400000) return verify('Publicación social pública comprobada mediante extracción reforzada; trabajo, comuna y fecha reciente confirmados.', 'Publicación social · lectura reforzada', publishedAt);
        if (tier === 'secondary') return null;
        return verify('Página pública específica comprobada mediante extracción reforzada; trabajo, comuna y fecha reciente confirmados.', 'Publicación pública · lectura reforzada', publishedAt);
      } catch {
        return null;
      }
    })();
    return scrapeFallback;
  };

  try {
    const response = await fetch(record.url, {
      headers:{ 'user-agent':'Mozilla/5.0 TrabajoCercaVerifier/1.0', 'accept':'text/html,application/xhtml+xml' },
      redirect:'follow',
      signal:AbortSignal.timeout(4000),
    });
    if (response.status === 404 || response.status === 410) return reject('La publicación original ya no está disponible en la fuente.');
    if (response.status === 401 || response.status === 403 || response.status === 429) {
      const reinforced = await verifyViaScrape();
      return reinforced ?? verifyTrustedIndexed() ?? inconclusive('La fuente bloquea temporalmente la comprobación automática y la lectura reforzada tampoco pudo confirmarla.', 'Revalidación temporalmente bloqueada');
    }
    if (!response.ok) {
      const reinforced = await verifyViaScrape();
      return reinforced ?? verifyTrustedIndexed() ?? inconclusive('La fuente respondió HTTP ' + response.status + ' y la lectura reforzada tampoco pudo confirmarla.', 'Revalidación temporalmente no disponible');
    }
    const finalUrl = response.url || record.url;
    if (visualEvidence && !sameSocialPost(record.url,finalUrl)) return pending('La fuente redirigió a otra publicación; falta comprobar el aviso original.','Identidad social no confirmada');
    if (!isSpecificJobResult(record.title, finalUrl)) {
      const reinforced = await verifyViaScrape();
      return reinforced ?? reject('El enlace original redirige a una página general o ya no conserva la publicación individual.');
    }

    const raw = (await response.text()).slice(0, 600000);
    const pageText = cleanHtml(raw).slice(0, 180000);
    if (unavailableSourceSignal(pageText)) return reject('La publicación original ya no está disponible en la fuente.');
    if (expiredSourceSignal(pageText)) return reject('La fuente indica que la oferta o postulación está cerrada o vencida.');
    const sourceOnlyEvidence = [pageText, raw.slice(0, 180000), finalUrl].filter(Boolean).join(' ');
    const pageUnsafeReason = unsafeContentReason(sourceOnlyEvidence, record.url);
    if (pageUnsafeReason) return reject(pageUnsafeReason);
    if (!moderate(sourceOnlyEvidence)) return reject('La publicación contiene una señal de riesgo o una condición incompatible con las reglas de Trabajo Cerca.');
    const pageJob = structuredJobSignal(raw) || isLikelyJobOpportunity(sourceOnlyEvidence, finalUrl);
    const targetMatch = hasTargetEvidence(sourceOnlyEvidence, record);
    if (!pageJob) {
      const reinforced = await verifyViaScrape();
      if (reinforced) return reinforced;
      const indexedFallback = verifyTrustedIndexed();
      if (indexedFallback) return indexedFallback;
      if (tier === 'portal' || tier === 'social') return inconclusive('La fuente abre, pero ni la vista técnica ni la lectura reforzada permiten confirmar el cargo en esta pasada.', 'Revalidación técnica limitada');
      return reject('La fuente actual no confirma una oferta de trabajo concreta.');
    }
    if (!targetMatch) {
      const reinforced = await verifyViaScrape();
      if (reinforced) return reinforced;
      const indexedFallback = verifyTrustedIndexed();
      if (indexedFallback) return indexedFallback;
      if (tier === 'portal' || tier === 'social') return inconclusive('La fuente abre, pero ni la vista técnica ni la lectura reforzada permiten confirmar la ubicación en esta pasada.', 'Revalidación técnica limitada');
      return reject('La fuente original actual no confirma una comuna objetivo como lugar real de trabajo o reclutamiento.');
    }
    const publishedTs = parseDiscoveryDate(record.sourcePublishedAt || record.date) ?? parseDiscoveryDate(sourceOnlyEvidence.slice(0, 50000));
    if (!publishedTs) {
      const reinforced = await verifyViaScrape();
      return reinforced ?? verifyTrustedIndexed() ?? inconclusive('La oferta parece laboral y territorialmente correcta, pero la fecha no pudo releerse ni con la lectura reforzada.', 'Revalidación de fecha limitada');
    }
    const publishedAt = new Date(publishedTs).toISOString();
    if (staleDiscoveryDate(publishedAt)) return reject('La publicación supera la antigüedad máxima de 45 días.');

    if (tier === 'official') return verify('Fuente pública/oficial accesible; cargo, comuna y fecha reciente confirmados.', 'Fuente oficial contrastada', publishedAt);
    if (tier === 'portal') return verify('Portal laboral reconocido accesible; cargo, comuna y fecha reciente confirmados.', 'Portal laboral contrastado', publishedAt);
    if (tier === 'social' && ageMs <= DISCOVERY_MAX_AGE_DAYS * 86400000) return verify('Publicación social pública y específica accesible; trabajo, comuna y fecha reciente confirmados.', 'Publicación social pública contrastada', publishedAt);
    if (tier === 'secondary') return pending('La publicación existe en un agregador secundario; falta contrastar la fuente original antes de marcarla como verificada.');
    if (pageText.length >= 300 && indexedJob) return verify('Página pública específica accesible; trabajo, comuna y fecha reciente confirmados.', 'Publicación pública contrastada', publishedAt);
    return pending('La publicación abre, pero la evidencia disponible todavía no alcanza el estándar de verificación.');
  } catch {
    const reinforced = await verifyViaScrape();
    return reinforced ?? verifyTrustedIndexed() ?? inconclusive('No fue posible comprobar la fuente original ni mediante la lectura reforzada en esta pasada.', 'Revalidación temporalmente no disponible');
  }
}

type RadarPageCursor = { nextToken?:string | null; updatedAt?:string };

async function saveRadarPageCursor(table:string, current:(RadarPageCursor & { id:string }) | undefined, nextToken:string | undefined) {
  const checkpoint = { nextToken:nextToken || null, updatedAt:new Date().toISOString() };
  if (current) {
    const { id, ...record } = current;
    const [ok] = await db.update(table, [{ id, record:{ ...record, ...checkpoint } }]);
    if (!ok) throw new Error('Radar cursor update failed');
  } else {
    const [id] = await db.add(table, [checkpoint]);
    if (!id) throw new Error('Radar cursor creation failed');
  }
}

async function enrichRadarCandidates(limit=40) {
  const cursor = await db.list<RadarPageCursor>('radar_enrichment_cursor', { limit:1 });
  const [candidates, radarJobs] = await Promise.all([
    db.list<ListingRecord>('radar_candidates', {
      limit:200, ...(cursor.items[0]?.nextToken ? { nextToken:cursor.items[0].nextToken } : {}),
    }),
    db.list<ListingRecord>('radar_jobs', { limit:200 }),
  ]);
  const knownUrls = new Set(radarJobs.items.map(item => item.url).filter(Boolean));
  const knownSignatures = new Set(radarJobs.items.map(item => candidateSignature(item.title, item.workCommunes)));
  const selected = candidates.items
    .filter(item => item.active && item.kind === 'candidate' && Boolean(item.url))
    .filter(item => isSpecificJobResult(item.title, item.url || '') && !knownUrls.has(item.url))
    .sort((a,b) => (Date.parse(a.enrichmentCheckedAt || '') || 0) - (Date.parse(b.enrichmentCheckedAt || '') || 0))
    .slice(0, limit);
  const checkedAt = new Date().toISOString();
  const results:Array<{ id:string; original:ListingRecord; promoted:ListingRecord | null }> = [];
  for (let i=0; i<selected.length; i+=8) {
    const batch = selected.slice(i, i+8);
    const resolved = await Promise.all(batch.map(async item => {
      const { id, ...record } = item;
      const original = { ...record, enrichmentCheckedAt:checkedAt };
      try {
        let pageText = '';
        try {
          const response = await fetch(item.url!, {
            headers:{ 'user-agent':'Mozilla/5.0 TrabajoCercaEnricher/1.0', 'accept':'text/html,application/xhtml+xml' },
            redirect:'follow', signal:AbortSignal.timeout(3500),
          });
          if (response.ok) pageText = cleanHtml((await response.text()).slice(0, 600000)).slice(0, 180000);
        } catch {
          pageText = '';
        }
        if (!pageText || pageText.length < 300) {
          try {
            const scraped = await guardedAi.scrape({ url:item.url! });
            if (scraped.status < 400 && scraped.text) pageText = [scraped.title, scraped.text].filter(Boolean).join(' ').slice(0, 180000);
          } catch {
            pageText = pageText || '';
          }
        }
        const evidence = [item.title, item.note, item.url, pageText].filter(Boolean).join(' ');
        const detected = pageText ? extractCommunes(evidence) : [];
        const signature = candidateSignature(item.title, detected);
        if (!pageText || !relevantEmploymentSignal(evidence) || !moderate(evidence) ||
            expiredSourceSignal(pageText) || !detected.length ||
            knownUrls.has(item.url) || knownSignatures.has(signature)) {
          return { id, original, promoted:null };
        }
        const recruitmentCommunes = [...new Set([...item.recruitmentCommunes.filter(place => PILOT.includes(place)), ...detected])];
        const recruitmentZones = [...new Set([...item.recruitmentZones.filter(place => PILOT.includes(place)), ...detected])];
        const promoted:ListingRecord = {
          ...original, kind:'job_offer', workLocation:detected.join(' · '), workCommunes:detected,
          recruitmentZones, recruitmentCommunes, status:'Por confirmar',
          review:true, verified:false, active:true,
          evidence:[item.evidence, 'La página específica confirma una señal laboral y una comuna objetivo; pasa a verificación automática.'].filter(Boolean).join(' '),
        };
        knownUrls.add(item.url);
        knownSignatures.add(signature);
        return { id, original, promoted };
      } catch {
        return { id, original, promoted:null };
      }
    }));
    results.push(...resolved);
  }
  const additions = results.filter(result => result.promoted !== null);
  const addedIds = additions.length ? await trackedFeedAdd('radar_jobs', additions.map(result => result.promoted!)) : [];
  const successful = new Map<string,string>(additions.flatMap((result, i) => addedIds[i] ? [[result.id, addedIds[i]!] as [string,string]] : []));
  const updates = results.map(result => ({
    id:result.id,
    record:successful.has(result.id)
      ? { ...result.original, active:false, status:'Promovido a verificación', radarJobId:successful.get(result.id) }
      : { ...result.original },
  }));
  const saved = updates.length ? await db.update('radar_candidates', updates) : [];
  if (saved.length !== updates.length || saved.some(ok => !ok)) {
    throw new Error('Candidate checkpoint write failed; review partial writes before retry');
  }
  await saveRadarPageCursor('radar_enrichment_cursor', cursor.items[0], candidates.nextToken);
  const failed = additions.length - successful.size;
  if (failed) throw new Error('Partial radar job insertion: ' + failed + ' candidates remain active');
  return { scanned:selected.length, promoted:successful.size, failed:0 };
}

async function processPendingOffers(limit=40) {
  const cursor = await db.list<RadarPageCursor>('radar_verification_cursor', { limit:1 });
  const rows = await db.list<ListingRecord>('radar_jobs', {
    limit:200, ...(cursor.items[0]?.nextToken ? { nextToken:cursor.items[0].nextToken } : {}),
  });
  const reviewCutoff = Date.now() - 6 * 3600000;
  const liveRecheckCutoff = Date.now() - 24 * 3600000;
  const pending = rows.items
    .filter(item => item.active && item.kind === 'job_offer')
    .filter(item => item.review || item.verified || Boolean(item.verificationMethod))
    .filter(item => {
      if (item.verificationVersion !== VERIFICATION_VERSION) return true;
      const checked = Date.parse(item.verificationCheckedAt || '');
      if (item.review) return !checked || checked < reviewCutoff;
      if (item.verified) return offerRecheckDue(item as unknown as Record<string,unknown>) && (!checked || checked < liveRecheckCutoff);
      return false;
    })
    .sort((a,b) => {
      const frequent=(item:ListingRecord)=>['portal','social'].includes(sourceVerificationTier(verificationHost(item.url,item.sourceDomain)));
      return recheckPriority(b,Date.now(),frequent(b))-recheckPriority(a,Date.now(),frequent(a)) || (Date.parse(a.verificationCheckedAt || '') || 0)-(Date.parse(b.verificationCheckedAt || '') || 0);
    })
    .slice(0, limit);
  const updates:Array<{ id:string; record:Record<string,unknown> }> = [];
  for (let i=0; i<pending.length; i+=16) {
    const resolved = await Promise.all(pending.slice(i, i+16).map(item => verifyPendingOffer(item)));
    updates.push(...resolved);
  }
  const saved = updates.length ? await trackedFeedUpdate('radar_jobs', updates) : [];
  if (saved.length !== updates.length || saved.some(ok => !ok)) {
    throw new Error('Partial verification write; publication counters must not claim success');
  }
  await saveRadarPageCursor('radar_verification_cursor', cursor.items[0], rows.nextToken);
  const verified = updates.filter(update => update.record.verified === true).length;
  const rejected = updates.filter(update => update.record.active === false).length;
  return { processed:updates.length, verified, rejected, kept:updates.length - verified - rejected };
}

async function reactivateOverstrictFalseNegatives() {
  const rows = await db.list<ListingRecord>('radar_jobs', { limit:200 });
  const recoverable = rows.items.filter(item => {
    if (item.active || item.kind !== 'job_offer') return false;
    const priorVerified = Boolean(item.verifiedAt && item.sourcePublishedAt && !staleDiscoveryDate(item.sourcePublishedAt));
    if (!priorVerified) return false;
    const reason = item.verificationReason || '';
    if (/no disponible|404|410|cerrad|vencid|expirad|retirad|eliminad|riesgo|contenido adulto|antigua/i.test(reason)) return false;
    return /no confirma una oferta de trabajo concreta|no confirma una comuna objetivo|no corresponde a una oferta de trabajo concreta|no demuestra una comuna objetivo/i.test(reason);
  });
  const updates = recoverable.map(item => {
    const { id, ...record } = item;
    const wasVerified = Boolean(record.verifiedAt && record.sourcePublishedAt && !staleDiscoveryDate(record.sourcePublishedAt));
    return {
      id,
      record:{
        ...record,
        active:true,
        review:!wasVerified,
        verified:wasVerified,
        status:wasVerified ? 'Verificada' : 'Por confirmar',
        verificationReason:'Reactivada para revalidación con criterio técnico corregido.',
        verificationMethod:'Recuperación de falso negativo',
      },
    };
  });
  if (updates.length) await trackedFeedUpdate('radar_jobs', updates);
  return updates.length;
}

async function recoveryStageSummary(label:string, audits:SourceAudit[], enrichment:{ scanned:number; promoted:number }, verification:{ processed:number; verified:number; rejected:number; kept:number }) {
  const feed = await rebuildPublicFeed();
  return {
    label,
    found:audits.reduce((sum,item)=>sum+item.candidatesFound,0),
    discovered:audits.reduce((sum,item)=>sum+item.newCandidates,0),
    promoted:enrichment.promoted,
    processed:verification.processed,
    verified:verification.verified,
    rejected:verification.rejected,
    kept:verification.kept,
    publicItems:feed.itemCount,
    publicJobs:feed.totalVerifiedJobOffers,
  };
}

async function recoverEmptyPublicFeed(force=false) {
  const now = new Date();
  const dayKey = now.toISOString().slice(0, 10);
  const state = await db.list<{ dayKey:string; ranAt:string; version?:string; completed?:boolean; result?:unknown }>('radar_empty_recovery', { limit:20 });
  const already = state.items.find(item => item.dayKey === dayKey && item.version === EMPTY_RECOVERY_VERSION && item.completed);
  if (already && !force) {
    const control = await db.list<{ itemCount:number }>('public_feed_control', { limit:1 });
    return { ran:false, reason:'already-ran-this-version', itemCount:control.items[0]?.itemCount ?? 0, result:already.result };
  }

  await ensureSourceRegistry();
  const reactivated = await reactivateOverstrictFalseNegatives();
  const snapshotBefore = await usableOfferSnapshot();
  const enrichment = await enrichRadarCandidates(12);
  const verification = await processPendingOffers(16);
  await cleanRadarInventory();
  const finalFeed = await rebuildPublicFeed();
  const notificationResult = finalFeed.totalVerifiedJobOffers > 0 ? await runNotificationSweep() : { skipped:true, reason:'empty-job-feed' };
  const result = {
    reactivated,
    snapshotBefore,
    enrichment,
    verification,
    itemCount:finalFeed.itemCount,
    verifiedJobs:finalFeed.totalVerifiedJobOffers,
    notificationResult,
  };
  await db.add('radar_empty_recovery', [{ dayKey, ranAt:new Date().toISOString(), version:EMPTY_RECOVERY_VERSION, completed:true, result }]);
  return { ran:true, ...result };
}

async function pruneNoisyTavilyCandidates() {
  const candidates = await db.list<ListingRecord>('radar_candidates', { limit: 200 });
  const updates: Array<{ id:string; record:Record<string, unknown> }> = [];
  for (const item of candidates.items) {
    if (!item.active || item.source !== 'Motor web independiente · Tavily') continue;
    const evidence = [item.title, item.note, item.workLocation, item.area].filter(Boolean).join(' ');
    if (item.url && (isSpecificJobResult(item.title, item.url) || (item.workCommunes.length > 0 && relevantEmploymentSignal(evidence)))) continue;
    const { id, ...record } = item;
    updates.push({ id, record:{ ...record, active:false, status:'Descartado por calidad' } });
  }
  if (updates.length) await db.update('radar_candidates', updates);
  return updates.length;
}

function sourcePriority(source:SourceRecord) {
  if (source.priority) return source.priority;
  if (/OMIL|municip/i.test(source.family + ' ' + source.name)) return 'A' as const;
  if (/Página local|territorial/i.test(source.family + ' ' + source.name)) return 'A' as const;
  if (/Portal laboral directo/i.test(source.family)) return 'B' as const;
  return 'B' as const;
}

function sourceCadenceHours(source:SourceRecord) {
  if (source.cadenceHours && source.cadenceHours > 0) return source.cadenceHours;
  const priority = sourcePriority(source);
  if (priority === 'A+') return 8;
  if (priority === 'A') return 12;
  if (priority === 'B') return 24;
  if (priority === 'C') return 72;
  return 168;
}

function canonicalJobUrl(value:string) {
  try { const url = new URL(value); url.hash=''; for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_|ref$|source$)/i.test(key)) url.searchParams.delete(key); return url.hostname.replace(/^www\./,'').toLowerCase() + url.pathname.replace(/\/$/,'') + (url.search ? url.search : ''); } catch { return value; }
}

function sourceFingerprint(matches:Array<{ title:string; url:string; context?:string; publishedAt?:string }>) {
  const text = matches.map(item => `${normalizedMatchText(item.title)}|${canonicalJobUrl(item.url)}|${item.publishedAt || ''}|${normalizedMatchText(item.context || '').slice(0,180)}`).sort().join('||');
  let hash = 2166136261;
  for (let i=0; i<text.length; i+=1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function sourceIsDue(source:SourceRecord, state?:SourceScanState) {
  if (!state?.lastCheckedAt) return true;
  const checked = Date.parse(state.lastCheckedAt);
  return !Number.isFinite(checked) || checked < Date.now() - sourceCadenceHours(source) * 3600000;
}

async function scanPublicSource(source: SourceRecord, priorState?:SourceScanState) {
  const checkedAt = new Date().toISOString();
  if (!source.scanUrl) return { audit:{ sourceKey:source.key, checkedAt, status:'error' as const, linksSeen:0, candidatesFound:0, newCandidates:0, message:'Sin URL de rastreo.' } };
  try {
    const response = await fetch(source.scanUrl, { headers:{ 'user-agent':'TrabajoCercaRadar/3.0' }, signal:AbortSignal.timeout(6500) });
    if (!response.ok) {
      return { audit:{ sourceKey:source.key, checkedAt, status:response.status === 403 || response.status === 429 ? 'blocked' as const : 'error' as const, linksSeen:0, candidatesFound:0, newCandidates:0, message:'HTTP ' + response.status } };
    }
    const html = (await response.text()).slice(0, 800000);
    const anchors = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].slice(0, 500);
    const matches: Array<{ title:string; url:string; context:string; publishedAt?:string }> = [];
    for (const anchor of anchors) {
      const rawHref = anchor[1];
      const title = cleanHtml(anchor[2]);
      if (!title || title.length < 5) continue;
      let url = '';
      try { url = new URL(rawHref, source.scanUrl).toString(); } catch { continue; }
      const index = anchor.index || 0;
      const context = cleanHtml(html.slice(Math.max(0, index - 260), Math.min(html.length, index + anchor[0].length + 520))).slice(0, 760);
      const directEvidence = [title, context, url].join(' ');
      const portalSpecific = hostIn(urlHost(url), PORTAL_VERIFICATION_DOMAINS) && isSpecificJobResult(title, url);
      if ((!portalSpecific && !isLikelyJobOpportunity(directEvidence, url)) || unsafeContentReason(directEvidence, url)) continue;
      if (!matches.some(item => item.url === url)) {
        const publishedTs = parseDiscoveryDate(context);
        matches.push({ title:title.slice(0, 180), url, context, publishedAt:publishedTs ? new Date(publishedTs).toISOString() : undefined });
      }
      if (matches.length >= 60) break;
    }

    const fingerprint = sourceFingerprint(matches);
    const state:SourceScanState = {
      ...(priorState?.id ? { id:priorState.id } : {}),
      sourceKey:source.key,
      fingerprint,
      lastCheckedAt:checkedAt,
      lastChangedAt:priorState?.fingerprint === fingerprint ? (priorState.lastChangedAt || checkedAt) : checkedAt,
      lastLinksSeen:anchors.length,
      lastCandidatesFound:matches.length,
    };
    if (priorState?.fingerprint && priorState.fingerprint === fingerprint) {
      return { audit:{ sourceKey:source.key, checkedAt, status:'ok' as const, linksSeen:anchors.length, candidatesFound:matches.length, newCandidates:0, refreshedExisting:0, skippedUnchanged:matches.length, message:'Fuente sin cambios desde la última revisión.' }, state };
    }

    const [existingCandidates, radarJobs] = await Promise.all([
      db.list<ListingRecord>('radar_candidates', { limit: 200 }),
      db.list<ListingRecord>('radar_jobs', { limit: 200 }),
    ]);
    const index = existingListingIndexes(existingCandidates.items, radarJobs.items);
    const rediscoveryUpdates = new Map<string, RediscoveryUpdate>();
    const seenUrls = new Set<string>();
    const seenSignatures = new Set<string>();
    const additions: Record<string, unknown>[] = [];
    const autoPublic: Record<string, unknown>[] = [];
    let refreshedExisting = 0;

    for (const match of matches) {
      const detected = extractCommunes([match.title, match.context, match.url].join(' '));
      const signature = candidateSignature(match.title, detected);
      const existingRef = index.byUrl.get(match.url) || index.bySignature.get(signature);
      if (existingRef) {
        if (!terminalRediscoveryBlock(existingRef.item) && mergeRediscoveredEvidence(existingRef, rediscoveryUpdates, {
          checkedAt,
          source:source.name,
          discoveredBy:'Motor 1 · fuentes directas',
          publishedAt:match.publishedAt,
          workCommunes:detected,
          recruitmentCommunes:detected,
          evidence:`Redescubierta en ${source.name}`,
        })) refreshedExisting += 1;
        continue;
      }
      if (seenUrls.has(match.url) || (detected.length && seenSignatures.has(signature))) continue;
      const canAutoPublish = detected.length > 0 && isSpecificJobResult(match.title, match.url);
      const record: ListingRecord = {
        kind:canAutoPublish ? 'job_offer' : 'candidate',
        origin:'radar',
        title:match.title,
        company:source.name,
        workLocation:detected.length ? detected.join(' · ') : 'Ubicación por confirmar',
        workCommunes:detected,
        recruitmentZones:detected.length ? detected : ['Por confirmar'],
        recruitmentCommunes:detected,
        area:canAutoPublish ? 'Oferta institucional por confirmar' : 'Candidato del Radar',
        status:canAutoPublish ? 'Nueva' : 'En revisión',
        date:match.publishedAt ? sourceDateLabel(match.publishedAt) : 'Detectado automáticamente',
        source:source.name,
        sourceDomain:new URL(match.url).hostname.replace(/^www\./, ''),
        discoveredBy:'Motor 1 · fuentes directas',
        sourcePublishedAt:match.publishedAt,
        url:match.url,
        note:redactSensitive(match.context || (canAutoPublish ? 'Pista laboral detectada automáticamente en una fuente pública prioritaria.' : 'Detectado en una fuente pública prioritaria; requiere enriquecimiento.')),
        tags:[source.name, match.title, ...detected].join(' ').toLocaleLowerCase('es-CL').split(/\s+/).slice(0, 24),
        visual:'field',
        icon:'map',
        evidence:`Fuente maestra ${sourcePriority(source)} · ${source.name}`,
        evidenceSources:[source.name],
        lastSeenAt:checkedAt,
        review:true,
        verified:false,
        active:true,
        createdAt:checkedAt,
      };
      if (canAutoPublish) autoPublic.push(record);
      else additions.push(record);
      seenUrls.add(match.url);
      seenSignatures.add(signature);
    }
    await flushRediscoveryUpdates(rediscoveryUpdates);
    if (autoPublic.length) await trackedFeedAdd('radar_jobs', autoPublic);
    if (additions.length) await db.add('radar_candidates', additions);
    return { audit:{ sourceKey:source.key, checkedAt, status:'ok' as const, linksSeen:anchors.length, candidatesFound:matches.length, newCandidates:additions.length + autoPublic.length, refreshedExisting }, state };
  } catch (err) {
    return { audit:{ sourceKey:source.key, checkedAt, status:'error' as const, linksSeen:0, candidatesFound:0, newCandidates:0, message:err instanceof Error ? err.message.slice(0, 180) : 'Error de rastreo' } };
  }
}

async function runPublicSourceSweep(places?:readonly string[], force=false) {
  await ensureSourceRegistry();
  const [sources, states] = await Promise.all([
    db.list<SourceRecord>('radar_sources', { limit: 160 }),
    db.list<SourceScanState>('source_scan_state', { limit: 160 }),
  ]);
  const stateByKey = new Map(states.items.map(item => [item.sourceKey, item]));
  const rank:Record<string,number> = { 'A+':0, A:1, B:2, C:3, D:4 };
  const automatic = sources.items
    .filter(source => source.active && source.mode === 'public_scan')
    .filter(source => !places || source.territories.some(place => places.includes(place)))
    .filter(source => force || sourceIsDue(source, stateByKey.get(source.key)))
    .sort((a,b) => rank[sourcePriority(a)] - rank[sourcePriority(b)]);
  const audits: SourceAudit[] = [];
  const nextStates:SourceScanState[] = [];
  for (let i=0; i<automatic.length; i+=6) {
    const batch = await Promise.all(automatic.slice(i, i+6).map(source => scanPublicSource(source, stateByKey.get(source.key))));
    audits.push(...batch.map(item => item.audit));
    nextStates.push(...batch.map(item => item.state).filter(Boolean) as SourceScanState[]);
  }
  if (audits.length) await db.add('source_audits', audits);
  const stateUpdates:Array<{ id:string; record:Record<string, unknown> }> = [];
  const stateAdds:Record<string, unknown>[] = [];
  for (const state of nextStates) {
    const { id, ...record } = state;
    if (id) stateUpdates.push({ id, record });
    else stateAdds.push(record);
  }
  if (stateUpdates.length) await db.update('source_scan_state', stateUpdates);
  if (stateAdds.length) await db.add('source_scan_state', stateAdds);
  return audits;
}

type TavilyResult = { title?: string; url?: string; content?: string; score?: number; published_date?: string | null };

async function getTavilyKey() {
  if (!SECURITY_POLICY.paidProviders) return undefined;
  const names = await secrets.listSecretNames();
  if (!names.includes('TAVILY_API_KEY')) return undefined;
  return secrets.readSecret('TAVILY_API_KEY');
}

async function getBrightDataToken() {
  if (!SECURITY_POLICY.paidProviders) return undefined;
  const names=await secrets.listSecretNames();
  if(!names.includes('BRIGHTDATA_API_TOKEN')) return undefined;
  return secrets.readSecret('BRIGHTDATA_API_TOKEN');
}

const SOCIAL_VISUAL_POC=[
 {name:'Radio Nativa Lumaco · Facebook',network:'facebook',url:'https://www.facebook.com/RadioNativaCl',dataset:'gd_lyclm3ey2q6rww027t',territory:'Lumaco'},
 {name:'Radio Nativa Lumaco · Instagram',network:'instagram',url:'https://www.instagram.com/radionativacl/',dataset:'gd_l1vikfch901nx3by4',territory:'Lumaco'},
] as const;

function collectMediaUrls(value:unknown,out=new Set<string>(),depth=0):Set<string>{
 if(depth>5||value==null)return out;
 if(typeof value==='string'&&/^https?:\/\//i.test(value)&&(/\.(?:jpe?g|png|webp)(?:\?|$)/i.test(value)||/fbcdn|cdninstagram|scontent/i.test(value))) out.add(value);
 else if(Array.isArray(value)) for(const v of value) collectMediaUrls(v,out,depth+1);
 else if(typeof value==='object') for(const v of Object.values(value as Record<string,unknown>)) collectMediaUrls(v,out,depth+1);
 return out;
}

async function socialVisualPocHandlerCore(){
 const token=await getBrightDataToken();
 if(!token) return {ready:false,reason:'BRIGHTDATA_API_TOKEN pendiente',sources:SOCIAL_VISUAL_POC.map(s=>s.name)};
 const report=[] as Record<string,unknown>[];
 for(const source of SOCIAL_VISUAL_POC){
  try{
   const payload=source.network==='facebook'?[{url:source.url,num_of_posts:8,start_date:'',end_date:'',country:''}]:[{url:source.url}];
   const trigger=await fetch(`https://api.brightdata.com/datasets/v3/trigger?dataset_id=${source.dataset}&format=json`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(12000)});
   const raw=await trigger.text(); let data:unknown; try{data=JSON.parse(raw)}catch{data=raw}
   const media=[...collectMediaUrls(data)].slice(0,6); let imagesRead=0,jobImages=0; const findings=[] as Record<string,unknown>[];
   for(const mediaUrl of media){
    try{
     const img=await fetch(mediaUrl,{signal:AbortSignal.timeout(8000)}); if(!img.ok)continue;
     const mime=(img.headers.get('content-type')||'image/jpeg').split(';')[0]; if(!['image/jpeg','image/png','image/webp'].includes(mime))continue;
     const bytes=new Uint8Array(await img.arrayBuffer()); if(bytes.byteLength>6000000)continue;
     const b64=Buffer.from(bytes).toString('base64');
     const ocr=await guardedAi.ocr({images:[{data:b64,mimeType:mime}],prompt:'Lee esta imagen de una publicación social local chilena. Determina si contiene un aviso de empleo, búsqueda de personal, trabajo u oficio. Extrae literalmente cargo/oficio, empleador, comuna/localidad, contacto, fecha/plazo y texto relevante. No inventes.',schema:{type:'object',properties:{isJobNotice:{type:'boolean'},text:{type:'string'},title:{type:'string'},company:{type:'string'},commune:{type:'string'},contact:{type:'string'},date:{type:'string'}},required:['isJobNotice','text']},thinkingMode:'FAST',cache:true});
     imagesRead++; const x=(ocr.data&&typeof ocr.data==='object'?ocr.data:{}) as Record<string,unknown>;
     if(x.isJobNotice===true){jobImages++; findings.push({mediaUrl,title:x.title,company:x.company,commune:x.commune,contact:x.contact,date:x.date,text:normalizeText(x.text).slice(0,600)});}
    }catch{/* continue per image */}
   }
   report.push({source:source.name,http:trigger.status,mediaFound:media.length,imagesRead,jobImages,findings,responsePreview:typeof data==='string'?data.slice(0,240):undefined});
  }catch(err){report.push({source:source.name,error:err instanceof Error?err.message:String(err)});}
 }
 await db.add('source_audits',[{sourceKey:'social-visual-poc',checkedAt:new Date().toISOString(),status:'ok',linksSeen:report.reduce((n,r)=>n+Number(r.mediaFound||0),0),candidatesFound:report.reduce((n,r)=>n+Number(r.jobImages||0),0),newCandidates:0,message:`POC visual social: ${JSON.stringify(report).slice(0,2500)}`}]);
 return {ready:true,report};
}

export const socialVisualPocHandler=async()=>{const result=await socialVisualPocHandlerCore(); console.warn('SOCIAL_VISUAL_POC '+JSON.stringify(result)); return {statusCode:200};};
export const socialVisualPocReportHandler=async()=>{const rows=await db.list<Record<string,unknown>>('source_audits',{limit:100});const latest=rows.items.filter(r=>r.sourceKey==='social-visual-poc').sort((a,b)=>Date.parse(String(b.checkedAt||''))-Date.parse(String(a.checkedAt||'')))[0];throw new Error('SOCIAL_VISUAL_RESULT '+JSON.stringify(latest||{missing:true}));};
export const socialVisualAuthTestHandler=async()=>{const names=await secrets.listSecretNames();const token=names.includes('BRIGHTDATA_API_TOKEN')?await secrets.readSecret('BRIGHTDATA_API_TOKEN'):undefined;if(!token)throw new Error('BRIGHTDATA_TEST token_missing names='+names.join(','));const res=await fetch('https://api.brightdata.com/datasets/v3/trigger?dataset_id=gd_l1vikfch901nx3by4&format=json',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify([{url:'https://www.instagram.com/radionativacl/'}]),signal:AbortSignal.timeout(15000)});const body=await res.text();throw new Error('BRIGHTDATA_TEST status='+res.status+' body='+body.slice(0,1200));};
export const socialVisualSnapshotTestHandler=async()=>{const token=await getBrightDataToken();if(!token)throw new Error('SOCIAL_SNAPSHOT token_missing');const id='sd_muwmtns6v767mbbg4';const progress=await fetch(`https://api.brightdata.com/datasets/v3/progress/${id}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});const p=await progress.text();const snap=await fetch(`https://api.brightdata.com/datasets/v3/snapshot/${id}?format=json`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});const body=await snap.text();throw new Error('SOCIAL_SNAPSHOT progress='+p.slice(0,500)+' snapshot_status='+snap.status+' body='+body.slice(0,5000));};
function collectAllUrls(value:unknown,out=new Set<string>(),depth=0):Set<string>{if(depth>8||value==null)return out;if(typeof value==='string'&&/^https?:\/\//i.test(value))out.add(value);else if(Array.isArray(value))for(const v of value)collectAllUrls(v,out,depth+1);else if(typeof value==='object')for(const v of Object.values(value as Record<string,unknown>))collectAllUrls(v,out,depth+1);return out;}
export const socialVisualDiscoveryTestHandler=async()=>{const token=await getBrightDataToken();if(!token)throw new Error('SOCIAL_DISCOVERY token_missing');const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};const ig=await fetch('https://api.brightdata.com/datasets/v3/snapshot/sd_muwmtns6v767mbbg4?format=json',{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});const igData=await ig.json() as unknown;const first=Array.isArray(igData)?igData[0]:igData;const keys=first&&typeof first==='object'?Object.keys(first as Record<string,unknown>):[];const urls=[...collectAllUrls(igData)].slice(0,80);const fb=await fetch('https://api.brightdata.com/datasets/v3/trigger?dataset_id=gd_lkaxegm826bjpoo9m5&format=json&uncompressed_webhook=true',{method:'POST',headers,body:JSON.stringify([{url:'https://www.facebook.com/RadioNativaCl/',num_of_posts:10,start_date:'',end_date:'',country:''}]),signal:AbortSignal.timeout(15000)});const fbBody=await fb.text();throw new Error('SOCIAL_DISCOVERY ig_keys='+JSON.stringify(keys)+' ig_urls='+JSON.stringify(urls)+' fb_status='+fb.status+' fb='+fbBody.slice(0,800));};
export const socialVisualMediaTestHandler=async()=>{const token=await getBrightDataToken();if(!token)throw new Error('SOCIAL_MEDIA token_missing');const h={Authorization:`Bearer ${token}`};const ig=await fetch('https://api.brightdata.com/datasets/v3/snapshot/sd_muwmtns6v767mbbg4?format=json',{headers:h,signal:AbortSignal.timeout(10000)});const data=await ig.json() as Record<string,unknown>[];const root=data[0]||{};const posts=Array.isArray(root.posts)?root.posts as Record<string,unknown>[]:[];const postSample=posts.slice(0,3).map(p=>({keys:Object.keys(p),urls:[...collectAllUrls(p)].slice(0,12)}));const list=await fetch('https://api.brightdata.com/datasets/v3/snapshots?dataset_id=gd_lkaxegm826bjpoo9m5',{headers:h,signal:AbortSignal.timeout(10000)});const fbSnaps=await list.json() as unknown;throw new Error('SOCIAL_MEDIA posts='+posts.length+' sample='+JSON.stringify(postSample).slice(0,3500)+' fb_snapshots='+JSON.stringify(fbSnaps).slice(0,1200));};
export const socialVisualOcrTestHandler=async()=>{const token=await getBrightDataToken();if(!token)throw new Error('SOCIAL_OCR token_missing');const snap=await fetch('https://api.brightdata.com/datasets/v3/snapshot/sd_muwmtns6v767mbbg4?format=json',{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});const data=await snap.json() as Record<string,unknown>[];const posts=Array.isArray(data[0]?.posts)?data[0].posts as Record<string,unknown>[]:[];const post=posts.find(p=>typeof p.image_url==='string')||{};const imageUrl=normalizeText(post.image_url);if(!imageUrl)throw new Error('SOCIAL_OCR no_image');const img=await fetch(imageUrl,{signal:AbortSignal.timeout(10000)});const mime=(img.headers.get('content-type')||'image/jpeg').split(';')[0];const bytes=new Uint8Array(await img.arrayBuffer());const b64=Buffer.from(bytes).toString('base64');const ocr=await guardedAi.ocr({images:[{data:b64,mimeType:['image/jpeg','image/png','image/webp'].includes(mime)?mime:'image/jpeg'}],prompt:'Lee completamente esta imagen de una publicación social chilena. Indica si contiene un aviso laboral. Extrae texto visible, cargo/oficio, empresa, comuna/localidad y contacto. No inventes.',schema:{type:'object',properties:{isJobNotice:{type:'boolean'},text:{type:'string'},title:{type:'string'},company:{type:'string'},commune:{type:'string'},contact:{type:'string'}},required:['isJobNotice','text']},thinkingMode:'FAST',cache:true});throw new Error('SOCIAL_OCR post='+normalizeText(post.url)+' datetime='+normalizeText(post.datetime)+' caption='+normalizeText(post.caption).slice(0,300)+' result='+JSON.stringify(ocr.data||{text:ocr.text}).slice(0,3500));};
export const socialFacebookResultTestHandler=async()=>{const token=await getBrightDataToken();if(!token)throw new Error('FB_RESULT token_missing');const h={Authorization:`Bearer ${token}`};const list=await fetch('https://api.brightdata.com/datasets/v3/snapshots?dataset_id=gd_lkaxegm826bjpoo9m5',{headers:h,signal:AbortSignal.timeout(10000)});const raw=await list.json() as unknown;const arr=Array.isArray(raw)?raw:(raw&&typeof raw==='object'&&Array.isArray((raw as Record<string,unknown>).snapshots)?(raw as Record<string,unknown>).snapshots as unknown[]:[]);const first=arr[0] as Record<string,unknown>|undefined;const id=normalizeText(first?.id||first?.snapshot_id);if(!id)throw new Error('FB_RESULT no_snapshot '+JSON.stringify(raw).slice(0,1800));const res=await fetch(`https://api.brightdata.com/datasets/v3/snapshot/${id}?format=json`,{headers:h,signal:AbortSignal.timeout(10000)});const body=await res.json() as unknown;const records=Array.isArray(body)?body:[];const sample=records.slice(0,3).map(x=>({keys:x&&typeof x==='object'?Object.keys(x as Record<string,unknown>):[],urls:[...collectAllUrls(x)].slice(0,15)}));throw new Error('FB_RESULT id='+id+' status='+res.status+' records='+records.length+' sample='+JSON.stringify(sample).slice(0,3800));};
async function ocrSocialPost(p:Record<string,unknown>){const u=normalizeText(p.image_url);if(!u)return null;try{const img=await fetch(u,{signal:AbortSignal.timeout(8000)});const mime=(img.headers.get('content-type')||'image/jpeg').split(';')[0];const b64=Buffer.from(new Uint8Array(await img.arrayBuffer())).toString('base64');const o=await guardedAi.ocr({images:[{data:b64,mimeType:['image/jpeg','image/png','image/webp'].includes(mime)?mime:'image/jpeg'}],prompt:'¿Esta imagen contiene un aviso laboral? Lee el texto y extrae cargo, empresa, comuna y contacto. No inventes.',schema:{type:'object',properties:{isJobNotice:{type:'boolean'},text:{type:'string'},title:{type:'string'},company:{type:'string'},commune:{type:'string'},contact:{type:'string'}},required:['isJobNotice','text']},thinkingMode:'FAST',cache:true});return {url:p.url,datetime:p.datetime,result:o.data||{text:o.text}};}catch(e){return {url:p.url,error:e instanceof Error?e.message:String(e)}}}
export const socialInstagramBatchOcrHandler=async()=>{const token=await getBrightDataToken();if(!token)throw new Error('IG_BATCH token_missing');const s=await fetch('https://api.brightdata.com/datasets/v3/snapshot/sd_muwmtns6v767mbbg4?format=json',{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});const d=await s.json() as Record<string,unknown>[];const posts=(Array.isArray(d[0]?.posts)?d[0].posts:[]) as Record<string,unknown>[];const results=await Promise.all(posts.slice(0,4).map(ocrSocialPost));throw new Error('IG_BATCH '+JSON.stringify(results).slice(0,5000));};

function socialOriginalDate(post:Record<string,unknown>):string {
  return originalSocialDate(post);
}

function socialSnapshotPosts(payload:unknown):Record<string,unknown>[] {
  const rows=Array.isArray(payload)?payload:(payload&&typeof payload==='object'?[payload]:[]);
  return rows.flatMap(value=>{
    if(!value||typeof value!=='object')return [];
    const row=value as Record<string,unknown>;
    if(Array.isArray(row.posts))return row.posts.filter(p=>p&&typeof p==='object') as Record<string,unknown>[];
    if(Array.isArray(row.records))return row.records.filter(p=>p&&typeof p==='object') as Record<string,unknown>[];
    return [row];
  });
}

async function socialTextOffers(post:Record<string,unknown>):Promise<Record<string,unknown>[]> {
  const finding=captionSocialFinding(post);
  return finding ? [finding] : [];
}

const SOCIAL_TARGETS=[
 {key:'angol-municipio',name:'Ilustre Municipalidad de Angol',territory:'Angol',url:'https://www.facebook.com/municipalidad.angol/'},
 {key:'lumaco-municipio',name:'Municipalidad de Lumaco',territory:'Lumaco · Capitán Pastene',url:'https://www.facebook.com/municipalidadlumaco/'},
 {key:'lumaco-radio',name:'Radio Nativa',territory:'Lumaco · Capitán Pastene',url:'https://www.facebook.com/RadioNativaCl/'},
 {key:'nacimiento-municipio',name:'Municipalidad de Nacimiento',territory:'Nacimiento',url:'https://www.facebook.com/MunicipalidadDeNacimiento/'},
 {key:'victoria-municipio',name:'Municipalidad de Victoria',territory:'Victoria',url:'https://www.facebook.com/victoriachile/'},
 {key:'lumaco-radio-instagram',name:'Radio Nativa · Instagram',territory:'Lumaco · Capitán Pastene',url:'https://www.instagram.com/radionativacl/'}, 
] as const;

export const socialTerritorialTriggerHandler=async()=>{
 if (!SECURITY_POLICY.paidProviders || !SECURITY_POLICY.remoteAi) {
  console.warn('SOCIAL_CAPTURE_SKIPPED '+JSON.stringify({handler:'socialTerritorialTriggerHandler',reason:'security_policy_disabled',providerCalls:0}));
  return {statusCode:200,skipped:true,reason:'security_policy_disabled'};
 }

 const token=await getBrightDataToken(); if(!token)throw new Error('SOCIAL_TARGET trigger token_missing');
 const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'}; const runs:Record<string,unknown>[]=[];
 const backlog=await db.list<Record<string,unknown>>('social_capture_runs',{limit:200});const pendingKeys=new Set(backlog.items.filter(x=>x.status==='pending').map(x=>normalizeText(x.sourceKey)));for(const source of SOCIAL_TARGETS){if(pendingKeys.has(source.key)){runs.push({source:source.name,status:'deferred-pending'});continue;}try{const instagram=source.url.includes('instagram.com');const dataset=instagram?'gd_l1vikfch901nx3by4':'gd_lkaxegm826bjpoo9m5';const payload=instagram?[{url:source.url}]:[{url:source.url,num_of_posts:8,start_date:'',end_date:'',country:''}];const res=await fetch(`https://api.brightdata.com/datasets/v3/trigger?dataset_id=${dataset}&format=json`,{method:'POST',headers,body:JSON.stringify(payload),signal:AbortSignal.timeout(12000)});const body=await res.json() as Record<string,unknown>;const snapshotId=normalizeText(body.snapshot_id);runs.push({...source,snapshotId,http:res.status});if(snapshotId)await db.add('social_capture_runs',[{sourceKey:source.key,sourceName:source.name,territory:source.territory,sourceUrl:source.url,snapshotId,status:'pending',createdAt:new Date().toISOString()}]);}catch(e){runs.push({...source,error:e instanceof Error?e.message:String(e)});}}
 console.warn('SOCIAL_TARGET_TRIGGER '+JSON.stringify(runs)); return {statusCode:200};
};

function socialFindingRecord(finding:Record<string,unknown>, source:string, territory:string, capturedAt:string):ListingRecord | null {
  const now=new Date().toISOString();
  const prepared=prepareSocialEvidence(finding,capturedAt,extractCommunes);
  const url=normalizeText(finding.postUrl), title=normalizeText(finding.title);
  if (!url || !title) return null;
  const recruitment=extractCommunes(territory);
  return {
    kind:'job_offer',origin:'radar',title,company:prepared.company || 'Empresa por confirmar',
    workLocation:prepared.workplace || 'Lugar de trabajo por confirmar',workCommunes:prepared.workCommunes,
    recruitmentZones:recruitment,recruitmentCommunes:recruitment,area:'Radar social',status:'Por confirmar',
    date:prepared.published ? sourceDateLabel(prepared.published) : 'Fecha por confirmar',
    expiresAt:prepared.deadline || undefined,sourcePublishedAt:prepared.published || undefined,
    apply:'Sencilla',source:source || 'Fuente social local',sourceDomain:verificationHost(url,'facebook.com'),
    discoveredBy:normalizeText(finding.medium)==='text' ? 'radar-social-text' : 'radar-social-visual',
    url,note:[String(prepared.row.text),normalizeText(finding.requirements)].filter(Boolean).join(' · ').slice(0,1200),
    tags:[title,prepared.company,prepared.workplace].join(' ').toLowerCase().split(/\s+/).slice(0,20),
    visual:'field',icon:'work',review:true,verified:false,active:true,createdAt:now,lastSeenAt:now,
    contact:prepared.contact || undefined,socialEvidence:prepared.evidence,
    verificationReason:prepared.ready ? 'Datos del afiche completos; falta comprobar la publicación original.' : 'Falta confirmar: '+prepared.evidence.missing.join(', ')+'.',
  };
}

export const socialTerritorialCollectHandler=async()=>{
 if (!SECURITY_POLICY.paidProviders || !SECURITY_POLICY.remoteAi) {
  console.warn('SOCIAL_CAPTURE_SKIPPED '+JSON.stringify({handler:'socialTerritorialCollectHandler',reason:'security_policy_disabled',providerCalls:0}));
  return {statusCode:200,skipped:true,reason:'security_policy_disabled'};
 }

 const token=await getBrightDataToken(); if(!token)throw new Error('SOCIAL_TARGET collect token_missing');
 const pendingRows:Record<string,unknown>[]=[];let nextPendingToken:string|undefined;for(let page=0;page<3;page++){const batch=await db.list<Record<string,unknown>>('social_capture_runs',{limit:100,...(nextPendingToken?{nextToken:nextPendingToken}:{})});pendingRows.push(...batch.items.filter(x=>x.status==='pending'));if(pendingRows.length>=12||!batch.nextToken)break;nextPendingToken=batch.nextToken;}const rows=pendingRows.sort((a,b)=>Date.parse(normalizeText(a.createdAt))-Date.parse(normalizeText(b.createdAt))).slice(0,1); const report:Record<string,unknown>[]=[];
 for(const row of rows){const id=normalizeText(row.snapshotId);if(!id)continue;try{const prog=await fetch(`https://api.brightdata.com/datasets/v3/progress/${id}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(8000)});const p=await prog.json() as Record<string,unknown>;if(p.status!=='ready'){report.push({source:row.sourceName,snapshotId:id,status:p.status});const started=Date.parse(normalizeText(row.createdAt));const stalePending=Number.isFinite(started)&&Date.now()-started>48*3600000;if(row.id&&(p.status==='failed'||p.status==='error'||stalePending))await db.update('social_capture_runs',[{id:String(row.id),record:{...row,status:'failed',lastError:normalizeText(p.status)||'snapshot_timeout',closedAt:new Date().toISOString()}}]);continue;}const snap=await fetch(`https://api.brightdata.com/datasets/v3/snapshot/${id}?format=json`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});const snapshot=await snap.json() as unknown;const records=socialSnapshotPosts(snapshot);let images=0,read=0,jobs=0,textRead=0,textJobs=0;const findings:Record<string,unknown>[]=[];let postCursor=Math.max(0,Number(row.postCursor||0));let mediaCursor=Math.max(0,Number(row.mediaCursor||0));let postsCompleted=0;const sourcePosts=records;while(postCursor<sourcePosts.length&&postsCompleted<3&&images<3){const post=sourcePosts[postCursor];if(mediaCursor===0&&textRead<3){textRead++;try{const extracted=await socialTextOffers(post);textJobs+=extracted.length;jobs+=extracted.length;findings.push(...extracted);}catch(e){console.warn('SOCIAL_TEXT_EXTRACTION_ERROR '+(e instanceof Error?e.message:String(e)).slice(0,160));}}const media=[...new Set([...collectMediaUrls(post.attachments),...collectMediaUrls(post.media),...collectMediaUrls(post.images),...collectMediaUrls(post.image_url),...collectMediaUrls(post)])];while(mediaCursor<media.length&&images<3){const mediaUrl=media[mediaCursor];mediaCursor++;images++;try{const img=await fetch(mediaUrl,{signal:AbortSignal.timeout(7000)});if(!img.ok)continue;const mime=(img.headers.get('content-type')||'image/jpeg').split(';')[0];if(!['image/jpeg','image/png','image/webp'].includes(mime))continue;const bytes=new Uint8Array(await img.arrayBuffer());if(bytes.byteLength>6000000)continue;const b64=Buffer.from(bytes).toString('base64');const o=await guardedAi.ocr({images:[{data:b64,mimeType:mime}],prompt:'Trabajo Cerca Chile. Lee TODO el texto visible del afiche o publicación. Detecta avisos laborales aunque no usen la palabra empleo: se necesita, se busca, buscamos, cupos, contratación, reemplazo, faena, turno, temporada, enviar CV, llamar o WhatsApp. Descarta cursos, beneficios, noticias y publicidad sin vacante. Si es empleo extrae cargo/oficio, empresa, localidad o comuna REAL de faena, requisitos, teléfono/correo/contacto y fecha límite. Conserva localidades como Coihue, Tijeral, Pidima, Pailahueque, Capitán Pastene, Selva Oscura, Quino y Mininco. No inventes.',schema:{type:'object',properties:{isJobNotice:{type:'boolean'},text:{type:'string'},title:{type:'string'},company:{type:'string'},commune:{type:'string'},requirements:{type:'string'},contact:{type:'string'},deadline:{type:'string'}},required:['isJobNotice','text']},thinkingMode:'FAST',cache:true});read++;const x=(o.data&&typeof o.data==='object'?o.data:{}) as Record<string,unknown>;if(x.isJobNotice===true){
  const finding=socialPosterFinding(post,{postUrl:post.post_url || post.url,postDate:socialOriginalDate(post),mediaUrl,
    title:x.title,company:x.company,commune:x.commune,requirements:x.requirements,contact:x.contact,deadline:x.deadline,text:x.text});
  if(finding){jobs++;findings.push(finding);}
}}catch{/* continue */}}if(mediaCursor>=media.length){postCursor++;mediaCursor=0;postsCompleted++;}}report.push({source:row.sourceName,territory:row.territory,posts:Array.isArray(records)?records.length:0,images,imagesRead:read,jobNotices:jobs,textPostsRead:textRead,textJobNotices:textJobs,findings});if (row.id) {
  const compactFindings=await storeSocialFindings(findings);
  const { id:runId,...previous }=row;
  const record={...previous,status:postCursor<records.length?'pending':'processed',postCursor,mediaCursor,
    processedAt:new Date().toISOString(),posts:records.length,images:Number(row.images||0)+images,
    imagesRead:Number(row.imagesRead||0)+read,jobNotices:Number(row.jobNotices||0)+jobs,
    textPostsRead:Number(row.textPostsRead||0)+textRead,textJobNotices:Number(row.textJobNotices||0)+textJobs,
    findings:[...(Array.isArray(row.findings)?row.findings:[]),...compactFindings]};
  if (Buffer.byteLength(JSON.stringify(record))>230000) throw new Error('Social capture index exceeds byte budget; preserve history and reconcile');
  const [saved]=await db.update('social_capture_runs',[{id:String(runId),record}]);
  if (!saved) throw new Error('Social capture checkpoint write failed');
}continue;}catch(e){report.push({source:row.sourceName,error:e instanceof Error?e.message:String(e)});}}
 const existing=await db.list<ListingRecord>('radar_jobs',{limit:200});
 const knownUrls=new Set(existing.items.filter(item=>item.url).map(item=>`${item.url}::${normalizeText(item.title).toLowerCase()}`));
 const additions:ListingRecord[]=[];
 for (const item of report) {
   const findings=Array.isArray(item.findings)?item.findings as Record<string,unknown>[]:[];
   for (const finding of findings) {
     const candidate=socialFindingRecord(finding,normalizeText(item.source),normalizeText(item.territory),normalizeText(finding.extractedAt));
     if (!candidate || knownUrls.has(`${candidate.url}::${candidate.title.toLowerCase()}`)) continue;
     additions.push(candidate);
     knownUrls.add(`${candidate.url}::${candidate.title.toLowerCase()}`);
   }
 }
 if (additions.length) {
   const ids=await trackedFeedAdd('radar_jobs',additions);
   if (ids.length!==additions.length || ids.some(id=>!id)) throw new Error('Partial social candidate insertion; preserve captured evidence');
   await processPendingOffers(20);
   await rebuildPublicFeed();
 } await db.add('source_audits',[{sourceKey:'social-territorial-result',checkedAt:new Date().toISOString(),status:'ok',linksSeen:report.reduce((n,r)=>n+Number(r.posts||0),0),candidatesFound:report.reduce((n,r)=>n+Number(r.jobNotices||0),0),newCandidates:additions.length,message:JSON.stringify(report).slice(0,12000)}]);
 console.warn('SOCIAL_TERRITORIAL_RESULT '+JSON.stringify(report).slice(0,12000));
 return {statusCode:200};
};

function tavilyQueries(place: string) {
  const aliases = TERRITORIAL_ALIASES[place] || [place];
  return [
    {
      family:'datos-dificiles-territoriales',
      query:`Avisos laborales MUY RECIENTES y difíciles de rastrear para ${place}, Chile, incluyendo ${aliases.join(', ')}. Prioriza OMIL, municipalidad, Facebook e Instagram públicos, radios locales, medios comunales, empresas, contratistas, comercios, ferias laborales, afiches y publicaciones con frases se necesita, se busca, buscamos personal, enviar CV, cupos, contratación, reemplazo, faena, temporada o trabajo. Busca cargos concretos, teléfono/correo o mecanismo de postulación. Excluye noticias sin vacante y contenido antiguo.`,
    },
    {
      family:'portales-locales',
      query:`Ofertas de trabajo recientes cuyo lugar real de trabajo sea ${place}, Chile. Busca primero publicaciones individuales en Computrabajo (cl.computrabajo.com) e Indeed (cl.indeed.com/viewjob), y complementa con BNE, Laborum, Trabajando.com, LinkedIn, Jobsora, Jooble y KitEmpleo. ChileTrabajos ya cuenta con rastreo directo y no es prioritario en esta consulta. Incluye empleo, vacante, se necesita, se busca, cupos, reemplazo, turno, temporada, faena, cosecha, packing, conductor, operador, bodega, comercio, aseo, salud, educación, técnicos, profesionales y oficios. Evita páginas generales y devuelve avisos concretos con cargo y ubicación.`,
    },
  ];
}

async function runTavilySweep(corePlaces:readonly string[]=PILOT, includeSecondary=true) {
  const checkedAt = new Date().toISOString();
  const key = await getTavilyKey();
  if (!key) {
    const audit: SourceAudit = { sourceKey:'motor-tavily', checkedAt, status:'blocked', linksSeen:0, candidatesFound:0, newCandidates:0, message:'Motor 2 listo, falta configurar la clave gratuita de Tavily.' };
    await db.add('source_audits', [audit]);
    return [audit];
  }

  const [existingCandidates, radarJobs] = await Promise.all([
    db.list<ListingRecord>('radar_candidates', { limit: 200 }),
    db.list<ListingRecord>('radar_jobs', { limit: 200 }),
  ]);
  const existingIndex = existingListingIndexes(existingCandidates.items, radarJobs.items);
  const rediscoveryUpdates = new Map<string, RediscoveryUpdate>();
  const seenUrls = new Set<string>();
  const seenSignatures = new Set<string>();
  let refreshedExisting = 0;

  let linksSeen = 0;
  let candidatesFound = 0;
  let failedSearches = 0;
  const additions: Record<string, unknown>[] = [];
  const provisionalPublic: Record<string, unknown>[] = [];

  const allSearchPlans = [
    ...corePlaces.flatMap(place => tavilyQueries(place).map(search => ({ place, bridge:false, ...search }))),
    ...(includeSecondary ? TRAVEL_HUBS.map(place => ({
      place,
      bridge:false,
      family:'movilidad-laboral',
      query:`Ofertas laborales recientes cuyo lugar real de trabajo sea ${place}, Chile. Prioriza publicaciones individuales de empleadores, portales laborales y avisos públicos con fecha reciente, cargo concreto y ubicación explícita en ${place}.`,
    })) : []),
    ...(includeSecondary ? SOURCE_HUBS.map(place => ({
      place,
      bridge:true,
      family:'ciudad-fuente',
      query:`Ofertas, avisos, datos de pega y reclutamientos recientes publicados o indexados desde ${place}, Chile, cuyo lugar real de trabajo o reclutamiento corresponda explícitamente a alguna comuna objetivo de Trabajo Cerca: ${PILOT.join(', ')}. Busca portales laborales, empresas, radios, Facebook, Instagram, TikTok y páginas pequeñas de empleo. Excluye oportunidades cuyo destino sea solo ${place}.`,
    })) : []),
  ];
  const tavilyRotation = Math.floor(Date.now()/86400000) % Math.max(1, allSearchPlans.length);
  const searchPlans = [...allSearchPlans.slice(tavilyRotation), ...allSearchPlans.slice(0,tavilyRotation)].slice(0,8);
  const sweeps: Array<{ place:string; family:string; bridge:boolean; results:TavilyResult[]; failed:boolean }> = [];
  for (let offset=0; offset<searchPlans.length; offset+=4) {
    const batch = searchPlans.slice(offset, offset+4);
    const batchResults = await Promise.all(batch.map(async plan => {
    try {
      const response = await fetch('https://api.tavily.com/search', {
        method:'POST',
        headers:{ 'Authorization':`Bearer ${key}`, 'Content-Type':'application/json' },
        body:JSON.stringify({
          query:plan.query,
          search_depth:'basic',
          topic:'general',
          max_results:8,
          time_range:'week',
          include_published_date:true,
          filter_by_published_date:false,
          include_answer:false,
          include_raw_content:false,
        }),
        signal:AbortSignal.timeout(8000),
      });
      if (!response.ok) return { place:plan.place, family:plan.family, bridge:plan.bridge, results:[] as TavilyResult[], failed:true };
      const payload = await response.json() as { results?: TavilyResult[] };
      return { place:plan.place, family:plan.family, bridge:plan.bridge, results:Array.isArray(payload.results) ? payload.results : [], failed:false };
    } catch {
      return { place:plan.place, family:plan.family, bridge:plan.bridge, results:[] as TavilyResult[], failed:true };
    }
    }));
    sweeps.push(...batchResults);
    if (offset + 4 < searchPlans.length) await new Promise(resolve => setTimeout(resolve, 250));
  }

  for (const sweep of sweeps) {
    if (sweep.failed) failedSearches += 1;
    linksSeen += sweep.results.length;
    for (const result of sweep.results) {
      const title = normalizeText(result.title);
      const url = normalizeText(result.url);
      const content = cleanDiscoveryText(result.content);
      const publishedDate = normalizeText(result.published_date);
      if (!title || !/^https?:\/\//i.test(url)) continue;
      const specific = isSpecificJobResult(title, url);
      const evidenceText = [title, content, url].join(' ');
      if (unsafeContentReason(evidenceText, url)) continue;
      if (staleDiscoveryDate([publishedDate, title].filter(Boolean).join(' '))) continue;
      if (!isLikelyJobOpportunity(evidenceText, url) || !moderate(evidenceText)) continue;
      const detected = sweep.bridge ? extractPilotCommunes(evidenceText) : extractCommunes(evidenceText);
      if (sweep.bridge && detected.length === 0) continue;
      if (!sweep.bridge && detected.length && !detected.includes(sweep.place)) continue;
      const workCommunes = detected;
      candidatesFound += 1;
      const signature = candidateSignature(title, workCommunes);
      const existingRef = existingIndex.byUrl.get(url) || existingIndex.bySignature.get(signature);
      if (existingRef) {
        if (!terminalRediscoveryBlock(existingRef.item) && mergeRediscoveredEvidence(existingRef, rediscoveryUpdates, {
          checkedAt,
          source:sourceLabelForUrl(url, 'web'),
          discoveredBy:'Motor 2 · Tavily',
          publishedAt:publishedDate,
          workCommunes,
          recruitmentCommunes:sweep.bridge ? workCommunes : [sweep.place],
          evidence:`Tavily volvió a detectar la publicación en la ruta ${sweep.family}.`,
        })) refreshedExisting += 1;
        continue;
      }
      if (seenUrls.has(url) || seenSignatures.has(signature)) continue;
      let domain = 'web';
      try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
      const canPublicProvisionally = specific && detected.length > 0;
      const record: ListingRecord = {
        seedKey:`tavily:${signature}`,
        kind:canPublicProvisionally ? 'job_offer' : 'candidate',
        origin:'radar',
        title:title.slice(0,180),
        company:domain,
        workLocation:detected.length ? workCommunes.join(' · ') : `${sweep.place} · por confirmar`,
        workCommunes,
        recruitmentZones:sweep.bridge ? workCommunes : [sweep.place],
        recruitmentCommunes:sweep.bridge ? workCommunes : [sweep.place],
        area:sweep.bridge ? `Ciudad fuente · ${sweep.place}` : canPublicProvisionally ? (sweep.family === 'comunidad-redes' ? 'Aviso comunitario por confirmar' : 'Oferta web por confirmar') : 'Candidato del Radar',
        status:canPublicProvisionally ? 'Por confirmar' : 'En revisión',
        date:sourceDateLabel(publishedDate),
        source:sourceLabelForUrl(url, domain),
        sourceDomain:domain,
        discoveredBy:'Motor 2 · Tavily',
        sourcePublishedAt:parseDiscoveryDate(publishedDate) ? new Date(parseDiscoveryDate(publishedDate)!).toISOString() : undefined,
        url,
        note:redactSensitive((content || 'Hallazgo web reciente.') + (canPublicProvisionally ? ' Trabajo Cerca lo muestra como pista útil; confirma vigencia, lugar y requisitos en la fuente original antes de postular.' : ' La señal es laboral pero el enlace no es suficientemente específico, por eso queda en revisión interna en vez de descartarse.')),
        tags:[sweep.family, sweep.place, title, domain].join(' ').toLocaleLowerCase('es-CL').split(/\s+/).filter(Boolean).slice(0,24),
        visual:'field',
        icon:'map',
        portalPlace:sweep.bridge ? sweep.place : undefined,
        evidence:sweep.bridge ? `Motor 2 · ciudad fuente ${sweep.place} · destino objetivo detectado: ${workCommunes.join(' · ')}` : `Motor 2 · ruta ${sweep.family} · búsqueda territorial: ${sweep.place}`,
        review:true,
        verified:false,
        active:true,
        createdAt:checkedAt,
      };
      if (canPublicProvisionally) provisionalPublic.push(record);
      else additions.push(record);
      seenUrls.add(url);
      seenSignatures.add(signature);
    }
  }

  await flushRediscoveryUpdates(rediscoveryUpdates);
  if (provisionalPublic.length) await trackedFeedAdd('radar_jobs', provisionalPublic.slice(0,120));
  if (additions.length) await db.add('radar_candidates', additions.slice(0,120));
  const audit: SourceAudit = {
    sourceKey:'motor-tavily',
    checkedAt,
    status:failedSearches === sweeps.length ? 'error' : 'ok',
    linksSeen,
    candidatesFound,
    newCandidates:additions.length + provisionalPublic.length,
    refreshedExisting,
    message:failedSearches ? `${failedSearches} de ${sweeps.length} búsquedas territoriales fallaron o excedieron tiempo.` : undefined,
  };
  await db.add('source_audits', [audit]);
  return [audit];
}

type ExaResult = { title?:string; url?:string; publishedDate?:string | null; text?:string; highlights?:string[] };

async function getExaKey() {
  if (!SECURITY_POLICY.paidProviders) return undefined;
  const names = await secrets.listSecretNames();
  if (!names.includes('EXA_API_KEY')) return undefined;
  return secrets.readSecret('EXA_API_KEY');
}

function exaSocialQueries(place:string) {
  const jobLanguage = 'pega, se necesita, se busca, vacante, cupos, reemplazo, temporada, faena, cosecha, ayudante, maestro, soldador, mecánico, conductor, operador, bodega, ventas, aseo, guardia, salud, educación, técnicos, profesionales y oficios';
  return [
    {
      family:'social-redes',
      query:`Publicaciones laborales recientes y concretas para trabajar en ${place}, Chile, difundidas públicamente en Facebook, Instagram o TikTok por OMIL, municipalidades, radios, medios locales, páginas de empleo, comercios, contratistas y empleadores. Busca ${jobLanguage}. Prioriza el post individual con cargo, fecha y ubicación explícita; evita perfiles genéricos, grupos sin aviso concreto y contenido no laboral.`,
      includeDomains:['facebook.com','instagram.com','tiktok.com'],
    },
    {
      family:'local-abierto',
      query:`Avisos laborales locales recientes y concretos para trabajar en ${place}, Chile, priorizando las fuentes de ESA comuna: OMIL y municipalidad de ${place}, radios locales, diarios y medios comunales digitales, cámaras de comercio, asociaciones, ferias laborales, consultoras locales, comercios, contratistas, empresas pequeñas y páginas territoriales. Busca también publicaciones cuyo texto laboral esté principalmente en una imagen o afiche cuando el índice conserve título, descripción o enlace específico. Busca ${jobLanguage}. Devuelve avisos individuales con cargo u oficio, fecha reciente, lugar real de trabajo y enlace específico. Excluye noticias generales sobre empleo, cursos, perfiles y páginas sin una vacante concreta. No priorices Los Ángeles, Temuco o Concepción salvo que el lugar real de trabajo sea ${place}.`,
      includeDomains:undefined as string[] | undefined,
    },
  ];
}

async function runExaSocialSweep(corePlaces:readonly string[]=PILOT, includeSecondary=true) {
  const checkedAt = new Date().toISOString();
  const key = await getExaKey();
  if (!key) {
    const audit: SourceAudit = { sourceKey:'motor-exa-social', checkedAt, status:'blocked', linksSeen:0, candidatesFound:0, newCandidates:0, message:'Motor 3 Social/Local listo. Falta configurar la clave gratuita EXA_API_KEY.' };
    await db.add('source_audits', [audit]);
    return [audit];
  }

  const [existingCandidates, radarJobs] = await Promise.all([
    db.list<ListingRecord>('radar_candidates', { limit:200 }),
    db.list<ListingRecord>('radar_jobs', { limit:200 }),
  ]);
  const existingIndex = existingListingIndexes(existingCandidates.items, radarJobs.items);
  const rediscoveryUpdates = new Map<string, RediscoveryUpdate>();
  const seenUrls = new Set<string>();
  const seenSignatures = new Set<string>();
  let refreshedExisting = 0;

  const plans = [
    ...corePlaces.flatMap(place => exaSocialQueries(place).map(search => ({ place, bridge:false, ...search }))),
    ...(includeSecondary ? TRAVEL_HUBS.map(place => ({
      place,
      bridge:false,
      family:'movilidad-laboral',
      query:`Ofertas laborales recientes cuyo lugar real de trabajo sea ${place}, Chile, publicadas por empleadores, portales, radios, medios locales o redes públicas. Prioriza avisos específicos con cargo, fecha y ubicación explícita en ${place}.`,
      includeDomains:undefined as string[] | undefined,
    })) : []),
    ...(includeSecondary ? SOURCE_HUBS.map(place => ({
      place,
      bridge:true,
      family:'ciudad-fuente',
      query:`Avisos, publicaciones y datos de pega recientes difundidos desde ${place}, Chile, que indiquen explícitamente como lugar real de trabajo o reclutamiento alguna comuna objetivo de Trabajo Cerca: ${PILOT.join(', ')}. Incluye Facebook, Instagram, TikTok, radios, empresas y páginas locales. Excluye empleos cuyo destino sea únicamente ${place}.`,
      includeDomains:undefined as string[] | undefined,
    })) : []),
  ];
  const sweeps: Array<{ place:string; family:string; bridge?:boolean; results:ExaResult[]; failed:boolean; failureReason?:string }> = [];

  for (let offset = 0; offset < plans.length; offset += 2) {
    const batch = plans.slice(offset, offset + 2);
    const batchResults = await Promise.all(batch.map(async plan => {
      try {
        const response = await fetch('https://api.exa.ai/search', {
          method:'POST',
          headers:{ 'x-api-key':key, 'Content-Type':'application/json' },
          body:JSON.stringify({
            query:plan.query,
            type:'fast',
            numResults:10,
            userLocation:'CL',
            contents:{ highlights:true },
            ...(plan.includeDomains ? { includeDomains:plan.includeDomains } : {}),
          }),
          signal:AbortSignal.timeout(9000),
        });
        if (!response.ok) return { place:plan.place, family:plan.family, bridge:plan.bridge, results:[] as ExaResult[], failed:true, failureReason:'http-' + response.status };
        const payload = await response.json() as { results?:ExaResult[] };
        return { place:plan.place, family:plan.family, bridge:plan.bridge, results:Array.isArray(payload.results) ? payload.results : [], failed:false };
      } catch (err) {
        const failureReason = err instanceof Error ? (err.name || 'fetch-error') : 'fetch-error';
        return { place:plan.place, family:plan.family, bridge:plan.bridge, results:[] as ExaResult[], failed:true, failureReason };
      }
    }));
    sweeps.push(...batchResults);
    if (offset + 2 < plans.length) await new Promise(resolve => setTimeout(resolve, 550));
  }

  let linksSeen = 0;
  let candidatesFound = 0;
  let failedSearches = 0;
  const failureReasons = new Map<string, number>();
  const additions: Record<string, unknown>[] = [];
  const provisionalPublic: Record<string, unknown>[] = [];

  for (const sweep of sweeps) {
    if (sweep.failed) {
      failedSearches += 1;
      const reason = sweep.failureReason || 'unknown';
      failureReasons.set(reason, (failureReasons.get(reason) || 0) + 1);
    }
    linksSeen += sweep.results.length;
    for (const result of sweep.results) {
      const title = normalizeText(result.title);
      const url = normalizeText(result.url);
      const publishedDate = normalizeText(result.publishedDate);
      const resultText = cleanDiscoveryText(result.text);
      const highlights = Array.isArray(result.highlights) ? result.highlights.map(cleanDiscoveryText).join(' ') : '';
      if (!title || !/^https?:\/\//i.test(url)) continue;
      const evidenceText = [title, resultText, highlights, url].join(' ');
      if (unsafeContentReason(evidenceText, url)) continue;
      if (staleDiscoveryDate([publishedDate, title].filter(Boolean).join(' '))) continue;
      if (!isLikelyJobOpportunity(evidenceText, url) || !moderate(evidenceText)) continue;

      const detected = sweep.bridge ? extractPilotCommunes(evidenceText) : extractCommunes(evidenceText);
      if (sweep.bridge && detected.length === 0) continue;
      const workCommunes = detected;
      if (!sweep.bridge && detected.length && !detected.includes(sweep.place)) continue;
      candidatesFound += 1;
      const signature = candidateSignature(title, workCommunes);
      const existingRef = existingIndex.byUrl.get(url) || existingIndex.bySignature.get(signature);
      if (existingRef) {
        if (!terminalRediscoveryBlock(existingRef.item) && mergeRediscoveredEvidence(existingRef, rediscoveryUpdates, {
          checkedAt,
          source:sourceLabelForUrl(url, 'web'),
          discoveredBy:'Motor 3 · Exa',
          publishedAt:publishedDate,
          workCommunes,
          recruitmentCommunes:sweep.bridge ? workCommunes : [sweep.place],
          evidence:`Exa volvió a detectar la publicación en la ruta ${sweep.family}.`,
        })) refreshedExisting += 1;
        continue;
      }
      if (seenUrls.has(url) || seenSignatures.has(signature)) continue;
      let domain = 'web';
      try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }

      const canPublicProvisionally = isSpecificJobResult(title, url) && detected.length > 0;
      const record: ListingRecord = {
        seedKey:`exa:${signature}`,
        kind:canPublicProvisionally ? 'job_offer' : 'candidate',
        origin:'radar',
        title:title.slice(0,180),
        company:domain,
        workLocation:detected.length ? workCommunes.join(' · ') : `${sweep.place} · por confirmar`,
        workCommunes,
        recruitmentZones:sweep.bridge ? workCommunes : [sweep.place],
        recruitmentCommunes:sweep.bridge ? workCommunes : [sweep.place],
        area:sweep.bridge ? `Ciudad fuente · ${sweep.place}` : canPublicProvisionally ? (sweep.family === 'social-redes' ? 'Aviso social por confirmar' : 'Aviso local por confirmar') : (sweep.family === 'social-redes' ? 'Señal social' : 'Señal local'),
        status:canPublicProvisionally ? 'Por confirmar' : 'En revisión',
        date:sourceDateLabel(publishedDate),
        source:sourceLabelForUrl(url, domain),
        sourceDomain:domain,
        discoveredBy:'Motor 3 · Exa',
        sourcePublishedAt:parseDiscoveryDate(publishedDate) ? new Date(parseDiscoveryDate(publishedDate)!).toISOString() : undefined,
        url,
        note:redactSensitive((highlights || resultText || '') + (canPublicProvisionally ? ' Aviso específico con comuna objetivo detectada. Se muestra como por confirmar para no perder oportunidad; revisa la fuente original antes de postular.' : ' Hallazgo del Radar Social/Local; queda en revisión interna hasta confirmar ubicación o especificidad.')),
        tags:[sweep.family, sweep.place, title, domain].join(' ').toLocaleLowerCase('es-CL').split(/\s+/).filter(Boolean).slice(0,24),
        visual:'field',
        icon:'map',
        portalPlace:sweep.bridge ? sweep.place : undefined,
        evidence:sweep.bridge ? `Motor 3 Social/Local · ciudad fuente ${sweep.place} · destino objetivo detectado: ${workCommunes.join(' · ')}` : `Motor 3 Social/Local · ruta ${sweep.family} · búsqueda territorial: ${sweep.place}`,
        review:true,
        verified:false,
        active:true,
        createdAt:checkedAt,
      };
      if (canPublicProvisionally) provisionalPublic.push(record);
      else additions.push(record);
      seenUrls.add(url);
      seenSignatures.add(signature);
    }
  }

  await flushRediscoveryUpdates(rediscoveryUpdates);
  if (provisionalPublic.length) await trackedFeedAdd('radar_jobs', provisionalPublic.slice(0,100));
  if (additions.length) await db.add('radar_candidates', additions.slice(0,100));
  const familyStats = sweeps.reduce<Record<string, { searches:number; links:number; failed:number }>>((acc, sweep) => {
    const current = acc[sweep.family] || { searches:0, links:0, failed:0 };
    current.searches += 1;
    current.links += sweep.results.length;
    if (sweep.failed) current.failed += 1;
    acc[sweep.family] = current;
    return acc;
  }, {});
  const familySummary = Object.entries(familyStats).map(([family, stats]) => `${family}: ${stats.links} enlaces/${stats.searches} búsquedas${stats.failed ? ` (${stats.failed} fallidas)` : ''}`).join(' · ');
  const audit: SourceAudit = {
    sourceKey:'motor-exa-social',
    checkedAt,
    status:failedSearches === sweeps.length ? 'error' : 'ok',
    linksSeen,
    candidatesFound,
    newCandidates:additions.length + provisionalPublic.length,
    refreshedExisting,
    message:`${familySummary}${failedSearches ? ` · Fallos: ${[...failureReasons.entries()].map(([reason, count]) => `${reason}:${count}`).join(', ')}` : ''}`,
  };
  await db.add('source_audits', [audit]);
  return [audit];
}

async function cleanRadarInventory() {
  const [jobs, candidates] = await Promise.all([
    db.list<ListingRecord>('radar_jobs', { limit:200 }),
    db.list<ListingRecord>('radar_candidates', { limit:200 }),
  ]);
  const evaluate = (item:ListingRecord & { id:string }) => {
    if (!item.active || item.origin !== 'radar') return undefined;
    const evidence = [item.title, item.company, item.note, item.url, item.sourceDomain].filter(Boolean).join(' ');
    const unsafeReason = unsafeContentReason(evidence, item.url);
    const dynamic = Boolean(item.seedKey?.startsWith('tavily:') || item.seedKey?.startsWith('exa:'));
    const sourceDateEvidence = [item.sourcePublishedAt, item.date].filter(Boolean).join(' ');
    const publishedTs = parseDiscoveryDate(sourceDateEvidence);
    let reason = '';
    if (unsafeReason) reason = unsafeReason;
    else if (!item.verified && !isLikelyJobOpportunity(evidence, item.url)) reason = 'El contenido no corresponde a una oferta de trabajo concreta.';
    else if (!item.verified && item.kind === 'job_offer' && !hasTargetEvidence(evidence, item)) reason = 'La fuente no demuestra una comuna objetivo como lugar real del trabajo.';
    else if (item.verified && !publishedTs) reason = 'La oferta estaba marcada como verificada sin fecha de publicación comprobable.';
    else if (publishedTs && staleDiscoveryDate(new Date(publishedTs).toISOString())) reason = 'Publicación antigua: supera el máximo de 60 días.';
    const { id, ...record } = item;
    const discoveredBy = item.seedKey?.startsWith('tavily:') ? 'Motor 2 · Tavily' : item.seedKey?.startsWith('exa:') ? 'Motor 3 · Exa' : item.discoveredBy;
    const source = dynamic && item.url ? sourceLabelForUrl(item.url, item.sourceDomain || item.source) : item.source;
    const date = dynamic && /^Detectado por Motor/i.test(item.date) ? sourceDateLabel(sourceDateEvidence) : item.date;
    if (reason) return { id, record:{ ...record, source, discoveredBy, date, active:false, review:false, verified:false, status:'Descartada por control de calidad', verificationReason:reason } };
    if (dynamic && (source !== item.source || discoveredBy !== item.discoveredBy || date !== item.date)) return { id, record:{ ...record, source, discoveredBy, date } };
    return undefined;
  };
  const jobUpdates = jobs.items.map(evaluate).filter(Boolean) as Array<{ id:string; record:Record<string, unknown> }>;
  const candidateUpdates = candidates.items.map(evaluate).filter(Boolean) as Array<{ id:string; record:Record<string, unknown> }>;
  if (jobUpdates.length) await trackedFeedUpdate('radar_jobs', jobUpdates);
  if (candidateUpdates.length) await db.update('radar_candidates', candidateUpdates);
  return { jobs:jobUpdates.length, candidates:candidateUpdates.length };
}

async function expireOldRecords() {
  const now = Date.now();
  const [community, candidates, radarJobs] = await Promise.all([
    db.list<ListingRecord>('community_posts', { limit: 200 }),
    db.list<ListingRecord>('radar_candidates', { limit: 200 }),
    db.list<ListingRecord>('radar_jobs', { limit: 200 }),
  ]);
  const updates: Array<{ id:string; record:Record<string, unknown> }> = [];
  for (const item of community.items) {
    if (item.active && item.expiresAt && Date.parse(item.expiresAt) < now) {
      const { id, ...record } = item;
      updates.push({ id, record:{ ...record, active:false, status:'Finalizada' } });
    }
  }
  if (updates.length) await trackedFeedUpdate('community_posts', updates);
  const stale: Array<{ id:string; record:Record<string, unknown> }> = [];
  for (const item of candidates.items) {
    if (item.active && now - Date.parse(item.createdAt) > 7 * 86400000) {
      const { id, ...record } = item;
      stale.push({ id, record:{ ...record, active:false, status:'Revisión expirada' } });
    }
  }
  if (stale.length) await db.update('radar_candidates', stale);

  const unconfirmed: Array<{ id:string; record:Record<string, unknown> }> = [];
  for (const item of radarJobs.items) {
    if (!item.active || !item.review || item.kind !== 'job_offer') continue;
    const created = Date.parse(item.createdAt);
    if (Number.isFinite(created) && now - created > 7 * 86400000) {
      const { id, ...record } = item;
      unconfirmed.push({ id, record:{ ...record, active:false, status:'Archivado sin confirmar' } });
    }
  }
  if (unconfirmed.length) await trackedFeedUpdate('radar_jobs', unconfirmed);
  const expiredEvidencePaths = [...stale, ...unconfirmed].map(entry => normalizeText(entry.record.evidenceImagePath)).filter(Boolean);
  if (expiredEvidencePaths.length) await storage.delete(expiredEvidencePaths);
  return { expiredCommunity:updates.length, expiredCandidates:stale.length, archivedUnconfirmed:unconfirmed.length };
}

async function finishPublicSweep(places:readonly string[]) {
  const result = await runPublicSourceSweep(places);
  await rebuildPublicFeed();
  await refreshSocialDraftQueue();
  return result;
}

export const publicSourceSweepHandler = async () => {
  await runPublicSourceSweep();
  await rebuildPublicFeed();
  await refreshSocialDraftQueue();
  return { statusCode:200 };
};

export const publicMallecoWestHandler = async () => { await finishPublicSweep(CORE_CORRIDORS.mallecoWest); return { statusCode:200 }; };
export const publicMallecoEastHandler = async () => { await finishPublicSweep(CORE_CORRIDORS.mallecoEast); return { statusCode:200 }; };
export const publicBiobioNorthHandler = async () => { await finishPublicSweep(CORE_CORRIDORS.biobioNorth); return { statusCode:200 }; };
export const publicTravelHandler = async () => { await finishPublicSweep(SOURCE_HUBS); return { statusCode:200 }; };

async function finishTavilySweep(places:readonly string[], includeSecondary=false) {
  const result = await runTavilySweep(places, includeSecondary);
  if (result.length && result.every(item => item.status !== 'ok')) throw new Error(result[0]?.message || 'Motor Tavily sin resultados válidos por error de ejecución.');
  await rebuildPublicFeed();
  await refreshSocialDraftQueue();
  return result;
}

export const webSearchSweepHandler = async () => {
  const result = await runTavilySweep();
  if (result.length && result.every(item => item.status !== 'ok')) throw new Error(result[0]?.message || 'Motor Tavily sin resultados válidos por error de ejecución.');
  await rebuildPublicFeed();
  await refreshSocialDraftQueue();
  return { statusCode:200 };
};

export const tavilyMallecoWestHandler = async () => { await finishTavilySweep(CORE_CORRIDORS.mallecoWest); return { statusCode:200 }; };
export const tavilyMallecoEastHandler = async () => { await finishTavilySweep(CORE_CORRIDORS.mallecoEast); return { statusCode:200 }; };
export const tavilyBiobioNorthHandler = async () => { await finishTavilySweep(CORE_CORRIDORS.biobioNorth); return { statusCode:200 }; };
export const tavilySecondaryHandler = async () => { await finishTavilySweep([], true); return { statusCode:200 }; };

async function finishExaSweep(places:readonly string[], includeSecondary=false) {
  const result = await runExaSocialSweep(places, includeSecondary);
  if (result.length && result.every(item => item.status !== 'ok')) throw new Error(result[0]?.message || 'Motor Social/Local Exa sin ejecución válida.');
  await rebuildPublicFeed();
  await refreshSocialDraftQueue();
  return result;
}

export const socialLocalSweepHandler = async () => {
  const result = await runExaSocialSweep();
  if (result.length && result.every(item => item.status !== 'ok')) throw new Error(result[0]?.message || 'Motor Social/Local Exa sin ejecución válida.');
  await rebuildPublicFeed();
  await refreshSocialDraftQueue();
  return { statusCode:200 };
};

export const exaMallecoWestHandler = async () => { await finishExaSweep(CORE_CORRIDORS.mallecoWest); return { statusCode:200 }; };
export const exaMallecoEastHandler = async () => { await finishExaSweep(CORE_CORRIDORS.mallecoEast); return { statusCode:200 }; };
export const exaBiobioNorthHandler = async () => { await finishExaSweep(CORE_CORRIDORS.biobioNorth); return { statusCode:200 }; };
export const exaSecondaryHandler = async () => { await finishExaSweep([], true); return { statusCode:200 }; };

export const autoVerificationHandler = async () => {
  const cleanup = await cleanRadarInventory();
  const enrichment = await enrichRadarCandidates(6);
  const result = await processPendingOffers(8);
  await rebuildPublicFeed();
  await refreshSocialDraftQueue();
  console.warn('RADAR_VERIFY ' + JSON.stringify({ cleanup, enrichment, ...result }));
  return { statusCode:200 };
};

export const verificationRecoveryBatchHandler = async () => {
  const result = await processPendingOffers(12);
  const feed = await rebuildPublicFeed();
  console.warn('RADAR_VERIFY_BATCH ' + JSON.stringify({ ...result, publicJobs:feed.totalVerifiedJobOffers, publicItems:feed.itemCount }));
  return { statusCode:200 };
};

export const feedRebuildHandler = async () => {
  const feed = await rebuildPublicFeed();
  console.warn('FEED_REBUILD ' + JSON.stringify({ itemCount:feed.itemCount, verifiedJobs:feed.totalVerifiedJobOffers }));
  return { statusCode:200 };
};

export const radarMaintenanceHandler = async () => {
  await ensureSeed();
  await ensureSourceRegistry();
  await pruneNoisyTavilyCandidates();
  await cleanRadarInventory();
  await expireOldRecords();
  await rebuildPublicFeed();
  await refreshSocialDraftQueue();
  return { statusCode:200 };
};

export const notificationSweepHandler = async () => {
  const result = await runNotificationSweep();
  console.warn('NOTIFICATION_SWEEP ' + JSON.stringify(result));
  return { statusCode:200 };
};

export const v14DirectSourcesHandler = async () => { await finishPublicSweep(PILOT); return { statusCode:200 }; };
export const v14TavilyGapsHandler = async () => { await finishTavilySweep(PILOT, true); return { statusCode:200 }; };
export const v16TerritorialSourceHandler = async () => {
  const cursorRows=await db.list<{position:number}>('motor3_web_cursor',{limit:1});
  const start=Math.max(0,Number(cursorRows.items[0]?.position||0))%PILOT.length;
  const places=[PILOT[start],PILOT[(start+1)%PILOT.length]];
  const before=await usableOfferSnapshot();
  const audits=await runTavilySweep(places,false);
  const after=await usableOfferSnapshot();
  const found=audits.reduce((s,a)=>s+a.candidatesFound,0), fresh=audits.reduce((s,a)=>s+a.newCandidates,0), links=audits.reduce((s,a)=>s+a.linksSeen,0);
  const next=(start+2)%PILOT.length; const now=new Date().toISOString();
  if(cursorRows.items[0]?.id) await db.update('motor3_web_cursor',[{id:cursorRows.items[0].id,record:{position:next,updatedAt:now}}]); else await db.add('motor3_web_cursor',[{position:next,updatedAt:now}]);
  await db.add('source_audits',[{sourceKey:'motor-territorial-controlled',checkedAt:now,status:'ok',linksSeen:links,candidatesFound:found,newCandidates:fresh,message:`Motor 3.3 web · ${places.join(' + ')} · enlaces:${links} · candidatos:${found} · nuevos:${fresh} · siguiente:${PILOT[next]}`}]);
  await recordLiveStage('Motor 3.3 web',before,after,fresh,found);
  console.warn('MOTOR3_WEB '+JSON.stringify({places,links,found,new:fresh,next:PILOT[next]}));
  return {statusCode:200};
};

export const v17HardWebHandler = async () => {
  const localHour=Number(new Intl.DateTimeFormat('en-US',{hour:'2-digit',hour12:false,timeZone:'America/Santiago'}).format(new Date()));
  if(![7,13,21].includes(localHour))return v16TerritorialSourceHandler();
  const cursorRows=await db.list<{position:number}>('hard_exa_cursor',{limit:1});
  const start=Math.max(0,Number(cursorRows.items[0]?.position||0))%PILOT.length;
  const places=[PILOT[start],PILOT[(start+1)%PILOT.length]];
  const before=await usableOfferSnapshot();
  const audits=await runExaSocialSweep(places,false);
  const after=await usableOfferSnapshot();
  const found=audits.reduce((sum,a)=>sum+a.candidatesFound,0);
  const fresh=audits.reduce((sum,a)=>sum+a.newCandidates,0);
  const next=(start+2)%PILOT.length;
  if(cursorRows.items[0]?.id)await db.update('hard_exa_cursor',[{id:cursorRows.items[0].id,record:{position:next,updatedAt:new Date().toISOString()}}]);
  else await db.add('hard_exa_cursor',[{position:next,updatedAt:new Date().toISOString()}]);
  await recordLiveStage('Exa · publicaciones difíciles',before,after,fresh,found);
  console.warn('HARD_EXA '+JSON.stringify({places,found,fresh,next,publicDelta:after.total-before.total}));
  return {statusCode:200};
};

export const v16TerritorialDirectBatchHandler = async (event?:{ scheduledTime?:string }) => {
  const id='public-scheduled-'+(event?.scheduledTime || new Date().toISOString()).replace(/[^A-Za-z0-9_-]/g,'');
  const result=await runFreePublicSources(FREE_PUBLIC_SOURCES,id);
  console.warn('FREE_PUBLIC_SCAN '+JSON.stringify(result));
  return { statusCode:200 };
};
async function recoverHistoricVisualFindings() {
  type RecoveryCursor=RadarPageCursor & { runId?:string | null; findingOffset?:number };
  const cursor=await db.list<RecoveryCursor>('radar_social_recovery_cursor',{ limit:1 });
  const current=cursor.items[0];
  const [runs,jobs]=await Promise.all([
    db.list<Record<string,unknown>>('social_capture_runs',{ limit:3,...(current?.nextToken?{ nextToken:current.nextToken }:{}) }),
    db.list<ListingRecord>('radar_jobs',{ limit:200 }),
  ]);
  const known=new Set(jobs.items.filter(job=>job.url).map(job=>`${job.url}::${normalizeText(job.title).toLowerCase()}`));
  const additions:ListingRecord[]=[];
  let findingsSeen=0;
  let next:RecoveryCursor={ nextToken:runs.nextToken || null,runId:null,findingOffset:0,updatedAt:new Date().toISOString() };
  const starting=current?.runId ? runs.items.findIndex(run=>run.id===current.runId) : 0;
  if (starting<0) throw new Error('Social recovery cursor refers to a missing capture; preserve its checkpoint');
  for (const run of runs.items.slice(starting)) {
    const references=Array.isArray(run.findings) ? run.findings as Record<string,unknown>[] : [];
    const offset=run.id===current?.runId ? Number(current?.findingOffset || 0) : 0;
    if (!Number.isSafeInteger(offset) || offset<0 || offset>references.length) throw new Error('Invalid social finding offset; preserve checkpoint');
    const selected=references.slice(offset,offset+12);
    const findings=await hydrateSocialFindings(selected);
    for (const finding of findings) {
      findingsSeen++;
      const capturedAt=normalizeText(finding.extractedAt) || normalizeText(run.processedAt) || normalizeText(run.createdAt);
      const candidate=socialFindingRecord(finding,normalizeText(run.sourceName),normalizeText(run.territory),capturedAt);
      if (!candidate || known.has(`${candidate.url}::${candidate.title.toLowerCase()}`)) continue;
      if (!moderate([candidate.title,candidate.note].join(' ')) || !isLikelyJobOpportunity(candidate.note,candidate.url)) continue;
      additions.push(candidate);
      known.add(`${candidate.url}::${candidate.title.toLowerCase()}`);
    }
    if (offset+selected.length<references.length) {
      next={ ...next,nextToken:current?.nextToken || null,runId:String(run.id),findingOffset:offset+selected.length };
      break;
    }
  }
  for (let at=0;at<additions.length;at+=4) {
    const chunk=additions.slice(at,at+4);
    const ids=await trackedFeedAdd('radar_jobs',chunk);
    if (ids.length!==chunk.length || ids.some(id=>!id)) throw new Error('Partial social recovery insertion; cursor preserved');
  }
  if (current) {
    const { id,...previous }=current;
    const [saved]=await db.update('radar_social_recovery_cursor',[{ id,record:{ ...previous,...next } }]);
    if (!saved) throw new Error('Social recovery cursor write failed');
  } else {
    const [id]=await db.add('radar_social_recovery_cursor',[next]);
    if (!id) throw new Error('Social recovery cursor insertion failed');
  }
  return { runs:runs.items.length,findingsSeen,recovered:additions.length,hasMore:Boolean(next.nextToken || next.runId) };
}

function externalOfferRecord(offer:VerifiedOffer):ListingRecord {
  const now = new Date().toISOString();
  return {
    kind:'job_offer', origin:'radar', title:offer.title, company:offer.company,
    workLocation:offer.work_site ? offer.work_commune+' · '+offer.work_site.replace(/^Ubicación:\s*/,'') : offer.work_commune, workCommunes:[offer.work_commune],
    recruitmentZones:[], recruitmentCommunes:[], area:'Radar externo', status:'Verificada',
    date:sourceDateLabel(offer.source_published_at), source:publicSourceAdapter(offer.source_url)!.name, sourceDomain:new URL(offer.source_url).hostname,
    sourcePublishedAt:offer.source_published_at, sourceValidThrough:offer.valid_through || null,
    validityMethod:offer.validity_method || 'explicit_deadline',
    expiresAt:offer.valid_through || undefined, url:offer.source_url,
    note:(offer.valid_through ? 'Postulación comprobada en la fuente: ' : 'Formulario habilitado comprobado; la fuente no informa cierre: ') + offer.application, tags:[], visual:'field', icon:'work',
    review:false, verified:true, active:true, createdAt:now, discoveredBy:'github-signed-laboratory',
    verificationCheckedAt:offer.verified_at, verifiedAt:offer.verified_at, firstVerifiedAt:offer.verified_at,
    lastVerifiedAt:offer.verified_at, verificationVersion:VERIFICATION_VERSION,
    verificationMethod:offer.verification_method, verificationReason:'Fuente individual, ubicación real, fecha original y postulación contrastadas.',
    lastSeenAt:offer.verified_at,
  };
}

export const v14VerificationHandler = async (event?:{ type:string; name:string; scheduledTime:string }) => {
  let documents:unknown = { status:'not_scheduled', updated:0, providerCalls:0 };
  let documentError:unknown;
  if (event?.type === 'cron' && event.name === 'verify-publish') {
    try {
      documents = {documents:await revalidateReviewedDocuments('verify-publish:' + event.scheduledTime),localContacts:await revalidateLocalContactOffers()};
    } catch (cause) {
      documentError = cause;
      console.error('DOCUMENT_REVALIDATION_FAILED');
    }
  }
  const providerSlot=isOriginalVerificationSlot(event);
  const history=providerSlot ? await recoverHistoricVisualFindings() : undefined;
  const result=providerSlot ? await processPendingOffers(8) : undefined;
  const ingestion=await pullRadarBatch(externalOfferRecord);
  const feed=await advancePublicFeed({ revision:'published-retention-counts-v7', reconcileManifestId:'a7425daf-c460-4d88-98fc-adfae0b807fd', project:projectFeedListing, refreshAt:feedRefreshAt });
  const receipts=await confirmRadarPublications();
  console.warn('RADAR_VERIFY_HISTORY '+JSON.stringify({documents,providerSlot,history,result,ingestion,receipts,publicJobs:feed.totalVerifiedJobOffers,feedRebuilding:feed.rebuilding}));
  if (documentError) throw documentError;
  return {statusCode:200};
};
export const v15VerificationRecoveryHandler = async () => { const result = await processPendingOffers(12); const feed=await rebuildPublicFeed(); console.warn('V15_VERIFY_RECOVERY '+JSON.stringify({result,publicJobs:feed.totalVerifiedJobOffers})); return { statusCode:200 }; };

export const radarEnrichmentWorker = async () => {
  const result=await enrichRadarCandidates(6);
  console.warn('RADAR_ENRICHMENT_WORKER '+JSON.stringify(result));
  return {statusCode:200};
};

export const radarVerificationWorker = async () => {
  const result=await processPendingOffers(8);
  console.warn('RADAR_VERIFICATION_WORKER '+JSON.stringify(result));
  return {statusCode:200};
};

export const radarPublishWorker = async () => {
  const feed=await rebuildPublicFeed();
  console.warn('RADAR_PUBLISH_WORKER '+JSON.stringify({publicJobs:feed.totalVerifiedJobOffers,itemCount:feed.itemCount}));
  return {statusCode:200};
};

export const radarMorningClosureHandler = async () => {
  const feed=await rebuildPublicFeed();
  console.warn('RADAR_MORNING_CLOSURE '+JSON.stringify({publicJobs:feed.totalVerifiedJobOffers,itemCount:feed.itemCount}));
  return {statusCode:200};
};

export const notificationDiagnosticHandler = async () => {
  const [logs, prefs, snapshot, radarRows, communityRows] = await Promise.all([
    db.list<Record<string, unknown>>('notification_dispatch_log', { limit:20 }),
    db.list<NotificationPreference>('notification_preferences', { limit:200 }),
    usableOfferSnapshot(),
    db.list<ListingRecord>('radar_jobs', { limit:200 }),
    db.list<ListingRecord>('community_posts', { limit:200 }),
  ]);
  const latest = [...logs.items].sort((a,b) => Date.parse(String(b.checkedAt || '')) - Date.parse(String(a.checkedAt || '')))[0] || null;
  const activePrefs = prefs.items.filter(item => item.active);
  const eligible = [...radarRows.items, ...communityRows.items].filter(item => item.kind === 'job_offer' && item.verified && !item.review && isCurrentlyActive(item)).filter(item => { const parsed = parseDiscoveryDate(item.sourcePublishedAt || item.date); return Boolean(parsed) && !staleDiscoveryDate(new Date(parsed!).toISOString()); });
  const communeCounts:Record<string,number> = {};
  for (const item of eligible) for (const commune of item.workCommunes) communeCounts[commune] = (communeCounts[commune] || 0) + 1;
  const feed = await rebuildPublicFeed();
  throw new Error('STATE_DIAGNOSTIC ' + JSON.stringify({ feedJobs:feed.totalVerifiedJobOffers, feedItems:feed.itemCount, verifiedInternal:snapshot.verified, eligibleFresh:eligible.length, offerCommunes:communeCounts, preferences:activePrefs.map(item => ({ communes:item.communes, keywordCount:item.keywords.length })), latestNotification:latest }));
};

export const radarRecoveryHandler = async () => {
  const result = await recoverEmptyPublicFeed(true);
  throw new Error('RADAR_RECOVERY_DIAGNOSTIC ' + JSON.stringify(result));
};

async function usableOfferSnapshot() {
  const [jobs, community] = await Promise.all([
    db.list<ListingRecord>('radar_jobs', { limit:200 }),
    db.list<ListingRecord>('community_posts', { limit:200 }),
  ]);
  const active = [...jobs.items, ...community.items].filter(item => item.kind === 'job_offer' && isCurrentlyActive(item));
  return { total:active.length, verified:active.filter(item => item.verified && !item.review).length, provisional:active.filter(item => item.review).length };
}

export const liveRadarValidationHandler = async () => {
  return { statusCode:200 };
};

export const backlogVerificationReportHandler = async () => {
  const rows = await db.list<ListingRecord>('radar_jobs', { limit:200 });
  const active = rows.items.filter(item => item.active && item.kind === 'job_offer');
  const verified = active.filter(item => item.verified && !item.review);
  const pending = active.filter(item => item.review);
  const reasons = new Map<string, number>();
  for (const item of pending) {
    const reason = item.verificationReason || 'Sin tratamiento';
    reasons.set(reason, (reasons.get(reason) || 0) + 1);
  }
  const result = {
    active:active.length,
    verified:verified.length,
    pending:pending.length,
    treated:active.filter(item => Boolean(item.verificationCheckedAt)).length,
    pendingReasons:[...reasons.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([reason,count])=>({reason,count})),
  };
  throw new Error('BACKLOG_VERIFY_REPORT ' + JSON.stringify(result));
};

async function recordLiveStage(motor:string, before:Awaited<ReturnType<typeof usableOfferSnapshot>>, after:Awaited<ReturnType<typeof usableOfferSnapshot>>, discovered:number, found?:number) {
  const result = { motor, checkedAt:new Date().toISOString(), before, after, publicDelta:after.total - before.total, discovered, ...(found == null ? {} : { found }) };
  await db.add('radar_live_tests', [result]);
  console.warn('RADAR_LIVE_STAGE ' + JSON.stringify(result));
}

export const liveTestDirectHandler = async () => {
  const before = await usableOfferSnapshot();
  const direct = await runPublicSourceSweep(undefined, true);
  await rebuildPublicFeed();
  const after = await usableOfferSnapshot();
  await recordLiveStage('Fuentes directas', before, after, direct.reduce((sum,item)=>sum + item.newCandidates,0));
  return { statusCode:200 };
};

export const liveTestTavilyHandler = async () => {
  const before = await usableOfferSnapshot();
  const tavily = await runTavilySweep();
  await rebuildPublicFeed();
  const after = await usableOfferSnapshot();
  await recordLiveStage('Tavily', before, after, tavily.reduce((sum,item)=>sum + item.newCandidates,0), tavily.reduce((sum,item)=>sum + item.candidatesFound,0));
  return { statusCode:200 };
};

export const liveTestExaHandler = async () => {
  const before = await usableOfferSnapshot();
  const exa = await runExaSocialSweep();
  await rebuildPublicFeed();
  const after = await usableOfferSnapshot();
  await recordLiveStage('Exa Social/Local', before, after, exa.reduce((sum,item)=>sum + item.newCandidates,0), exa.reduce((sum,item)=>sum + item.candidatesFound,0));
  return { statusCode:200 };
};

export const liveTestReportHandler = async () => {
  await rebuildPublicFeed();
  const [rows, feedRows, controlRows, snapshot] = await Promise.all([
    db.list<Record<string, unknown>>('radar_live_tests', { limit:10 }),
    readFeedRows(),
    db.list<PublicFeedControl>('public_feed_control', { limit:1 }),
    usableOfferSnapshot(),
  ]);
  const latest = [...rows.items].sort((a,b) => Date.parse(String(b.checkedAt || '')) - Date.parse(String(a.checkedAt || ''))).slice(0,3).map(row => ({ motor:row.motor, before:(row.before as {total?:number})?.total, after:(row.after as {total?:number})?.total, publicDelta:row.publicDelta, discovered:row.discovered, found:row.found }));
  const feed = feedRows.items[0];
  const items = feed?.items ?? [];
  const feedSummary = {
    snapshot,
    pageCount:controlRows.items[0]?.pageCount ?? 0,
    firstPageCount:items.length,
    jobOffers:items.filter(item => item.kind === 'job_offer').length,
    candidates:items.filter(item => item.kind === 'candidate').length,
    review:items.filter(item => item.review).length,
    verified:items.filter(item => item.verified && !item.review).length,
    sample:items.slice(0,5).map(item => ({ title:item.title, kind:item.kind, review:item.review, verified:item.verified, place:item.workLocation })),
  };
  throw new Error('RADAR_TEST_REPORT ' + JSON.stringify({ stages:latest, feed:feedSummary }));
};

const consumeReviewedExchange=reviewedReceiver({
  ingest:()=>pullRadarBatch(externalOfferRecord),
  advance:()=>advancePublicFeed({ revision:'published-retention-counts-v7', reconcileManifestId:'a7425daf-c460-4d88-98fc-adfae0b807fd', project:projectFeedListing, refreshAt:feedRefreshAt }),
  confirm:confirmRadarPublications,
});

const ADMIN_EMAILS = ['mrvvergara@gmail.com'];

const applicationRouter = router({
  'GET /api/growth/advertising': [async ({query}) => json(await advertisingCatalog(query))],
  'POST /api/growth/house-events': [publicQuota('house-events',60,60000,600), houseClientEvent],
  'GET /api/admin/marketing/house': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), houseDashboard],
  'PUT /api/admin/marketing/house': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), saveHouseConfiguration],
  'POST /api/admin/marketing/creative': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), uploadHouseCreative],
  'GET /api/admin/marketing/trials': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), trialApplications],
  'POST /api/admin/marketing/trial': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), activateFreeTrial],
  'POST /api/admin/backup/page': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async (ctx) => adminBackupPage(ctx)],
  'GET /api/admin/session': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async (ctx) => json({ administrator:true, userId:ctx.user!.userId, backupExportEnabled:true })],
  'GET /api/_healthcheck': [async () => json({ message: 'Success' })],
  'GET /api/ops/security-policy': [async () => json({ revision:'security-containment-v2',...SECURITY_POLICY })],

  // Operator diagnostics only; no writes, proofs, keys or history payloads are returned.
  'GET /api/ops/radar-external': [async () => json(await externalRadarStatus())],
  // Only the existing signed receiver and feed; no collector or provider is invoked.
  'POST /api/ops/radar-external/consume': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async () => error('Operación manual deshabilitada durante la reparación de seguridad.',403)],
  'GET /api/ops/document-revalidation': [async () => json(await documentRevalidationStatus())],
  'GET /api/ops/radar-feed': [async () => json(await publicFeedProgress())],
  'GET /api/ops/local-source-evidence': [async ({ query }) => json(await readLocalSourceEvidence(query.cursor))],
  'GET /api/ops/free-public-sources': [async () => json(await freePublicSourceStatus())],
  'POST /api/ops/free-public-sources/run': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async () => error('Operación manual deshabilitada durante la reparación de seguridad.',403)],

  'POST /api/radar/social-run': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async () => error('Operación manual deshabilitada durante la reparación de seguridad.',403)],

  'GET /api/radar/social-results': [async () => {
    const runs=await db.list<Record<string,unknown>>('social_capture_runs',{limit:30});
    const latest=runs.items.slice(-10).reverse();
    return json({ runs:latest.map(x=>({source:x.sourceName,territory:x.territory,status:x.status,createdAt:x.createdAt,processedAt:x.processedAt,posts:x.posts,images:x.images,imagesRead:x.imagesRead,jobNotices:x.jobNotices,findings:x.findings})) });
  }],

  'POST /api/radar/social-collect': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async () => error('Operación manual deshabilitada durante la reparación de seguridad.',403)],

  'POST /api/analytics': [publicQuota('analytics-minute',30,60000,120),publicQuota('analytics-day',500,86400000,2000),async ({ body }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const event = normalizeText(input.event).slice(0, 80);
    const distinctId = cleanClientToken(input.distinctId);
    if (!ANALYTICS_EVENTS.has(event) || !distinctId) return error('Evento de analítica no válido.', 400);
    const eventId=normalizeText(input.eventId);
    if(!/^[A-Za-z0-9_-]{16,80}$/.test(eventId))return json({received:false,reason:'client_update_required'},202);
    if (!allowBurst('analytics', distinctId, 120, 60000)) return error('Demasiados eventos de analítica.', 429);
    const properties = cleanAnalyticsProperties(input.properties);
    const recorded=await recordUsageEvent(eventId,event,distinctId,properties.commune);
    if(recorded.duplicate)return json({received:true,duplicate:true,internalRecorded:true,externalAccepted:false,externalQueryableConfirmed:false},202);
    try {
      const dailyId=createHash('sha256').update(new Date().toISOString().slice(0,10)+'\0'+distinctId).digest('hex');
      const delivered = await relayAnalytics(event, dailyId, properties);
      return json({received:true,internalRecorded:true,externalAccepted:delivered,externalQueryableConfirmed:false},202);
    } catch {
      console.warn('analytics_external_delivery_failed',{event});
      return json({received:true,internalRecorded:true,externalDelivered:false},202);
    }
  }],
  'GET /api/admin/marketing/usage': [requireAuth(),requireAdminEmailAllowlist(ADMIN_EMAILS),async ctx=>{
    const page=await readUsageMetrics(ctx.query.cursor);
    return json({items:page.items,nextToken:page.nextToken||null,source:'first_party_server_receipts',billing:false,externalAnalyticsEnabled:SECURITY_POLICY.externalAnalytics});
  }],

  'GET /api/notifications/preferences': [requireAuth(), async (ctx) => {
    const pref = await getNotificationPreference(ctx.user!.userId);
    return json({ active:Boolean(pref?.active), communes:pref?.communes ?? [], keywords:pref?.keywords ?? [], legacyPending:'legacyPending' in pref && pref.legacyPending===true });
  }],

  'POST /api/notifications/preferences': [requireAuth(), async (ctx) => {
    const input = (ctx.body ?? {}) as Record<string, unknown>;
    const communes = cleanAlertCommunes(input.communes);
    const keywords = cleanAlertKeywords(input.keywords);
    if (!communes.length) return error('Elige al menos una comuna para recibir avisos.', 400);
    const saved = await saveNotificationPreference(ctx.user!.userId, communes, keywords);
    return json({ active:true, communes:saved.communes, keywords:saved.keywords });
  }],

  'DELETE /api/notifications/preferences': [requireAuth(), async (ctx) => {
    await disableNotificationPreference(ctx.user!.userId);
    return json({ active:false });
  }],

  'POST /api/notifications/test': [requireAuth(), publicQuota('notification-test',2,3600000,10), async (ctx) => {
    const pref = await getNotificationPreference(ctx.user!.userId);
    if (!pref?.active) return error('Activa tus avisos antes de probarlos.', 400);
    const result = await notifications.send({
      userIds:[ctx.user!.userId],
      notification:{ title:'Trabajo Cerca · prueba de avisos', body:'Si puedes leer este mensaje en tu dispositivo, la prueba de recepción ha llegado.', url:'/' },
      data:{ kind:'notification_test' },
      ttlSeconds:600,
    });
    return json({ sent:result.sent, failed:result.failed,providerAccepted:result.sent>0,deviceDeliveryConfirmed:false });
  }],

  'GET /api/listings': [async ({ query }) => {
    let feed;
    try {
      feed = await readPublicFeedPage(query.cursor);
    } catch (cause) {
      if (cause instanceof Error && cause.message === 'Feed cursor invalid') return error('Cursor de paginación no válido.', 400);
      throw cause;
    }
    if (!feed) return error('El Radar está preparando su inventario. Reintenta en unos minutos.', 503);
    return query.fresh === '1' ? json(feed) : cacheable(feed, 60);
  }],

  'GET /api/listings/:id': [async ({params})=>{const item=await readPublicFeedItem(params.id);return item?json({item}):error('Esta publicación ya no está disponible en el feed público.',404);}],

  'GET /api/ops/summary': [async () => {
    const [radarJobs, community, candidates, audits, leads, drafts, campaigns] = await Promise.all([
      db.list<ListingRecord>('radar_jobs', { limit:200 }),
      db.list<ListingRecord>('community_posts', { limit:200 }),
      db.list<ListingRecord>('radar_candidates', { limit:200 }),
      db.list<SourceAudit>('source_audits', { limit:100 }),
      db.list<AdvertiserLead>('growth_advertiser_leads', { limit:100 }),
      db.list<SocialDraft>('growth_social_queue', { limit:100 }),
      commercialInventory(),
    ]);
    const now = Date.now();
    const activeRadar = radarJobs.items.filter(item => isCurrentlyActive(item));
    const activeCommunity = community.items.filter(item => isCurrentlyActive(item));
    const pendingCandidates = candidates.items.filter(item => item.active);
    const latestAuditBySource = new Map<string, SourceAudit>();
    for (const audit of [...audits.items].sort((a,b) => Date.parse(b.checkedAt) - Date.parse(a.checkedAt))) {
      if (!latestAuditBySource.has(audit.sourceKey)) latestAuditBySource.set(audit.sourceKey, audit);
    }
    const latestAudits = [...latestAuditBySource.values()];
    const lastSweep = latestAudits.map(item => item.checkedAt).sort().at(-1);
    const activeCampaigns = campaigns.filter(item => item.status === 'active' && Date.parse(item.startAt) <= now && now <= Date.parse(item.endAt));
    const payload = {
      updatedAt:new Date().toISOString(),
      jobs:{
        active:activeRadar.filter(item => item.kind === 'job_offer').length,
        verified:activeRadar.filter(item => item.kind === 'job_offer' && item.verified && !item.review).length,
        publicPending:activeRadar.filter(item => item.kind === 'job_offer' && item.review).length,
        direct:activeCommunity.length,
      },
      radar:{
        pendingCandidates:pendingCandidates.length,
        sourceFailures:latestAudits.filter(item => item.status !== 'ok').length,
        lastSweep:lastSweep ?? null,
      },
      growth:{
        advertiserLeads:leads.items.filter(item => item.status === 'new').length,
        advertiserLeadsPartial:Boolean(leads.nextToken),
        socialDraftsPartial:Boolean(drafts.nextToken),
        socialDrafts:drafts.items.filter(item => item.status === 'draft').length,
        activeCampaigns:activeCampaigns.length,
      },
      privacy:{
        personalDetailsIncluded:false,
        note:'Este resumen expone solo conteos operativos agregados.',
      },
    };
    return cacheable(payload, 30);
  }],

  'POST /api/growth/commercial-events': [publicQuota('commercial-events',60,60000,600), commercialClientEvent],
  'GET /api/admin/marketing/commercial-metrics': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), commercialMetrics],
  'GET /api/growth/promotion': [async () => json(await publicPromotion())],
  'GET /api/admin/marketing/commercial': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), commercialAdmin],
  'PUT /api/admin/marketing/commercial': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), commercialAdmin],
  'GET /api/admin/marketing/campaigns': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), commercialCampaigns],
  'PUT /api/admin/marketing/campaigns': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), commercialCampaigns],
  'GET /api/growth/sponsor': [async ({query}) => {
    const catalog=await advertisingCatalog(query);
    const chosen=catalog.commercial.find(ad=>ad.placements?.includes('search'));
    return json({sponsor:chosen?{...chosen,scope:chosen.communes.includes(query.place)?'exact':'regional'}:null,place:query.place||'Todas'});
  }],

  'POST /api/growth/advertiser-leads': [publicQuota('advertiser',3,3600000,30), async ({ body }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    if (normalizeText(input.website)) return json({ received:true }, 202);
    const clientToken = cleanClientToken(input.clientToken);
    if (!clientToken) return error('Solicitud no válida.', 400);
    if (!allowBurst('advertiser', clientToken, 3, 3600000)) return error('Demasiadas solicitudes. Intenta nuevamente más tarde.', 429);
    const businessName = normalizeText(input.businessName).slice(0, 120);
    const commune = normalizeText(input.commune).slice(0, 80);
    const category = normalizeText(input.category).slice(0, 80);
    const presence = normalizeText(input.presence).slice(0, 80);
    const contact = normalizeText(input.contact).slice(0, 120);
    const note = normalizeText(input.note).slice(0, 600);
    const consent = input.consent === true;
    if (!businessName || !commune || !category || !contact) return error('Completa negocio, comuna, rubro y contacto.', 400);
    if (!COMMERCIAL_PLACES.includes(commune)) return error('Selecciona una comuna de Trabajo Cerca.', 400);
    if(input.advertisingConsent!==true)return error('Autoriza la publicidad del negocio que representas, sin cobros.',400);
    if (!consent) return error('Debes aceptar el aviso de privacidad para solicitar información comercial.', 400);
    if (!moderate([businessName, category, contact, note].join(' '))) return error('La solicitud requiere revisión.', 400);
    let duplicate=false; let leadCursor:string|undefined; const leadTokens=new Set<string>();
    for(let page=0;page<200;page++){
      const recent=await db.list<AdvertiserLead>('growth_advertiser_leads',{limit:100,...(leadCursor?{nextToken:leadCursor}:{})});
      duplicate=recent.items.some(item=>item.contact.toLocaleLowerCase('es-CL')===contact.toLocaleLowerCase('es-CL')&&Date.now()-Date.parse(item.createdAt)<86400000);
      leadCursor=recent.nextToken;if(duplicate||!leadCursor)break;
      if(leadTokens.has(leadCursor)||page===199)return error('No se completó la comprobación comercial. Reintenta más tarde.',503);leadTokens.add(leadCursor);
    }
    if (duplicate) return json({ received:true, duplicate:true }, 202);
    const record: AdvertiserLead = { businessName, commune, category, presence, contact, note, source:'self_service', status:'new', createdAt:new Date().toISOString() };
    const [id] = await db.add('growth_advertiser_leads', [{...record, advertisingConsent:true, consentAcceptedAt:new Date().toISOString(), trialState:'pending_review', houseAttribution:input.houseAttribution && typeof input.houseAttribution === 'object' ? {campaignId:String((input.houseAttribution as Record<string,unknown>).campaignId||'').slice(0,60),creativeId:String((input.houseAttribution as Record<string,unknown>).creativeId||'').slice(0,60)} : null}]);
    if (!id) return error('No se pudo registrar tu interés.', 500);
    await houseConversion(input.houseAttribution,'advertiser_captured',id);
    await houseConversion(input.houseAttribution,'registration_completed',id);
    return json({ received:true, id, trialState:'pending_review', promotion:await publicPromotion() }, 201);
  }],

  'GET /api/radar/run-territorial-now': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async () => error('Operación manual deshabilitada durante la reparación de seguridad.',403)],

  'GET /api/radar/status': [async () => {
    await ensureSourceRegistry();
    const [sources, audits, candidates, socialRuns] = await Promise.all([
      db.list<SourceRecord>('radar_sources', { limit: 160 }),
      db.list<SourceAudit>('source_audits', { limit: 100 }),
      db.list<ListingRecord>('radar_candidates', { limit: 200 }),
      db.list<Record<string,unknown>>('social_capture_runs', { limit: 200 }),
    ]);
    const latestBySource = new Map<string, SourceAudit & { id:string }>();
    for (const audit of audits.items) {
      const previous = latestBySource.get(audit.sourceKey);
      if (!previous || Date.parse(audit.checkedAt) > Date.parse(previous.checkedAt)) latestBySource.set(audit.sourceKey, audit);
    }
    const secretNames = await secrets.listSecretNames();
    const secondEngineConfigured = secretNames.includes('TAVILY_API_KEY');
    const thirdEngineConfigured = secretNames.includes('EXA_API_KEY');
    const detailed = sources.items.filter(source => source.active).map(source => {
      const latest = latestBySource.get(source.key);
      const motor2 = source.key === 'motor-tavily';
      const motor3 = source.key === 'motor-territorial-controlled';
      const dynamicStatus = motor2
        ? (secondEngineConfigured ? 'automatic' : 'limited')
        : motor3
          ? 'automatic'
          : source.status;
      const dynamicNote = motor2 && !secondEngineConfigured
        ? 'Segundo motor web preparado. Falta ingresar la clave gratuita de Tavily para activarlo.'
        : source.note;
      return {
        ...source,
        status:dynamicStatus,
        note:dynamicNote,
        lastChecked:latest?.checkedAt,
        lastStatus:latest?.status,
        candidatesFound:latest?.candidatesFound ?? 0,
        newCandidates:latest?.newCandidates ?? 0,
      };
    });
    const lastSweep = audits.items.reduce<string | undefined>((best, audit) => !best || Date.parse(audit.checkedAt) > Date.parse(best) ? audit.checkedAt : best, undefined);
    const motor2Latest = latestBySource.get('motor-tavily');
    const motor3Latest = latestBySource.get('motor-territorial-controlled');
    const territoryCoverage = PILOT.map(place => {
      const local = detailed.filter(source => source.territories.includes(place));
      const official = local.filter(source => source.mode === 'public_scan').length;
      const community = local.filter(source => source.family === 'Medios y comunidad local').length;
      const automated = local.filter(source => source.status === 'automatic').length;
      const checked = local.map(source => source.lastChecked).filter(Boolean) as string[];
      const lastChecked = checked.sort((a,b) => Date.parse(b) - Date.parse(a))[0];
      return {
        place,
        officialSources:official,
        communitySources:community,
        automatedSources:automated,
        lastChecked,
        gap:community === 0 ? 'Falta medio comunitario nominal' : official === 0 ? 'Falta fuente oficial automática' : 'Cobertura base activa',
      };
    });
    return json({
      sources:detailed,
      inventoryDiagnostics:await (async()=>{const records=await db.list<ListingRecord>('radar_jobs',{limit:200});const bySource:Record<string,number>={};let precargadas=0;let automaticas=0;let socialPublicadas=0;for(const job of records.items.filter(x=>x.kind==='job_offer'&&isCurrentlyActive(x)&&x.verified&&!x.review)){const source=normalizeText(job.source)||'Sin fuente';bySource[source]=(bySource[source]||0)+1;if(job.seedKey?.startsWith('static:'))precargadas++;else automaticas++;if(job.discoveredBy==='radar-social-visual')socialPublicadas++;}return {sampled:records.items.length,hasMore:Boolean(records.nextToken),precargadas,automaticas,socialPublicadas,bySource};})(),
      socialOverview:{
        sampled:socialRuns.items.length,
        pending:socialRuns.items.filter(x=>x.status==='pending').length,
        processed:socialRuns.items.filter(x=>x.status==='processed').length,
        failed:socialRuns.items.filter(x=>x.status==='failed').length,
        imagesRead:socialRuns.items.reduce((n,x)=>n+(Number.isFinite(Number(x.imagesRead))?Number(x.imagesRead):0),0),
        jobNotices:socialRuns.items.reduce((n,x)=>n+(Number.isFinite(Number(x.jobNotices))?Number(x.jobNotices):0),0),
        hasMore:Boolean(socialRuns.nextToken),
      },
      automatedSources:detailed.filter(source => source.status === 'automatic').length,
      pendingCandidates:candidates.items.filter(item => item.active && item.review).length,
      secondEngineConfigured,
      thirdEngineConfigured,
      searchEngines:1 + (secondEngineConfigured ? 1 : 0) + (thirdEngineConfigured ? 1 : 0),
      motor2Latest: motor2Latest ? {
        checkedAt:motor2Latest.checkedAt,
        status:motor2Latest.status,
        linksSeen:motor2Latest.linksSeen,
        candidatesFound:motor2Latest.candidatesFound,
        newCandidates:motor2Latest.newCandidates,
        message:motor2Latest.message,
      } : undefined,
      motor3Latest: motor3Latest ? {
        checkedAt:motor3Latest.checkedAt,
        status:motor3Latest.status,
        linksSeen:motor3Latest.linksSeen,
        candidatesFound:motor3Latest.candidatesFound,
        newCandidates:motor3Latest.newCandidates,
        message:motor3Latest.message,
      } : undefined,
      territoryCoverage,
      lastSweep,
    });
  }],

  'POST /api/radar/photo-tip': [async () => error('La lectura automática de fotos está deshabilitada. Comparte el enlace y texto del aviso.',503)],

  'POST /api/listings': [publicQuota('publish',5,900000,40), async ({ body }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    if (normalizeText(input.website)) return json({ received:true }, 202);
    const clientToken = cleanClientToken(input.clientToken);
    if (!clientToken) return error('Solicitud no válida.', 400);
    if (!allowBurst('publish', clientToken, 5, 900000)) return error('Has realizado varias publicaciones seguidas. Intenta nuevamente más tarde.', 429);
    const kind = normalizeText(input.kind) as ListingRecord['kind'];
    if (!['worker_available','worker_need','service_request','candidate'].includes(kind)) {
      return error('Tipo de publicación no válido.', 400);
    }

    const workLocation = normalizeText(input.workLocation).slice(0, 100);
    const title = (normalizeText(input.title) || (kind === 'candidate' ? 'Aviso aportado al Radar' : '')).slice(0, 140);
    const note = normalizeText(input.detail).slice(0, 1200);
    const contact = normalizeText(input.contact).slice(0, 100);
    const name = normalizeText(input.name).slice(0, 100);
    const sourceUrl = normalizeText(input.sourceUrl).slice(0, 600);
    const sourceName = (normalizeText(input.sourceName) || 'Aporte comunitario').slice(0, 100);
    const consent = input.consent === true;
    const zones = Array.isArray(input.recruitmentZones)
      ? input.recruitmentZones.map(normalizeText).filter(Boolean).slice(0, 14)
      : [];

    if (!title || !workLocation) return error('Falta el cargo/oficio y la localidad.', 400);
    if (!consent) return error('Debes confirmar el aviso de privacidad antes de publicar.', 400);
    if (kind !== 'candidate' && !contact) return error('Indica un medio de contacto.', 400);
    if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) return error('El enlace aportado debe comenzar con http:// o https://.', 400);
    const combined = [title, note, name, contact].join(' ');
    if (!moderate(combined)) return error('La publicación requiere revisión antes de incorporarse.', 400);

    const recentPosts = await db.list<ListingRecord>('community_posts', { limit:100 });
    const now = Date.now();
    const normalizedContact = contact.toLocaleLowerCase('es-CL');
    const normalizedTitle = title.toLocaleLowerCase('es-CL');
    const normalizedPlace = workLocation.toLocaleLowerCase('es-CL');
    const duplicate = recentPosts.items.some(item => {
      if (now - Date.parse(item.createdAt) > 86400000) return false;
      if (kind === 'candidate') {
        if (sourceUrl && item.url === sourceUrl) return true;
        return item.kind === 'candidate' && item.title.toLocaleLowerCase('es-CL') === normalizedTitle && item.workLocation.toLocaleLowerCase('es-CL') === normalizedPlace;
      }
      return Boolean(item.contact) && item.contact!.toLocaleLowerCase('es-CL') === normalizedContact && item.title.toLocaleLowerCase('es-CL') === normalizedTitle && item.workLocation.toLocaleLowerCase('es-CL') === normalizedPlace;
    });
    if (duplicate) return error('Este aviso parece repetido. Espera antes de publicarlo nuevamente o edita/cierra el anterior.', 409);

    if (kind !== 'candidate') {
      const activeForContact = recentPosts.items.filter(item => item.active && item.contact && item.contact.toLocaleLowerCase('es-CL') === normalizedContact).length;
      if (activeForContact >= 4) return error('Ya existen varias publicaciones activas asociadas a este contacto. Cierra las anteriores antes de agregar otra.', 429);
    }

    const createdAt = new Date().toISOString();
    const days = kind === 'worker_available' ? 21 : 30;
    const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
    const ownerToken = token();
    const review = kind === 'candidate';
    const origin = review ? 'community' : 'direct';
    const defaultArea = kind === 'worker_available' ? 'Personas disponibles'
      : kind === 'worker_need' ? 'Oportunidad directa'
      : kind === 'service_request' ? 'Servicios'
      : 'Aporte al Radar';

    const record: ListingRecord = {
      kind,
      origin,
      title,
      company: name || (kind === 'worker_need' ? 'Publicación directa' : kind === 'worker_available' ? 'Persona disponible' : 'Trabajo Cerca'),
      workLocation,
      workCommunes: extractCommunes(workLocation),
      recruitmentZones: zones.length ? zones : [workLocation],
      recruitmentCommunes: extractCommunes((zones.length ? zones : [workLocation]).join(' ')),
      area: defaultArea,
      status: review ? 'En revisión' : 'Activa',
      date: 'Publicado hoy',
      expiresAt,
      apply: 'Sencilla',
      source: review ? `${sourceName} · aporte al Radar` : 'Publicación directa en Trabajo Cerca',
      sourceDomain: review && sourceUrl ? (() => { try { return new URL(sourceUrl).hostname.replace(/^www\./, ''); } catch { return 'trabajocerca.local'; } })() : 'trabajocerca.local',
      url: review && /^https?:\/\//i.test(sourceUrl) ? sourceUrl : undefined,
      note,
      tags: [title, workLocation, ...zones].join(' ').toLocaleLowerCase('es-CL').split(/\s+/).filter(Boolean).slice(0, 20),
      visual: 'field',
      icon: kind === 'worker_need' ? 'build' : 'map',
      review,
      verified: false,
      active: true,
      createdAt,
      contact: review ? undefined : contact,
      contactPublicationConsent:!review && consent,
      contactConsentAt:!review && consent ? createdAt : undefined,
      ownerToken,
    };

    const [id] = await trackedFeedAdd('community_posts', [record]);
    if (!id) return error('No se pudo guardar la publicación.', 500);
    await rebuildPublicFeed();
    if(kind === 'worker_available' || kind === 'worker_need') await houseConversion(input.houseAttribution,'registration_completed',id);
    if(kind === 'worker_available') await houseConversion(input.houseAttribution,'profile_published',id);
    if(kind === 'worker_need') await houseConversion(input.houseAttribution,'employer_added',id);
    return json({ item: publicRecord({ ...record, id }), ownerToken }, 201);
  }],

  'POST /api/listings/:id/contact': [publicQuota('contact',30,600000,300), async ({ params, body }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const clientToken = cleanClientToken(input.clientToken);
    if (!clientToken) return error('Solicitud no válida.', 400);
    if (!allowBurst('contact', clientToken, 30, 600000)) return error('Has consultado muchos contactos en poco tiempo. Intenta nuevamente más tarde.', 429);
    const entry = await readPublicFeedEntry(params.id);
    if (!entry || entry.item.hasContact!==true) return error('Publicación no disponible.',404);
    const [record] = await db.get<ListingRecord>(entry.source,[entry.sourceId],{consistent:true});
    // Recheck the current record, not just a possibly older materialized page.
    if (!record || record.contactPublicationConsent===false || !record.contact || !projectFeedListing({...record,id:entry.sourceId})) return error('Publicación no disponible.',404);
    return json({ contact: record.contact, contactLabel: record.contactLabel });
  }],

  'POST /api/listings/:id/close': [publicQuota('close',10,600000,100), async ({ params, body }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const supplied = normalizeText(input.ownerToken);
    if (!supplied) return error('Falta autorización para cerrar la publicación.', 403);
    const [record] = await db.get<ListingRecord>('community_posts', [params.id]);
    if (!record) return error('Publicación no encontrada.', 404);
    if (record.ownerToken !== supplied) return error('No puedes cerrar esta publicación desde este dispositivo.', 403);
    const [ok] = await trackedFeedUpdate('community_posts', [{
      id: params.id,
      record: { ...record, active: false, status: 'Finalizada' },
    }]);
    if (!ok) return error('No se pudo cerrar la publicación.', 500);
    await rebuildPublicFeed();
    return json({ closed: true });
  }],

  'POST /api/listings/:id/manage': [publicQuota('owner-manage',5,600000,50), async ({params,body})=>{
    const input=(body??{}) as Record<string,unknown>;
    const [record]=await db.get<ListingRecord>('community_posts',[params.id],{consistent:true});
    if(!record)return error('Publicación no encontrada.',404);
    let patch:ReturnType<typeof ownedPublicationPatch>;
    try{patch=ownedPublicationPatch(record,input);}catch{return error('No se autorizaron los cambios o faltan datos válidos.',403);}
    if(!moderate([patch.title,patch.note,patch.contact].join(' ')))return error('Los cambios requieren revisión.',400);
    const [ok]=await trackedFeedUpdate('community_posts',[{id:params.id,record:{...record,...patch,workCommunes:extractCommunes(patch.workLocation)}}]);
    if(!ok)return error('No se pudo guardar la publicación.',500);
    await rebuildPublicFeed();return json({updated:true,id:params.id});
  }],

  'POST /api/listings/:id/delete': [publicQuota('delete',5,600000,50), async ({ params, body }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const supplied = normalizeText(input.ownerToken);
    if (!supplied) return error('Falta autorización para eliminar la publicación.', 403);
    const [record] = await db.get<ListingRecord>('community_posts', [params.id]);
    if (!record) return error('Publicación no encontrada.', 404);
    if (record.ownerToken !== supplied) return error('No puedes eliminar esta publicación desde este dispositivo.', 403);
    const [ok] = await trackedFeedDelete('community_posts', [params.id]);
    if (!ok) return error('No se pudo eliminar la publicación.', 500);
    await rebuildPublicFeed();
    return json({ deleted: true });
  }],
});


export const handler:ReturnType<typeof router> = async event => withSecurityHeaders(await applicationRouter(event));
