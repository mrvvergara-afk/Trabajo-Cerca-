import { db } from '@appdeploy/sdk';
import { createHash } from 'node:crypto';
import { currentPublicFeedManifest, registerPublicFeedChange } from './public-feed';
import { publicPublisher, publicSourceAdapter, safePublicUrl } from './public-source-adapters';
import { evaluatePublicJob, publicText, type PublicVerification } from './public-source-verifier';
import { fetchPublicPage } from './public-source-http';
import { shadowEvaluate } from './shadow-radar';

export type FreeSource = { key:string; name:string; url:string; territory:string; bootstrap?:boolean; discoveryGroup?:'local' | 'portal'; discoveryPriority?:'secondary' };
type PublicCandidate = { url:string; source:string; priority?:boolean; publisherPage?:string };
type ScanState = { position:number; queues:Record<string,string[]>; seen:Record<string,string[]>;
  localPosition?:number; portalPosition?:number;
  portalProviderPosition?:number; providerPositions?:Record<string,number>;
  secondaryPosition?:number; corePortalSelections?:number;
  renderPending?:PublicCandidate[]; documentPending?:PublicCandidate[];
  pending:PublicCandidate[]; priorityCandidates?:PublicCandidate[]; reviewLane?:number;
  reviewProviderPosition?:number;
  rechecks?:Array<{ url:string; lastAttemptAt?:string; nextCheckAt?:string }>;
  checkedAt?:string; runId?:string; recheckPolicy?:string; summary?:Record<string,unknown> };
type Stored = Record<string,unknown>;
const CURSOR = 'free_public_source_cursor';
const SEEDS = 'free_public_seed_state';
const hash = (value:string) => createHash('sha256').update(value).digest('hex');

export function publicDocumentUrl(value:string) {
  const clean = safePublicUrl(value);
  if (!clean) return false;
  const url = new URL(clean);
  if (/\.(?:pdf|png|jpe?g|webp)$/i.test(url.pathname)) return true;
  const pairs = [...url.searchParams.entries()];
  return url.hostname.replace(/^www\./,'')==='munilumaco.cl' &&
    url.pathname==='/index.php/component/phocadownload/category/1-concursos' &&
    new Set(pairs.map(([key])=>key)).size===pairs.length &&
    pairs.every(([key])=>['Itemid','download'].includes(key)) &&
    /^[1-9]\d{0,8}(?::[a-z0-9-]+)?$/i.test(url.searchParams.get('download') || '') &&
    (!url.searchParams.has('Itemid') || /^[1-9]\d{0,8}$/.test(url.searchParams.get('Itemid') || ''));
}

