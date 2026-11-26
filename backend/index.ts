Warning: truncated output (original token count: 81612)
Total output lines: 4160

import { publicInstitutional, institutionalMedia, institutionalArchiveQueue, institutionalAdmin, institutionalBridge, institutionalCron } from './house-autonomy';
export { institutionalCron };
import {feedReconciliationBaseline} from './feed-reconciliation-config';
import {operationalView} from './operational-metrics';
import {claimVerification,settleVerification,readVerificationIntake,saveVerificationRetryCursor,clearOrphanedIntake,verificationQueueView} from './verification-work';
import { selectRescueBatch } from './rescue-work-policy';
import {processAdminReviewBatch,confirmAdminReviewPublications,isAdminVerificationSlot} from './radar-admin-verification';
import {updateCommercialCampaignDetails} from './commercial-editor';
import {withSecurityHeaders} from './security-headers';
import {COMMERCIAL_PLACES} from '../shared/commercial-policy';
import {ownedPublicationPatch} from '../shared/owned-publication';
import { ownerTokenDigest, mayManagePublication } from './owner-authorization';
import { advertisingCatalog, saveHouseConfiguration, uploadHouseCreative, houseClientEvent, houseDashboard, houseConversion, trialApplications, activateFreeTrial, decideAdvertiserLead, commercialAdmin, readCommercialConfiguration, commercialCampaigns, readCommercialCampaigns, requestCommercialExpansion, publicPromotion, commercialInventory, commercialClientEvent, commercialMetrics } from './house-marketing';
import { db, router, json, error, secrets, storage, ai, notifications, requireAuth, requireAdminEmailAllowlist } from '@appdeploy/sdk';
import { listLocalDirectory, createLocalDirectory, localDirectoryContact, localDirectoryRemove, localDirectoryStatus, submitLocalReview, reportLocalDirectory, adminLocalQueue, adminLocalDecision, adminApproveLocalReview, adminResolveLocalReport, publicLocalDirectoryEntry, myLocalDirectoryEntries, removeLocalDirectoryByEmail } from './local-directory';
import { adminBackupPage } from './admin-backup';
import { directChatGPTImport, revalidateOfficialMunicipalOpenOffers } from './chatgpt-direct-import';
import { motorDAutoImportHandler, confirmMotorDPublications } from './motor-d-auto-import';
import { executiveEngineTelemetry } from './engine-telemetry';
import { captureEngineTelemetry } from './engine-telemetry-snapshot';
import {chatgptAutoImportHandler, confirmChatGPTPublications} from './chatgpt-auto-import';
import { repairApprovedTerritoriesOnce, archiveMislocatedCmpcDuplicateOnce, repairMaestranzaMinincoOnce } from './territory-repair';
import { diagnosePurenPublishedJobs } from './territorial-source-audit';
export { motorDAutoImportHandler };
import { importReview, listReview, decideReview } from './radar-review-inbox';
import {importMotorCGitHubOidc} from './motor-c-github-import';
import { checkOneReview } from './radar-review-check';
import { enqueueAdminReviewedOffer, readAdminReviewPublicationStatus } from './radar-review-queue';
import { confirmedOfferDeadline, offerRetentionReason, offerRecheckDue } from './offer-retention';
import { advancePublicFeed, readPublicFeedPage, readStagedPublicFeedPage, readPublicFeedItem, readPublicFeedSummary, publicFeedProgress, registerPublicFeedChange, trackedFeedAdd, trackedFeedUpdate, trackedFeedDelete } from './public-feed';
import { readCachedPublicPage } from './public-feed-http-cache';
import { isOriginalVerificationSlot } from './verification-schedule';
import { readLocalSourceEvidence } from './local-source-evidence';
import { captionSocialFinding, socialPosterFinding, originalSocialDate, prepareSocialEvidence, socialSourceDate, socialVerificationBlock, sameSocialPost, type SocialEvidence } from './social-evidence';
import { storeSocialFindings, hydrateSocialFindings } from './social-evidence-store';
import { socialExplicitClosure } from './social-evidence';
import { checkSocialApplication } from './social-application';
import { publicSourceAdapter, publicJobExclusion, publicFeedIdentity } from './public-source-adapters';
import { contradictoryWorksite } from '../shared/workplace-consistency';
import { knownFirstPublication } from './first-publication';
import { evaluatePublicJob, type PublicVerification } from './public-source-verifier';
import { fetchPublicPage } from './public-source-http';
import { freePublicSourceStatus, runFreePublicSources, verifiedPublicRecord, type FreeSource } from './free-public-sources';
import {shadowPdfBatch} from './shadow-pdf';
import {runFastBCPipeline} from './fast-bc-pipeline';
export const engineTelemetrySnapshotHandler = async (event?:{scheduledTime?:string}) =>
  captureEngineTelemetry(event?.scheduledTime);
export const fastBCPipelineHandler = async () => {
  try { const result=await runFastBCPipeline();console.warn('FAST_B_C_CYCLE '+JSON.stringify(result));await db.tx.update('fast_bc_pipeline_latest',[{id:'current',record:{at:new Date().toISOString(),state:'completed',result}}]); }
  catch(error){console.warn('FAST_B_C_ERROR '+String(error).slice(0,240));throw error;}
  return {statusCode:200};
};
export {motorBIndependentHandler} from './motor-b-independent';
export {trabajandoTargetedHandler} from './trabajando-targeted';
import {motorCIndependentHandler as motorCLocalHandler} from './motor-c-independent';
import {pullMotorCFromGitHub} from './motor-c-github-pull';
import {pullGeminiReviewQueue} from './motor-gemini-github-pull';
export async function motorCIndependentHandler() {
  const [pullResult, localResult, geminiResult] = await Promise.allSettled([
    pullMotorCFromGitHub(), motorCLocalHandler(), pullGeminiReviewQueue(),
  ]);
  console.warn('MOTOR_GEMINI_COMBINED '+JSON.stringify({state:geminiResult.status==='fulfilled'?String(geminiResult.value['state']||'unknown'):'pull_failed'}));
  console.warn('MOTOR_C_COMBINED ' + JSON.stringify({
    pull: pullResult.status === 'fulfilled' ? pullResult.value.state : 'pull_failed',
    localStatus: localResult.status === 'fulfilled' ? localResult.value.statusCode : 'local_failed',
  }));
  return {statusCode:200};
}
export async function geminiReviewPullHandler() {
  await pullGeminiReviewQueue();
  return { statusCode: 200 };
}
import {publishQualifiedShadowOffers} from './shadow-publish';
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
  ownerToken?: string;
  ownerHash?: string;
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

