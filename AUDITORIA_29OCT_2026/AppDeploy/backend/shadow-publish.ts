import {db} from '@appdeploy/sdk';
import {publicSourceAdapter,safePublicUrl} from './public-source-adapters';
import {fetchPublicPage} from './public-source-http';
import {evaluatePublicJob,type PublicVerification} from './public-source-verifier';
import {saveVerifiedPublicOffer} from './free-public-sources';

type Row=Record<string,unknown>;
const towns=['Angol','Collipulli','Ercilla','Renaico','Mininco','Nacimiento','Negrete','Mulchén','Los Sauces','Purén','Traiguén','Lumaco','Victoria'];
const fold=(s:string)=>s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const text=(s:string)=>s.replace(/<[^>]+>/g,' ').replace(/&(?:nbsp|amp|quot);/g,' ').replace(/\s+/g,' ').trim();
function alternate(url:string,raw:string,now:number):PublicVerification|null {
 const adapter=publicSourceAdapter(url);if(!adapter||adapter.family==='aggregator'||raw.length<180)return null;
 const title=text(raw.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||'').slice(0,170);
 const plain=text(raw.replace(/<(?:script|style|nav|footer|header)\b[^>]*>[\s\S]*?<\/\w+>/gi,'')).slice(0,8000);
 if(title.length<12||/^(inicio|noticias|trabaja con nosotros|concursos p[uú]blicos|municipalidad)$/i.test(title))return null;
 if(!/oferta laboral|se requiere|se necesita|se busca|postular|vacante|convocatoria laboral/i.test(plain.slice(0,3500)))return null;
 if(/oferta (?:cerrada|vencida|finalizada)|postulaciones cerradas|concurso finalizado/i.test(plain))return null;
 // A municipality landing page mentioning several communes is not a single job.
 const titlePlaces=towns.filter(t=>fold(title).includes(fold(t)));
 const bodyPlaces=towns.filter(t=>fold(plain.slice(0,1700)).includes(fold(t)));
 const place=titlePlaces.length===1?titlePlaces[0]:bodyPlaces.length===1?bodyPlaces[0]:null;
 if(!place)return null;
 const company=text(raw.match(/<(?:meta|span)\b[^>]*(?:name|property)=["'](?:hiringOrganization|employer)["'][^>]*content=["']([^"']+)/i)?.[1]||plain.match(/(?:empleador|empresa contratante|instituci[oó]n empleadora)\s*:\s*([^.;]{5,75})/i)?.[1]||'').slice(0,80);
 if(company.length<4)return null;
 const date=raw.match(/<meta\b[^>]*(?:property|name)=["'](?:article:published_time|datePublished)["'][^>]*content=["'](20\d{2}-\d{2}-\d{2}(?:T[^"']*)?)/i)?.[1]||raw.match(/<time\b[^>]*datetime=["'](20\d{2}-\d{2}-\d{2}(?:T[^"']*)?)/i)?.[1]||'';
 const stamp=Date.parse(date);
 if(!Number.isFinite(stamp)||stamp>now||now-stamp>45*86400000)return null;
 const anchor=[...raw.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].find(m=>/^(?:postular|postula aqu[ií]|enviar cv|enviar curr[ií]culum|apply now)$/i.test(text(m[2])));
 const href=anchor?.[1].match(/href=["']([^"']+)["']/i)?.[1]||'';
 const apply=href.startsWith('mailto:')&&/^[^\s]+@[^\s]+\.[^\s]+/.test(href.slice(7))?href:safePublicUrl(href,url);
 if(!apply||(!apply.startsWith('https:')&&!apply.startsWith('mailto:')))return null;
 return {status:'verified',reason:'motor_b_independent_html_verified',title,company,work_commune:place,
   source_published_at:new Date(stamp).toISOString(),url,source:adapter.name,application:apply,
   verification_method:'motor_b_html_original_source',validity_method:'live_application'};
}
export async function publishQualifiedShadowOffers() {
 const rows=(await db.list<Row>('radar_shadow_b',{limit:100})).items;
 const selected=rows.filter(x=>x.stage==='recoverable'&&x.reachable===true&&x.locationConflict!==true).slice(0,8);
 const results:Row[]=[];
 for(const row of selected) {
  const url=typeof row.url==='string'?safePublicUrl(row.url):null;
  if(!url){results.push({reason:'invalid_url'});continue;}
  const page=await fetchPublicPage(url,url);
  if(page.error||page.status!==200){results.push({url,status:'blocked',reason:page.error||'HTTP '+page.status});continue;}
  const strict=evaluatePublicJob(url,page.raw,page.url,page.status);
  const offer=strict.status==='verified'?strict:alternate(url,page.raw,Date.now());
  if(!offer){results.push({url,status:'pending',reason:strict.reason});continue;}
  try {
    const saved=await saveVerifiedPublicOffer(offer);
    results.push({url,status:'stored_for_public_feed',sourceTable:saved.table,sourceId:saved.id,method:offer.verification_method});
  }catch(e){results.push({url,status:'error',reason:e instanceof Error?e.message.slice(0,130):'save_failed'});}
 }
 console.warn('SHADOW_B_PUBLICATION '+JSON.stringify({examined:selected.length,results}).slice(0,13000));
 return {examined:selected.length,results};
}
