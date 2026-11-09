import { db, json, error } from '@appdeploy/sdk';
import { readPublicFeedPage, registerPublicFeedChange } from './public-feed';
import { safePublicUrl, publicJobExclusion, publicFeedIdentity } from './public-source-adapters';

type Candidate={id_fuente:string;cargo:string;empresa:string;comunas:string[];url_original:string;fecha_publicacion:string;fecha_cierre?:string|null;justificacion?:string;recruitment_communes?:string[];work_location?:string;territorial_recruitment_verified?:boolean;social_source_account?:string;social_evidence_type?:string;fecha_publicacion_metodo?:string;internal_visibility_days?:number};
const LOCAL=new Set(['Angol','Collipulli','Ercilla','Lumaco','Los Sauces','Purén','Renaico','Traiguén','Victoria','Mulchén','Negrete','Nacimiento']);
const norm=(s:string)=>s.toLowerCase().normalize('NFD').replace(/[^a-z0-9 ]/g,' ').replace(/ +/g,' ').trim();
const keyUrl=(s:string)=>{const known=publicFeedIdentity(s);if(known)return known;const clean=safePublicUrl(s);if(!clean)return '';const url=new URL(clean);return url.hostname.replace(/^www\./,'')+url.pathname.replace(/\/$/,'')+url.search;};
function parse(value:unknown):Candidate[]|null {
  if(!Array.isArray(value)||value.length<1||value.length>15)return null;
  const result:Candidate[]=[];
  for(const input of value){
    if(!input||typeof input!=='object')return null;
    const x=input as Record<string,unknown>;
    const id=String(x.id_fuente??''), title=String(x.cargo??''), company=String(x.empresa??''),url=String(x.url_original??'');
    const communes=x.comunas;
    const date=String(x.fecha_publicacion??''),deadline=x.fecha_cierre==null?null:String(x.fecha_cierre);
    if(!/^[A-Za-z0-9_-]{4,64}$/.test(id)||title.length<5||title.length>180||company.length<2||company.length>140||
      !Array.isArray(communes)||!communes.length||communes.length>12||!communes.every(y=>typeof y==='string'&&LOCAL.has(y))||
      !/^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/.test(date)||Number.isNaN(Date.parse(date))||Date.parse(date+'T00:00:00-03:00')>Date.now()||
      (deadline!==null&&(!/^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/.test(deadline)||Number.isNaN(Date.parse(deadline))))||
      !url.startsWith('https://')||url.length>700)return null;
    let host='';try{host=new URL(url).hostname.toLowerCase()}catch{return null;}
    const omilSocial=(host==='www.instagram.com'||host==='instagram.com')&&new URL(url).pathname.replace(/\/$/,'')==='/omilangol2026'&&
      x.social_source_account==='omilangol2026'&&x.social_evidence_type==='user_supplied_official_omil_post_and_poster_screenshots'&&
      x.territorial_recruitment_verified===true&&Array.isArray(x.recruitment_communes)&&
      x.recruitment_communes.length===1&&x.recruitment_communes[0]==='Angol'&&
      Number(x.internal_visibility_days)>=1&&Number(x.internal_visibility_days)<=15&&
      typeof x.fecha_publicacion_metodo==='string'&&x.fecha_publicacion_metodo.startsWith('fecha_inferida_');
    if(!omilSocial && (!safePublicUrl(url) || publicJobExclusion({kind:'job_offer',url,title,workCommunes:communes})))return null;
    result.push({id_fuente:id,cargo:title,empresa:company,comunas:[...new Set(communes as string[])],url_original:url,fecha_publicacion:date,fecha_cierre:deadline,justificacion:String(x.justificacion??'').slice(0,500),...(omilSocial?{recruitment_communes:['Angol'],work_location:String(x.work_location||'Lugar de trabajo no informado').slice(0,180),territorial_recruitment_verified:true,social_source_account:'omilangol2026',social_evidence_type:String(x.social_evidence_type),fecha_publicacion_metodo:String(x.fecha_publicacion_metodo),internal_visibility_days:Number(x.internal_visibility_days)}:{})});
  }
  if(new Set(result.map(x=>x.id_fuente)).size!==result.length)return null;
  return result;
}
async function inventory(){
  const list:Array<Record<string,unknown>>=[];let cursor:string|undefined;
  const seen=new Set<string>();
  for(let step=0;step<100;step++){
    const page=await readPublicFeedPage(cursor);
    if(!page || ('feedRebuilding' in page && page.feedRebuilding===true) || ('degraded' in page && page.degraded===true))throw Error('El manifiesto público no está estable. No se permitirá importar.');
    list.push(...(page.items as Array<Record<string,unknown>>));
    if(!page.nextCursor){
      if(list.length < Number(page.totalJobOffers||0))throw Error('El catálogo está incompleto: se bloquea la importación.');
      return list;
    }
    if(seen.has(page.nextCursor))throw Error('Paginación inconsistente.');
    seen.add(page.nextCursor);cursor=page.nextCursor;
  }
  throw Error('La lectura completa superó el límite seguro.');
}
export async function directChatGPTImport(body:unknown){
  const data=body as Record<string,unknown>|null;
  const candidates=parse(data?.offers);
  if(!candidates)return error('Lote inválido: se requieren fichas individuales, fechas, comunas y enlaces aprobados.',400);
  const commit=data?.commit===true;
  const live=await inventory();
  const results=[];
  const now=new Date().toISOString();
  for(const x of candidates){
    const social=x.social_source_account==='omilangol2026';
    const urlKey=social?'':keyUrl(x.url_original);
    const duplicate=live.find(y=>{
      const title=norm(String(y.title||'')),company=norm(String(y.company||''));
      const loc=[...(Array.isArray(y.workCommunes)?y.workCommunes as string[]:[]),...(Array.isArray(y.recruitmentCommunes)?y.recruitmentCommunes as string[]:[])];
      return (urlKey!==''&&keyUrl(String(y.url||''))===urlKey)||
        (title===norm(x.cargo)&&company===norm(x.empresa)&&loc.some(c=>x.comunas.includes(c)));
    });
    if(duplicate){results.push({id:x.id_fuente,status:'already_published',existingId:duplicate.id});continue;}
    if(x.fecha_cierre&&Date.parse(x.fecha_cierre+'T23:59:59-03:00')<Date.now()){
      results.push({id:x.id_fuente,status:'expired'});continue;
    }
    const id='chatgpt_'+x.id_fuente;
    if(!commit){results.push({id:x.id_fuente,status:'ready_for_direct_import'});continue;}
    const rec={id,kind:'job_offer',origin:'radar',title:x.cargo,company:x.empresa,
      workLocation:social?(x.work_location||'Lugar de trabajo no informado'):x.comunas.join(' / '),workCommunes:social?[]:x.comunas,recruitmentCommunes:social?x.recruitment_communes||['Angol']:[],recruitmentZones:social?['Postulación presencial OMIL Angol']:[],
      ...(social?{territorialRecruitmentVerified:true,sourceDateEvidence:x.fecha_publicacion_metodo,sourceEvidenceType:x.social_evidence_type,sourceAccount:x.social_source_account,sourceOriginalDateEstimated:true}:{ }),
      area:social?'Reclutamiento OMIL':'Radar externo',status:'Verificada',date:social?'Fecha aproximada: '+x.fecha_publicacion:x.fecha_publicacion,source:social?'OMIL Angol · Instagram':'Fuente externa · '+new URL(x.url_original).hostname,
      sourceDomain:new URL(x.url_original).hostname,sourcePublishedAt:x.fecha_publicacion,
      sourceValidThrough:x.fecha_cierre,expiresAt:x.fecha_cierre||undefined,
      validityMethod:x.fecha_cierre?'explicit_deadline':'open_posting',url:x.url_original,
      note:x.justificacion||'Oferta comprobada en fuente individual mediante revisión ChatGPT.',
      tags:[],visual:'field',icon:'work',review:false,verified:true,active:true,createdAt:now,
      firstPublishedAt:social?now:x.fecha_publicacion,discoveredBy:social?'motor-d-social-omil':'chatgpt-direct',verifiedAt:now,lastVerifiedAt:now,
      verificationMethod:social?'omil_social_poster_evidence':'chatgpt_primary_source_manual',verificationReason:social?'Afiche y publicación OMIL Angol aportados y revisados; reclutamiento presencial acreditado; fecha original estimada.':'Control documental humano/IA y comparación previa con catálogo vivo.'};
    const [saved]=await db.tx.add('radar_jobs',[rec]);
    if(!saved){results.push({id:x.id_fuente,status:'already_imported_id'});continue;}
    await registerPublicFeedChange('radar_jobs',id);
    live.push(rec);
    results.push({id:x.id_fuente,status:'direct_record_queued_for_public_projection',internalId:id});
  }
  return json({readOnly:!commit,publicFeedChecked:live.length,results,note:commit?'Grabado directamente en radar_jobs, sin colas de revisión. La proyección pública se confirma en el cron existente.':'Simulación: no se escribieron ofertas.'});
}

