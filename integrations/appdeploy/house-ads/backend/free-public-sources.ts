import { db } from '@appdeploy/sdk';
import { createHash } from 'node:crypto';
import { currentPublicFeedManifest, registerPublicFeedChange } from './public-feed';
import { publicPublisher, publicSourceAdapter, publicOfferIdentity, safePublicUrl, samePublicJob } from './public-source-adapters';
import { evaluatePublicJob, publicText, type PublicVerification } from './public-source-verifier';
import { fetchPublicPage } from './public-source-http';
import { shadowEvaluate } from './shadow-radar';
import { rememberCandidates, recordCandidate, recordVerification, recoverCandidatePage } from './radar-trace';

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
  // A portal's individual detail page is not another search index.
  // Recommendation widgets otherwise expand the crawl into unrelated national jobs.
  if (publicSourceAdapter(origin)?.family==='portal') {
    return {candidates:[...candidates].filter(([url])=>samePublicJob(origin,url)).map(([url,title])=>({url,title})),archives:[]};
  }
  return { candidates:[...candidates].map(([url,title]) => ({ url,title })),archives:[...archives].slice(0,5) };
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

export async function saveVerifiedPublicOffer(offer:PublicVerification, now=Date.now()) {
  const adapter = publicSourceAdapter(offer.url || '');
  if (!adapter || adapter.family==='aggregator') throw new Error('Unconfirmed offer identity');
  const unit=offer.document_unit_key;
  if (unit && offer.document_unit_verified!==true) throw new Error('Document unit evidence not verified');
  const canonical=publicOfferIdentity(offer.url!,unit);
  if (!canonical) throw new Error('Invalid offer unit identity');
  const identity = hash(canonical), table = 'radar_external_'+identity.slice(0,32);
  const previous = (await db.list<Stored>(table,{ limit:2 })).items;
  if (previous.length>1 || previous[0] && previous[0].externalIdentity!==identity) throw new Error('Public identity conflict; preserve history');
  const old = previous[0], { id:_id,...fields } = old || {};
  const record = { ...fields,...verifiedPublicRecord(offer,now),createdAt:old?.createdAt || new Date(now).toISOString(),
    externalIdentity:identity,externalVerifiedAt:new Date(now).toISOString(),
    ...(unit?{documentUnitKey:unit,documentUnitVerified:true}:{}) };
  if (Buffer.byteLength(JSON.stringify(record))>230*1024) throw new Error('Public offer exceeds byte budget');
  let id = old?.id;
  if (id) {
    const [ok] = await db.update(table,[{ id,record }]);
    if (!ok) throw new Error('Public offer update failed');
  } else {
    const [created] = await db.tx.add(table,[{ ...record,id:'free-'+identity.slice(0,40) }]);
    if (!created) throw new Error('Public offer already exists; reconcile before advancing');
    id = created;
  }
  // Retain storage identity even if feed registration fails; a later retry re-registers it.
  await recordCandidate(offer.url!,{publication:'stored',sourceTable:table,sourceId:id,dedupIdentity:identity,state:'verified',reason:offer.reason},now);
  await registerPublicFeedChange(table,id);
  await recordCandidate(offer.url!,{publication:'queued_for_feed',feedPresent:false},now);
  return { table,id,url:offer.url };
}

async function closeKnownOffer(url:string,result:PublicVerification,page:{url:string;status:number;raw:string},now:number) {
  if (result.status!=='rejected' || !['source_removed','closed_notice','expired_deadline'].includes(result.reason)) return null;
  const adapter=publicSourceAdapter(url);
  if (!adapter || adapter.family==='aggregator') return null;
  const identity=hash(adapter.identityUrl),table='radar_external_'+identity.slice(0,32);
  const rows=(await db.list<Stored>(table,{limit:2})).items;
  if (rows.length>1) throw new Error('Conflicting closure identity; preserve originals');
  const current=rows[0];if (!current || current.externalIdentity!==identity) return null;
  const {id,...original}=current;
  if (current.active!==false || current.closureReason!==result.reason) {
    const [ok]=await db.update(table,[{id,record:{...original,active:false,status:'Cerrada',
      closureReason:result.reason,closedAt:new Date(now).toISOString(),
      closureEvidence:{sourceUrl:page.url,http:page.status,decodedHtmlSha256:hash(page.raw),checkedAt:new Date(now).toISOString(),reason:result.reason}}}]);
    if (!ok) throw new Error('Confirmed closure checkpoint failed');
  }
  // Registration also runs on retry after a partial registration failure.
  await registerPublicFeedChange(table,id);
  return {id,table,reason:result.reason};
}

