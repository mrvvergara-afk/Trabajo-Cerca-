import { municipalOfferStatusFromHtml } from './municipal-index-status';
import { db, json, error, isAppDatabaseError } from '@appdeploy/sdk';
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
      url==='https://www.munimulchen.cl/oferta-laboral-02-operarios-agrarios-cosecha-de-arandanos/' &&
      x.municipal_open_index_url==='https://www.munimulchen.cl/pagina-central-ofertas-laborales/' &&
      x.fecha_publicacion_metodo==='original_no_informada_municipal_abierta' &&
      x.application_method==='in_person_omil' && x.internal_visibility_days===14 &&
      x.comunas instanceof Array && x.comunas.length===1 && x.comunas[0]==='Mulchén' &&
      x.empresa==='Empresa agrícola no identificada (OMIL Mulchén)' &&
      typeof x.fecha_descubrimiento==='string' &&
      /^20\d{2}-\d{2}-\d{2}$/.test(x.fecha_descubrimiento) &&
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
async function officialMunicipalIndexStatus(row:Candidate):Promise<'open'|'closed'|'unknown'> {
  if (!row.municipal_open_index_url) return 'unknown';
  try {
    const response=await fetch(row.municipal_open_index_url,{redirect:'error',signal:AbortSignal.timeout(10000)});
    if (!response.ok)return 'unknown';
    const html=(await response.text()).slice(0,400000);
    return municipalOfferStatusFromHtml(
      html,'https://www.munimulchen.cl/oferta-laboral-02-operarios-agrarios-cosecha-de-arandanos/',
      row.municipal_open_index_url);
  } catch { return 'unknown'; }
}

/**
 * Daily safety check for undated first-party OMIL offers.
 * An outage is NOT evidence of closure. A confirmed closed marker removes the
 * listing; an open marker renews its 14-day verification lease. Neither action
 * rewrites the actual publication date or invents an employer deadline.
 */
