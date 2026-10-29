import { db, isAppDatabaseError } from '@appdeploy/sdk';
import {reviewPublicationReader} from './radar-review-queue';

// This private inbox is intentionally isolated from radar_jobs, radar_candidates and feed.
const TABLE='radar_review_inbox';
type Review={id?:string;kind:'review_candidate'|'review_catalog';url:string;sourceId:string;
  territories:string[];publishedEvidence:string|null;deadlineEvidence:string|null;
  status:'pending'|'needs_evidence'|'discarded'|'ready_for_final_check'|'submitting'|'queued_for_verification';
  radarJobId?:string;
  createdAt:string;updatedAt:string;published:false;verified:false;
  motorState?:string;blockReason?:string;lastCheckedAt?:string;nextCheckAt?:string;lastCheck?:{reason?:string}};
const HOSTS=new Set(['chiletrabajos.cl','kitempleo.cl','traiguencity.cl','malleco7.cl',
  'munimulchen.cl','municipalidadcollipulli.cl','municipalidadrenaico.cl',
  'muninegrete.cl','mtraiguen.cl','munilumaco.cl','munipuren.cl','muniercilla.cl','victoriachile.cl',
  'nacimiento.cl','munilossauces.cl','noticias.angol.cl','radionativa.cl',
  'radioviaducto.cl','lasnoticiasdemalleco.cl','bne.gob.cl','empleospublicos.cl','sence.gob.cl']);
const TOWNS=new Set(['Angol','Collipulli','Ercilla','Renaico','Mininco','Los Sauces','Purén',
  'Traiguén','Lumaco','Nacimiento','Negrete','Mulchén','Victoria','Quilaco']);
