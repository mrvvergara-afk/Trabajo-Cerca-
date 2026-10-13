import { createHash } from 'node:crypto';
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
  url?:string;
  source?:string;
  source_published_at?:string;
  valid_through?:string;
  application?:string;
  verification_method?:string;
  validity_method?:'explicit_deadline' | 'live_application';
  validity_evidence?:{ form_url:string; form_action:string; checked_at:string; source_sha256:string };
};

const SOURCE_WORK_PLACES = ['Angol','Collipulli','Ercilla','Renaico','Mininco','Los Sauces','Purén','Traiguén','Lumaco','Nacimiento','Negrete','Mulchén','Victoria'];
const sourceFold = (value:unknown) => String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const sourceDecode = (value:string) => value.replace(/&(?:amp|quot|apos|lt|gt|nbsp);/g, entity => ({ '&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' ' }[entity] || entity));
export const publicText = (value:string) => sourceDecode(value.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
const sourceObject = (value:unknown):value is Data => Boolean(value && typeof value === 'object' && !Array.isArray(value));

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

function worksite(job:Data) {
  const locations = Array.isArray(job.jobLocation) ? job.jobLocation : [job.jobLocation];
  const found = new Set<string>();
  if (!locations.length) return null;
  for (const location of locations) {
    if (!sourceObject(location) || !sourceObject(location.address)) return null;
    const address = location.address;
    const country = sourceObject(address.addressCountry) ? address.addressCountry.name || address.addressCountry.identifier : address.addressCountry;
    if (!country || !['cl','chile'].includes(sourceFold(country).trim())) return null;
    const text = sourceFold(address.addressLocality);
    const places = SOURCE_WORK_PLACES.filter(place => new RegExp('\\b'+sourceFold(place)+'\\b').test(text));
    if (places.length===2 && places.includes('Mininco') && places.includes('Collipulli')) places.splice(places.indexOf('Collipulli'),1);
    if (!places.length) return null;
    for (const place of places) found.add(place);
  }
  return found.size===1 ? [...found][0] : null;
}

function applicationLink(raw:string, url:string) {
  for (const anchor of raw.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    if (!/postul|aplicar|apply|envi.{0,20}(?:cv|curr[ií]culum)/i.test(publicText(anchor[2]))) continue;
    if (/\bdisabled\b|aria-disabled\s*=\s*["']true["']/i.test(anchor[1])) continue;
    const href = attribute(anchor[1],'href');
    if (/^mailto:[^@\s?]+@[^@\s?]+\.[^@\s?]+(?:\?.*)?$/i.test(href)) return href;
    const target = safePublicUrl(href,url);
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
  const base = { title,company:employer,work_commune:place,work_location_verified:true,url:finalUrl,source:adapter.name };
  const published = socialSourceDate(job.datePosted);
  const deadline = job.validThrough ? socialSourceDate(job.validThrough,true) : null;
  if (deadline && Date.parse(deadline)<=now) return { ...base,status:'rejected',reason:'expired_deadline' };
  if (!published || Date.parse(published)>now) return { ...base,status:'pending',reason:'source_date_missing_or_future' };
  const dated = { ...base,source_published_at:published };
  if (now-Date.parse(published)>45*86400000) return { ...dated,status:'pending',reason:'source_older_than_45_days' };
  if (!/oferta laboral|postul|requisitos|descripci[oó]n del (?:empleo|trabajo)|jornada|vacante|empleo|job|apply/i.test(body)) return { ...dated,status:'pending',reason:'hiring_text_missing' };
  if (job.validThrough && !deadline) return { ...dated,status:'review_ready',reason:'invalid_source_deadline' };
  const form = liveApplicationForm(visible,finalUrl), link = applicationLink(visible,finalUrl);
  const application = form || link;
  if (!employer || !application) return { ...dated,status:'review_ready',reason:'application_or_employer_requires_review' };
  if (!deadline && !form) return { ...dated,status:'review_ready',reason:'live_application_form_or_deadline_missing' };
  const result:PublicVerification = { ...dated,status:'verified',reason:deadline?'live_jobposting_with_deadline_and_application':'live_jobposting_with_enabled_application_form',
    application,valid_through:deadline || '',verification_method:adapter.verificationMethod,
    validity_method:deadline?'explicit_deadline':'live_application' };
  if (!deadline && form) result.validity_evidence = { form_url:finalUrl,form_action:form,checked_at:new Date(now).toISOString(),source_sha256:createHash('sha256').update(raw).digest('hex') };
  return result;
}