export async function revalidateOfficialMunicipalOpenOffers() {
  const now=Date.now(),timestamp=new Date(now).toISOString();
  const [last]=await db.get<Record<string,unknown>>('municipal_open_recheck_state',['daily']);
  const previous=Date.parse(String(last?.checkedAt||''));
  if(Number.isFinite(previous)&&now-previous<20*3600000)
    return {status:'not_due',renewed:0,closed:0,unknown:0};
  let nextToken:string|undefined,finished=false,seen=0,renewed=0,closed=0,unknown=0;
  for(let pageNo=0;pageNo<30;pageNo++){
    const page=await db.list<Record<string,unknown>>('radar_jobs',{limit:100,...(nextToken?{nextToken}:{})});
    seen+=page.items.length;
    for(const item of page.items){
      if(item.validityMethod!=='municipal_open_status'||item.active!==true||
         item.municipalOpenIndexUrl!=='https://www.munimulchen.cl/pagina-central-ofertas-laborales/')continue;
      const state=await officialMunicipalIndexStatus({
        municipal_open_index_url:String(item.municipalOpenIndexUrl)
      } as Candidate);
      if(state==='unknown'){unknown++;continue;}
      const updated=state==='open' ? {...item,lastVerifiedAt:timestamp,verificationCheckedAt:timestamp,
        municipalOpenEvidenceValidUntil:new Date(now+14*86400000).toISOString(),
        verificationReason:'Índice municipal revalidado como Postulación Abierta.'}
        : {...item,active:false,closureReason:'confirmed_official_index_closed',
           verificationCheckedAt:timestamp,verificationReason:'Índice oficial indica Postulación Cerrada.'};
      const [updatedRows]=await db.transact([
          db.tx.update('radar_jobs',[{id:String(item.id),record:updated}]),
          db.tx.add('public_feed_changes',[{source:'radar_jobs',sourceId:String(item.id),queuedAt:timestamp}]),
        ]);
      if(!updatedRows[0])throw Error('municipal_recheck_update_failed');
      if(state==='open')renewed++;else closed++;
    }
    if(!page.nextToken){finished=true;break;}
    nextToken=page.nextToken;
  }
  if(!finished)throw Error('municipal_recheck_incomplete');
  const mark={id:'daily',checkedAt:timestamp,seen,renewed,closed,unknown};
  if(last){
    const [ok]=await db.tx.update('municipal_open_recheck_state',[{id:'daily',record:mark}]);
    if(!ok)throw Error('municipal_recheck_checkpoint_update_failed');
  } else {
    const [created]=await db.tx.add('municipal_open_recheck_state',[mark]);
    if(!created)throw Error('municipal_recheck_checkpoint_create_failed');
  }
  return {status:'completed',seen,renewed,closed,unknown};
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
  if (data?.producer!==undefined && !['chatgpt_territorial','motor_d_territorial'].includes(String(data.producer)))
    return error('Productor de publicación no reconocido.',400);
  const producer=data?.producer==='motor_d_territorial'?'motor_d_territorial':'chatgpt_territorial';
  // Fail BEFORE any writes if the primary municipal index cannot be checked.
  // An HTTP outage must never become a terminal 'review_expired' receipt.
  const municipalProofs=new Map<string,'open'|'closed'>();
  for (const candidate of candidates) if(candidate.municipal_open_index_url) {
    const proof=await officialMunicipalIndexStatus(candidate);
    if(proof==='unknown')return error('Índice municipal no verificable; reintentar el lote sin escribir.',503);
    municipalProofs.set(candidate.id_fuente,proof);
  }
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
    if(municipal && municipalProofs.get(x.id_fuente)!=='open'){
      results.push({id:x.id_fuente,status:'review_expired'});continue;
    }
    if(x.fecha_cierre&&Date.parse(x.fecha_cierre+'T23:59:59-03:00')<Date.now()){
      results.push({id:x.id_fuente,status:'expired'});continue;
    }
    const id=(producer==='motor_d_territorial'?'motor_d_':'chatgpt_')+x.id_fuente;
    if(!commit){results.push({id:x.id_fuente,status:'ready_for_direct_import'});continue;}
    const rec={id,kind:'job_offer',origin:'radar',sourceProducer:producer,title:x.cargo,company:x.empresa,
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
      discoveredBy:producer==='motor_d_territorial'?(municipal?'motor-d-official-omil':social?'motor-d-social-omil':'motor-d-territorial'):'chatgpt-direct',verifiedAt:now,lastVerifiedAt:now,
      verificationMethod:municipal?'omil_official_open_index':social?'omil_social_poster_evidence':producer==='motor_d_territorial'?'motor_d_primary_source':'chatgpt_primary_source_manual',
      verificationReason:municipal?'Índice municipal indica Postulación Abierta; ficha individual acredita la postulación presencial; fecha original no informada. Revalidación obligatoria en 14 días.':
        social?'Afiche y publicación OMIL Angol aportados y revisados; reclutamiento presencial acreditado; fecha original estimada.':
        (producer==='motor_d_territorial'?'Control Motor D y comparación previa con catálogo vivo.':'Control ChatGPT y comparación previa con catálogo vivo.')};
    let savedRows:Array<string|null>;
    try {
      [savedRows]=await db.transact([
        db.tx.add('radar_jobs',[rec]),
        db.tx.add('public_feed_changes',[{source:'radar_jobs',sourceId:id,queuedAt:new Date().toISOString()}]),
      ]);
    }catch(cause){
      // The transaction either committed both source and outbox, or neither.
      // A known duplicate needs an identity check, never a blind replay.
      if(isAppDatabaseError(cause) && cause.code==='AppDatabaseDuplicateId'){
        const [existing]=await db.get<{url?:string;kind?:string;title?:string;company?:string}>(
          'radar_jobs',[id],{consistent:true});
        if(existing?.kind==='job_offer' && existing.url===rec.url
            && existing.title===rec.title && existing.company===rec.company){
          results.push({id:x.id_fuente,status:'already_imported_id'});
          continue;
        }
      }
      throw cause;
    }
    if(!savedRows[0])throw new Error('direct_job_transaction_outcome_unconfirmed');
    live.push(rec);
    results.push({id:x.id_fuente,status:'direct_record_queued_for_public_projection',internalId:id});
  }
  return json({readOnly:!commit,publicFeedChecked:live.length,results,note:commit?'Grabado directamente en radar_jobs, sin colas de revisión. La proyección pública se confirma en el cron existente.':'Simulación: no se escribieron ofertas.'});
}
