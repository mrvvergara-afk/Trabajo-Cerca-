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
 ['Mininco','https://victoriachile.cl/departamentos-y-direcciones/udel/omil/'],
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
const isJob=/empleo|oferta laboral|postul|concurso|vacante|reclut|operari|administrativ|técnic|tecnic|trabaja con|cargo|se requiere/i;
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
 for(let step=0;step<4;step++){
  const [name,seed]=seeds[(position+step)%seeds.length];
  try{
   const response=await fetch(seed,{headers:{accept:'text/html','user-agent':'TrabajoCercaMotorC/1.0'},signal:AbortSignal.timeout(12000),redirect:'error'});
   if(!response.ok)throw Error('http_'+response.status);
   if(!String(response.headers.get('content-type')).includes('html'))throw Error('not_html');
   const html=(await response.text()).slice(0,280000);visited++;
   const seen=new Set<string>();
   for(const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
    if(identified>=40)break;
    const label=clean(match[2]),url=candidateUrl(match[1],seed);
    if(!url||!label||notJob.test(label)||!isJob.test(label+' '+new URL(url).pathname)||seen.has(url))continue;
    seen.add(url);identified++;
    const key=createHash('sha256').update('motor-c-local|'+url+'|'+label).digest('hex').slice(0,22);
    const [prior]=await db.get('motor_c_local_candidates',[key],{consistent:true});
    const record={url,label,source:name,observedAt:new Date().toISOString(),state:'needs_primary_verification',publicable:false};
    if(prior)await db.tx.update('motor_c_local_candidates',[{id:key,record}],{patch:true});
    else await db.tx.add('motor_c_local_candidates',[{id:key,...record}]);
    const reported=name==='Salud Araucanía Norte'?[]:[name==='Mininco'?'Mininco':name];
    try{const result=await importReview({items:[{candidate_key:key,url,source_id:'motor-c-independent',
      status:'revision_obligatoria',reported_territories:reported,published_date_evidence:null,deadline_evidence:null}]});
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
 const cursorRecord={position:(position+4)%seeds.length,updatedAt:new Date().toISOString()};
 if(old)await db.tx.update('motor_c_local_cursor',[{id:'current',record:cursorRecord}],{patch:true});
 else await db.tx.add('motor_c_local_cursor',[{id:'current',...cursorRecord}]);
 const report={visited,identified,queued,rejected,submitted,sourcePending,errors,sourceCount:seeds.length,published:0};
 await db.tx.add('motor_c_local_runs',[{id:createHash('sha256').update(String(Date.now())).digest('hex').slice(0,36),...report,at:new Date().toISOString()}]);
 const [latest]=await db.get('motor_c_local_latest',['current'],{consistent:true});
 if(latest)await db.tx.update('motor_c_local_latest',[{id:'current',record:{...report,at:new Date().toISOString()}}],{patch:true});
 else await db.tx.add('motor_c_local_latest',[{id:'current',...report,at:new Date().toISOString()}]);
 console.warn('MOTOR_C_LOCAL '+JSON.stringify(report));return {statusCode:200};
}
