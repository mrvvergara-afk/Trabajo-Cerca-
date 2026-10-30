import { createHash } from 'node:crypto';
import { publicSourceAdapter, safePublicUrl, samePublicJob } from './public-source-adapters';
import { localContactIndexStatus } from './local-contact-evidence';
import { socialSourceDate } from './social-evidence';
import type { PublicVerification } from './public-source-verifier';

export type OfficialOpenEvidence = {
  schema:'trabajo-cerca.official-open.v1'; status:'open'; checkedAt:string;
  sourceUrl:string; indexUrl:string; metadataUrl:string;
  sourceSha256:string; indexSha256:string; metadataSha256:string;
  originalPublishedAt:string; metadataId:number;
  workplaceLiteral:string; applicationInstructions:string;
  employerIdentity:'not_named_by_publisher';
};
export type OfficialPage = {url:string;status:number;raw:string;error?:string};
export type MunicipalContext = {index:OfficialPage;metadata:OfficialPage;checkedAt:string};
const text=(raw:string)=>raw.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi,' ')
  .replace(/<[^>]+>/g,' ').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n:string)=>(()=>{const code=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return code>0&&code<=0x10ffff?String.fromCodePoint(code):'';})())
  .replace(/&(?:nbsp|amp|quot|apos|lt|gt);/g,e=>({'&nbsp;':' ','&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'}[e]||e))
  .replace(/\s+/g,' ').trim();
const fold=(value:string)=>text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
function attr(tag:string,name:string){return tag.match(new RegExp('\\b'+name+'\\s*=\\s*["\']([^"\']+)["\']','i'))?.[1]||'';}

/** Only a reviewed official template is enabled, never arbitrary HTML supplied by a client. */
export function municipalEvidenceRequests(url:string,raw:string){
  const clean=safePublicUrl(url);
  if(!clean)return null;
  const u=new URL(clean);
  if(u.protocol!=='https:'||u.hostname.replace(/^www\./,'')!=='munimulchen.cl'||!/^\/oferta-laboral-[a-z0-9-]+\/?$/.test(u.pathname))return null;
  const articles=[...raw.matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article>/gi)].filter(m=>/\bcargo\b/.test(attr(m[1],'class')));
  if(articles.length!==1)return null;
  const canonical=[...raw.matchAll(/<link\b([^>]*)>/gi)].filter(m=>attr(m[1],'rel')==='canonical');
  if(canonical.length!==1||!samePublicJob(clean,safePublicUrl(attr(canonical[0][1],'href'),clean)||''))return null;
  const short=[...raw.matchAll(/<link\b([^>]*)>/gi)].find(m=>attr(m[1],'rel')==='shortlink');
  const shortUrl=short?safePublicUrl(attr(short[1],'href'),clean):null;
  const shortParsed=shortUrl?new URL(shortUrl):null;
  const id=shortParsed?.origin===u.origin&&shortParsed.pathname==='/' ? shortParsed.searchParams.get('p') : null;
  return {sourceUrl:clean,indexUrl:u.origin+'/pagina-central-ofertas-laborales/',
    metadataUrl:id&&/^\d+$/.test(id)?u.origin+'/wp-json/wp/v2/pages/'+id:null,
    id:id?Number(id):null,article:articles[0],title:text(articles[0][2].match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i)?.[1]||'')};
}