const short=(value:unknown,max=100)=>typeof value==='string'?value.trim().slice(0,max):'';
function safeUrl(value:unknown){
  const v=short(value,700);
  if(!v||v.length>600)return null;
  try{
    const u=new URL(v),h=u.hostname.replace(/^www\./,'').toLowerCase();
    if(u.protocol!=='https:'||u.username||u.password||u.port||!HOSTS.has(h))return null;
    u.hash='';return u.toString();
  }catch{return null;}
}
function dateEvidence(value:unknown){
  if(typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(value))return null;
  const x=new Date(value+'T12:00:00Z');
  return !Number.isNaN(x.getTime())&&x.toISOString().slice(0,10)===value?value:null;
}
function parse(body:unknown){
  const obj=body&&typeof body==='object'?body as Record<string,unknown>:{};
  if(!Array.isArray(obj.items)||obj.items.length<1||obj.items.length>35)
    throw Error('Se requieren entre 1 y 35 referencias.');
  let rejected=0;const rows:Review[]=[];const unique=new Set<string>();
  const now=new Date().toISOString();
  for(const value of obj.items){
    const x=value&&typeof value==='object'?value as Record<string,unknown>:{};
    const key=short(x.candidate_key,40),url=safeUrl(x.url),status=short(x.status,80);
    if(!/^[a-f0-9]{22}$/.test(key)||!url||unique.has(key)||
      !['revision_obligatoria','revision_y_catalogo_no_disponible'].includes(status)){rejected++;continue;}
    unique.add(key);
    const places=Array.isArray(x.reported_territories)?x.reported_territories:[];
    const territories=[...new Set(places.filter((p):p is string=>typeof p==='string'&&TOWNS.has(p)))].slice(0,5);
    rows.push({id:'tc_'+key,kind:'review_candidate',url,sourceId:short(x.source_id,50),
      territories,publishedEvidence:dateEvidence(x.published_date_evidence),
      deadlineEvidence:dateEvidence(x.deadline_evidence),status:'pending',
      createdAt:now,updatedAt:now,published:false,verified:false});
  }
  return {rows,rejected};
}
async function prepare(){
  const existing=await db.list<Review>(TABLE,{limit:1});
  if(existing.items.length)return;
  // Initialize table catalog with standalone write before conditional chosen-ID writes.
  const now=new Date().toISOString();
  const [id]=await db.add(TABLE,[{kind:'review_catalog',url:'',sourceId:'',territories:[],
    publishedEvidence:null,deadlineEvidence:null,status:'pending',createdAt:now,
    updatedAt:now,published:false,verified:false}]);
  if(!id)throw Error('No fue posible iniciar la bandeja.');
}
export async function importReview(body:unknown){
  const {rows,rejected}=parse(body);
  if(!rows.length)return {inserted:0,duplicates:0,rejected,published:0};
  await prepare();
  let inserted=0,duplicates=0;
  for(const row of rows){
    const id=row.id!;
    const [old]=await db.get<Review>(TABLE,[id],{consistent:true});
    if(old){
      if(old.kind!=='review_candidate'||old.url!==row.url)throw Error('ID y URL no coinciden.');
      duplicates++;continue;
    }
    try{
      const [saved]=await db.tx.add(TABLE,[row]);
      if(saved)inserted++;else duplicates++;
    }catch(cause:unknown){
      if(isAppDatabaseError(cause)&&
        (cause.code==='AppDatabaseDuplicateId'||cause.code==='AppDatabaseUnknownOutcome')){
        const [existing]=await db.get<Review>(TABLE,[id],{consistent:true});
        if(existing&&existing.kind==='review_candidate'&&existing.url===row.url){duplicates++;continue;}
      }
      throw cause;
    }
  }
  return {inserted,duplicates,rejected,published:0};
}
export async function listReview(cursor?:string){
  if(cursor&&cursor.length>16000)throw Error('Cursor inválido.');
  const page=await db.list<Review>(TABLE,{limit:20,...(cursor?{nextToken:cursor}:{})});
  const reader=reviewPublicationReader();
  const items=[];
  for(const row of page.items.filter(x=>x.kind==='review_candidate')){
    const publication=await reader(row.id,row);
    items.push({id:row.id,url:row.url,sourceId:row.sourceId,territories:row.territories,
      publishedEvidence:row.publishedEvidence,deadlineEvidence:row.deadlineEvidence,status:row.status,
      radarJobId:row.radarJobId||null,motorState:row.motorState||null,
      lastCheckedAt:row.lastCheckedAt||null,nextCheckAt:row.nextCheckAt||null,
      lastCheck:row.lastCheck||null,publication});
  }
  return {schema:'trabajo-cerca.review-inbox.v1',items,hasMore:!!page.nextToken,nextToken:page.nextToken||null,
    scope:'current_page',summary:{queued:items.filter(x=>x.status==='queued_for_verification').length,
      published:items.filter(x=>x.publication.published).length,
      pending:items.filter(x=>['pending_verifier','waiting_for_feed','waiting_for_feed_projection'].includes(x.publication.state)).length,
      blocked:items.filter(x=>['blocked','duplicate','inactive_or_rejected','queue_reconciliation_required'].includes(x.publication.state)).length}};
}
export async function decideReview(body:unknown){
  const obj=body&&typeof body==='object'?body as Record<string,unknown>:{};
  const id=short(obj.id,50),status=short(obj.status,50);
  if(!/^tc_[a-f0-9]{22}$/.test(id)||
    !['needs_evidence','discarded','ready_for_final_check'].includes(status))
    throw Error('Decisión no válida.');
  const [item]=await db.get<Review>(TABLE,[id],{consistent:true});
  if(!item||item.kind!=='review_candidate')throw Error('Registro no encontrado.');
  if(item.status==='submitting'||item.status==='queued_for_verification')throw Error('Ya fue enviado al verificador.');
  const [updated]=await db.tx.update(TABLE,[{id,record:{
    status,updatedAt:new Date().toISOString(),published:false,verified:false,
    duplicateScan:undefined
  },if:{status:item.status}}],{patch:true});
  if(!updated)throw Error('Registro modificado: vuelve a cargar.');
  return {updated:true,status,published:false};
}
