import {db} from '@appdeploy/sdk';
import {createHash} from 'node:crypto';
// Motor B: fuentes, red, cola, validacion y almacenamiento propios. Sin importar codigo de A.
import {MOTOR_B_SOURCES} from './motor-b-sources';
import {extractBDocument} from './motor-b-document';
const towns=['Angol','Collipulli','Ercilla','Renaico','Mininco','Nacimiento','Negrete','Mulchén','Los Sauces','Purén','Traiguén','Lumaco','Victoria','Quilaco'];
const legacySeeds=[
['Municipio Mulchén','https://www.munimulchen.cl/pagina-central-ofertas-laborales/'],
['OMIL Negrete','https://www.muninegrete.cl/oficina-municipal-de-intermediacion-laboral-omil/'],
['Municipio Victoria','https://victoriachile.cl/departamentos-y-direcciones/udel/omil/'],
['Municipio Collipulli','https://municipalidadcollipulli.cl/'],
['Municipio Renaico','https://municipalidadrenaico.cl/concursos-publicos/'],
['Municipio Lumaco','https://munilumaco.cl/'],
['Angol Noticias','https://www.angolnoticiasnew.cl/'],
['Traiguencity','https://www.traiguencity.cl/noticias/traiguen/laboral-traiguen/'],
['Chiletrabajos','https://www.chiletrabajos.cl/'],
['Computrabajo','https://cl.computrabajo.com/'],
['Laborum','https://www.laborum.cl/'],
['Indeed','https://cl.indeed.com/'],
['Arauco','https://jobs.arauco.com/'],
['CMPC','https://cmpc.csod.com/'],
['Empleos Publicos','https://www.empleospublicos.cl/'],
['OMIL Sence','https://sence.gob.cl/personas/omil']
] as const;
const seeds=MOTOR_B_SOURCES;
const hash=(s:string)=>createHash('sha256').update(s).digest('hex').slice(0,48);
const fold=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const clean=(s:string)=>s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&(?:nbsp|amp|quot);/gi,' ').replace(/\s+/g,' ').trim();
const urlFor=(raw:string,base:string)=>{try{const u=new URL(raw.replace(/&amp;/g,'&'),base);if(u.protocol!=='https:'||u.username||u.password||u.port||u.hostname.endsWith('.local')||/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname))return null;u.hash='';return u.toString();}catch{return null;}};
const approved=new Set(seeds.map(([,u])=>new URL(u).hostname));
async function read(url:string){const u=new URL(url);if(!approved.has(u.hostname))throw Error('host_not_approved');const response=await fetch(url,{method:'GET',headers:{'Accept':'text/html,application/xhtml+xml'},signal:AbortSignal.timeout(8000),redirect:'error'});const mime=response.headers.get('content-type')||'';if(/application\/pdf|image\/(?:png|jpeg|webp)/.test(mime)||/\.(?:pdf|png|jpe?g|webp)$/i.test(u.pathname)){
 const contentLength=Number(response.headers.get('content-length')||0);
 if(contentLength>3500000)throw Error('document_over_size_limit');
 const bytes=new Uint8Array(await response.arrayBuffer());
 if(bytes.byteLength>3500000)throw Error('document_over_size_limit');
 const document=await extractBDocument(url,bytes,mime);
 return {body:document.text,status:response.status,document};
 }
 if(!/text\/html|application\/(?:rss\+xml|atom\+xml|xml)|text\/xml/.test(mime))throw Error('unsupported_content_type');const body=await response.text();return {body:body.slice(0,250000),status:response.status};}
