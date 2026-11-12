import { db, json, error } from '@appdeploy/sdk';
import { readPublicFeedPage, registerPublicFeedChange } from './public-feed';
import { safePublicUrl, publicJobExclusion, publicFeedIdentity } from './public-source-adapters';

type Candidate={id_fuente:string;cargo:string;empresa:string;comunas:string[];url_original:string;fecha_publicacion:string|null;fecha_descubrimiento?:string;municipal_open_index_url?:string;application_method?:string;fecha_cierre?:string|null;justificacion?:string;recruitment_communes?:string[];work_location?:string;territorial_recruitment_verified?:boolean;social_source_account?:string;social_evidence_type?:string;fecha_publicacion_metodo?:string;internal_visibility_days?:number};
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
    const date=x.fecha_publicacion==null?null:String(x.fecha_publicacion),deadline=x.fecha_cierre==null?null:String(x.fecha_cierre);
    // The publisher did not specify the original date. No fabricated date
    // or artificial employer deadline; allow only the exact official OMIL proof.
    const municipalOpen=(date===null &&
      (new URL(url.startsWith('https://')?url:'https://invalid.example.cl')).hostname==='www.munimulchen.cl' &&
      new URL(url).pathname==='/oferta-laboral-02-operarios-agrarios-cosecha-de-arandanos/' &&
      x.municipal_open_index_url==='https://www.munimulchen.cl/pagina-central-ofertas-laborales/' &&
      x.fecha_publicacion_metodo==='original_no_informada_municipal_abierta' &&
      x.application_method==='in_person_omil' && x.internal_visibility_days===14 &&
      x.comunas instanceof Array && x.comunas.length===1 && x.comunas[0]==='Mulchén' &&
      x.empresa==='Empresa agrícola no identificada (OMIL Mulchén)' &&
      typeof x.fecha_descubrimiento==='string' &&
      /^20\\d{2}-\\d{2}-\\d{2}$/.test(x.fecha_descubrimiento) &&
      Number.isFinite(Date.parse(x.fecha_descubrimiento)) &&
      Date.parse(x.fecha_descubrimiento)<=Date.now());
    if(!/^[A-Za-z0-9_-]{4,64}$/.test(id)||title.length<5||title.length>180||company.length<2||company.length>140||
      !Array.isArray(communes)||!communes.length||communes.length>12||!communes.every(y=>typeof y==='string'&&LOCAL.has(y))||
      (!municipalOpen && (date===null || !/^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/.test(date) || Number.isNaN(Date.parse(date)) || Date.parse(date+'T00:00:00-03:00')>Date.now()))||
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
    result.push({id_fuente:id,cargo:title,empresa:company,comunas:[...new Set(communes as string[])],url_original:url,fecha_publicacion:date,fecha_cierre:deadline,justificacion:String(x.justificacion??'').slice(0,500),...(municipalOpen?{
      municipal_open_index_url:String(x.municipal_open_index_url),application_method:'in_person_omil',
      fecha_descubrimiento:String(x.fecha_descubrimiento),fecha_publicacion_metodo:String(x.fecha_publicacion_metodo),
      internal_visibility_days:14
    }:{}),...(omilSocial?{recruitment_communes:['Angol'],work_location:String(x.work_location||'Lugar de trabajo no informado').slice(0,180),territorial_recruitment_verified:true,social_source_account:'omilangol2026',social_evidence_type:String(x.social_evidence_type),fecha_publicacion_metodo:String(x.fecha_publicacion_metodo),internal_visibility_days:Number(x.internal_visibility_days)}:{})});
  }
  if(new Set(result.map(x=>x.id_fuente)).size!==result.length)return null;
  return result;
}
async function officialMunicipalIndexStillOpen(row:Candidate) {
  if (!row.municipal_open_index_url) return false;
  try {
    const response=await fetch(row.municipal_open_index_url,{redirect:'error',signal:AbortSignal.timeout(10000)});
    if (!response.ok)return false;
    const html=(await response.text()).slice(0,400000);
    const needle='/oferta-laboral-02-operarios-agrarios-cosecha-de-arandanos/';
    const position=html.indexOf(needle);
    if(position<0)return false;
    // Evaluate the closest status marker before THIS link, not the first
    // 'open' banner elsewhere on the municipal index.
    const before=html.slice(Math.max(0,position-1100),position)
      .replace(/<[^>]+>/g,' ').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase();
    const open=before.lastIndexOf('postulacion abierta');
    const closed=before.lastIndexOf('postulacion cerrada');
    return open>=0 && open>closed;
  } catch { return false; }
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
    const municipal=Boolean(x.municipal_open_index_url && x.fecha_publicacion===null);
    const urlKey=social?'':keyUrl(x.url_original);
    const duplicate=live.find(y=>{
      const title=norm(String(y.title||'')),company=norm(String(y.company||''));
      const loc=[...(Array.isArray(y.workCommunes)?y.workCommunes as string[]:[]),...(Array.isArray(y.recruitmentCommunes)?y.recruitmentCommunes as string[]:[])];
      return (urlKey!==''&&keyUrl(String(y.url||''))===urlKey)||
        (title===norm(x.cargo)&&company===norm(x.empresa)&&loc.some(c=>x.comunas.includes(c)));
    });
    if(duplicate){results.push({id:x.id_fuente,status:'already_published',existingId:duplicate.id});continue;}
    if(municipal && !(await officialMunicipalIndexStillOpen(x))){
      results.push({id:x.id_fuente,status:'review_expired'});continue;
    }
    if(x.fecha_cierre&&Date.parse(x.fecha_cierre+'T23:59:59-03:00')<Date.now()){
      results.push({id:x.id_fuente,status:'expired'});continue;
    }
    const id='chatgpt_'+x.id_fuente;
    if(!commit){results.push({id:x.id_fuente,status:'ready_for_direct_import'});continue;}
    const rec={id,kind:'job_offer',origin:'radar',title:x.cargo,company:x.empresa,
      workLocation:social?(x.work_location||'Lugar de trabajo no informado'):x.comunas.join(' / '),workCommunes:social?[]:x.comunas,recruitmentCommunes:social?x.recruitment_communes||['Angol']:[],recruitmentZones:social?['Postulación presencial OMIL Angol']:[],
      ...(social?{territorialRecruitmentVerified:true,sourceDateEvidence:x.fecha_publicacion_metodo,sourceEvidenceType:x.social_evidence_type,sourceAccount:x.social_source_account,sourceOriginalDateEstimated:true}:{ }),
      area:social?'Reclutamiento OMIL':municipal?'Oferta laboral OMIL':'Radar externo',status:'Verificada',
      date:municipal?'Fecha original no informada':social?'Fecha aproximada: '+x.fecha_publicacion:x.fecha_publicacion,
      source:social?'OMIL Angol · Instagram':municipal?'Municipalidad de Mulchén · OMIL':'Fuente externa · '+new URL(x.url_original).hostname,
      sourceDomain:new URL(x.url_original).hostname,sourcePublishedAt:x.fecha_publicacion,
      sourceValidThrough:x.fecha_cierre,expiresAt:x.fecha_cierre||undefined,
      validityMethod:municipal?'municipal_open_status':x.fecha_cierre?'explicit_deadline':'open_posting',url:x.url_original,
      ...(municipal?{municipalOpenIndexUrl:x.municipal_open_index_url,
        municipalOpenEvidenceValidUntil:new Date(Date.now()+14*86400000).toISOString(),
        sourceOriginalDateUnreported:true,sourceDateUnconfirmed:true,
        sourceDateEvidence:'official_municipal_index_open',applicationMethod:'in_person_omil'}:{}),
      note:x.justificacion||'Oferta comprobada en fuente individual mediante revisión ChatGPT.',
      tags:[],visual:'field',icon:'work',review:false,verified:true,active:true,createdAt:now,
      firstPublishedAt:municipal?now:social?now:x.fecha_publicacion,
      discoveredBy:municipal?'motor-d-official-omil':social?'motor-d-social-omil':'chatgpt-direct',verifiedAt:now,lastVerifiedAt:now,
      verificationMethod:municipal?'omil_official_open_index':social?'omil_social_poster_evidence':'chatgpt_primary_source_manual',
      verificationReason:municipal?'Índice municipal indica Postulación Abierta; ficha individual acredita la postulación presencial; fecha original no informada. Revalidación obligatoria en 14 días.':
        social?'Afiche y publicación OMIL Angol aportados y revisados; reclutamiento presencial acreditado; fecha original estimada.':
        'Control documental humano/IA y comparación previa con catálogo vivo.'};
    const [saved]=await db.tx.add('radar_jobs',[rec]);
    if(!saved){results.push({id:x.id_fuente,status:'already_imported_id'});continue;}
    await registerPublicFeedChange('radar_jobs',id);
    live.push(rec);
    results.push({id:x.id_fuente,status:'direct_record_queued_for_public_projection',internalId:id});
  }
  return json({readOnly:!commit,publicFeedChecked:live.length,results,note:commit?'Grabado directamente en radar_jobs, sin colas de revisión. La proyección pública se confirma en el cron existente.':'Simulación: no se escribieron ofertas.'});
}
