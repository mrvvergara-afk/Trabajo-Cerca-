import { createHash } from 'node:crypto';
import { db, secrets } from '@appdeploy/sdk';
import { importReview, decideReview } from './radar-review-inbox';
import { enqueueAdminReviewedOffer } from './radar-review-queue';
import { publicSourceAdapter, publicFeedIdentity } from './public-source-adapters';
import { nextGeminiVerifyCursor, geminiRetryableReason } from './gemini-verify-scheduler';

// Laboratorio: solo bandeja administrativa. No publica directamente ni altera motores A/B/C.
const REPOSITORY = 'mrvvergara-afk/motor-rastreo-gemini';
const FILE = 'output/trabajo_cerca_review_queue_v2.json';
const STATUS_TABLE = 'gemini_github_pull_status';
type Candidate = Record<string, unknown>;
function string(value:unknown) { return typeof value === 'string' ? value.trim() : ''; }
function candidateKey(url:string) { return createHash('sha256').update(url).digest('hex').slice(0,22); }
const TERRITORIES = new Set(['Purén','Traiguén','Los Sauces','Angol','Victoria','Renaico','Collipulli','Ercilla','Lumaco','Mulchén','Negrete','Nacimiento']);
export function adaptGeminiCandidate(raw:Candidate) {
  const url = string(raw.url_directa || raw.url);
  let host = '';
  try { const parsed=new URL(url); if(parsed.protocol!=='https:')return null; host=parsed.hostname.replace(/^www\./,'').toLowerCase(); }
  catch { return null; }
  const supported:Record<string,string>={'chiletrabajos.cl':'Chiletrabajos','portal.chiletrabajos.cl':'Chiletrabajos','laborum.cl':'Laborum','trabajando.cl':'Trabajando.com','cl.computrabajo.com':'Computrabajo','computrabajo.cl':'Computrabajo','bne.cl':'BNE','bne.gob.cl':'BNE','jobs.arauco.com':'Arauco','cmpc.csod.com':'CMPC','municipalidadrenaico.cl':'Municipalidad Renaico','munimulchen.cl':'Municipalidad Mulchen','mtraiguen.cl':'Municipalidad Traiguen','muninegrete.cl':'Municipalidad Negrete','munilumaco.cl':'Municipalidad Lumaco','munipuren.cl':'Municipalidad Puren','muniercilla.cl':'Municipalidad Ercilla','municipalidadcollipulli.cl':'Municipalidad Collipulli','nacimiento.cl':'Municipalidad Nacimiento','munilossauces.cl':'Municipalidad Los Sauces','noticias.angol.cl':'Municipalidad Angol','victoriachile.cl':'Municipalidad Victoria','hospitalangol.cl':'Hospital Angol'};
  if(!supported[host])return null;
  if(host==='chiletrabajos.cl'&&!new URL(url).pathname.startsWith('/trabajo/'))return null;
  // The merged public-source adapter accepts only individual Trabajando requisitions.
  // Opcionempleo remains an aggregator: resolve employer ATS separately before import.
  const adapter=publicSourceAdapter(url);
  if(!adapter||adapter.family==='aggregator')return null;
  const originalCity=string(raw.comuna_real || raw.comuna);
  const city=({'Mininco':'Collipulli','Coihue':'Negrete','Coigüe':'Negrete','Capitán Pastene':'Lumaco'} as Record<string,string>)[originalCity] || originalCity;
  if(!TERRITORIES.has(city))return null;
  const state=string(raw.estado_vigencia || raw.estado);
  if(!state.startsWith('confirmada')&&!state.startsWith('pendiente_')&&!['convocatoria_detectada_pendiente_verificar_vigencia','candidata_para_revision'].includes(state))return null;
  // Las fuentes no estructuradas se conservan en revisión, nunca se aprueban aquí.
  const publication=string(raw.fecha_publicacion || raw.fecha_original);
  const date=/^20\d{2}-\d{2}-\d{2}$/.test(publication) ? publication : null;
  return {
    candidate_key:candidateKey((publicFeedIdentity(url)||url)+(adapter.family==='local'&&string(raw.id)?':unit:'+string(raw.id):'')),
    url,
    source_id:'gemini-v2-'+supported[host].toLowerCase().replace(/\s+/g,'-'),
    reported_territories:[city],
    published_date_evidence:date,
    deadline_evidence:/^20\d{2}-\d{2}-\d{2}$/.test(string(raw.fecha_cierre))?string(raw.fecha_cierre):null,
    status:'revision_obligatoria',
  };
}
export async function pullGeminiReviewQueue() {
  const at=new Date().toISOString();
  const save=async (state:Record<string,unknown>)=>{
    await db.tx.update(STATUS_TABLE,[{id:'current',record:{at,...state}}]);
    console.warn('MOTOR_GEMINI_PULL '+JSON.stringify({at,...state}));
    return {at,...state};
  };
  try {
    const names=await secrets.listSecretNames();
    if(!names.includes('MOTOR_C_GITHUB_READ_TOKEN'))return save({state:'missing_github_read_token'});
    const token=await secrets.readSecret('MOTOR_C_GITHUB_READ_TOKEN');
    const endpoint='https://api.github.com/repos/'+REPOSITORY+'/contents/'+FILE+'?ref=main';
    const response=await fetch(endpoint,{headers:{
      authorization:'Bearer '+token,accept:'application/vnd.github+json',
      'user-agent':'TrabajoCerca-Gemini-Bridge/1.0',
      'x-github-api-version':'2022-11-28',
    },signal:AbortSignal.timeout(12000)});
    if(!response.ok)return save({state:'github_http_error',httpStatus:response.status});
    const data=await response.json() as {content?:unknown;encoding?:unknown;sha?:unknown;size?:unknown};
    if(data.encoding!=='base64'||typeof data.content!=='string'||typeof data.size!=='number'||data.size>800000||typeof data.sha!=='string')
      return save({state:'invalid_file_metadata'});
    const decoded=Buffer.from(data.content.replace(/\s/g,''),'base64');
    if(decoded.length!==data.size)return save({state:'invalid_file_size'});
    const json:unknown=JSON.parse(decoded.toString('utf8'));
    const obj=json&&typeof json==='object'&&!Array.isArray(json)?json as Record<string,unknown>:{};
    const confirmed=Array.isArray(obj.catalogo_principal_confirmadas)?obj.catalogo_principal_confirmadas:[];
    const pending=Array.isArray(obj.catalogo_principal_pendientes)?obj.catalogo_principal_pendientes:[];
    const allRecords=confirmed.length||pending.length?[...confirmed,...pending]:(Array.isArray(obj.items)?obj.items:[]);
    const sourceTotal=['catalogo_principal_confirmadas','catalogo_principal_pendientes','territorio_complementario_confirmadas','territorio_complementario_pendientes'].reduce((n,key)=>n+(Array.isArray(obj[key])?obj[key].length:0),0);
    const [previous]=await db.get<Record<string,unknown>>(STATUS_TABLE,['current'],{consistent:true});
    if(allRecords.length>500)return save({state:'too_many_records',sourceTotal});
    const sourceCount=allRecords.length;
    const complementaryTotal=sourceTotal-sourceCount;
    const start=sourceCount?Math.max(0,Number(previous?.nextImportCursor)||0)%sourceCount:0;
    const records=allRecords.slice(start,start+16);
    const nextImportCursor=sourceCount&&start+records.length<sourceCount?start+records.length:0;
    const normalized=records.map(record=>{
      if(!record||typeof record!=='object'||Array.isArray(record))return null;
      const raw=record as Candidate;
      const candidate=adaptGeminiCandidate(raw);
      return candidate?{candidate,autoSubmit:string(raw.estado_vigencia||raw.estado).startsWith('confirmada')}:null;
    });
    const valid=normalized.filter((r):r is NonNullable<typeof r>=>r!==null);
    let inserted=0,duplicates=0,rejected=records.length-valid.length;
    for(let i=0;i<valid.length;i+=35){
      const result=await importReview({items:valid.slice(i,i+35).map(item=>item.candidate)});
      inserted+=result.inserted;duplicates+=result.duplicates;rejected+=result.rejected;
    }
    // Avanza solo por el verificador y publicador existentes.
    // Nunca se marca una oferta como verificada ni se publica desde este conector.
    let queued=0,alreadyQueued=0,needsReview=0,verificationRetriesPending=0;
    const reasons:Record<string,number>={};
    const addReason=(reason:string)=>{const key=reason.slice(0,90);reasons[key]=(reasons[key]||0)+1;};
    const retainedForReview=valid.filter(x=>!x.autoSubmit).length;
    let submissionAttempts=0;
    const verifyStart=confirmed.length?Math.max(0,Number(previous?.nextVerifyCursor)||0)%confirmed.length:0;
    const verifyRecords=confirmed.slice(verifyStart,verifyStart+4);
    const retryReasons:string[]=[];
    for (const raw of verifyRecords) {
      const item=raw&&typeof raw==='object'&&!Array.isArray(raw)?adaptGeminiCandidate(raw as Candidate):null;
      if(!item)continue;
      submissionAttempts++;
      const id='tc_'+item.candidate_key;
      try {
        const [row]=await db.get<{status?:string;lastCheck?:{reason?:string}}>('radar_review_inbox',[id],{consistent:true});
        if(!row){needsReview++;addReason('candidate_not_found_after_import');continue;}
        if(row.status==='pending'||row.status==='needs_evidence'){
          await decideReview({id,status:'ready_for_final_check'});
        } else if(!['ready_for_final_check','submitting','queued_for_verification'].includes(row.status||'')){
          needsReview++;addReason('not_eligible_status:'+String(row.status));continue;
        }
        const result=await enqueueAdminReviewedOffer({id});
        if(result.queued){ if(result.alreadyQueued)alreadyQueued++;else queued++; }
        else {
          needsReview++;
          const reason=result.reason||row.lastCheck?.reason||'unknown_verification_reason';
          addReason(reason);
          if(geminiRetryableReason(reason)){
            verificationRetriesPending++;
            retryReasons.push(reason);
          }
        }
      } catch(cause) {
        needsReview++;
        addReason(cause instanceof Error?cause.name+':'+cause.message:'unknown_exception');
      }
    }
    const nextVerifyCursor=nextGeminiVerifyCursor(verifyStart,verifyRecords.length,confirmed.length,retryReasons);
    // A partial duplicate scan must be resumed on the next scheduled run;
    // otherwise a 43-item rotation revisits it after the 24h checkpoint expires.
    const importRemainingInSweep=Math.max(0,sourceCount-start-records.length);
    return save({state:'import_completed',githubSha:data.sha,adapterRevision:'gemini-v2.4-progress',sourceTotal,totalMain:sourceCount,complementaryIsolated:complementaryTotal,received:records.length,deferred:importRemainingInSweep,importStart:start,nextImportCursor,verifyStart,nextVerifyCursor,verificationRetriesPending,importedConfirmed:valid.filter(x=>x.autoSubmit).length,retainedForReview,submissionAttempts,inserted,duplicates,rejected,queued,alreadyQueued,needsReview,reasons,published:0,lastAttemptAt:at});
  }catch(error){return save({state:'pull_error',error:error instanceof Error?error.name:'unknown'});}
}