type Candidate={id:string;url:string;source:string;title:string;company:string|null;commune:string|null;publishedAt:string|null;application:string|null;status:string;observedAt:string;reason:string};
function jobPosting(html:string):Record<string,unknown>|null{
 for(const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  try{
   const roots=[JSON.parse(m[1])];let count=0;
   while(roots.length&&count++<150){const x=roots.pop();if(Array.isArray(x)){roots.push(...x.slice(0,30));continue;}
    if(!x||typeof x!=='object')continue;
    if(x['@type']==='JobPosting'||Array.isArray(x['@type'])&&x['@type'].includes('JobPosting'))return x;
    for(const v of Object.values(x))if(v&&typeof v==='object')roots.push(v);
   }
  }catch{continue;}
 }
 return null;
}
function analyze(url:string,source:string,html:string,now:number):Candidate{
 const structured=jobPosting(html);const plain=clean(html).slice(0,12000);const h1=clean(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||'');
 const title=(typeof structured?.title==='string'?structured.title:h1||clean(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'')).slice(0,180);
 const loc=towns.filter(t=>new RegExp('\\b'+fold(t)+'\\b').test(fold(title+' '+plain.slice(0,2400))));
 const org=structured?.hiringOrganization as Record<string,unknown>|undefined;
 const company=(typeof org?.name==='string'?org.name:plain.match(/(?:empresa|empleador|institucion)\s*:\s*([^.;]{4,90})/i)?.[1]?.trim())||null;
 const date=html.match(/(?:datePublished|article:published_time)["'\s:=>]+(20\d{2}-\d{2}-\d{2})/i)?.[1]||html.match(/<time[^>]*datetime=["'](20\d{2}-\d{2}-\d{2})/i)?.[1]||null;
 const sourceDate=typeof structured?.datePosted==='string'?structured.datePosted.slice(0,10):date;
 const time=sourceDate?Date.parse(sourceDate):NaN;
 const links=[...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
 const apply=links.filter(m=>/postular|enviar cv|aplicar|apply/i.test(clean(m[2]))).map(m=>urlFor(m[1],url)).find(Boolean)|| (structured?url:null);
 const expires=typeof structured?.validThrough==='string'?Date.parse(structured.validThrough):NaN;
 const closed=/postulaciones cerradas|proceso finalizado|oferta (?:cerrada|vencida|expirada)|no longer accepting/i.test(plain)||(Number.isFinite(expires)&&expires<now);
 const validDate=Number.isFinite(time)&&time>=now-45*86400000&&time<=now;
 const subject=/oferta laboral|vacante|se necesita|se requiere|contrataci[oó]n|postular|empleo/i.test(title+' '+plain.slice(0,1700));
 const status=closed?'closed':!subject&&!structured?'not_job':loc.length!==1?'review_location':!validDate?'review_date':!apply?'review_application':'ready';
 return {id:hash(url),url,source,title,company,commune:loc.length===1?loc[0]:null,publishedAt:validDate?sourceDate:null,application:apply,status:status==='ready'&&!company?'review_employer':status,observedAt:new Date(now).toISOString(),reason:closed?'explicitly_closed':status};
}
export async function motorBIndependentHandler(){
 const now=Date.now();
 const [previous]=await db.get<{position:number;queue:Array<{url:string;source:string}>}>('motor_b_state',['cursor'],{consistent:true});
 const state=previous||{position:0,queue:[]};
 const index=state.position%seeds.length;const [source,seed]=seeds[index];
 const nextSeeds=Array.from({length:3},(_,j)=>seeds[(index+j)%seeds.length]);
 const tasks=[...nextSeeds.map(([name,url])=>({url,source:name})),...state.queue.slice(0,6)];
 const nextQueue=state.queue.slice(6);let visited=0,ready=0,reviews=0,errors:string[]=[];const reviewReasons:Record<string,number>={};const markReview=(reason:string)=>{reviews++;reviewReasons[reason]=(reviewReasons[reason]||0)+1;};
 for(const job of tasks){
  try{const {body,document}=await read(job.url);visited++;
   if(document){
    const id=hash(job.url);
    await db.tx.update('motor_b_documents',[{id,record:{id,url:job.url,source:job.source,...document,observedAt:new Date(now).toISOString()}}]);
    if(document.status!=='extracted')markReview(document.reason||document.status);
    if(document.text.length>25){const item=analyze(job.url,job.source,'<h1>Documento laboral</h1><p>'+document.text.replace(/</g,'&lt;')+'</p>',now);await db.tx.update('motor_b_offers',[{id:item.id,record:{...item,status:'review_document',reason:'document_extracted_verify_original_date_and_workplace'}}]);markReview('document_extracted_needs_offer_check');}
    continue;
   }
   if(!seeds.some(([,entry])=>entry===job.url)&&!/(?:\/feed\/?|\/(?:rss|sitemap)(?:\.xml)?\/?|\/(?:robots\.txt))$/i.test(new URL(job.url).pathname)){const candidate=analyze(job.url,job.source,body,now);const [old]=await db.get<Candidate>('motor_b_offers',[candidate.id],{consistent:true});if(!old||old.status!==candidate.status)await db.tx.update('motor_b_offers',[{id:candidate.id,record:candidate}]);if(candidate.status==='ready')ready++;else markReview(candidate.status);}
   const host=new URL(job.url).hostname;
   // Discover eligible RSS/Atom entry links and XML sitemap loc entries without using engine A.
   if(/^\s*(?:<\?xml|<rss\b|<feed\b|<urlset\b|<sitemapindex\b)/i.test(body)){
     for(const item of body.matchAll(/<(?:loc|link)\b[^>]*>([^<]{8,1200})<\/(?:loc|link)>|<link\b[^>]*href=["']([^"']+)["']/gi)){
       const target=urlFor(item[1]||item[2],job.url);
       if(target&&new URL(target).hostname===host&&!nextQueue.some(q=>q.url===target)&&nextQueue.length<70&&/emple|trabaj|oferta|vacante|postul|job|career|feed|sitemap|rss|concurs/i.test(target))nextQueue.push({url:target,source:job.source});
     }
   }
   for(const a of body.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
    const url=urlFor(a[1],job.url),label=clean(a[2]);
    if(!url||new URL(url).hostname!==host||url===job.url||nextQueue.some(q=>q.url===url))continue;
    if(/empleo|trabajo|oferta|vacante|postula|concurso|career|job|requisit|convocatoria|reclut|\bfeed\b|sitemap|\.pdf|afiche|bases|descarga/i.test(url+' '+label)&&nextQueue.length<70)nextQueue.push({url,source:job.source});
   }
  }catch(e){errors.push(job.source+':'+String(e).slice(0,90));}
 }
 await db.tx.update('motor_b_state',[{id:'cursor',record:{position:index+3,queue:nextQueue.slice(0,70)}}]);
 await db.tx.add('motor_b_runs',[{id:hash(String(now)+seed),at:new Date(now).toISOString(),source,visited,ready,reviews,reviewReasons,errors,queueLength:nextQueue.length}]);
 console.warn('MOTOR_B_INDEPENDENT '+JSON.stringify({source,visited,ready,reviews,reviewReasons,errors,queueLength:nextQueue.length}));
 return {statusCode:200};
}
