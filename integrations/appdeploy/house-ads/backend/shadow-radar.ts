import {db} from '@appdeploy/sdk';
import {createHash} from 'node:crypto';
import {publicText, type PublicVerification} from './public-source-verifier';
import {publicSourceAdapter} from './public-source-adapters';

// Shadow evaluator: never writes to the public feed, never fabricates dates or employer.
const locales=['Angol','Collipulli','Ercilla','Renaico','Mininco','Nacimiento','Negrete','Mulchén','Los Sauces','Purén','Traiguén','Lumaco','Victoria'];
const fold=(v:string)=>v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
export async function shadowEvaluate(input:{url:string;source:string;publisherPage?:string;raw:string;http:number;baseline:PublicVerification;at:number}) {
  const {url,source,publisherPage,raw,http,baseline,at}=input;
  const adapter=publicSourceAdapter(url);
  const body=publicText(raw.replace(/<(?:script|style|nav|header|footer)\b[^>]*>[\s\S]*?<\/\w+>/gi,'')).slice(0,6500);
  const pageTitle=publicText(raw.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'').slice(0,180);
  const heading=publicText(raw.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||'').slice(0,180);
  const title=heading && !/^(noticias|inicio|concursos p[uú]blicos|trabaja con nosotros|ofertas? laborales?)$/i.test(heading) ? heading : pageTitle;
  const dateEvidence=(raw.match(/<meta\b[^>]*(?:property|name)=["'](?:article:published_time|datePublished|date)["'][^>]*content=["'](20\d{2}-\d{2}-\d{2}[^"']*)/i)?.[1]||raw.match(/<time\b[^>]*datetime=["'](20\d{2}-\d{2}-\d{2}[^"']*)/i)?.[1]||'');
  const parsedDate=Date.parse(dateEvidence);
  const recentDate=Number.isFinite(parsedDate)&&parsedDate<=at&&at-parsedDate<=45*86400000;
  const applicationUrl=raw.match(/<a\b[^>]*href=["'](https:\/\/[^"']+)["'][^>]*>\s*(?:<[^>]+>\s*)*(?:postular|postula aqu[ií]|aplicar|enviar curr[ií]culum|apply now)/i)?.[1]||null;
  const matched=locales.filter(place=>fold(body.slice(0,3500)+' '+title).includes(fold(place)));
  const titlePlaces=locales.filter(place=>fold(title).includes(fold(place)));
  const locationConflict=Boolean(baseline.work_commune && titlePlaces.length===1 && fold(baseline.work_commune)!==fold(titlePlaces[0]));
  const closed=/oferta (?:expirada|finalizada|cerrada)|postulaci[oó]n(?:es)? (?:cerradas?|finalizadas?)|no longer accepting applications/i.test(body);
  const actionable=/postul|env[ií]a.{0,24}(?:cv|curr[ií]culum)|se (?:busca|necesita|requiere)|vacante|oferta laboral|job opening|apply/i.test(body);
  const reachable=http===200 && raw.length>120 && !/verify you are human|access denied|unusual traffic|log in to view/i.test(body);
  let stage:'publishable'|'recoverable'|'blocked'|'closed'='recoverable';
  if(baseline.status==='verified' && !locationConflict)stage='publishable';
  else if(locationConflict)stage='recoverable';
  else if(closed || baseline.reason==='expired_deadline' || baseline.reason==='source_removed')stage='closed';
  else if(!reachable)stage='blocked';
  else if((baseline.status==='review_ready' && !!baseline.title && !!baseline.work_commune && !!baseline.application) || 
    (!!adapter && actionable && matched.length===1 && title.length>9 && !/inicio|home|municipalidad|noticias?$/i.test(title)))
    stage='recoverable'; 
  const identity=createHash('sha256').update(url).digest('hex').slice(0,42);
  const id='b-'+identity;
  const value={id,url,source,publisherPage:publisherPage||null,title:baseline.title||title||null,
    place:baseline.work_commune||matched[0]||null,employer:baseline.company||null,
    publishedAt:baseline.source_published_at||(recentDate?new Date(parsedDate).toISOString():null),validThrough:baseline.valid_through||null,
    application:baseline.application||applicationUrl||url,stage,actionable,reachable,baselineStatus:baseline.status,
    extractionMethod:baseline.title?'structured_baseline':heading?'html_heading':'page_title',
    dateEvidence:recentDate?dateEvidence:null,applicationEvidence:applicationUrl||baseline.application||null,
    needsEmployer:!baseline.company,needsOriginalDate:!baseline.source_published_at&&!recentDate,
    locationConflict,titlePlace: titlePlaces.length===1?titlePlaces[0]:null,
    baselineReason:baseline.reason,observedAt:new Date(at).toISOString(),shadow:true,
    // Only offers with complete original evidence may be considered publishable.
    eligibleForPublicFeed:stage==='publishable' };
  const [prev]=await db.get<Record<string,unknown>>('radar_shadow_b',[id],{consistent:true});
  const record={...value,...(prev?.sourceId&&baseline.status==='verified'?{stage:'stored'}:{})};
  const [saved]=prev?await db.tx.update('radar_shadow_b',[{id,record}],{patch:true}):await db.tx.add('radar_shadow_b',[record]);
  if(!saved)throw Error('Shadow B evidence not saved');
  return {url,stage,title:value.title,place:value.place,dateEvidence:value.dateEvidence,applicationEvidence:value.applicationEvidence,baselineStatus:baseline.status,reason:baseline.reason};
}