export async function runFreePublicSources(sources:FreeSource[], requestId:string, now=Date.now()) {
  if (!/^[A-Za-z0-9_-]{12,128}$/.test(requestId)) throw new Error('Invalid public scan request ID');
  const receiptId = hash(requestId);
  const [completed] = await db.get<Stored>('free_public_source_runs',[receiptId],{ consistent:true });
  if (completed) return { ...(completed.summary as Stored),replayed:true,providerCalls:0 };
  const current = (await db.list<ScanState>(CURSOR,{ limit:1 })).items[0];
  if (current?.runId===requestId) return { ...current.summary,replayed:true,providerCalls:0 };
  if (!sources.length) throw new Error('No reviewed public sources');
  const [lease] = await db.tx.add('free_public_run_leases',[{ id:String(Math.floor(now/900000)),requestId,startedAt:new Date(now).toISOString() }]);
  if (!lease) return { deferred:true,reason:'public_scan_cooldown',providerCalls:0,nextAllowedAt:new Date((Math.floor(now/900000)+1)*900000).toISOString() };
  const state:ScanState = current ? structuredClone(current) : { position:0,queues:{},seen:{},pending:[] };
  state.renderPending=state.renderPending || [];
  state.documentPending=state.documentPending || [];
  // Preserve PDF/image references for a dedicated document reader; they must not
  // consume the bounded HTML verification queue or block newer job pages.
  for (const candidate of state.pending.filter(item=>publicDocumentUrl(item.url))) {
    if (!state.documentPending.some(item=>item.url===candidate.url) && state.documentPending.length<180) state.documentPending.push(candidate);
  }
  state.pending=state.pending.filter(item=>!publicDocumentUrl(item.url));
  for (const recovered of await recoverCandidatePage(now)) {
    const target=publicDocumentUrl(recovered.url)?state.documentPending:state.pending;
    const cap=publicDocumentUrl(recovered.url)?180:100;
    if (target.length<cap && !target.some(x=>x.url===recovered.url)) target.push(recovered);
  }
  const rechecks = new Map((state.rechecks || []).map(item => [item.url,item]));
  const documentManagedUrls=new Set<string>();
  // Accepted signed offers remain in their original tables. Discover their URLs without rewriting the batch or its proof.
  const accepted = (await db.list<Stored>('radar_external_pull_state',{ limit:1 })).items[0];
  for (const receipt of (Array.isArray(accepted?.receipts) ? accepted.receipts as Stored[] : []).slice(0,3)) {
    if (typeof receipt.table!=='string' || !/^radar_external_[a-f0-9]{32}$/.test(receipt.table) || typeof receipt.id!=='string') continue;
    const [offer] = await db.get<Stored>(receipt.table,[receipt.id],{ consistent:true });
    const url = typeof offer?.url==='string' ? safePublicUrl(offer.url) : null;
    if (url && offer?.documentUnitVerified===true) {
      documentManagedUrls.add(url);rechecks.delete(url);continue;
    }
    const adapter=url ? publicSourceAdapter(url) : null;
    if (url && adapter && adapter.family!=='aggregator' && !rechecks.has(url)) rechecks.set(url,{ url,lastAttemptAt:String(offer?.externalVerifiedAt || '') });
  }
  const due = [...rechecks.values()].filter(item => {
    if (state.recheckPolicy!=='public-source-dates-v2') return true;
    const checked=Date.parse(item.nextCheckAt || ''),attempt=Date.parse(item.lastAttemptAt || '');
    return Number.isFinite(checked) ? now>=checked : !Number.isFinite(attempt) || now-attempt>=18*3600000;
  }).sort((a,b) => (Date.parse(a.nextCheckAt || a.lastAttemptAt || '') || 0)-(Date.parse(b.nextCheckAt || b.lastAttemptAt || '') || 0));
  const priority = due.slice(0,2).map(item => ({ url:item.url,source:'Reverificación pública' }));
  const priorityUrls = new Set(priority.map(item => item.url));
  state.priorityCandidates=[...priority,...(state.priorityCandidates || []).filter(item=>!priorityUrls.has(item.url) && !documentManagedUrls.has(item.url))];
  state.pending=state.pending.filter(item=>!documentManagedUrls.has(item.url));
  const seenPending = new Set([...state.pending.map(item => item.url),...state.documentPending.map(item=>item.url),...state.priorityCandidates.map(item => item.url),...rechecks.keys(),...documentManagedUrls]);
  const audits:Stored[] = [],receipts:Stored[] = [],closures:Stored[]=[];
  const changedSeeds = new Map<string,{ previous:Stored | null; record:Stored }>();
  let reads = 0, roots = 0;
  const started = Date.now();
  const bootstrapSource=sources.find(source=>source.bootstrap);
  const bootstrapState=bootstrapSource ? (await db.get<Stored>(SEEDS,[hash(bootstrapSource.key)],{ consistent:true }))[0] : null;
  const visitedSources=new Set<string>();
  let discoverySlot=0,selectionAttempts=0;
  while (reads<8 && roots<Math.min(8,sources.length) && selectionAttempts<20 && Date.now()-started<35000) {
    const onboarding=Boolean(roots===0 && bootstrapSource && !bootstrapState);
    const source = onboarding ? bootstrapSource! : nextPublicSource(sources,state,discoverySlot++);
    selectionAttempts++;
    if (visitedSources.has(source.key)) continue;
    visitedSources.add(source.key);
    const seedId = hash(source.key);
    const [previousSeed] = await db.get<Stored>(SEEDS,[seedId],{ consistent:true });
    if (Date.parse(String(previousSeed?.nextAllowedAt || ''))>now) {
      audits.push({source:source.name,territory:source.territory,url:source.url,http:0,
        discoveryGroup:localDiscoverySource(source)?'local':'portal',error:'source_retry_deferred',
        previousReason:previousSeed?.lastError,nextAllowedAt:previousSeed?.nextAllowedAt,coverageComplete:false,candidates:0});
      continue;
    }
    let queue = ((previousSeed?.queue as string[] | undefined) || state.queues[source.key])
      ?.filter(url=>!publicDocumentUrl(url));
    let seen = (previousSeed?.seen as string[] | undefined) || state.seen[source.key] || [];
    if (!queue?.length) { queue=[source.url];seen=[]; }
    const url = queue[0], page = await fetchPublicPage(url);reads++;roots++;
    const audit:Stored = { source:source.name,territory:source.territory,url,http:page.status,
      discoveryGroup:localDiscoverySource(source)?'local':'portal',
      error:page.error || null,coverageComplete:false,candidates:0 };
    if (page.status===200 && !page.error) {
      const links = publicPageLinks(page.raw,page.url);
      if (publicRenderRequired(page.raw)) {
        audit.error='source_render_required';audit.renderRequired=true;
        if (['munilossauces.cl','nacimiento.cl'].includes(publicPublisher(page.url)?.group || '') &&
            !state.renderPending.some(item=>item.url===page.url) && state.renderPending.length<12) {
          state.renderPending.push({ url:page.url,source:source.name,publisherPage:page.url });
        }
      }
      if (publicSourceAdapter(page.url) && !seenPending.has(page.url)) links.candidates.unshift({ url:page.url,title:'' });
      await rememberCandidates(links.candidates.map(item=>({url:item.url,source:source.name,publisherPage:page.url})),now);
      audit.candidateEvidence=links.candidates.slice(0,40).map(item=>({ url:item.url,title:item.title }));
      audit.retainedCandidateCount=links.candidates.length;
      for (const item of links.candidates) if (!seenPending.has(item.url)) {
        if (onboarding && state.priorityCandidates.length<3) state.priorityCandidates.push({ url:item.url,source:source.name,priority:true,publisherPage:page.url });
        else if (publicDocumentUrl(item.url) && state.documentPending.length<180) state.documentPending.push({url:item.url,source:source.name,publisherPage:page.url});
        else if (state.pending.length<100 && !publicDocumentUrl(item.url)) state.pending.push({ url:item.url,source:source.name,publisherPage:page.url });
        else audit.queueFull=true;
        seenPending.add(item.url);
      }
      seen = [...new Set([...seen,url])].slice(-64);
      queue = [...new Set([...queue.slice(1),...links.archives,...links.candidates.filter(item => publicSourceAdapter(item.url)?.family==='local' &&
        !publicDocumentUrl(item.url)).map(item => item.url)])]
        .filter(item => !seen.includes(item)).slice(0,30);
      audit.candidates = links.candidates.length;
    }
    const restricted=Boolean(page.error && /robots|challenge|render_required/.test(String(audit.error))) || [401,403,429].includes(page.status) || audit.renderRequired===true;
    const seed = { id:seedId,key:source.key,queue,seen,revision:Number(previousSeed?.revision || 0)+1,checkedAt:new Date(now).toISOString(),
      lastError:audit.error || (page.status>=400?'HTTP '+page.status:null),nextAllowedAt:restricted ? new Date(now+12*3600000).toISOString() : null };
    if (Buffer.byteLength(JSON.stringify(seed))>230*1024) throw new Error('Source history checkpoint byte budget exceeded');
    changedSeeds.set(seedId,{ previous:previousSeed,record:seed });
    audits.push(audit);if (!onboarding) state.position=(state.position+1)%sources.length;
  }
  let verified = 0;
  const reviewed:Stored[] = [];
  const shadowReviewed:Stored[] = [];
  while (reads<14 && (state.pending.length || state.priorityCandidates.length) && reviewed.length<6 && Date.now()-started<50000) {
    const priorityQueue=state.priorityCandidates.length>0;
    const selected=priorityQueue ? 0 : pendingCandidateIndex(state.pending,state.reviewLane || 0,state.reviewProviderPosition || 0);
    if (selected<0) break;
    const candidate = priorityQueue ? state.priorityCandidates[0] : state.pending[selected];
    const page = await fetchPublicPage(candidate.url,candidate.url);reads++;
    let result = page.error ? { status:'pending',reason:page.error } as PublicVerification : evaluatePublicJob(candidate.url,page.raw,page.url,page.status,now);
    if (result.reason==='aggregator_requires_original_source') {
      const originals = publicPageLinks(page.raw,page.url).candidates.filter(item => publicSourceAdapter(item.url)?.family!=='aggregator');
      if (originals.length===1 && reads<14) {
        const original = originals[0].url, originalPage = await fetchPublicPage(original,original);reads++;
        result = originalPage.error ? { status:'pending',reason:originalPage.error } : evaluatePublicJob(original,originalPage.raw,originalPage.url,originalPage.status,now);
      }
    }
    await recordVerification(candidate.url,result,page.status,'A',now);
    if (result.status==='verified') {
      receipts.push(await saveVerifiedPublicOffer(result,now));verified++;
      rechecks.set(safePublicUrl(result.url!)!,{ url:safePublicUrl(result.url!)!,lastAttemptAt:new Date(now).toISOString(),nextCheckAt:new Date(now+18*3600000).toISOString() });
    } else if (result.status==='rejected') {
      const closed=await closeKnownOffer(candidate.url,result,page,now);
      if (closed) closures.push(closed);
      if (rechecks.has(candidate.url)) rechecks.set(candidate.url,{url:candidate.url,lastAttemptAt:new Date(now).toISOString(),nextCheckAt:new Date(now+24*3600000).toISOString()});
    } else if (result.status==='pending' && (rechecks.has(candidate.url) || rechecks.size<80)) {
      // Failure to parse/access an offer is not evidence it should be discarded.
      // Keep its URL for a later independent HTTP attempt without blocking the discovery cursor.
      rechecks.set(candidate.url,{ url:candidate.url,lastAttemptAt:new Date(now).toISOString(),nextCheckAt:new Date(now+6*3600000).toISOString() });
    } else if (rechecks.has(candidate.url)) {
      rechecks.set(candidate.url,{ url:candidate.url,lastAttemptAt:new Date(now).toISOString(),nextCheckAt:new Date(now+24*3600000).toISOString() });
    }
    try {
      shadowReviewed.push(await shadowEvaluate({url:candidate.url,source:candidate.source,publisherPage:candidate.publisherPage,raw:page.raw,http:page.status,baseline:result,at:now}));
    } catch(shadowCause) { console.warn('SHADOW_B_STORAGE_ERROR '+String(shadowCause)); }
    reviewed.push({ url:candidate.url,status:result.status,reason:result.reason });
    if (publicSourceAdapter(candidate.url)?.family==='portal') state.reviewProviderPosition=(state.reviewProviderPosition || 0)+1;
    // The immutable run receipt retains every reviewed result and source failure.
    if (priorityQueue) state.priorityCandidates.shift();
    else { state.pending.splice(selected,1);state.reviewLane=((state.reviewLane || 0)+1)%3; }
  }
  const summary = { checkedAt:new Date(now).toISOString(),sourcesRead:roots,httpReads:reads,
    localSourcesRead:audits.filter(item=>item.discoveryGroup==='local').length,
    portalSourcesRead:audits.filter(item=>item.discoveryGroup==='portal').length,
    documentsManagedSeparately:documentManagedUrls.size,
    noticesChecked:reviewed.length,verified,stored:receipts.length,published:0,providerCalls:0,
    closuresConfirmed:closures.length,closures,sourcesDeferred:audits.filter(item=>item.error==='source_retry_deferred').length,
    pending:state.pending.length,priorityPending:state.priorityCandidates.length,
    documentsAwaitingLocalReader:state.documentPending.length,
    reverificationBacklog:due.filter(item => !reviewed.some(result => result.url===item.url)).length,trackedOffers:rechecks.size,
    nextSource:state.position,coverageComplete:false,audits:audits.map(({ candidateEvidence,...audit })=>audit),reviewed,shadowReviewed,receipts };
  state.rechecks=[...rechecks.values()];
  state.recheckPolicy='public-source-dates-v2';
  state.summary=summary;state.checkedAt=summary.checkedAt;state.runId=requestId;
  state.queues={};state.seen={};
  const { id:_id,...payload } = state as ScanState & { id?:string };
  if (Buffer.byteLength(JSON.stringify(payload))>230*1024) throw new Error('Public source checkpoint byte budget exceeded');
  const checkpoint = current ? db.tx.update(CURSOR,[{ id:current.id,record:payload,if:{ runId:current.runId } }]) : db.tx.add(CURSOR,[{ ...payload,id:'cursor' }]);
  const receipt = db.tx.add('free_public_source_runs',[{ id:receiptId,requestId,summary }]);
  const seedWrites = [...changedSeeds].map(([id,seed]) => seed.previous ? db.tx.update(SEEDS,[{ id,record:seed.record,if:{ revision:seed.previous.revision } }]) : db.tx.add(SEEDS,[seed.record]));
  const sourceReads=audits.map((audit,index)=>({ ...audit,id:hash('free_public_source_reads:'+requestId+'-'+index),requestId,checkedAt:summary.checkedAt }));
  sourceReads.forEach(read=>{if (Buffer.byteLength(JSON.stringify(read))>230*1024) throw new Error('Source evidence byte budget exceeded');});
  const journals=db.tx.add('free_public_source_reads',sourceReads);
  if (Buffer.byteLength(JSON.stringify({ payload,summary,sourceReads,seeds:[...changedSeeds.values()].map(seed=>seed.record) }))>900*1024) throw new Error('Public scan transaction input byte budget exceeded');
  const [saved,recorded] = await db.transact([checkpoint,receipt,...seedWrites,journals]);
  if (!saved[0] || !recorded[0]) throw new Error('Public source checkpoint and audit receipt were not committed');
  return summary;
}

export async function freePublicSourceStatus() {
  const current = (await db.list<ScanState>(CURSOR,{ limit:1 })).items[0];
  const snapshot = current ? await currentPublicFeedManifest() : null;
  const receipts = Array.isArray(current?.summary?.receipts) ? current.summary.receipts as Stored[] : [];
  const visible = snapshot ? receipts.filter(receipt => snapshot.manifest.pages.some(page => page.keys.includes(String(receipt.table)+':'+String(receipt.id)))) : [];
  return { readOnly:true,providerCalls:0,initialized:Boolean(current),summary:current?.summary || null,
    publishedConfirmed:snapshot ? visible.length : null,feedManifestId:snapshot?.manifestId || null,
    historicalCoverageComplete:false,pending:current?.pending.length ?? null,checkedAt:current?.checkedAt || null,
    documentWork:publicDocumentWork(current) };
}
