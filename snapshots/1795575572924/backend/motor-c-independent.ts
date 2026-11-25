import {db} from '@appdeploy/sdk';
import {createHash} from 'node:crypto';
import {importReview,decideReview} from './radar-review-inbox';
import {enqueueAdminReviewedOffer} from './radar-review-queue';
// Independently implemented C intake inside AppDeploy. GitHub C stays separate;
// this avoids reliance on the protected external HTTP ingress.
const seeds=[
 ['Angol','https://noticias.angol.cl/'],
 ['Collipulli','https://municipalidadcollipulli.cl/'],
 ['Ercilla','https://muniercilla.cl/'],
 ['Renaico','https://municipalidadrenaico.cl/concursos-publicos/'],
 ['Mininco (Collipulli)','https://municipalidadcollipulli.cl/'],
 ['Los Sauces','https://munilossauces.cl/'],
 ['Purén','https://munipuren.cl/'],
 ['Traiguén','https://mtraiguen.cl/'],
 ['Lumaco','https://munilumaco.cl/'],
 ['Nacimiento','https://nacimiento.cl/'],
 ['Negrete','https://www.muninegrete.cl/oficina-municipal-de-intermediacion-laboral-omil/'],
 ['Mulchén','https://www.munimulchen.cl/pagina-central-ofertas-laborales/'],
 ['Victoria','https://victoriachile.cl/departamentos-y-direcciones/udel/omil/'],
 ['Salud Araucanía Norte','https://ssan.redsalud.gob.cl/trabaje-con-nosotros/']
] as const;
const isJob=/empleo|oferta laboral|postul|concurso|vacante|reclut|operari|administrativ|técnic|tecnic|trabaja con|cargo|se requiere|cosecha|ar[aá]ndan|selecci[oó]n de personal|convocatoria|auxiliar|se busca/i;
const notJob=/^(inicio|omil|noticias|ofertas laborales|municipalidad|concursos públicos|contacto|menú)$/i;
const clean=(s:string)=>s.replace(/<[^>]+>/g,' ').replace(/&nbsp;|&amp;/g,' ').replace(/\s+/g,' ').trim().slice(0,180);
function candidateUrl(raw:string,seed:string){
 try{const u=new URL(raw.replace(/&amp;/g,'&'),seed);const root=new URL(seed);
  if(u.protocol!=='https:'||u.hostname!==root.hostname||u.username||u.password||u.port||u.hash)return null;
  u.searchParams.forEach((_,key)=>{if(key.startsWith('utm_')||['fbclid','gclid'].includes(key))u.searchParams.delete(key);});
  return u.toString();
 }catch{return null;}
}
export async function motorCIndependentHandler(){
 const [old]=await db.get<{position:number}>('motor_c_local_cursor',['current'],{consistent:true});
 const position=Number(old?.position||0);
 let visited=0,identified=0,queued=0,rejected=0,submitted=0,sourcePending=0;const errors:string[]=[];
 // Limit local source work to one source per run to respect AppDeploy's 30-second cap.
 for(let step=0;step<1;step++){
  const [name,seed]=seeds[(position+step)%seeds.length];
  try{
   const response=await fetch(seed,{headers:{accept:'text/html','user-agent':'TrabajoCercaMotorC/1.0'},signal:AbortSignal.timeout(12000),redirect:'error'});
   if(!response.ok)throw Error('http_'+response.status);
   if(!String(response.headers.get('content-type')).includes('html'))throw Error('not_html');
   const html=(await response.text()).slice(0,280000);visited++;
   const seen=new Set<string>();
   for(const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
    if(identified>=8)break;
    const label=clean(match[2]),url=candidateUrl(match[1],seed);
    if(!url||!label||notJob.test(label)||!isJob.test(label+' '+new URL(url).pathname)||seen.has(url))continue;
    seen.add(url);identified++;
    const key=createHash('sha256').update('motor-c-local|'+url+'|'+label).digest('hex').slice(0,22);
    // La pagina individual es evidencia; la etiqueta de un enlace no confirma trabajo ni comuna.
    let detailTitle='',detailDate:string|null=null,detailStatus='detail_unread';
    try {const detail=await fetch(url,{headers:{accept:'text/html'},signal:AbortSignal.timeout(4500),redirect:'error'});
      if(detail.ok && (detail.headers.get('content-type')||'').includes('html')) {
        const page=(await detail.text()).slice(0,140000);
        detailTitle=clean(page.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||page.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'');
        detailDate=page.match(/(?:datePublished|article:published_time|datePosted)["'\s:=>]+(20\d{2}-\d{2}-\d{2})/i)?.[1]||page.match(/<time[^>]*datetime=["'](20\d{2}-\d{2}-\d{2})/i)?.[1]||null;
        detailStatus=/postulaciones cerradas|proceso finalizado|oferta (?:cerrada|vencida|expirada)/i.test(page)?'closed_notice':'detail_read';
      } else detailStatus='http_'+detail.status;
    }catch(e){detailStatus='detail_fetch_failed';}
    await db.tx.update('motor_c_local_candidates',[{id:key,record:{
     url,label,detailTitle,detailDate,detailStatus,source:name,observedAt:new Date().toISOString(),state:'needs_primary_verification',publicable:false}}]);
    const reported=name==='Salud Araucanía Norte'?[]:[name==='Mininco (Collipulli)'?'Collipulli':name];
    try{const result=await importReview({items:[{candidate_key:key,url,source_id:'motor-c-independent',
      status:'revision_obligatoria',reported_territories:reported,published_date_evidence:detailDate,deadline_evidence:null}]});
      queued+=result.inserted;rejected+=result.rejected;
      if(result.inserted||result.duplicates){
       try{await decideReview({id:'tc_'+key,status:'ready_for_final_check'});
        const checked=await enqueueAdminReviewedOffer({id:'tc_'+key});
        if(checked.queued)submitted++;else sourcePending++;
       }catch(e){sourcePending++;errors.push('primary_check:'+String(e).slice(0,95));}
      }
    }catch(e){rejected++;errors.push('review:'+String(e).slice(0,90));}
   }
  }catch(e){errors.push(name+':'+String(e).slice(0,95));}
 }
 await db.tx.update('motor_c_local_cursor',[{id:'current',record:{position:(position+1)%seeds.length,updatedAt:new Date().toISOString()}}]);
 const report={visited,identified,queued,rejected,submitted,sourcePending,errors,sourceCount:seeds.length,published:0};
 await db.tx.add('motor_c_local_runs',[{id:createHash('sha256').update(String(Date.now())).digest('hex').slice(0,36),...report,at:new Date().toISOString()}]);
 await db.tx.update('motor_c_local_latest',[{id:'current',record:{...report,at:new Date().toISOString()}}]);
 console.warn('MOTOR_C_LOCAL '+JSON.stringify(report));return {statusCode:200};
}
