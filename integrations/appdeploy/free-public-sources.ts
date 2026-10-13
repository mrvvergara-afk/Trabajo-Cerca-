import { db } from '@appdeploy/sdk';
import { createHash } from 'node:crypto';
import { currentPublicFeedManifest, registerPublicFeedChange } from './public-feed';
import { publicPublisher, publicSourceAdapter, safePublicUrl } from './public-source-adapters';
import { evaluatePublicJob, publicText, type PublicVerification } from './public-source-verifier';
import { fetchPublicPage } from './public-source-http';

export type FreeSource = { key:string; name:string; url:string; territory:string; bootstrap?:boolean };
type PublicCandidate = { url:string; source:string; priority?:boolean };
type ScanState = { position:number; queues:Record<string,string[]>; seen:Record<string,string[]>;
  pending:PublicCandidate[]; priorityCandidates?:PublicCandidate[]; reviewLane?:number;
  rechecks?:Array<{ url:string; lastAttemptAt?:string; nextCheckAt?:string }>;
  checkedAt?:string; runId?:string; recheckPolicy?:string; summary?:Record<string,unknown> };
type Stored = Record<string,unknown>;
const CURSOR = 'free_public_source_cursor';
const SEEDS = 'free_public_seed_state';
const hash = (value:string) => createHash('sha256').update(value).digest('hex');

