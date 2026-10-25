import { db, isAppDatabaseError } from '@appdeploy/sdk';

// This private inbox is intentionally isolated from radar_jobs, radar_candidates and feed.
const TABLE='radar_review_inbox';
type Review={id?:string;kind:'review_candidate'|'review_catalog';url:string;sourceId:string;
  territories:string[];publishedEvidence:string|null;deadlineEvidence:string|null;
  status:'pending'|'needs_evidence'|'discarded'|'ready_for_final_check';
  createdAt:string;updatedAt:string;published:false;verified:false};
const HOSTS=new Set(['chiletrabajos.cl','kitempleo.cl','traiguencity.cl','malleco7.cl',
  'municipalidadquilaco.cl','munimulchen.cl','municipalidadcollipulli.cl','municipalidadrenaico.cl',
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
export async function listReview(){
  const page=await db.list<Review>(TABLE,{limit:140});
  const items=page.items.filter(row=>row.kind==='review_candidate')
    .sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100)
    .map(row=>({id:row.id,url:row.url,sourceId:row.sourceId,territories:row.territories,
      publishedEvidence:row.publishedEvidence,deadlineEvidence:row.deadlineEvidence,status:row.status}));
  return {schema:'trabajo-cerca.review-inbox.v1',items,hasMore:Boolean(page.nextToken),published:0};
}
export async function decideReview(body:unknown){
  const obj=body&&typeof body==='object'?body as Record<string,unknown>:{};
  const id=short(obj.id,50),status=short(obj.status,50);
  if(!/^tc_[a-f0-9]{22}$/.test(id)||
    !['needs_evidence','discarded','ready_for_final_check'].includes(status))
    throw Error('Decisión no válida.');
  const [item]=await db.get<Review>(TABLE,[id],{consistent:true});
  if(!item||item.kind!=='review_candidate')throw Error('Registro no encontrado.');
  const [updated]=await db.tx.update(TABLE,[{id,record:{
    status,updatedAt:new Date().toISOString(),published:false,verified:false
  },if:{status:item.status}}],{patch:true});
  if(!updated)throw Error('Registro modificado: vuelve a cargar.');
  return {updated:true,status,published:false};
}