const POSTHOG_PROJECT_KEY = 'phc_BnfcP6mKc3J2438WPTonKWZnuFfC7RvQ9jFJwTbtPSVz';
const ANALYTICS_EVENTS = new Set([
  'tc_app_open', 'tc_commune_selected', 'tc_listing_opened', 'tc_contact_revealed',
  'tc_external_offer_click', 'tc_listing_shared', 'tc_sponsor_impression', 'tc_sponsor_click',
  'tc_sponsor_viewable_impression', 'tc_photo_tip_submitted', 'tc_advertiser_interest_submitted', 'tc_install_started', 'tc_app_installed', 'tc_travel_opened',
  'tc_install_prompt_available', 'tc_install_prompt_accepted', 'tc_install_prompt_dismissed',
  'tc_notifications_enabled', 'tc_notifications_disabled', 'tc_notifications_test',
]);
const ANALYTICS_PROPERTY_KEYS = new Set([
  'surface', 'commune', 'listing_id', 'kind', 'area', 'origin', 'verified', 'review',
  'sponsor_id', 'category', 'scope', 'presence', 'count', 'keyword_count', 'visible_ms',
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
  const response = await fetch('https://us.i.posthog.com/i/v0/e/', {
    method:'POST',
    headers:{ 'content-type':'application/json' },
    body:JSON.stringify({
      api_key:POSTHOG_PROJECT_KEY,
      event,
      properties:{ distinct_id:distinctId, '$process_person_profile':false, ...properties },
    }),
  });
  return response.ok;
}

const SEED_VERSION = '2026-10-06-v17-live-benchmark';
const SOURCE_VERSION = '2026-10-06-radar-v17-web-discovery';
const PILOT = ['Angol','Collipulli','Ercilla','Renaico','Mininco','Nacimiento','Negrete','Mulchén','Los Sauces','Purén','Traiguén','Lumaco','Victoria'];
const TRAVEL_HUBS = ['Los Ángeles','Temuco','Lautaro'] as const;
const MARKET_PLACES = [...PILOT, ...TRAVEL_HUBS];
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
  { key:'hospital-angol-concursos', name:'Hospital de Angol · concursos oficiales',url:'https://hospitalangol.cl/concursos/',territory:'Angol',discoveryGroup:'local' },
  { key:'hospital-angol-enlaces', name:'Hospital de Angol · bolsa de trabajo',url:'https://hospitalangol.cl/enlaces/',territory:'Angol',discoveryGroup:'local' },
  { key:'fashions-park-empleo-angol', name:'Fashion\'s Park · contratación oficial', url:'https://fashionspark.hiringroom.com/jobs', territory:'Angol y Victoria', discoveryGroup:'portal' },
  { key:'omil-lumaco', name:'Municipalidad / OMIL Lumaco', url:'https://www.munilumaco.cl/', territory:'Lumaco' },
  { key:'omil-los-sauces', name:'Municipalidad / OMIL Los Sauces', url:'https://www.munilossauces.cl/noticias', territory:'Los Sauces' },
  { key:'omil-traiguen', name:'Municipalidad / OMIL Traiguén', url:'https://mtraiguen.cl/direccion-de-fomento-productivo/', territory:'Traiguén' },
  { key:'omil-renaico', name:'Municipalidad / OMIL Renaico', url:'https://municipalidadrenaico.cl/concursos-publicos/', territory:'Renaico' },
  { key:'omil-nacimiento', name:'Municipalidad / OMIL Nacimiento', url:'https://www.nacimiento.cl/noticias', territory:'Nacimiento' },
  { key:'omil-negrete', name:'Municipalidad / OMIL Negrete', url:'https://www.muninegrete.cl/', territory:'Negrete' },
  { key:'omil-mulchen', name:'Municipalidad / OMIL Mulchén', url:'https://www.munimulchen.cl/?s=oferta+laboral', territory:'Mulchén' },
  { key:'omil-collipulli', name:'Municipalidad / OMIL Collipulli', url:'https://municipalidadcollipulli.cl/concursos-publicos/', territory:'Collipulli' },
  // Public, reviewed municipal sources: no paid provider or Instagram automation.
  { key:'omil-victoria-news', name:'Municipalidad / OMIL Victoria · publicaciones', url:'https://victoriachile.cl/category/omil/', territory:'Victoria', discoveryGroup:'local' },
  { key:'omil-puren-2026', name:'Municipalidad / Purén · llamados 2026', url:'https://munipuren.cl/llamados-a-concurso-2026/', territory:'Purén', discoveryGroup:'local' },
  { key:'omil-ercilla', name:'Municipalidad / Ercilla · portal', url:'https://muniercilla.cl/', territory:'Ercilla', discoveryGroup:'local' },
  { key:'malleco7', name:'Malleco 7', url:'https://www.malleco7.cl/', territory:'Malleco' },
  { key:'malleco7-ediciones', name:'Malleco 7 · ediciones digitales', url:'https://www.malleco7.cl/ediciones-digitales-malleco7/', territory:'Malleco' },
  { key:'radio-nativa', name:'Radio Nativa', url:'https://www.radionativa.cl/', territory:'Lumaco' },
  { key:'cmpc-empleo-csod', name:'CMPC · portal de empleo', url:'https://cmpc.csod.com/ux/ats/careersite/4/home?c=cmpc', territory:'zona forestal' },
  { key:'cmpc-empleo-trabajando', name:'CMPC · portal oficial Trabajando', url:'https://cmpc.trabajando.cl/', territory:'Collipulli, Mininco, Nacimiento y zona forestal', discoveryGroup:'portal' },
  { key:'arauco-empleo', name:'Arauco · portal de empleo', url:'https://jobs.arauco.com/Chile/search/', territory:'zona forestal' },
];
const FREE_PORTAL_SEARCHES = [
  { key:'indeed', name:'Indeed', search:'https://cl.indeed.com/jobs?q=&l={place}&fromage=45' },
  { key:'computrabajo', name:'Computrabajo', search:'https://cl.computrabajo.com/empleos-en-{region}-en-{slug}' },
  { key:'linkedin', name:'LinkedIn', search:'https://www.linkedin.com/jobs/search/?keywords=&location={place}%2C%20Chile&f_TPR=r3888000' },
  { key:'laborum', name:'Laborum', search:'https://www.laborum.cl/empleos-busqueda-{slug}.html' },
  { key:'opcionempleo', name:'Opción Empleo', search:'https://www.opcionempleo.cl/empleo-en-{slug}.html' },
  { key:'chiletrabajos', name:'ChileTrabajos', search:'https://www.chiletrabajos.cl/encuentra-un-empleo/?2={place}' },
  { key:'trabajando', name:'Trabajando.com', search:'https://www.trabajando.cl/trabajo-{slug}' },
  { key:'jobrapido', name:'Jobrapido · descubrimiento', search:'https://cl.jobrapido.com/Ofertas-de-trabajo-en-{place}' }
];
// Scan the 13 priority localities, including Victoria, Purén, Ercilla and Mininco. Quilaco is excluded.
const FREE_TARGET_TOWNS = [...PILOT];
const FREE_PUBLIC_SOURCES:FreeSource[] = (() => {
  const searches = FREE_TARGET_TOWNS.flatMap(place => FREE_PORTAL_SEARCHES.map(portal => ({
    key:portal.key+'-'+place, name:portal.name+' · '+place, territory:place,
    url:portal.search.replace('{place}',encodeURIComponent(place)).replace('{region}', ['Mulchén','Negrete','Nacimiento'].includes(place)?'biobio':'araucania').replace('{slug}',place.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,'-')),
  })));
  const secondary = ['Los Ángeles','Temuco'].flatMap(place => FREE_PORTAL_SEARCHES.map(portal => ({
    key:portal.key+'-secondary-'+place, name:portal.name+' · '+place, territory:place, discoveryPriority:'secondary' as const, discoveryGroup:'portal' as const,
    url:portal.search.replace('{place}',encodeURIComponent(place)).replace('{region}', ['Los Ángeles'].includes(place)?'biobio':'araucania').replace('{slug}',sourceSlug(place)),
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
  { key:'hospital-angol-concursos',name:'Hospital de Angol · concursos y llamados',family:'Empleador institucional',mode:'public_scan',status:'automatic',scanUrl:'https://hospitalangol.cl/concursos/',priority:'A+',cadenceHours:12,territories:['Angol'],note:'Fichas públicas; no publicar concursos internos o históricos sin comprobar acceso, plazo, fecha y postulación.',active:true },
  { key:'hospital-angol-bolsa',name:'Hospital de Angol · bolsa de reemplazos',family:'Empleador institucional',mode:'public_scan',status:'automatic',scanUrl:'https://hospitalangol.cl/enlaces/',priority:'A+',cadenceHours:12,territories:['Angol'],note:'Bolsa y canal oficial; la página de enlaces es fuente de descubrimiento, no oferta individual.',active:true },
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
 {title:'Apoyo Cyber Octubre 2026 · Falabella Express',company:'Falabella Retail',portalPlace:'Temuco',evidence:'El título de la oferta identifica explícitamente Falabella Express Angol.',place:'Angol',recruit:'Angol',area:'Comerc…46612 tokens truncated…adarRows, communityRows] = await Promise.all([
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
  const publicFeed=await readPublicFeedSummary();
  return { total:active.length, verified:active.filter(item => item.verified && !item.review).length, provisional:active.filter(item => item.review).length,
    publicVerified:Number(publicFeed.totalVerifiedJobOffers||0),publicItems:Number(publicFeed.itemCount||0),publicRebuilding:publicFeed.rebuilding===true };
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
  advance:()=>advancePublicFeed({ revision:'published-retention-counts-v11-inmel-territorial-withdrawal', reconcileManifestId:feedReconciliationBaseline, project:projectFeedListing, refreshAt:feedRefreshAt }),
  confirm:confirmRadarPublications,
});

const ADMIN_EMAILS = ['mrvvergara@gmail.com'];

const applicationRouter = router({
  'GET /api/admin/gemini/status': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async () => {
    const [row]=await db.get<Record<string,unknown>>('gemini_github_pull_status',['current'],{consistent:true});
    return json(row||{state:'not_yet_executed'});
  }],
  'POST /api/admin/gemini/pull': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async () => json(await pullGeminiReviewQueue())],
  'GET /api/admin/ops-telemetry': [requireAuth(),requireAdminEmailAllowlist(ADMIN_EMAILS),async () => {
    const [snapshot,operation,workQueue]=await Promise.all([
      executiveEngineTelemetry(),
      operationalView().catch(()=>null),
      verificationQueueView().catch(()=>null),
    ]);
    const response=json({...snapshot,operation,workQueue,operationReadState:operation?'available':'read_error'});
    response.headers={...response.headers,'Cache-Control':'no-store, private','Vary':'Authorization'};
    return response;
  }],
  'GET /api/admin/motors/health': [requireAuth(),requireAdminEmailAllowlist(ADMIN_EMAILS),async () => {
    const [[b],[c],[githubPull]]=await Promise.all([db.get('motor_b_latest',['current'],{consistent:true}),db.get('motor_c_local_latest',['current'],{consistent:true}),db.get('motor_c_github_pull_latest',['current'],{consistent:true})]);
    return json({motorA:'verification_and_public_feed',motorB:b||null,motorC:c||null,motorCGithubPull:githubPull||{state:'not_executed'},metricScope:'last_completed_run',verifiedAndPublishedUnconfirmed:true});
  }],
  'POST /api/internal/motor-c/import': [importMotorCGitHubOidc],
  'GET /api/growth/institutional': [publicInstitutional],
  'GET /api/growth/institutional/media/:hash': [institutionalMedia],
  'GET /api/growth/institutional/archive': [institutionalArchiveQueue],
  'GET /api/growth/institutional/bridge': [institutionalBridge],
  'GET /api/admin/marketing/institutional': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), institutionalAdmin],
  'POST /api/admin/marketing/institutional': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), institutionalAdmin],
  'GET /api/growth/advertising': [async ({query}) => json(await advertisingCatalog(query))],
  'POST /api/growth/house-events': [publicQuota('house-events',60,60000,600), houseClientEvent],
  'GET /api/admin/marketing/house': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), houseDashboard],
  'PUT /api/admin/marketing/house': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), saveHouseConfiguration],
  'POST /api/admin/marketing/creative': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), uploadHouseCreative],
  'GET /api/admin/marketing/trials': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), trialApplications],
  'PUT /api/admin/marketing/trials': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), decideAdvertiserLead],
  'GET /api/admin/marketing/notifications': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async ctx=>{const saved=await notifications.listUserTopics({userId:ctx.user!.userId});return json({enabled:saved.topics.includes('tc-admin-commercial-requests')});}],
  'POST /api/admin/marketing/notifications': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async ctx=>{const enabled=(ctx.body as {enabled?:unknown})?.enabled===true;const userIds=[ctx.user!.userId];if(enabled)await notifications.subscribeTopic({userIds,topic:'tc-admin-commercial-requests'});else await notifications.unsubscribeTopic({userIds,topic:'tc-admin-commercial-requests'});return json({enabled});}],
  'POST /api/admin/marketing/trial': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), activateFreeTrial],
  'POST /api/admin/backup/page': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async (ctx) => adminBackupPage(ctx)],
  'GET /api/admin/session': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async (ctx) => json({ administrator:true, userId:ctx.user!.userId, backupExportEnabled:true })],
  'POST /api/admin/chatgpt-direct-import': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async ({body}) => directChatGPTImport(body)],
  'GET /api/admin/territorial-coverage': [requireAuth(),requireAdminEmailAllowlist(ADMIN_EMAILS),async()=>{
    const target=['Angol','Collipulli','Ercilla','Lumaco','Los Sauces','Purén','Renaico','Traiguén','Victoria','Mulchén','Negrete','Nacimiento'];
    const byCity=new Map(target.map(city=>[city,{city,publicJobs:0,sourceConfigured:0,sourceChecked:0,sourceFailed:0,sourceWithFindings:0,
      latestSweep:null as string|null,internalPending:0,internalBlocked:0,unpublishedEligible:0}]));
    const normal=(v:unknown)=>normalizeText(String(v||'')).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-CL');
    const toCity=(v:unknown)=>{
      const name=normal(v);if(name==='mininco'||name==='villa mininco')return 'Collipulli';
      if(name==='coihue'||name==='coigue')return 'Negrete';
      if(name==='capitan pastene')return 'Lumaco';
      return target.find(city=>normal(city)===name)||null;
    };
    const audits:Array<SourceAudit>=[];let auditToken:string|undefined;let sourceAuditComplete=false;
    for(let i=0;i<10;i++){
      const b=await db.list<SourceAudit>('source_audits',{limit:100,...(auditToken?{nextToken:auditToken}:{})});
      audits.push(...b.items);if(!b.nextToken){sourceAuditComplete=true;break;}auditToken=b.nextToken;
    }
    const latest=new Map<string,SourceAudit>();
    for(const audit of audits){
      const prior=latest.get(audit.sourceKey);
      if(!prior||Date.parse(audit.checkedAt)>Date.parse(prior.checkedAt))latest.set(audit.sourceKey,audit);
    }
    const sources=SOURCE_DEFS.filter(s=>s.active&&(s.mode==='public_scan'||s.mode==='discovery'));
    for(const src of sources){
      const audit=latest.get(src.key);
      for(const commune of new Set(src.territories.map(toCity).filter((x):x is string=>!!x))){
        const city=byCity.get(commune);if(!city)continue;
        city.sourceConfigured++;
        if(!audit)continue;
        city.sourceChecked++;
        if(audit.status!=='ok')city.sourceFailed++;
        if(audit.candidatesFound>0)city.sourceWithFindings++;
        if(!city.latestSweep||Date.parse(audit.checkedAt)>Date.parse(city.latestSweep))city.latestSweep=audit.checkedAt;
      }
    }
    let cursor:string|undefined;let feedComplete=false;
    const publishedByCity=new Map(target.map(city=>[city,new Set<string>()]));
    for(let i=0;i<100;i++){
      const page=await readPublicFeedPage(cursor);if(!page)break;
      for(const item of (page.items||[]) as Array<Record<string,unknown>>){
        if(item.kind!=='job_offer')continue;
        for(const city of new Set((Array.isArray(item.workCommunes)?item.workCommunes:[]).map(toCity).filter((x):x is string=>!!x)))
          publishedByCity.get(city)?.add(String(item.id||''));
      }
      if(!page.nextCursor){feedComplete=true;break;}cursor=page.nextCursor;
    }
    for(const [city,ids] of publishedByCity){const stats=byCity.get(city);if(stats)stats.publicJobs=ids.size;}
    const recovery=await db.list<Record<string,unknown>>('radar_gap_recovery_last',{limit:1});
    const last=recovery.items[0];
    const recoveryCommunes=(last?.communes&&typeof last.communes==='object'?last.communes:{}) as Record<string,Record<string,number>>;
    for(const [key,counts] of Object.entries(recoveryCommunes)){
      const cityName=toCity(key);const stats=cityName?byCity.get(cityName):undefined;
      if(!stats)continue;
      stats.internalPending+=Number(counts.pending||0);stats.internalBlocked+=Number(counts.blocked||0);
      stats.unpublishedEligible+=Number(counts.eligibleAbsent||0);
    }
    const response=json({readOnly:true,checkedAt:new Date().toISOString(),feedComplete,
      sourceAuditComplete,recoveryCheckedAt:last?.checkedAt||null,communes:[...byCity.values()],
      sources:sources.map(src=>{const audit=latest.get(src.key);return {id:src.key,communes:[...new Set(src.territories.map(toCity).filter((x):x is string=>!!x))],status:audit?.status||'not_checked',checkedAt:audit?.checkedAt||null,candidates:audit?.candidatesFound??null};}),
      note:'Los totales públicos provienen del catálogo; las cifras internas provienen de la última conciliación. Fuentes configuradas no significan rastreo efectivo. Ninguna cifra suma las ciudades fuente.'});
    response.headers={...response.headers,'Cache-Control':'no-store, private','Vary':'Authorization'};
    return response;
  }],
  'GET /api/admin/archive-cleanup-status': [requireAuth(),requireAdminEmailAllowlist(ADMIN_EMAILS),async()=>{
    const rows=await db.list<Record<string,unknown>>('radar_archive_status_last',{limit:1});
    const response=json({readOnly:true,available:rows.items.length>0,latest:rows.items[0]||null});
    response.headers={...response.headers,'Cache-Control':'no-store, private','Vary':'Authorization'};
    return response;
  }],
  'GET /api/admin/priority-rescue-metrics': [requireAuth(),requireAdminEmailAllowlist(ADMIN_EMAILS),async()=>{
    const [rows,history]=await Promise.all([db.list<Record<string,unknown>>('radar_priority_rescue_telemetry',{limit:1}),db.list<Record<string,unknown>>('radar_priority_rescue_history',{limit:100})]);
    const runs=history.items.sort((a,b)=>Date.parse(String(b.checkedAt||''))-Date.parse(String(a.checkedAt||''))).slice(0,96);
    const response=json({available:rows.items.length>0,latest:rows.items[0]||null,history:runs,historyComplete:!history.nextToken,readOnly:true});
    response.headers={...response.headers,'Cache-Control':'no-store, private','Vary':'Authorization'};
    return response;
  }],
  'GET /api/admin/gap-recovery-status': [requireAuth(),requireAdminEmailAllowlist(ADMIN_EMAILS),async()=>{
    const rows=await db.list<Record<string,unknown>>('radar_gap_recovery_last',{limit:1});
    const response=json({available:rows.items.length>0,latest:rows.items[0]||null,readOnly:true});
    response.headers={...response.headers,'Cache-Control':'no-store, private','Vary':'Authorization'};
    return response;
  }],
  'GET /api/admin/internal-offer-reconciliation': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async () => {
    // Read-only full inventory; never change verification/publication state here.
    const rows:Array<Record<string,unknown>>=[];let token:string|undefined;let inventoryComplete=false;
    for(let step=0;step<15;step++){
      const page=await db.list<Record<string,unknown>>('radar_jobs',{limit:100,...(token?{nextToken:token}:{})});
      rows.push(...page.items);
      if(!page.nextToken){inventoryComplete=true;break;}
      token=page.nextToken;
    }
    const shown=new Set<string>(); const shownIdentity=new Set<string>();let cursor:string|undefined;let publicComplete=false;
    for(let step=0;step<100;step++){
      const page=await readPublicFeedPage(cursor);
      if(!page){break;}
      for(const entry of (page.items||[]) as Array<Record<string,unknown>>){
        shown.add(String(entry.id||''));
        if(typeof entry.url==='string'){const key=publicFeedIdentity(entry.url);if(key)shownIdentity.add(key);}
      }
      if(!page.nextCursor){publicComplete=true;break;}
      cursor=page.nextCursor;
    }
    const now=Date.now();
    const eligible=rows.filter(row=>row.kind==='job_offer').map(row=>{
      const url=typeof row.url==='string'?row.url:'';
      const key=url?publicFeedIdentity(url):null;
      const publicId=shown.has(String(row.id||''));
      const equivalent=!!key&&shownIdentity.has(key);
      const published=publicId||equivalent;
      const explicitDeadline=Date.parse(String(row.sourceValidThrough||''));
      const expired=Number.isFinite(explicitDeadline) && explicitDeadline<now;
      const exclusion=publicJobExclusion(row);
      const retention=offerRetentionReason(row);
      const recheck=offerRecheckDue(row);
      const verified=row.verified===true && row.review!==true;
      let group:string,reason:string;
      if(published){group='publicada';reason=publicId?'Identificador visible en catálogo':'Enlace equivalente ya visible; comprobar deduplicación';}
      else if(expired){group='descartable_confirmada';reason='Plazo de postulación explícitamente vencido';}
      else if(row.active!==true){
        const archiveReason=String(row.archiveReason||'');
        if(archiveReason==='legacy_verification_inconclusive'){group='archivada_sin_evidencia';reason='Fuente no verificable después de revisión; registro y evidencia conservados';}
        else if(archiveReason==='explicit_application_deadline_elapsed'){group='descartable_confirmada';reason='Archivada por plazo de postulación explícito vencido';}
        else{group='revisar_inactiva';reason=String(row.closureReason||row.verificationReason||retention||'Registro inactivo; requiere evidencia antes de descarte');}
      }
      else if(!verified){group='reverificar';reason=String(row.verificationReason||'Aprobación o evidencia pendiente');}
      else if(exclusion){group='apta_bloqueada';reason='Regla de proyección: '+exclusion;}
      else if(retention){group='apta_bloqueada';reason='Regla de vigencia: '+retention;}
      else {
        const projection=projectFeedListing(row as Record<string,unknown>&{id:string});
        group=projection?'apta_no_visible':'apta_bloqueada';
        reason=projection?'Apta para proyección, pero ausente del manifiesto público':'Rechazo en proyección (territorio, fecha o seguridad); revisar origen';
      }
      return {id:String(row.id||''),cargo:String(row.title||''),empresa:String(row.company||''),
        comuna:Array.isArray(row.workCommunes)?row.workCommunes:[],
        fuente:String(row.source||''),url,fecha:String(row.sourcePublishedAt||''),
        plazo:String(row.sourceValidThrough||''),active:row.active===true,
        verified:row.verified===true,review:row.review===true,
        checkDue:recheck,group,reason,discoveredBy:String(row.discoveredBy||row.origin||'origen_no_registrado'),
        verificationReason:String(row.verificationReason||''),retentionReason:retention,
        exclusionReason:exclusion};
    });
    const counts:Record<string,number>={};
    const originCounts:Record<string,number>={};
    for(const item of eligible)counts[item.group]=(counts[item.group]||0)+1;
    for(const row of rows.filter(entry=>entry.kind==='job_offer')){
      const key=String(row.discoveredBy||row.origin||'origen_no_registrado').slice(0,70);
      originCounts[key]=(originCounts[key]||0)+1;
    }
    const response=json({readOnly:true,checkedAt:new Date().toISOString(),inventoryComplete,publicComplete,
      totalInternalJobRecords:eligible.length,publicFeedEntries:shown.size,counts,originCounts,items:eligible,
      note:'Los grupos de descarte son recomendaciones de auditoría, no eliminaciones. Sólo plazo explícito vencido se clasifica como descarte confirmado. Enlace equivalente visible puede haber sido deduplicado.'});
    response.headers={...response.headers,'Cache-Control':'no-store, private','Vary':'Authorization'};
    return response;
  }],
  'GET /api/admin/feed-discrepancies': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async ({query}) => {
    const token=typeof query.cursor==='string'?query.cursor:undefined;
    if(token && (token.length>400||!/^[A-Za-z0-9_+=/.:-]+$/.test(token)))return error('Cursor inválido.',400);
    const shown=new Set<string>();let feedCursor:string|undefined;
    for(let p=0;p<100;p++){
      const page=await readPublicFeedPage(feedCursor);
      if(!page)break;
      for(const item of page.items as Array<Record<string,unknown>>)shown.add(String(item.id||''));
      if(!page.nextCursor)break;
      feedCursor=page.nextCursor;
    }
    const rows=await db.list<Record<string,unknown>>('radar_jobs',{limit:100,...(token?{nextToken:token}:{})});
    const missing=rows.items.filter(row=>row.kind==='job_offer'&&!shown.has(String(row.id||''))).map(row=>({
      id:row.id,title:row.title,company:row.company,workCommunes:row.workCommunes||[],
      discoveredBy:row.discoveredBy||null,sourcePublishedAt:row.sourcePublishedAt||null,
      sourceValidThrough:row.sourceValidThrough||null,active:row.active,verified:row.verified,review:row.review,
      retentionReason:offerRetentionReason(row),exclusionReason:publicJobExclusion(row)||null,
      nextCheck:offerRecheckDue(row)?'revalidation_due':'not_due'
    }));
    return json({readOnly:true,checked:rows.items.length,publicIds:shown.size,missing,
      nextCursor:rows.nextToken||null,note:'Los ausentes pueden ser duplicados, exclusiones legítimas o proyecciones pendientes; no se han reactivado.'});
  }],
  'GET /api/admin/feed-audit': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async ({query}) => {
    const cursor = typeof query.cursor === 'string' ? query.cursor : undefined;
    if (cursor && (cursor.length > 256 || !/^v2:[A-Za-z0-9_-]{1,128}:[0-9]+$/.test(cursor)))
      return error('Cursor de auditoría inválido.', 400);
    const page = await readPublicFeedPage(cursor);
    if (!page) return json({ available:false, reason:'manifest_missing', items:[], hasMore:false, readOnly:true });
    const entries = (page.items || []) as Array<Record<string,unknown>>;
    const ids = entries.map(item => String(item.id || ''));
    const internal = ids.length ? await db.get<Record<string,unknown>>('radar_jobs', ids, { consistent:true }) : [];
    const items = entries.map((item,index) => {
      const row = internal[index];
      const stored = row && row.kind === 'job_offer' ? row : null;
      const original = stored || item;
      const discoveredBy = original.discoveredBy ?? null;
      const provenance = typeof discoveredBy === 'string' ? discoveredBy :
        typeof original.origin === 'string' ? original.origin : 'not_recorded';
      return {
        id:item.id, title:item.title, company:item.company,
        workCommunes:item.workCommunes ?? [], recruitmentCommunes:item.recruitmentCommunes ?? [],
        source:item.source ?? null, sourceDomain:item.sourceDomain ?? null,
        url:item.url ?? null, applicationUrl:item.applicationUrl ?? null,
        publishedDate:item.sourcePublishedAt ?? item.date ?? null,
        deadline:item.sourceValidThrough ?? null,
        verified:item.verified === true, review:item.review === true,
        inPublicFeed:true, sourceRecordFound:!!stored,
        provenance, origin:original.origin ?? null,
        discoveredBy, sourceId:original.sourceId ?? null,
        engineAttribution:provenance === 'not_recorded' ? 'unknown' : 'inferred_from_metadata'
      };
    });
    const response = json({
      available:true, readOnly:true, scope:'one_public_manifest_page',
      reportedVerifiedJobs:page.totalVerifiedJobOffers,
      reportedTotalJobs:page.totalJobOffers,
      pageItems:items.length, items, nextCursor:page.nextCursor ?? null,
      hasMore:page.hasMore === true,
      note:'Presencia confirmada en el manifiesto; atribución de motor solo cuando los metadatos lo permiten.'
    });
    response.headers={...response.headers,'Cache-Control':'no-store, private','Vary':'Authorization'};
    return response;
  }],
  'GET /api/admin/offer-trace': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async ({query}) => {
    const term=typeof query.id==='string'?query.id.trim():'';
    if(!/^[0-9]{5,12}$/.test(term))return error('Identificador de oferta inválido.',400);
    const tables=['radar_jobs','radar_candidates','radar_review_inbox','radar_admin_verification_queue'];
    const matches:Array<Record<string,unknown>>=[];
    const coverage:Array<Record<string,unknown>>=[];
    for(const table of tables){
      let cursor:string|undefined,scanned=0,complete=false;
      for(let step=0;step<12;step++){
        const batch=await db.list<Record<string,unknown>>(table,{limit:100,...(cursor?{nextToken:cursor}:{})});
        scanned+=batch.items.length;
        for(const row of batch.items){
          const url=typeof row.url==='string'?row.url:'';
          const title=typeof row.title==='string'?row.title:'';
          const marker=[url,row.id,row.identificador,row.sourceId].filter(x=>typeof x==='string').join(' ');
          if(marker.includes(term)){
            matches.push({table,id:row.id||null,url:url||null,title:title||null,status:row.status||null,
              review:row.review??null,verified:row.verified??null,motorState:row.motorState||null,
              blockReason:row.blockReason||null,lastCheck:row.lastCheck||null,
              radarJobId:row.radarJobId||null});
          }
        }
        cursor=batch.nextToken;
        if(!cursor){complete=true;break;}
      }
      coverage.push({table,scanned,complete,more:!complete});
    }
    const response=json({term,matches,coverage,partial:coverage.some(x=>!x.complete),readOnly:true,
      note:'Ausencia solo concluyente para tablas marcadas complete. Fuentes externas y feed paginado aún requieren contraste.'});
    response.headers={...response.headers,'Cache-Control':'no-store, private','Vary':'Authorization'};
    return response;
  }],
  'POST /api/admin/radar-review/status': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async ({body}) => json(await readAdminReviewPublicationStatus(body))],
  'POST /api/admin/radar-review/submit': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async ({body}) => json(await enqueueAdminReviewedOffer(body))],
  'POST /api/admin/radar-review/check': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async ({body}) => json(await checkOneReview(body))],
  'GET /api/admin/radar-review': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async ctx => {const response=json(await listReview(ctx.query.cursor));response.headers={...response.headers,'Cache-Control':'no-store, private','Vary':'Authorization'};return response; }],
  'POST /api/admin/radar-review/import': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async ({body}) => {
    try{return json(await importReview(body));}
    catch(cause){if(cause instanceof Error&&/Se requieren|ID y URL/.test(cause.message))return error(cause.message,400);throw cause;}
  }],
  'POST /api/admin/radar-review/decision': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async ({body}) => {
    try{return json(await decideReview(body));}
    catch(cause){if(cause instanceof Error&&/Decisión no válida|Registro no encontrado/.test(cause.message))return error(cause.message,400);throw cause;}
  }],
  'GET /api/admin/document-work': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async () => {
    const status = await freePublicSourceStatus();
    const source = status.documentWork;
    // Export only source references; never credentials, source page bodies or internal cursor state.
    const items = source.items.slice(0, 100).map(item => ({
      url: item.url,
      source: item.source,
      publisher_page: item.publisher_page,
      kind: item.kind,
    }));
    return json({
      schema: 'trabajo-cerca.document-export.v1',
      read_only: true,
      paid_provider_calls: 0,
      created_at: new Date().toISOString(),
      documentWork: {
        schema: 'trabajo-cerca.document-work.v1',
        read_only: true,
        paid_provider_calls: 0,
        coverage_complete: false,
        checked_at: source.checked_at,
        items,
      },
    });
  }],
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
  'GET /api/ops/fast-bc': [async () => {
    const [row]=await db.get<Record<string,unknown>>('fast_bc_state_v2',['current'],{consistent:true});
    const [html]=await db.get<Record<string,unknown>>('fast_bc_html_status_v1',['current'],{consistent:true});
    const decisions=(row?.resolved || {}) as Record<string,{state?:string}>;
    const states={closed:0,not_job:0,needs_source_evidence:0,blocked:0};
    for(const decision of Object.values(decisions)){
      const state=decision.state as keyof typeof states;
      if(state in states)states[state]++;
    }
    return json({initialized:Boolean(row),lastRunAt:row?.lastRunAt || null,
      lastBatch:row?.lastBatch || null,htmlLastBatch:html || null,decisions:states,resolvedTotal:Object.keys(decisions).length,
      historicalQueuesReopened:false,publicationsNotAutomaticallyCertified:true});
  }],
  'GET /api/ops/radar-ab-progress': [async () => {
    const [feed,shadow,pdf]=await Promise.all([readPublicFeedSummary(),db.list<Record<string,unknown>>('radar_shadow_b',{limit:200}),db.list<Record<string,unknown>>('radar_shadow_pdf',{limit:200})]);
    const shadowCount={publishable:0,recoverable:0,blocked:0,closed:0};
    const pdfCount={recoverable:0,needs_review:0,blocked:0,closed:0};
    for(const row of shadow.items){const k=String(row.stage);if(k in shadowCount)shadowCount[k as keyof typeof shadowCount]++;}
    for(const row of pdf.items){const k=String(row.stage);if(k in pdfCount)pdfCount[k as keyof typeof pdfCount]++;}
    return json({updatedAt:new Date().toISOString(),motorA:{visibleVerifiedOffers:Number(feed.totalVerifiedJobOffers||0)},motorB:{htmlReviewed:shadow.items.length,htmlStages:shadowCount,pdfRead:pdf.items.length,pdfStages:pdfCount},additionalPublishedFromB:0,comparisonComplete:false});
  }],
  'GET /api/admin/radar-shadow-compare': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async ({query})=>{
    const rows=await db.list<Record<string,unknown>>('radar_shadow_b',{limit:100,...(query.cursor?{nextToken:query.cursor}:{})});
    const count={publishable:0,recoverable:0,blocked:0,closed:0};
    for(const item of rows.items){const s=String(item.stage);if(s in count)count[s as keyof typeof count]++;}
    const [status,feedState,feedSummary,pdfRows]=await Promise.all([freePublicSourceStatus(),publicFeedProgress(),readPublicFeedSummary(),db.list<Record<string,unknown>>('radar_shadow_pdf',{limit:100})]);
    const pdfCounts={recoverable:0,needs_review:0,blocked:0,closed:0};
    for(const item of pdfRows.items){const state=String(item.stage);if(state in pdfCounts)pdfCounts[state as keyof typeof pdfCounts]++;}
    const independentlyEligible=rows.items.filter(x=>x.eligibleForPublicFeed===true && x.extractionMethod==='html_verified_evidence').length;
    return json({readOnly:true,experiment:'full-source-real-pages',baseline:status.summary,
      result:{publicVerifiedJobOffers:Number(feedSummary.totalVerifiedJobOffers||0),publicFeedItemCount:feedState.visibleItemCount,
        shadowRecords:rows.items.length,shadowHtmlIndependentCandidates:independentlyEligible,
        pdfDocumentsAnalyzed:pdfRows.items.length,pdfCounts,
        // Extra published offers must be confirmed by public feed. Zero until that reconciliation is implemented.
        confirmedAdditionalPublishedFromMotorB:0,comparisonComplete:false},shadow:{sampled:rows.items.length,stages:count,items:rows.items.map(x=>({url:x.url,title:x.title,place:x.place,source:x.source,baselineReason:x.baselineReason,stage:x.stage,eligibleForPublicFeed:x.eligibleForPublicFeed})),nextCursor:rows.nextToken},publicFeedUntouched:true});
  }],
  'POST /api/ops/free-public-sources/run': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async () => error('Operación manual deshabilitada durante la reparación de seguridad.',403)],

  'POST /api/radar/social-run': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async () => error('Operación manual deshabilitada durante la reparación de seguridad.',403)],

  'GET /api/radar/social-results': [async () => {
    const runs=await db.list<Record<string,unknown>>('social_capture_runs',{limit:30});
    const latest=runs.items.slice(-10).reverse();
    return json({ runs:latest.map(x=>({source:x.sourceName,territory:x.territory,status:x.status,createdAt:x.createdAt,processedAt:x.processedAt,posts:x.posts,images:x.images,imagesRead:x.imagesRead,jobNotices:x.jobNotices,findings:x.findings})) });
  }],

  'POST /api/radar/social-collect': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async () => error('Operación manual deshabilitada durante la reparación de seguridad.',403)],

  'GET /api/local-directory': [async ({ query }) => listLocalDirectory(query)],
  'GET /api/local-directory/mine': [requireAuth(),async ({user})=>myLocalDirectoryEntries(user?.email||'')],
  'GET /api/local-directory/:id': [async ({params})=>publicLocalDirectoryEntry(params.id)],
  'POST /api/local-directory/:id/remove-by-email': [requireAuth(),async ({params,user})=>removeLocalDirectoryByEmail(params.id,user?.email||'')],
  'POST /api/local-directory': [publicQuota('local-directory',3,900000,30), async ({ body }) => createLocalDirectory(body)],
  'POST /api/local-directory/:id/contact': [publicQuota('contact',30,600000,300), async ({ params }) => localDirectoryContact(params.id)],
  'POST /api/local-directory/:id/reviews': [publicQuota('local-review',4,3600000,25), requireAuth(), async ({ params, body, user }) => submitLocalReview(params.id,body,user?.email||'')],
  'POST /api/local-directory/:id/report': [publicQuota('local-report',4,3600000,25), async ({ params, body }) => reportLocalDirectory(params.id,body)],
  'POST /api/local-directory/:id/delete': [publicQuota('local-remove',4,600000,25), async ({ params, body }) => localDirectoryRemove(params.id,body)],
  'POST /api/local-directory/:id/status': [publicQuota('local-receipt',15,60000,120), async ({ params, body }) => localDirectoryStatus(params.id,body)],
  'GET /api/admin/local-directory': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async () => adminLocalQueue()],
  'POST /api/admin/local-directory/:id/approve': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async ({ params }) => adminLocalDecision(params.id,'approved')],
  'POST /api/admin/local-directory/:id/hide': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async ({ params }) => adminLocalDecision(params.id,'hidden')],
  'POST /api/admin/local-directory/reviews/:id/approve': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async ({ params }) => adminApproveLocalReview(params.id)],
  'POST /api/admin/local-directory/reports/:id/resolve': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async ({ params }) => adminResolveLocalReport(params.id)],

  'POST /api/analytics': [async ({ body }) => {
    if ((body as Record<string, unknown> | null)?.consent !== true) return json({received:false,disabled:true,reason:'consent_required'},202);
    if (!SECURITY_POLICY.externalAnalytics) return json({received:false,disabled:true,reason:'security_policy_disabled'},202);
    const input = (body ?? {}) as Record<string, unknown>;
    const event = normalizeText(input.event).slice(0, 80);
    const distinctId = cleanClientToken(input.distinctId);
    if (!ANALYTICS_EVENTS.has(event) || !distinctId) return error('Evento de analítica no válido.', 400);
    if (!allowBurst('analytics', distinctId, 120, 60000)) return error('Demasiados eventos de analítica.', 429);
    const properties = cleanAnalyticsProperties(input.properties);
    try {
      const delivered = await relayAnalytics(event, distinctId, properties);
      if (!delivered) return error('Analítica temporalmente no disponible.', 502);
      return json({ received:true }, 202);
    } catch {
      return error('Analítica temporalmente no disponible.', 502);
    }
  }],

  'GET /api/notifications/preferences': [requireAuth(), async (ctx) => {
    const pref = await getNotificationPreference(ctx.user!.userId);
    return json({ active:Boolean(pref?.active), communes:pref?.communes ?? [], keywords:pref?.keywords ?? [] });
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
      notification:{ title:'Trabajo Cerca · avisos activados', body:'Listo. Te avisaremos cuando aparezcan nuevas ofertas verificadas en tus zonas.', url:'/' },
      data:{ kind:'notification_test' },
      ttlSeconds:600,
    });
    return json({ sent:result.sent, failed:result.failed });
  }],

  'GET /api/listings': [async ({ query }) => {
    let feed;
    try {
      feed = await readCachedPublicPage(query.cursor, query.fresh === '1');
    } catch (cause) {
      if (cause instanceof Error && cause.message === 'Feed cursor invalid') return error('Cursor de paginación no válido.', 400);
      throw cause;
    }
    if (!feed) {
      const staged=await readStagedPublicFeedPage();
      if(staged && staged.items.length) return json(staged);
      // Initial public-manifest construction can span multiple scheduled steps.
      // Serve a privacy-filtered, approved-only emergency page instead of HTTP 503.
      // This is a temporary subset, never a fabricated or unreviewed offer.
      const visible:Record<string,unknown>[]=[];
      let nextToken:string|undefined;
      let inspected=0;
      for(let pass=0;pass<8 && visible.length<40;pass++){
        const rows=await db.list<ListingRecord>('radar_jobs',{limit:200,...(nextToken?{nextToken}:{})});
        inspected+=rows.items.length;
        for(const row of rows.items){
          const projected=projectFeedListing(row as Record<string,unknown> & {id:string});
          if(projected)visible.push(projected);
          if(visible.length===40)break;
        }
        nextToken=rows.nextToken;
        if(!nextToken)break;
      }
      console.warn('PUBLIC_FEED_DEGRADED '+JSON.stringify({reason:'manifest_building',visible:visible.length,inspected,moreSourceRows:Boolean(nextToken)}));
      return json({items:visible,totalItems:visible.length,totalJobOffers:visible.filter((x:Record<string,unknown>)=>x.kind==='job_offer').length,
        totalVerifiedJobOffers:visible.filter((x:Record<string,unknown>)=>x.kind==='job_offer').length,
        recentJobOffers24h:0,recentJobOffers7d:0,totalProvisionalJobOffers:0,
        communeStats:{},kindStats:{jobs:visible.length,people:0,needs:0,services:0},
        hasMore:false,degraded:true,feedRebuilding:true,feedState:'degraded_emergency_subset',totalsProvisional:true});
    }
    // Never CDN-cache a partial or emergency-stale result as authoritative.
    if ('degraded' in feed && feed.degraded === true) return json(feed);
    return query.fresh === '1' ? json(feed) : cacheable(feed, 60);
  }],

  // Read-only, paginated public identities for independent ChatGPT reconciliation.
  'GET /api/listings/identities': [async ({query}) => {
    let page;
    try { page=await readPublicFeedPage(query.cursor); }
    catch(cause) {
      if(cause instanceof Error && cause.message==='Feed cursor invalid')return error('Cursor de paginación no válido.',400);
      return error('El catálogo completo no está disponible para conciliación.',503);
    }
    if(!page || ('degraded' in page && page.degraded===true) ||
       ('feedRebuilding' in page && page.feedRebuilding===true))
      return error('El catálogo está en reconstrucción; reintentar sin importar.',503);
    return json({items:(page.items as Record<string,unknown>[]).filter(x=>x.kind==='job_offer').map(x=>({
      id:x.id,title:x.title,company:x.company,url:x.url,
      workCommunes:x.workCommunes,urlHashSha256:x.urlHashSha256
    })),nextCursor:page.nextCursor??null,hasMore:Boolean(page.nextCursor),
      totalItems:page.totalItems,complete:!page.nextCursor,provisional:false});
  }],
  'GET /api/listings/:id': [async ({params})=>{const item=await readPublicFeedItem(params.id);return item?json({item}):error('Esta publicación ya no está disponible en el feed público.',404);}],

  'GET /api/ops/summary': [async () => {
    const [radarJobs, community, candidates, audits, leads, drafts, campaigns, publicFeed] = await Promise.all([
      db.list<ListingRecord>('radar_jobs', { limit:200 }),
      db.list<ListingRecord>('community_posts', { limit:200 }),
      db.list<ListingRecord>('radar_candidates', { limit:200 }),
      db.list<SourceAudit>('source_audits', { limit:100 }),
      db.list<AdvertiserLead>('growth_advertiser_leads', { limit:100 }),
      db.list<SocialDraft>('growth_social_queue', { limit:100 }),
      commercialInventory(),
      readPublicFeedSummary(),
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
        publicVisible:Number(publicFeed.totalJobOffers||0),
        publicVerified:Number(publicFeed.totalVerifiedJobOffers||0),
        publicUpdatedAt:new Date().toISOString(),
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
  'GET /api/admin/marketing/commercial': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), async ()=>readCommercialConfiguration()],
  'PUT /api/admin/marketing/commercial': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), commercialAdmin],
  'GET /api/admin/marketing/campaigns': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), readCommercialCampaigns],
  'PUT /api/admin/marketing/campaigns': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), commercialCampaigns],
  'PUT /api/admin/marketing/campaigns/details': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), updateCommercialCampaignDetails],
  'POST /api/admin/marketing/coverage': [requireAuth(), requireAdminEmailAllowlist(ADMIN_EMAILS), requestCommercialExpansion],
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
    const allowed=['search','listing','featured','form'];
    const slots=Array.isArray(input.placementsRequested)?input.placementsRequested.filter((v):v is string=>typeof v==='string'&&allowed.includes(v)):['search'];
    if(!slots.length||slots.length>4)return error('Selecciona un espacio.',400);
    const headline=normalizeText(input.headlineRequested).slice(0,130);
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
    const record: AdvertiserLead = { businessName, commune, category, presence, contact, note:('[Espacios: '+slots.join(', ')+'] '+(headline?'[Texto: '+headline+'] ':'')+note).slice(0,600), source:'self_service', status:'new', createdAt:new Date().toISOString() };
    const [id] = await db.add('growth_advertiser_leads', [{...record, advertisingConsent:true, consentAcceptedAt:new Date().toISOString(), trialState:'pending_review', houseAttribution:input.houseAttribution && typeof input.houseAttribution === 'object' ? {campaignId:String((input.houseAttribution as Record<string,unknown>).campaignId||'').slice(0,60),creativeId:String((input.houseAttribution as Record<string,unknown>).creativeId||'').slice(0,60)} : null}]);
    if (!id) return error('No se pudo registrar tu interés.', 500);
    await houseConversion(input.houseAttribution,'advertiser_captured',id);
    await houseConversion(input.houseAttribution,'registration_completed',id);
    try{await notifications.sendToTopic({topic:'tc-admin-commercial-requests',notification:{title:'Trabajo Cerca · Nueva solicitud de publicidad',body:'Hay una solicitud publicitaria pendiente de revisión.',url:'/#operacion'},ttlSeconds:3600});}catch{console.warn('MARKETING_ADMIN_PUSH_UNAVAILABLE');}
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

  'POST /api/radar/photo-tip': [publicQuota('photo-tip',3,900000,60), async ({body}) => {
    const input=(body??{}) as Record<string,unknown>;
    const raw=typeof input.imageData==='string'?input.imageData:'';
    const mime=input.mimeType==='image/png'?'image/png':input.mimeType==='image/webp'?'image/webp':'image/jpeg';
    const encoded=raw.replace(/^data:image\/(?:jpeg|png|webp);base64,/, '');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length>2800000 || encoded.length<250) return error('Imagen no válida o demasiado grande. Usa una captura JPG, PNG o WEBP.',400);
    const bytes=Buffer.from(encoded,'base64');
    if(bytes.byteLength>2100000) return error('Imagen demasiado grande (máximo 2 MB).',413);
    const jpg=bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
    const png=bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47;
    const webp=bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
    if (!(mime==='image/jpeg'&&jpg || mime==='image/png'&&png || mime==='image/webp'&&webp)) return error('Formato de imagen no válido.',400);
    const id=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,14);
    const path='radar-contributions/pending/'+id+(jpg?'.jpg':png?'.png':'.webp');
    const [stored]=await storage.write([{path,content:encoded,contentType:mime}]);
    if (!stored) return error('No pudimos guardar la imagen. Intenta otra vez.',503);
    const [recordId]=await db.add('radar_photo_contributions',[{path,sourceName:normalizeText(input.sourceName).slice(0,100)||'Aporte comunitario',status:'pending_moderation',createdAt:new Date().toISOString(),mimeType:mime,bytes:bytes.length,provenance:'community_upload',public:false}]);
    if(!recordId) {await storage.delete([path]);return error('No se pudo registrar el aporte.',503);}
    return json({received:true,public:false,status:'pending_moderation',reference:recordId},202);
  }],

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
      date: new Intl.DateTimeFormat('es-CL',{timeZone:'America/Santiago',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(createdAt)),
      firstPublishedAt: createdAt,
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
      ownerHash: ownerTokenDigest(ownerToken),
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
    const [community, radar] = await Promise.all([
      db.get<ListingRecord>('community_posts', [params.id]),
      db.get<ListingRecord>('radar_jobs', [params.id]),
    ]);
    const record = community[0] ?? radar[0];
    if (!record || !isCurrentlyActive(record)) return error('Publicación no disponible.', 404);
    if (!record.contact) return error('Este aviso no tiene un contacto directo publicado.', 404);
    return json({ contact: record.contact, contactLabel: record.contactLabel });
  }],

  'POST /api/listings/:id/close': [publicQuota('close',10,600000,100), async ({ params, body }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const supplied = normalizeText(input.ownerToken);
    if (!supplied) return error('Falta autorización para cerrar la publicación.', 403);
    const [record] = await db.get<ListingRecord>('community_posts', [params.id]);
    if (!record) return error('Publicación no encontrada.', 404);
    if (!mayManagePublication(record,supplied)) return error('No puedes cerrar esta publicación desde este dispositivo.', 403);
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
    // Shared publication editor keeps its existing contract; the plaintext owner credential lives only in this request.
    try{
      if(!mayManagePublication(record,input.ownerToken))throw Error('owner_denied');
      patch=ownedPublicationPatch({...record,ownerToken:input.ownerToken as string},input);
    }catch{return error('No se autorizaron los cambios o faltan datos válidos.',403);}
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
    if (!mayManagePublication(record,supplied)) return error('No puedes eliminar esta publicación desde este dispositivo.', 403);
    const [ok] = await trackedFeedDelete('community_posts', [params.id]);
    if (!ok) return error('No se pudo eliminar la publicación.', 500);
    await rebuildPublicFeed();
    return json({ deleted: true });
  }],
});


export const handler:ReturnType<typeof router> = async event => withSecurityHeaders(await applicationRouter(event));