export function publicPageLinks(raw:string, origin:string) {
  const candidates = new Map<string,string>(), archives = new Set<string>();
  raw=raw.replace(/<(nav|header|footer)\b[^>]*>[\s\S]*?<\/\1>/gi,'');
  // Structured lists are discovery evidence only. Every original job still
  // passes the normal date, location, employer and application verification.
  let nodes=0;
  const visit=(value:unknown,depth=0)=>{
    if (++nodes>1200 || depth>9) return;
    if (Array.isArray(value)) {for(const child of value.slice(0,100))visit(child,depth+1);return;}
    if (!value || typeof value!=='object') return;
    const entry=value as Record<string,unknown>;
    if (['JobPosting','ListItem'].includes(String(entry['@type']))) {
      const target=typeof entry.url==='string' ? entry.url : typeof entry.item==='string' ? entry.item : null;
      const url=target ? safePublicUrl(target,origin) : null,adapter=url?publicSourceAdapter(url):null;
      if (url && adapter && publicPublisher(url)?.group===publicPublisher(origin)?.group) candidates.set(url,String(entry.title || entry.name || '').slice(0,200));
    }
    for(const child of Object.values(entry))visit(child,depth+1);
  };
  for(const script of raw.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    if(script[1].length>300000)continue;
    try {visit(JSON.parse(script[1]));} catch { /* No script evaluation or invented IDs. */ }
  }
  if (/^\s*<\?xml|<rss\b|<feed\b/i.test(raw)) for(const entry of raw.matchAll(/<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi)) {
    const title=publicText((entry[1].match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/<!\[CDATA\[|\]\]>/g,''));
    const target=entry[1].match(/<link[^>]*>([^<]+)<\/link>/i)?.[1] || entry[1].match(/<link\b[^>]*href=["']([^"']+)/i)?.[1];
    const url=target?safePublicUrl(target.replace(/&amp;/g,'&'),origin):null;
    if(url && publicSourceAdapter(url)?.family==='local' && publicPublisher(url)?.group===publicPublisher(origin)?.group && /oferta|vacante|empleo|concurso|postul/i.test(title+' '+url)) candidates.set(url,title.slice(0,200));
  }
  for (const anchor of raw.matchAll(/<a\b([^>]*)href\s*=\s*["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const url = safePublicUrl(anchor[2].replace(/&amp;/g,'&'),origin);
    if (!url) continue;
    const alt = [...anchor[4].matchAll(/\balt=["']([^"']+)["']/gi)].map(match => match[1]).join(' ');
    const title = publicText(anchor[4]+' '+alt);
    const adapter = publicSourceAdapter(url);
    if (publicPublisher(origin)?.group==='malleco7.cl' && new URL(origin).pathname==='/ediciones-digitales-malleco7/' &&
        adapter?.family==='local' && /^\/edicion-[a-z0-9-]+\/$/.test(new URL(url).pathname) && /^Edici[oó]n\s/i.test(title)) {
      candidates.set(url,title.slice(0,200));
    }
    if (publicDocumentUrl(url) && publicPublisher(url)?.group===publicPublisher(origin)?.group &&
        /\bbases?\b|decreto|concurso|convocatoria|descargar\s+pdf/i.test(title)) candidates.set(url,title.slice(0,200));
    if (adapter && (adapter.family!=='local' || /ofertas? (?:laboral|de (?:empleo|trabajo))|vacantes?|se (?:busca|necesita|requiere)|postul|concurso.{0,25}(?:p[uú]blico|cargo)|recluta/i.test(title+' '+new URL(url).pathname.replace(/[-_]/g,' ')))) candidates.set(url,title.slice(0,200));
    if (publicPublisher(url)?.group===publicPublisher(origin)?.group &&
        (/\brel=["']next["']/i.test(anchor[1]+' '+anchor[3]) || /\/page\/\d+|[?&](?:page|paged|start|offset|pagina)=\d+/i.test(url) || /^(?:siguiente|next|›|»)$/i.test(title.trim()))) archives.add(url);
  }
  if (publicSourceAdapter(origin)?.family==='local') {
    for (const embed of raw.matchAll(/<(?:iframe|embed|object)\b[^>]*>/gi)) {
      for (const attribute of embed[0].matchAll(/\b(?:src|data-emsrc|data-src|data)\s*=\s*["']([^"']+)["']/gi)) {
        const url=safePublicUrl(attribute[1].replace(/&amp;/g,'&'),origin);
        if (url && /\.pdf(?:[?#]|$)/i.test(url) && publicPublisher(url)?.group===publicPublisher(origin)?.group) {
          candidates.set(url,'Documento PDF de la publicación municipal');
        }
      }
    }
  }
  if (publicSourceAdapter(origin)?.family==='local' && /ofertas? laboral|vacantes?|se (?:busca|necesita|requiere)|postulaciones?/i.test(publicText(raw))) {
    for (const image of raw.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
      const url=safePublicUrl(image[1].replace(/&amp;/g,'&'),origin);
      if (url && publicPublisher(url)?.group===publicPublisher(origin)?.group && /\.(?:png|jpe?g|webp)(?:[?#]|$)/i.test(url) &&
          !/logo|banner|icon|slider|cropped|avatar|favicon/i.test(url)) candidates.set(url,'Imagen de la publicación laboral');
    }
  }
  return { candidates:[...candidates].slice(0,40).map(([url,title]) => ({ url,title })),archives:[...archives].slice(0,5) };
}

export function publicRenderRequired(raw:string) {
  const text=publicText(raw.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi,''));
  return /<script\b/i.test(raw) && text.length<160 &&
    (text.length===0 || /\bloading\b|cargando|habilit[ae].{0,20}javascript|enable.{0,20}javascript/i.test(text) ||
     /<(?:app-root|nuxt)\b|<(?:div|main)\b[^>]*\bid=["'](?:app|root|__next|__nuxt)["']|<img\b[^>]*alt=["']loading["']/i.test(raw));
}

export function publicDocumentWork(current?:ScanState | null) {
  const items=[...(current?.documentPending || []),...(current?.pending || [])].flatMap(item=>{
    const url=safePublicUrl(item.url),publisherPage=safePublicUrl(item.publisherPage || item.url);
    if (!url || !publisherPage || !(publicSourceAdapter(url)?.family==='local' || publicDocumentUrl(url) && publicPublisher(url)?.group==='munilumaco.cl') ||
        publicPublisher(url)?.group!==publicPublisher(publisherPage)?.group) return [];
    return [{ url,source:item.source,publisher_page:publisherPage,
      kind:publicDocumentUrl(url)?'document':'local_page' }];
  });
  const rendered=(current?.renderPending || []).flatMap(item=>{
    const url=safePublicUrl(item.url);
    return url && ['munilossauces.cl','nacimiento.cl'].includes(publicPublisher(url)?.group || '')
      ? [{ url,source:item.source,publisher_page:url,kind:'rendered_page' }] : [];
  });
  return { schema:'trabajo-cerca.document-work.v1',read_only:true,paid_provider_calls:0,
    items:[...rendered,...items].slice(0,100),checked_at:current?.checkedAt || null,coverage_complete:false };
}

export function pendingCandidateIndex(items:PublicCandidate[], lane=0,providerPosition=0) {
  const priority=items.findIndex(item=>item.priority);
  if (priority>=0) return priority;
  const lanes=['local','portal','aggregator'];
  for (let offset=0;offset<lanes.length;offset++) {
    const kind=lanes[(lane+offset)%lanes.length];
    if (kind==='portal') {
      const providers=[...new Set(items.filter(item=>publicSourceAdapter(item.url)?.family==='portal').map(item=>publicPublisher(item.url)?.group))].filter(Boolean);
      if (providers.length) return items.findIndex(item=>publicSourceAdapter(item.url)?.family==='portal' && publicPublisher(item.url)?.group===providers[providerPosition%providers.length]);
    }
    const index=items.findIndex(item=>!publicDocumentUrl(item.url) && publicSourceAdapter(item.url)?.family===kind);
    if (index>=0) return index;
  }
  return -1;
}

function localDiscoverySource(source:FreeSource) {
  return source.discoveryGroup==='local' || source.discoveryGroup!=='portal' && publicSourceAdapter(source.url)?.family==='local';
}

export function nextPublicSource(sources:FreeSource[], state:Pick<ScanState,'localPosition' | 'portalPosition' | 'portalProviderPosition' | 'providerPositions' | 'secondaryPosition' | 'corePortalSelections'>, slot:number) {
  const local=sources.filter(localDiscoverySource), allPortals=sources.filter(source=>!localDiscoverySource(source));
  const primary=allPortals.filter(source=>source.discoveryPriority!=='secondary');
  const secondary=allPortals.filter(source=>source.discoveryPriority==='secondary');
  const portals=primary.length ? primary : allPortals;
  // Three out of four source roots prioritize municipalities and OMIL.
  // Independent cursors keep portals discoverable without increasing HTTP budget.
  const useLocal=local.length>0 && (!portals.length || slot%4!==3);
  const pool=useLocal ? local : portals;
  if (!pool.length) throw new Error('No public discovery pool');
  const field=useLocal ? 'localPosition' : 'portalPosition';
  if (!useLocal) {
    // Secondary cities use one in four portal slots, within the existing read budget.
    if (primary.length && secondary.length) {
      const turn=Math.max(0, Number(state.corePortalSelections) || 0)%4;
      state.corePortalSelections=(turn+1)%4;
      if (turn===3) {
        const position=Math.max(0, Number(state.secondaryPosition) || 0)%secondary.length;
        state.secondaryPosition=(position+1)%secondary.length;
        return secondary[position];
      }
    }
    const providers=[...new Set(pool.map(source=>publicPublisher(source.url)?.group || source.key))];
    const provider=providers[(state.portalProviderPosition || 0)%providers.length];
    state.portalProviderPosition=((state.portalProviderPosition || 0)+1)%providers.length;
    const options=pool.filter(source=>(publicPublisher(source.url)?.group || source.key)===provider);
    const positions=state.providerPositions || (state.providerPositions={});
    const index=(positions[provider] || 0)%options.length;
    positions[provider]=(index+1)%options.length;
    state.portalPosition=((state.portalPosition || 0)+1)%pool.length;
    return options[index];
  }
  const position=Math.max(0,Number(state[field]) || 0)%pool.length;
  state[field]=(position+1)%pool.length;
  return pool[position];
}

export function verifiedPublicRecord(offer:PublicVerification, now=Date.now()):Stored {
  if (offer.status!=='verified' || !offer.url || !offer.title || !offer.company || !offer.work_commune || !offer.source_published_at) throw new Error('Incomplete public verification');
  const expiry = offer.valid_through || undefined;
  return { kind:'job_offer',origin:'radar',title:offer.title,company:offer.company,
    workLocation:offer.work_commune,workCommunes:[offer.work_commune],recruitmentZones:[],recruitmentCommunes:[],
    area:'Fuente pública',status:'Verificada',date:new Date(offer.source_published_at).toLocaleDateString('es-CL',{ day:'2-digit',month:'short',year:'numeric',timeZone:'America/Santiago' }),source:offer.source,
    sourceDomain:new URL(offer.url).hostname,sourcePublishedAt:offer.source_published_at,
    ...(offer.source_date_evidence ? { sourceDateEvidence:offer.source_date_evidence } : {}),
    sourceValidThrough:offer.valid_through || null,validityMethod:offer.validity_method || (offer.valid_through ? 'explicit_deadline' : 'source_age_45_days'),
    expiresAt:expiry,url:offer.url,note:(offer.valid_through?'Postulación comprobada en la fuente: ':'Formulario habilitado comprobado; la fuente no informa cierre: ')+offer.application,
    tags:[],visual:'field',icon:'work',review:false,verified:true,active:true,
    createdAt:new Date(now).toISOString(),discoveredBy:'free-public-sources-v1',
    secondaryMarket:['Los Ángeles','Temuco'].includes(offer.work_commune),
    verificationCheckedAt:new Date(now).toISOString(),verifiedAt:new Date(now).toISOString(),
    verificationMethod:offer.verification_method,verificationReason:offer.reason };
}
