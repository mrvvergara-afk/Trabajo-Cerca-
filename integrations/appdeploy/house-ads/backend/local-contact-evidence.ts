import {createHash} from 'node:crypto';
import {safePublicUrl, publicSourceAdapter, samePublicJob} from './public-source-adapters';

export type LocalContactEvidence = {
  schema:'trabajo-cerca.local-contact.v1';
  source_html:string; source_sha256:string;
  index_url:string; index_html:string; index_sha256:string;
  metadata_url:string; metadata_json:string; metadata_sha256:string;
  capture_started_at:string; capture_completed_at:string; reviewed_at:string;
  workplace_literal:string; employer_identity:'named'|'not_named_by_publisher';
};

type ContactOffer = {
  source_url:string; title:string; company:string; work_commune:string;
  source_published_at:string; valid_through:string; application:string; verified_at:string;
  local_contact_evidence?:LocalContactEvidence;
  application_details?:{method:'in_person';instructions:string};
  vacancies?:number;
};

function text(html:string) {
  return html.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ')
    .replace(/&#(x[0-9a-f]+|\d+);/gi,(_,number:string)=>{
      const code=number[0].toLowerCase()==='x' ? parseInt(number.slice(1),16) : Number(number);
      return code>0 && code<=0x10ffff ? String.fromCodePoint(code) : '';
    }).replace(/&(?:nbsp|amp|quot|apos|lt|gt);/g,entity=>({
      '&nbsp;':' ','&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>',
    }[entity] || entity)).replace(/\s+/g,' ').trim();
}
const fold=(value:string)=>text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');

export function localContactIndexStatus(raw:string, sourceUrl:string, title:string) {
  const matches=[...raw.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].filter(anchor=>{
    const href=anchor[1].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    return href && !href.startsWith('#') && samePublicJob(sourceUrl,safePublicUrl(href,sourceUrl) || '');
  });
  if (matches.length!==1) return 'unknown';
  const label=fold(matches[0][2]);
  if (!label.includes(fold(title))) return 'unknown';
  if (/postulacion cerrada|oferta cerrada|vacante cubierta/.test(label)) return 'closed';
  return /postulacion abierta/.test(label) ? 'open' : 'unknown';
}

export function localContactDescription(evidence:LocalContactEvidence) {
  return text(evidence.source_html.match(/<article\b[^>]*class=["'][^"']*\bcargo\b[^"']*["'][^>]*>([\s\S]*?)<\/article>/i)?.[1] || '');
}

export function validateLocalContactEvidence(item:ContactOffer, now=Date.now()) {
  const evidence=item.local_contact_evidence;
  const reject=()=>{throw new Error('Invalid dated in-person primary evidence');};
  if (!evidence || evidence.schema!=='trabajo-cerca.local-contact.v1' || item.valid_through ||
      item.application!==item.source_url || publicSourceAdapter(item.source_url)?.family!=='local') return reject();
  for (const [raw,digest] of [[evidence.source_html,evidence.source_sha256],
      [evidence.index_html,evidence.index_sha256],[evidence.metadata_json,evidence.metadata_sha256]]) {
    if (typeof raw!=='string' || raw.length>100000 || !/^[a-f0-9]{64}$/.test(digest) || hash(raw)!==digest) return reject();
  }
  const source=safePublicUrl(item.source_url),index=safePublicUrl(evidence.index_url),metadataUrl=safePublicUrl(evidence.metadata_url);
  if (!source || !index || !metadataUrl || new URL(source).hostname!==new URL(index).hostname ||
      new URL(source).hostname!==new URL(metadataUrl).hostname) return reject();
  const endpoint=new URL(metadataUrl).pathname.match(/^\/wp-json\/wp\/v2\/(pages|posts)\/(\d+)$/);
  let metadata:Record<string,unknown>;
  try {metadata=JSON.parse(evidence.metadata_json);} catch {return reject();}
  if (!endpoint || metadata.id!==Number(endpoint[2]) || metadata.status!=='publish' || metadata.type!==endpoint[1].replace(/s$/,'') ||
      typeof metadata.link!=='string' || !samePublicJob(source,metadata.link) || typeof metadata.date_gmt!=='string' ||
      Date.parse(metadata.date_gmt+'Z')!==Date.parse(item.source_published_at)) return reject();
  const stamps=[evidence.capture_started_at,evidence.capture_completed_at,evidence.reviewed_at,item.verified_at].map(Date.parse);
  if (!stamps.every(Number.isFinite) || stamps[0]>stamps[1] || stamps[1]>stamps[2] || stamps[2]!==stamps[3] ||
      stamps[3]>now || now-stamps[0]>86400000) return reject();
  if (localContactIndexStatus(evidence.index_html,item.source_url,item.title)!=='open') return reject();
  const articles=[...evidence.source_html.matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article>/gi)]
    .filter(article=>/\bclass\s*=\s*["'][^"']*\bcargo\b/i.test(article[1]));
  if (articles.length!==1) return reject();
  const body=fold(articles[0][2]),literal=fold(evidence.workplace_literal);
  if (!body.includes(fold(item.title)) || !body.includes(fold(item.company)) || !body.includes(literal) ||
      !body.includes(fold(item.work_commune)) || !/predio ubicado|lugar de trabajo|faena|trabajar|servicio en/.test(literal) ||
      /postulacion cerrada|postulaciones cerradas/.test(body)) return reject();
  const instructions=item.application_details?.instructions;
  const following=evidence.source_html.slice(articles[0].index!+articles[0][0].length,articles[0].index!+articles[0][0].length+2500);
  if (item.application_details?.method!=='in_person' || !instructions || !fold(following).includes(fold(instructions)) ||
      !/presentar|presentarse|dirigirse|postular/i.test(instructions) || !/oficina omil/i.test(instructions) ||
      !/calle|avenida/i.test(instructions) || !/\d{2,5}/.test(instructions)) return reject();
  if (item.vacancies!==undefined && (!Number.isInteger(item.vacancies) || item.vacancies<1 || item.vacancies>10000 ||
      !new RegExp('\\b'+item.vacancies+' (?:cupos|vacantes)\\b').test(body))) return reject();
  return true;
}

