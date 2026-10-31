import { createHash } from 'node:crypto';
import { db, secrets } from '@appdeploy/sdk';
import { importReview } from './radar-review-inbox';

// Laboratorio: solo bandeja administrativa. No publica directamente ni altera motores A/B/C.
const REPOSITORY = 'mrvvergara-afk/motor-rastreo-gemini';
const FILE = 'output/trabajo_cerca_review_queue.json';
const STATUS_TABLE = 'gemini_github_pull_status';
type Candidate = Record<string, unknown>;
function string(value:unknown) { return typeof value === 'string' ? value.trim() : ''; }
function candidateKey(url:string) { return createHash('sha256').update(url).digest('hex').slice(0,22); }
const TERRITORIES = new Set(['Purén','Traiguén','Los Sauces','Angol','Victoria','Renaico','Collipulli','Ercilla','Lumaco','Mulchén','Negrete','Nacimiento']);
export function adaptGeminiCandidate(raw:Candidate) {
  const url = string(raw.url);
  let host = '';
  try { const parsed=new URL(url); if(parsed.protocol!=='https:')return null; host=parsed.hostname.replace(/^www\./,'').toLowerCase(); }
  catch { return null; }
  if(host!=='chiletrabajos.cl')return null;
  if(!url.includes('/trabajo/'))return null;
  const city=string(raw.comuna);
  if(!TERRITORIES.has(city))return null;
  const state=string(raw.estado);
  if(state!=='convocatoria_detectada_pendiente_verificar_vigencia')return null;
  const publication=string(raw.fecha_original);
  const date=/^20\d{2}-\d{2}-\d{2}$/.test(publication) ? publication : null;
  return {
    candidate_key:candidateKey(url),
    url,
    source_id:'gemini-v19-chiletrabajos',
    reported_territories:[city],
    published_date_evidence:date,
    deadline_evidence:null,
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
    if(data.encoding!=='base64'||typeof data.content!=='string'||typeof data.size!=='number'||data.size>200000||typeof data.sha!=='string')
      return save({state:'invalid_file_metadata'});
    const decoded=Buffer.from(data.content.replace(/\s/g,''),'base64');
    if(decoded.length!==data.size)return save({state:'invalid_file_size'});
    const json:unknown=JSON.parse(decoded.toString('utf8'));
    const obj=json&&typeof json==='object'&&!Array.isArray(json)?json as Record<string,unknown>:{};
    const records=Array.isArray(obj.items)?obj.items:[];
    if(records.length>500)return save({state:'too_many_records'});
    const normalized=records.map(record=>record&&typeof record==='object'&&!Array.isArray(record)?adaptGeminiCandidate(record as Candidate):null);
    const valid=normalized.filter((r):r is NonNullable<typeof r>=>r!==null);
    let inserted=0,duplicates=0,rejected=records.length-valid.length;
    for(let i=0;i<valid.length;i+=35){
      const result=await importReview({items:valid.slice(i,i+35)});
      inserted+=result.inserted;duplicates+=result.duplicates;rejected+=result.rejected;
    }
    return save({state:'import_completed',githubSha:data.sha,received:records.length,inserted,duplicates,rejected,published:0});
  }catch(error){return save({state:'pull_error',error:error instanceof Error?error.name:'unknown'});}
}
