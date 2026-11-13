import { db } from '@appdeploy/sdk';
import { createHash } from 'node:crypto';
import { freePublicSourceStatus, publicDocumentUrl, saveVerifiedPublicOffer } from './free-public-sources';
import { safePublicUrl, publicSourceAdapter } from './public-source-adapters';
import { fetchPublicPage } from './public-source-http';
import { evaluatePublicJob } from './public-source-verifier';
import { bcCheckLimit } from './recheck-policy';

type JobResult={id:string;url:string;checkedAt:string;firstReason:string;decision:string;reason:string;published:boolean;attempts?:number};
const TABLE='fast_bc_html_decisions_v1';
const STATUS='fast_bc_html_status_v1';
const key=(url:string)=>createHash('sha256').update('fast-bc-html:'+url).digest('hex').slice(0,48);
const targetPlaces=new Set(['angol','collipulli','mininco','ercilla','lumaco','los-sauces','puren','renaico','traiguen','victoria','mulchen','negrete','coihue','coigue','nacimiento']);
const nonTargetCities=new Set(['valdivia','chillan','constitucion','santiago','concepcion','temuco','osorno','talca','puerto-montt','san-jose-de-la-mariquina']);
const indexPaths=/\/(?:search|trabaje-con-nosotros|empleos|ofertas-laborales|bolsa-de-empleo)\/?$/i;
function genericSourceIndex(url:string){try{const u=new URL(url);return indexPaths.test(u.pathname) && !u.searchParams.has('id') && !u.searchParams.has('jobId') && !u.searchParams.has('oferta');}catch{return false;}}
// Only the location prefix on Arauco's individual-job URLs is used as a triage hint.
// A non-target prefix is NOT a rejection: the job may describe a different worksite.
function locationHint(url:string){
 try{
  const u=new URL(url);
  if(u.hostname!=='jobs.arauco.com')return 'unknown';
  const slug=decodeURIComponent(u.pathname.split('/')[3]||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if([...targetPlaces].some(city=>slug.startsWith(city+'-')))return 'target';
  if([...nonTargetCities].some(city=>slug.startsWith(city+'-')))return 'outside_hint';
  return 'unknown'; // Unrecognized city is not proof of out-of-territory work.
 }catch{return 'unknown';}
}

export async function runFastBCHtml(){
 const source=await freePublicSourceStatus();
 const reviewed=Array.isArray(source.summary?.reviewed)?source.summary.reviewed as Array<{url?:string;status?:string;reason?:string}>:[];
 // Only the latest Motor A first-pass findings are eligible; never import historical queues.
 const seenUrls=new Set<string>();
 const recheckRows=Array.isArray(source.recheckWork)?source.recheckWork as Array<{url?:string}>:[];
 const reviewedWithRechecks=[...reviewed,...recheckRows.map(row=>({...row,status:'pending',reason:'revalidation_due'}))];
 const todo=reviewedWithRechecks.filter(row=>{
  if(row.status!=='pending' || typeof row.url!=='string' || publicDocumentUrl(row.url))return false;
  const url=safePublicUrl(row.url);
  if(!url || seenUrls.has(url))return false;
  seenUrls.add(url);
  return true;
 });
 // Prioritize territorial candidates; keep outside hints auditable but avoid spending
 // the limited three network checks on obvious out-of-area Arauco URL prefixes.
 todo.sort((a,b)=>Number(locationHint(a.url||'')==='outside_hint')-Number(locationHint(b.url||'')==='outside_hint'));
 let checked=0,verified=0,archived=0,blocked=0,already=0,legacyRecovered=0,deferredOutside=0,deferredIndex=0,storedForFeed=0,storageFailures=0;
 const outcomes:Array<{url:string;decision:string;reason:string}>=[];
 // Walk the entire bounded first-pass result so early already-seen rows cannot starve later ones.
 const checkLimit=bcCheckLimit(todo.length,12);
 for(const row of todo){
  if(checked>=checkLimit)break;
  const url=safePublicUrl(row.url || '');
  if(!url || !publicSourceAdapter(url))continue;
  if(genericSourceIndex(url)){deferredIndex++;continue;}
  if(locationHint(url)==='outside_hint'){deferredOutside++;continue;}
  const id=key(url);
  const [prior]=await db.get<JobResult>(TABLE,[id],{consistent:true});
  // A pending or blocked decision is not a final rejection. Retry at most twice,
  // separated by 24 hours; successful and confirmed-closed decisions stay final.
  if(prior){
   // Legacy decisions archived missing structured data even when the job was still open.
   const legacyFalseArchive=prior.decision==='archived_insufficient_evidence' && !['source_removed','closed_notice','expired_deadline'].includes(prior.reason);
   const retryable=legacyFalseArchive || ['pending_evidence','blocked_source','blocked_verification_storage'].includes(prior.decision);
   const elapsed=Date.now()-Date.parse(prior.checkedAt);
   const maxAttempts=prior.decision==='blocked_verification_storage'?4:prior.decision==='blocked_source'?3:2;
   if(!retryable || (prior.attempts||1)>=maxAttempts || !Number.isFinite(elapsed) || elapsed<24*60*60*1000){already++;continue;}
   if(legacyFalseArchive)legacyRecovered++;
  }
  checked++;
  const page=await fetchPublicPage(url,url);
  const result=page.error?{status:'pending',reason:page.error}:
    evaluatePublicJob(url,page.raw,page.url,page.status,Date.now());
  let decision='pending_evidence',reason=String(result.reason || 'unresolved').slice(0,120),published=false;
  if(result.status==='verified'){
   try{await saveVerifiedPublicOffer(result,Date.now());decision='stored_pending_public_feed';published=false;verified++;storedForFeed++;}
   catch(error){decision='blocked_verification_storage';reason=String(error).slice(0,110);blocked++;storageFailures++;}
  }else if(page.error || [0,401,403,429,500,502,503].includes(page.status)){
   decision='blocked_source';blocked++;
  }else if(result.status==='rejected' && ['source_removed','closed_notice','expired_deadline'].includes(result.reason)){
   decision='confirmed_closed';archived++;
  }
  const record={id,url,firstReason:prior?.firstReason || row.reason || '',checkedAt:new Date().toISOString(),decision,reason,published,attempts:(prior?.attempts||0)+1};
  const [stored]=prior ? await db.tx.update(TABLE,[{id,record}]) : await db.tx.add(TABLE,[record]);
  if(!stored){storageFailures++;console.warn('FAST_B_C_DECISION_WRITE_FAILED '+JSON.stringify({url,decision}));} // Never count failed writes as successful deduplication.
  outcomes.push({url,decision,reason});
 }
 const summary={checkedAt:new Date().toISOString(),aCheckedAt:source.checkedAt,found:todo.length,checked,verified,archived,blocked,already,legacyRecovered,deferredOutside,deferredIndex,storedForFeed,storageFailures,outcomes};
 // Avoid a status write on idle five-minute cron cycles; keep last meaningful result.
 if(checked===0 && storageFailures===0){
  console.warn('FAST_B_C_HTML_IDLE '+JSON.stringify({found:todo.length,already,deferredOutside,deferredIndex}));
  return summary;
 }
 const [old]=await db.get<{id:string}>(STATUS,['current'],{consistent:true});
 if(old)await db.tx.update(STATUS,[{id:'current',record:{id:'current',...summary}}]);
 else await db.tx.add(STATUS,[{id:'current',...summary}]);
 console.warn('FAST_B_C_HTML '+JSON.stringify(summary).slice(0,3600));
 return summary;
}
