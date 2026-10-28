import { createHash } from 'node:crypto';
import { WORK_PLACES } from '../shared/territories';
import { socialSourceDate } from './social-evidence';
import { publicSourceAdapter, safePublicUrl, samePublicJob } from './public-source-adapters';

type Data = Record<string, unknown>;
export type PublicVerification = {
  status:'verified' | 'review_ready' | 'pending' | 'rejected';
  reason:string;
  title?:string;
  company?:string;
  work_commune?:string;
  work_location_verified?:boolean;
  work_location_evidence?:{method:string;literal:string};
  url?:string;
  source?:string;
  source_published_at?:string;
  valid_through?:string;
  application?:string;
  verification_method?:string;
  validity_method?:'explicit_deadline' | 'live_application';
  validity_evidence?:{ form_url:string; form_action:string; checked_at:string; source_sha256:string };
  document_unit_key?:string;
  document_unit_verified?:boolean;
  source_date_evidence?:{ date_posted:string; valid_through:string; timezone:string };
};

const SOURCE_WORK_PLACES = [...WORK_PLACES];
const sourceFold = (value:unknown) => String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const sourceDecode = (value:string) => value.replace(/&(?:amp|quot|apos|lt|gt|nbsp);/g, entity => ({ '&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' ' }[entity] || entity));
export const publicText = (value:string) => sourceDecode(value.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
const sourceObject = (value:unknown):value is Data => Boolean(value && typeof value === 'object' && !Array.isArray(value));

// Chiletrabajos publishes civil timestamps without a zone. Only this adapter interprets them in continental Chile.
export function publicJobDate(value:unknown, source:string, endOfDay=false) {
  const explicit = socialSourceDate(value,endOfDay);
  if (explicit) return explicit;
  if (source!=='Chiletrabajos' || typeof value!=='string') return null;
  const match=value.trim().match(/^(20\d{2}-\d{2}-\d{2})[T ](\d{2}):(\d{2}):(\d{2})$/);
  if (!match || Number(match[2])>23 || Number(match[3])>59 || Number(match[4])>59) return null;
  const day=socialSourceDate(match[1]);
  if (!day) return null;
  const stamp=Date.parse(day)+(Number(match[2])*3600+Number(match[3])*60+Number(match[4]))*1000;
  const parts=new Intl.DateTimeFormat('en-CA',{ timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23' }).formatToParts(new Date(stamp));
  const field=(key:string)=>parts.find(part=>part.type===key)?.value;
  if (field('year')+'-'+field('month')+'-'+field('day')!==match[1] || field('hour')!==match[2] || field('minute')!==match[3] || field('second')!==match[4]) return null;
  return new Date(stamp).toISOString();
}

function visibleHtml(raw:string) {
  return raw.replace(/<(script|style|nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi,'');
}

function attribute(tag:string, key:string) {
  const match = tag.match(new RegExp('(?:^|\\s)'+key+'\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))','i'));
  return match ? sourceDecode(match[1] ?? match[2] ?? match[3] ?? '') : '';
}

function postings(raw:string) {
  const result:Data[] = [];
  for (const script of raw.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (attribute(script[1],'type').toLowerCase() !== 'application/ld+json') continue;
    let nodes:unknown[];
    try { nodes = [JSON.parse(script[2])]; } catch { continue; }
    let visited = 0;
    while (nodes.length && visited++<2000) {
      const node = nodes.pop();
      if (Array.isArray(node)) nodes.push(...node);
      else if (sourceObject(node)) {
        const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
        if (types.includes('JobPosting')) result.push(node);
        nodes.push(...Object.values(node).filter(value => value && typeof value === 'object'));
      }
    }
  }
  return result;
}

function bneLabelledPosting(raw:string, url:string):Data | null {
  // The official detail page has one offer heading, employer label and two calendar fields.
  const headings=[...raw.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
  if (headings.length!==1 || !/\bid=["']nombreOferta["']/i.test(headings[0][1])) return null;
  for (const tag of raw.matchAll(/<(link|meta)\b([^>]*)>/gi)) {
    const declared=tag[1].toLowerCase()==='link' && attribute(tag[2],'rel')==='canonical' ? attribute(tag[2],'href') : attribute(tag[2],'property')==='og:url' ? attribute(tag[2],'content') : '';
    if (declared && !samePublicJob(url,safePublicUrl(declared,url) || '')) return null;
  }
  const title=publicText(headings[0][1].replace(/<small\b[^>]*>[\s\S]*?<\/small>/gi,''));
  const scope=raw.slice(headings[0].index).split(/modalCvIncompleto/)[0];
  if (!/DATOS DE CONTACTO/i.test(scope) || !/Origen de la Oferta/i.test(publicText(scope))) return null;
  const employer=scope.match(/<strong\b[^>]*>\s*<span\b[^>]*>\s*Empresa:\s*<\/span>\s*<\/strong>\s*<br\s*\/?>\s*<span\b[^>]*>([\s\S]*?)<\/span>/i);
  const calendars=[...scope.matchAll(/<i\b[^>]*class=["'][^"']*\bfa-calendar\b[^"']*["'][^>]*>\s*<\/i>\s*<span\b[^>]*>\s*(\d{2}\/\d{2}\/20\d{2})\s*<\/span>/gi)];
  if (!employer || calendars.length!==2) return null;
  const beforeDates=publicText(scope.slice(0,calendars[0].index));
  const region=beforeDates.match(/(Araucan[ií]a|B[ií]o\s*B[ií]o)\s*,\s*([a-záéíóúñ ]{3,45})\s*$/i);
  const locality=region?.[2]?.trim() || '';
  const eligible=SOURCE_WORK_PLACES.filter(place=>sourceFold(locality)===sourceFold(place));
  if (eligible.length!==1 || !title || !applicationLink(scope,url)) return null;
  const isBiobio=['Nacimiento','Negrete','Mulchén','Quilaco'].includes(eligible[0]);
  if (isBiobio!==sourceFold(region![1]).replace(/\s/g,'').includes('biobio')) return null;
  return { '@type':'JobPosting',url,title,hiringOrganization:{ name:publicText(employer[1]) },
    jobLocation:{ address:{ addressCountry:'CL',addressLocality:locality } },
    datePosted:calendars[0][1],validThrough:calendars[1][1] };
}

function descriptionWorksite(value:unknown) {
  const text=typeof value==='string' ? sourceDecode(value.replace(/<br\s*\/?>|<\/p>/gi,'\n').replace(/<[^>]*>/g,' ')) : '';
  const scopes=[...text.matchAll(/(?:(?:lugar (?:real )?de trabajo|ubicaci[oó]n de (?:la )?faena)\s*:\s*|(?:para (?:un |el )?proyecto|servicio de atenci[oó]n domiciliaria|realizar (?:su |la )?pr[aá]ctica presencial|para trabajar|desempe[nñ]arse(?: de forma presencial)?)\s+en\s+)([^\n.;]{2,140})/gi)]
    .filter(match=>{
      // Functional requirements are not contradictory geographic evidence.
      // Explicit workplace labels remain authoritative, including unknown places.
      if (/^(?:lugar |ubicaci[oó]n )/i.test(match[0])) return true;
      if (/\b(?:en|ubicad[oa]s?|localidad|comuna|ciudad)\b/i.test(match[1])) return true;
      if (/^terreno\s*$/i.test(match[1])) return false;
      return !/^(?:equipo|conjunto|colaboraci[oó]n|turnos|jornadas|(?:el |un |una |las |los )?(?:[aá]rea|[aá]mbito|departamento|auditor[ií]as?|relator[ií]as?|capacitaciones?|procesos|gesti[oó]n|control de calidad))\b/i.test(match[1]);
    });
  if (!scopes.length) return {observed:false,commune:null,literal:''};
  const places=new Set<string>();
  for (const match of scopes) {
    const scope=sourceFold(match[1]);
    const found=SOURCE_WORK_PLACES.filter(place=>new RegExp('\\b'+sourceFold(place)+'\\b').test(scope));
    if (!found.length) return {observed:true,commune:null,literal:match[0]};
    if (found.length===2 && found.includes('Mininco') && found.includes('Collipulli')) found.splice(found.indexOf('Collipulli'),1);
    for (const place of found) places.add(place);
  }
  return {observed:true,commune:places.size===1 ? [...places][0] : null,literal:scopes.map(match=>match[0]).join(' | ')};
}

function worksite(job:Data) {
  const locations = Array.isArray(job.jobLocation) ? job.jobLocation : [job.jobLocation];
  const found = new Set<string>();
  if (!locations.length) return null;
  for (const location of locations) {
    if (!sourceObject(location) || !sourceObject(location.address)) return null;
    const address = location.address;
    const country = sourceObject(address.addressCountry) ? address.addressCountry.name || address.addressCountry.identifier : address.addressCountry;
    if (!country || !['cl','chile'].includes(sourceFold(country).trim())) return null;
  }
  // A portal city is not necessarily the worksite. Only an explicit workplace
  // statement in this matching job's own description can replace that city.
  const explicit=descriptionWorksite(job.description);
  if (locations.length===1 && explicit.observed) return explicit.commune;
  for (const location of locations) {
    const address=(location as Data).address as Data;
    const text = sourceFold(address.addressLocality);
    const places = SOURCE_WORK_PLACES.filter(place => new RegExp('\\b'+sourceFold(place)+'\\b').test(text));
    if (places.length===2 && places.includes('Mininco') && places.includes('Collipulli')) places.splice(places.indexOf('Collipulli'),1);
    if (!places.length) return null;
    for (const place of places) found.add(place);
  }
  return found.size===1 ? [...found][0] : null;
}

function applicationLink(raw:string, url:string) {
  // Laborum's main job owns this named form; recommendation cards also carry
  // Postular labels and must never become this job's application destination.
  if (new URL(url).hostname.replace(/^www\./,'')==='laborum.cl') {
    const forms=[...raw.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)]
      .filter(form=>attribute(form[1],'id')==='form-salario-pretendido');
    if (forms.length===1 && !/\bhidden\b|aria-hidden\s*=\s*["']true["']/i.test(forms[0][1])) {
      const buttons=[...forms[0][2].matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)];
      if (buttons.some(button=>attribute(button[1],'type')==='submit' &&
          !/\bdisabled\b|aria-disabled\s*=\s*["']true["']/i.test(button[1]) &&
          /^(?:postularme|postulaci[oó]n r[aá]pida)$/i.test(publicText(button[2]).trim()))) return url;
    }
  }
  for (const anchor of raw.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    if (!/postul|aplicar|apply|envi.{0,20}(?:cv|curr[ií]culum)/i.test(publicText(anchor[2]))) continue;
    if (/\bdisabled\b|aria-disabled\s*=\s*["']true["']/i.test(anchor[1])) continue;
    const href = attribute(anchor[1],'href');
    if (/^mailto:[^@\s?]+@[^@\s?]+\.[^@\s?]+(?:\?.*)?$/i.test(href)) return href;
    const target = safePublicUrl(href,url);
    if (target && publicSourceAdapter(target) && !samePublicJob(url,target)) continue;
    if (target?.startsWith('https:')) return target;
  }
  return null;
}

function liveApplicationForm(raw:string, url:string) {
  for (const form of raw.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    if (/\bhidden\b|display\s*:\s*none|visibility\s*:\s*hidden/i.test(form[1])) continue;
    if (attribute(form[1],'method').toLowerCase() !== 'post' || /<fieldset\b[^>]*\bdisabled\b/i.test(form[2])) continue;
    const controls = [
      ...[...form[2].matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)].map(match => ({ kind:'button',attrs:match[1],label:match[2] })),
      ...[...form[2].matchAll(/<input\b([^>]*)>/gi)].map(match => ({ kind:'input',attrs:match[1],label:attribute(match[1],'value') })),
    ];
    const submit = controls.some(control => !/\bdisabled\b|\bhidden\b|display\s*:\s*none|visibility\s*:\s*hidden|aria-disabled\s*=\s*["']true["']/i.test(control.attrs) &&
      (attribute(control.attrs,'type') || (control.kind==='button'?'submit':'')).toLowerCase()==='submit' &&
      /postul|aplicar|apply|enviar.{0,15}(?:cv|curr[ií]culum)/i.test(publicText(control.label)));
    if (!submit) continue;
    const action = safePublicUrl(attribute(form[1],'action') || url,url);
    if (!action?.startsWith('https:') || new URL(action).hostname.replace(/^www\./,'') !== new URL(url).hostname.replace(/^www\./,'')) continue;
    if (/\/(?:login|signin|registro|subscribe|newsletter)(?:\/|$)/i.test(new URL(action).pathname)) continue;
    return action;
  }
  return null;
}

export function evaluatePublicJob(url:string, raw:string, finalUrl=url, status=200, now=Date.now()):PublicVerification {
  if ([404,410].includes(status)) return { status:'rejected',reason:'source_removed' };
  if (status!==200) return { status:'pending',reason:'HTTP '+status };
  const adapter = publicSourceAdapter(url);
  if (!adapter || !samePublicJob(url,finalUrl)) return { status:'pending',reason:'individual_source_identity_unconfirmed' };
  if (adapter.family==='aggregator') return { status:'pending',reason:'aggregator_requires_original_source' };
  if (Buffer.byteLength(raw,'utf8')>600000) return { status:'pending',reason:'source_byte_budget_exceeded' };
  const visible = visibleHtml(raw), body = publicText(visible);
  if (/verify you are human|access denied|unusual traffic|log in to view|iniciar sesi[oó]n para ver/i.test(body)) return { status:'pending',reason:'public_access_challenge' };
  if (/oferta (?:expirada|finalizada|cerrada)|postulaci[oó]n(?:es)? (?:cerradas?|finalizadas?)|esta oferta ya no|job (?:expired|closed)|no longer accepting applications/i.test(body)) return { status:'rejected',reason:'closed_notice' };
  const all = postings(raw);
  if (!all.length && adapter.name==='Bolsa Nacional de Empleo') {
    const labelled=bneLabelledPosting(visible,finalUrl);
    if (labelled) all.push(labelled);
  }
  const matched = all.filter(job => {
    const entity = job.mainEntityOfPage;
    return [job.url,sourceObject(entity)?entity['@id']:entity].some(value => typeof value==='string' && samePublicJob(finalUrl,safePublicUrl(value,finalUrl) || ''));
  });
  const pageTitle = publicText(raw.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
  const job = matched.length===1 ? matched[0] : !matched.length && all.length===1 &&
    !all[0].url && !all[0].mainEntityOfPage && typeof all[0].title==='string' &&
    sourceFold(pageTitle).includes(sourceFold(all[0].title)) ? all[0] : null;
  if (!job) return { status:'pending',reason:all.length?'ambiguous_jobposting':'structured_jobposting_missing' };
  const title = typeof job.title==='string' ? job.title.trim() : '';
  const employer = sourceObject(job.hiringOrganization) && typeof job.hiringOrganization.name==='string' ? job.hiringOrganization.name.trim() : '';
  const place = worksite(job);
  if (!title || title.length>300) return { status:'pending',reason:'job_title_missing' };
  if (!place) return { status:'pending',reason:'worksite_missing_or_multiple' };
  const explicitPlace=descriptionWorksite(job.description);
  const base = { title,company:employer,work_commune:place,work_location_verified:true,url:finalUrl,source:adapter.name,
    ...(explicitPlace.observed ? {work_location_evidence:{method:'explicit_worksite_in_own_job_description',literal:explicitPlace.literal}} : {}) };
  const titlePlaces=SOURCE_WORK_PLACES.filter(t=>new RegExp('\\b'+sourceFold(t)+'\\b').test(sourceFold(title)));
  if (titlePlaces.length===1 && titlePlaces[0]!==place) return {...base,
    status:'review_ready',reason:'title_worksite_conflict',work_location_verified:false};
  const published = publicJobDate(job.datePosted,adapter.name);
  const deadline = job.validThrough ? publicJobDate(job.validThrough,adapter.name,true) : null;
  if (deadline && Date.parse(deadline)<=now) return { ...base,status:'rejected',reason:'expired_deadline' };
  if (!published || Date.parse(published)>now) return { ...base,status:'pending',reason:'source_date_missing_or_future' };
  const dated = { ...base,source_published_at:published };
  if (!deadline && now-Date.parse(published)>45*86400000) return { ...dated,status:'pending',reason:'source_older_than_45_days' };
  if (!/oferta laboral|postul|requisitos|descripci[oó]n del (?:empleo|trabajo)|jornada|vacante|empleo|job|apply/i.test(body)) return { ...dated,status:'pending',reason:'hiring_text_missing' };
  if (job.validThrough && !deadline) return { ...dated,status:'review_ready',reason:'invalid_source_deadline' };
  const form = liveApplicationForm(visible,finalUrl), link = applicationLink(visible,finalUrl);
  // An accessible original job page remains a useful application destination even when
  // the application button is loaded dynamically by the portal.
  const application = form || link || (adapter.family==='portal' ? finalUrl : '');
  if (!employer || !application) return { ...dated,status:'review_ready',reason:'application_or_employer_requires_review' };
  // A dated offer with a usable application link does not need an explicit closing date.
  const result:PublicVerification = { ...dated,status:'verified',reason:deadline?'live_jobposting_with_deadline_and_application':'live_jobposting_with_enabled_application_form',
    application,valid_through:deadline || '',verification_method:adapter.verificationMethod,
    validity_method:deadline?'explicit_deadline':'live_application' };
  if (adapter.name==='Chiletrabajos' && (!socialSourceDate(job.datePosted) || job.validThrough && !socialSourceDate(job.validThrough,true))) {
    result.source_date_evidence={ date_posted:String(job.datePosted),valid_through:String(job.validThrough || ''),timezone:'America/Santiago' };
  }
  if (!deadline && form) result.validity_evidence = { form_url:finalUrl,form_action:form,checked_at:new Date(now).toISOString(),source_sha256:createHash('sha256').update(raw).digest('hex') };
  return result;
}