export function publicPageLinks(raw:string, origin:string) {
  const candidates = new Map<string,string>(), archives = new Set<string>();
  raw=raw.replace(/<(nav|header|footer)\b[^>]*>[\s\S]*?<\/\1>/gi,'');
  for (const anchor of raw.matchAll(/<a\b([^>]*)href\s*=\s*["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const url = safePublicUrl(anchor[2].replace(/&amp;/g,'&'),origin);
    if (!url) continue;
    const alt = [...anchor[4].matchAll(/\balt=["']([^"']+)["']/gi)].map(match => match[1]).join(' ');
    const title = publicText(anchor[4]+' '+alt);
    const adapter = publicSourceAdapter(url);
    if (adapter && (adapter.family!=='local' || /ofertas? (?:laboral|de (?:empleo|trabajo))|vacantes?|se (?:busca|necesita|requiere)|postul|concurso.{0,25}(?:p[uú]blico|cargo)|recluta/i.test(title+' '+new URL(url).pathname.replace(/[-_]/g,' ')))) candidates.set(url,title.slice(0,200));
    if (publicPublisher(url)?.group===publicPublisher(origin)?.group &&
        (/\brel=["']next["']/i.test(anchor[1]+' '+anchor[3]) || /\/page\/\d+|[?&](?:page|paged)=\d+/i.test(url))) archives.add(url);
  }
  return { candidates:[...candidates].slice(0,40).map(([url,title]) => ({ url,title })),archives:[...archives].slice(0,5) };
}

export function pendingCandidateIndex(items:PublicCandidate[], lane=0) {
  const priority=items.findIndex(item=>item.priority);
  if (priority>=0) return priority;
  const lanes=['local','portal','aggregator'];
  for (let offset=0;offset<lanes.length;offset++) {
    const kind=lanes[(lane+offset)%lanes.length];
    const index=items.findIndex(item=>! /\.(?:pdf|png|jpe?g|webp)(?:[?#]|$)/i.test(item.url) && publicSourceAdapter(item.url)?.family===kind);
    if (index>=0) return index;
  }
  return -1;
}

export function verifiedPublicRecord(offer:PublicVerification, now=Date.now()):Stored {
  if (offer.status!=='verified' || !offer.url || !offer.title || !offer.company || !offer.work_commune || !offer.source_published_at) throw new Error('Incomplete public verification');
  const expiry = offer.valid_through || new Date(Date.parse(offer.source_published_at)+45*86400000).toISOString();
  return { kind:'job_offer',origin:'radar',title:offer.title,company:offer.company,
    workLocation:offer.work_commune,workCommunes:[offer.work_commune],recruitmentZones:[],recruitmentCommunes:[],
    area:'Fuente pública',status:'Verificada',date:new Date(offer.source_published_at).toLocaleDateString('es-CL',{ day:'2-digit',month:'short',year:'numeric',timeZone:'America/Santiago' }),source:offer.source,
    sourceDomain:new URL(offer.url).hostname,sourcePublishedAt:offer.source_published_at,
    ...(offer.source_date_evidence ? { sourceDateEvidence:offer.source_date_evidence } : {}),
    sourceValidThrough:offer.valid_through || null,validityMethod:offer.validity_method || 'explicit_deadline',
    expiresAt:expiry,url:offer.url,note:(offer.valid_through?'Postulación comprobada en la fuente: ':'Formulario habilitado comprobado; la fuente no informa cierre: ')+offer.application,
    tags:[],visual:'field',icon:'work',review:false,verified:true,active:true,
    createdAt:new Date(now).toISOString(),discoveredBy:'free-public-sources-v1',
    verificationCheckedAt:new Date(now).toISOString(),verifiedAt:new Date(now).toISOString(),
    verificationMethod:offer.verification_method,verificationReason:offer.reason };
}

async function saveOffer(offer:PublicVerification, now:number) {
  const adapter = publicSourceAdapter(offer.url || '');
  if (!adapter || adapter.family==='aggregator') throw new Error('Unconfirmed offer identity');
  const identity = hash(adapter.identityUrl), table = 'radar_external_'+identity.slice(0,32);
  const previous = (await db.list<Stored>(table,{ limit:2 })).items;
  if (previous.length>1 || previous[0] && previous[0].externalIdentity!==identity) throw new Error('Public identity conflict; preserve history');
  const old = previous[0], { id:_id,...fields } = old || {};
  const record = { ...fields,...verifiedPublicRecord(offer,now),createdAt:old?.createdAt || new Date(now).toISOString(),
    externalIdentity:identity,externalVerifiedAt:new Date(now).toISOString() };
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
  await registerPublicFeedChange(table,id);
  return { table,id,url:offer.url };
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
  const rechecks = new Map((state.rechecks || []).map(item => [item.url,item]));
  // Accepted signed offers remain in their original tables. Discover their URLs without rewriting the batch or its proof.
  const accepted = (await db.list<Stored>('radar_external_pull_state',{ limit:1 })).items[0];
  for (const receipt of (Array.isArray(accepted?.receipts) ? accepted.receipts as Stored[] : []).slice(0,3)) {
    if (typeof receipt.table!=='string' || !/^radar_external_[a-f0-9]{32}$/.test(receipt.table) || typeof receipt.id!=='string') continue;
    const [offer] = await db.get<Stored>(receipt.table,[receipt.id],{ consistent:true });
    const url = typeof offer?.url==='string' ? safePublicUrl(offer.url) : null;
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
  state.priorityCandidates=[...priority,...(state.priorityCandidates || []).filter(item=>!priorityUrls.has(item.url))];
  const seenPending = new Set([...state.pending.map(item => item.url),...state.priorityCandidates.map(item=>item.url),...rechecks.keys()]);
  const audits:Stored[] = [],receipts:Stored[] = [];
  const changedSeeds = new Map<string,{ previous:Stored | null; record:Stored }>();
  let reads = 0, roots = 0;
  const started = Date.now();
  const bootstrapSource=sources.find(source=>source.bootstrap);
  const bootstrapState=bootstrapSource ? (await db.get<Stored>(SEEDS,[hash(bootstrapSource.key)],{ consistent:true }))[0] : null;
  while (reads<5 && roots<Math.min(5,sources.length) && Date.now()-started<35000) {
    const onboarding=Boolean(roots===0 && bootstrapSource && !bootstrapState);
    const source = onboarding ? bootstrapSource! : sources[state.position%sources.length];
    const seedId = hash(source.key);
    const [previousSeed] = await db.get<Stored>(SEEDS,[seedId],{ consistent:true });
    let queue = (previousSeed?.queue as string[] | undefined) || state.queues[source.key];
    let seen = (previousSeed?.seen as string[] | undefined) || state.seen[source.key] || [];
    if (!queue?.length) { queue=[source.url];seen=[]; }
    const url = queue[0], page = await fetchPublicPage(url);reads++;roots++;
    const audit:Stored = { source:source.name,territory:source.territory,url,http:page.status,
      error:page.error || null,coverageComplete:false,candidates:0 };
    if (page.status===200 && !page.error) {
      const links = publicPageLinks(page.raw,page.url);
      if (publicSourceAdapter(page.url) && !seenPending.has(page.url)) links.candidates.unshift({ url:page.url,title:'' });
      audit.candidateEvidence=links.candidates.map(item=>({ url:item.url,title:item.title }));
      for (const item of links.candidates) if (!seenPending.has(item.url)) {
        if (onboarding && state.priorityCandidates.length<3) state.priorityCandidates.push({ url:item.url,source:source.name,priority:true });
        else if (state.pending.length<100) state.pending.push({ url:item.url,source:source.name });
        else audit.queueFull=true;
        seenPending.add(item.url);
      }
      seen = [...new Set([...seen,url])].slice(-64);
      queue = [...new Set([...queue.slice(1),...links.archives,...links.candidates.filter(item => publicSourceAdapter(item.url)?.family==='local').map(item => item.url)])]
        .filter(item => !seen.includes(item)).slice(0,30);
      audit.candidates = links.candidates.length;
    }
    const seed = { id:seedId,key:source.key,queue,seen,revision:Number(previousSeed?.revision || 0)+1,checkedAt:new Date(now).toISOString() };
    if (Buffer.byteLength(JSON.stringify(seed))>230*1024) throw new Error('Source history checkpoint byte budget exceeded');
    changedSeeds.set(seedId,{ previous:previousSeed,record:seed });
    audits.push(audit);if (!onboarding) state.position=(state.position+1)%sources.length;
  }
  let verified = 0;
  const reviewed:Stored[] = [];
  while (reads<8 && (state.pending.length || state.priorityCandidates.length) && reviewed.length<3 && Date.now()-started<50000) {
    const priorityQueue=state.priorityCandidates.length>0;
    const selected=priorityQueue ? 0 : pendingCandidateIndex(state.pending,state.reviewLane || 0);
    if (selected<0) break;
    const candidate = priorityQueue ? state.priorityCandidates[0] : state.pending[selected];
    const page = await fetchPublicPage(candidate.url,candidate.url);reads++;
    let result = page.error ? { status:'pending',reason:page.error } as PublicVerification : evaluatePublicJob(candidate.url,page.raw,page.url,page.status,now);
    if (result.reason==='aggregator_requires_original_source') {
      const originals = publicPageLinks(page.raw,page.url).candidates.filter(item => publicSourceAdapter(item.url)?.family!=='aggregator');
      if (originals.length===1 && reads<8) {
        const original = originals[0].url, originalPage = await fetchPublicPage(original,original);reads++;
        result = originalPage.error ? { status:'pending',reason:originalPage.error } : evaluatePublicJob(original,originalPage.raw,originalPage.url,originalPage.status,now);
      }
    }
    if (result.status==='verified') {
      receipts.push(await saveOffer(result,now));verified++;
      rechecks.set(safePublicUrl(result.url!)!,{ url:safePublicUrl(result.url!)!,lastAttemptAt:new Date(now).toISOString(),nextCheckAt:new Date(now+18*3600000).toISOString() });
    } else if (rechecks.has(candidate.url)) {
      // A failed attempt does not update the offer's verification stamp or its original publication date.
      rechecks.set(candidate.url,{ url:candidate.url,lastAttemptAt:new Date(now).toISOString(),nextCheckAt:new Date(now+4*3600000).toISOString() });
    }
    reviewed.push({ url:candidate.url,status:result.status,reason:result.reason });
    // The immutable run receipt retains every reviewed result and source failure.
    if (priorityQueue) state.priorityCandidates.shift();
    else { state.pending.splice(selected,1);state.reviewLane=((state.reviewLane || 0)+1)%3; }
  }
  const summary = { checkedAt:new Date(now).toISOString(),sourcesRead:roots,httpReads:reads,
    noticesChecked:reviewed.length,verified,stored:receipts.length,published:0,providerCalls:0,
    pending:state.pending.length,priorityPending:state.priorityCandidates.length,
    documentsAwaitingLocalReader:state.pending.filter(item=>/\.(?:pdf|png|jpe?g|webp)(?:[?#]|$)/i.test(item.url)).length,
    reverificationBacklog:due.filter(item => !reviewed.some(result => result.url===item.url)).length,trackedOffers:rechecks.size,
    nextSource:state.position,coverageComplete:false,audits:audits.map(({ candidateEvidence,...audit })=>audit),reviewed,receipts };
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
    historicalCoverageComplete:false,pending:current?.pending.length ?? null,checkedAt:current?.checkedAt || null };
}
