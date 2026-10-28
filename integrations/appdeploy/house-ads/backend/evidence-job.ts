import { createHash } from 'node:crypto';
import { publicSourceAdapter, safePublicUrl } from './public-source-adapters';
import { evaluatePublicJob, publicJobDate, publicText, type PublicVerification } from './public-source-verifier';
import { PRIMARY_PLACES } from '../shared/territories';

const fold=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function attributes(tag:string) {
  const result:Record<string,string>={};
  for (const m of tag.matchAll(/([:\w-]+)\s*=\s*["']([^"']*)["']/g)) result[m[1].toLowerCase()]=m[2];
  return result;
}
export function evaluateEvidenceHtml(url:string, raw:string, now=Date.now()):PublicVerification {
  const pending=(reason:string):PublicVerification=>({status:'pending',reason,url});
  const adapter=publicSourceAdapter(url);
  if (!adapter || adapter.family==='aggregator') return pending('original_employer_source_required');
  const visible=raw.replace(/<(script|style|nav|footer|header)\b[^>]*>[\s\S]*?<\/\1>/gi,'');
  const lines=visible.replace(/<\/(?:p|div|li|tr|h[1-6])>|<br\s*\/?>/gi,'\n').split('\n').map(publicText).filter(Boolean);
  const body=lines.join('\n');
  if (/verify you are human|access denied|log in to view|iniciar sesi[oó]n para ver/i.test(body)) return pending('public_access_challenge');
  if (/postulaciones cerradas|concurso finalizado|oferta (?:cerrada|vencida|expirada)/i.test(body)) return {status:'rejected',reason:'closed_notice',url};
  const headings=[...visible.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(x=>publicText(x[1]));
  if (headings.length!==1 || headings[0].length<8 || /^(inicio|noticias|trabaja con nosotros|concursos p[uú]blicos|ofertas laborales)$/i.test(headings[0])) return pending('individual_job_heading_required');
  if (!/oferta laboral|se (?:requiere|necesita|busca)|vacante|convocatoria laboral|llamado a concurso/i.test(body)) return pending('hiring_text_missing');
  // The publisher's city and an OMIL's contact address do not prove the worksite.
  const workLines=lines.filter(x=>/^(?:lugar de trabajo|comuna (?:de trabajo|del cargo)|ubicaci[oó]n del (?:cargo|empleo)|el (?:cargo|trabajo) se (?:desempeña|realiza) en)\s*[:\-]/i.test(x));
  const places=PRIMARY_PLACES.filter(t=>workLines.some(x=>new RegExp('(?:^|[^a-z])'+fold(t)+'(?:$|[^a-z])').test(fold(x))));
  if (places.length!==1) return pending('explicit_unique_worksite_required');
  const companyLine=lines.find(x=>/^(?:empleador|empresa contratante|instituci[oó]n empleadora|empresa)\s*:/i.test(x));
  const company=companyLine?.replace(/^[^:]+:\s*/,'').trim() || '';
  if (company.length<3 || company.length>120) return {status:'review_ready',reason:'explicit_employer_required',url,title:headings[0],work_commune:places[0]};
  const dates=[...raw.matchAll(/<meta\b[^>]*>|<time\b[^>]*>/gi)].flatMap(m=>{
    const a=attributes(m[0]);
    return /^(article:published_time|datePublished)$/i.test(a.property||a.name||'')?[a.content]:a.datetime?[a.datetime]:[];
  });
  const labelled=lines.find(x=>/^fecha de publicaci[oó]n\s*:/i.test(x))?.replace(/^[^:]+:\s*/,'');
  if (labelled) dates.push(labelled);
  const parsed=[...new Set(dates.filter(Boolean).map(x=>publicJobDate(x,adapter.name)).filter((x):x is string=>Boolean(x)))];
  if (parsed.length!==1 || Date.parse(parsed[0])>now) return pending('source_date_missing_ambiguous_or_future');
  const closeLine=lines.find(x=>/^(?:fecha (?:de cierre|l[ií]mite)|cierre de postulaciones|postular hasta)\s*:/i.test(x));
  const deadline=closeLine?publicJobDate(closeLine.replace(/^[^:]+:\s*/,''),adapter.name,true):null;
  if (closeLine&&!deadline) return {status:'review_ready',reason:'invalid_source_deadline',url};
  if (deadline&&Date.parse(deadline)<=now) return {status:'rejected',reason:'expired_deadline',url};
  if (!deadline&&now-Date.parse(parsed[0])>45*86400000) return pending('source_older_than_45_days');
  const links=[...visible.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].filter(m=>/^(?:postular|postula aqu[ií]|enviar cv|enviar curr[ií]culum|apply now)$/i.test(publicText(m[2]))&&!/\bdisabled\b|aria-disabled=["']true|display\s*:\s*none/i.test(m[1]));
  const destinations=links.map(m=>attributes(m[1]).href||'').filter(Boolean).map(href=>{
    if (/^mailto:[^\s?@]+@[^\s?@]+\.[^\s?@]+(?:\?[^<>"']*)?$/i.test(href)) return href;
    return safePublicUrl(href,url);
  }).filter((x):x is string=>Boolean(x&&/^(https:|mailto:)/.test(x)));
  if (new Set(destinations).size!==1) return {status:'review_ready',reason:'usable_application_required',url,title:headings[0],company,work_commune:places[0],source_published_at:parsed[0]};
  return {status:'verified',reason:'visible_original_evidence_verified',url,source:adapter.name,
    title:headings[0],company,work_commune:places[0],work_location_verified:true,
    work_location_evidence:{method:'explicit_worksite_in_visible_document',literal:workLines.join(' ').slice(0,500)},
    source_published_at:parsed[0],valid_through:deadline||'',application:destinations[0],
    verification_method:'motor_b_html_original_source',validity_method:deadline?'explicit_deadline':'live_application',
    validity_evidence:{form_url:url,form_action:destinations[0],checked_at:new Date(now).toISOString(),source_sha256:createHash('sha256').update(raw).digest('hex')}};
}
export function evaluateWithEvidence(url:string,raw:string,finalUrl=url,status=200,now=Date.now()) {
  const baseline=evaluatePublicJob(url,raw,finalUrl,status,now);
  // Explicit rejection and conflicting structured evidence remain authoritative.
  return status===200 && baseline.reason==='structured_jobposting_missing'
    ? evaluateEvidenceHtml(finalUrl,raw,now) : baseline;
}