export function evaluateMunicipalOffer(url:string,raw:string,context:MunicipalContext,now=Date.now()):PublicVerification|null{
  const request=municipalEvidenceRequests(url,raw);
  if(!request)return null;
  const {title,article}=request;
  const base={title,url:request.sourceUrl,source:publicSourceAdapter(url)?.name};
  const pending=(reason:string,extra:Partial<PublicVerification>={}):PublicVerification=>({...base,status:'pending',reason,...extra});
  if(!title||title.length>180)return pending('official_job_title_missing');
  const checked=Date.parse(context.checkedAt);
  if(!Number.isFinite(checked)||checked>now+1000||now-checked>86400000)return pending('official_evidence_stale');
  if(context.index.error||context.index.status!==200||safePublicUrl(context.index.url)!==request.indexUrl)return pending('official_index_unavailable');
  const state=localContactIndexStatus(context.index.raw,request.sourceUrl,title);
  if(state==='closed')return {...base,status:'rejected',reason:'official_application_closed'};
  if(state!=='open')return pending('official_application_status_unconfirmed');
  const body=text(article[2]);
  if(/postulaci[oó]n(?:es)? cerrad[ao]s?|vacante cubierta|proceso finalizado/i.test(body))return {...base,status:'rejected',reason:'official_application_closed'};
  if(!request.metadataUrl||!request.id)return pending('official_original_date_endpoint_missing');
  if(context.metadata.error||context.metadata.status!==200||safePublicUrl(context.metadata.url)!==request.metadataUrl)return pending('official_original_date_unavailable');
  let metadata:Record<string,unknown>;
  try{metadata=JSON.parse(context.metadata.raw);}catch{return pending('official_original_date_invalid');}
  if(metadata.id!==request.id||metadata.type!=='page'||metadata.status!=='publish'||typeof metadata.link!=='string'||!samePublicJob(request.sourceUrl,metadata.link))return pending('official_metadata_identity_mismatch');
  // date_gmt is the original publication field. Never substitute modified_gmt, the crawl date or an image path.
  const date=typeof metadata.date_gmt==='string'&&/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(metadata.date_gmt)?metadata.date_gmt+'Z':'';
  const stamp=Date.parse(date);
  if(!Number.isFinite(stamp)||new Date(stamp).toISOString().slice(0,19)!==metadata.date_gmt||stamp>now)return pending('official_original_date_missing_or_future');
  const original=new Date(stamp).toISOString();
  const dated={source_published_at:original,application_state:'open' as const};
  const intro=text(article[2].match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1]||'');
  const workplace=intro.match(/(?:un )?predio ubicado en (?:el )?sector [^.;]+/i)?.[0];
  if(!/empresa del rubro agr[ií]cola de la comuna de Mulch[eé]n/i.test(intro)||!workplace||/Santa B[aá]rbara|Los [ÁA]ngeles|Negrete|Nacimiento/i.test(intro))return pending('official_workplace_requires_review',dated);
  const following=raw.slice(article.index!+article[0].length,article.index!+article[0].length+2500);
  const instructions=text(following.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1]||'');
  if(!/interesados deben presentar|para postular.*presentar/i.test(instructions)||!/oficina omil/i.test(instructions)||!/\bcalle\b.*\d{2,5}/i.test(instructions))return pending('official_application_instructions_missing',dated);
  const vacancies=Number(body.match(/\b(\d{1,5})\s+(?:cupos|vacantes)\b/i)?.[1]);
  if(!Number.isInteger(vacancies)||vacancies<1||vacancies>10000)return pending('official_vacancies_requires_review',dated);
  const deadlineLiteral=body.match(/(?:fecha de cierre|postulaciones hasta|plazo de postulaci[oó]n)\s*:?\s*([^.;]{8,90})/i)?.[1];
  const deadline=deadlineLiteral?socialSourceDate(deadlineLiteral,true):null;
  if(deadlineLiteral&&!deadline)return pending('invalid_source_deadline',dated);
  if(deadline&&Date.parse(deadline)<=now)return {...base,...dated,status:'rejected',reason:'expired_deadline'};
  const proof:OfficialOpenEvidence={schema:'trabajo-cerca.official-open.v1',status:'open',checkedAt:context.checkedAt,
    sourceUrl:request.sourceUrl,indexUrl:request.indexUrl,metadataUrl:request.metadataUrl,
    sourceSha256:sha(raw),indexSha256:sha(context.index.raw),metadataSha256:sha(context.metadata.raw),
    originalPublishedAt:original,metadataId:request.id,workplaceLiteral:workplace,
    applicationInstructions:instructions,employerIdentity:'not_named_by_publisher'};
  return {...base,...dated,status:'verified',reason:'official_open_with_original_date_and_in_person_application',
    company:'Empresa del rubro agrícola',work_commune:'Mulchén',work_location_verified:true,
    work_location_evidence:{method:'official_individual_notice_workplace',literal:intro},
    application:request.sourceUrl,valid_through:deadline||'',verification_method:'Municipalidad de Mulchén · índice y aviso individual con fecha oficial',
    validity_method:deadline?'explicit_deadline':'official_open_status',official_evidence:proof,vacancies};
}
