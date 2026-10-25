import {db} from '@appdeploy/sdk';
import {createHash} from 'node:crypto';
import {fetchPublicPage} from './public-source-http';
import {publicSourceAdapter,publicFeedIdentity} from './public-source-adapters';

import {evaluatePublicJob} from './public-source-verifier';
import {currentPublicFeedManifest} from './public-feed';
export type ReviewCheck={
 status:'blocked'|'pending'|'rejected'|'verified_for_final_review';reason:string;canPublish:false;
 checkedAt:string;title?:string;company?:string;workCommune?:string;publishedDate?:string;
 sourcePublishedAt?:string;application?:string;source?:string;deadline?:string|null;
 verificationMethod?:string;scanned?:number;existingPublicId?:string;
 evidence?:{originalUrl:string;finalUrl:string;httpStatus:number;sourceSha256:string|null;checkedAt:string;method?:string};
};
type DuplicateScan={fingerprint:string;startedAt:string;cursor?:string|null;processed:number;pages:number;inventoryComplete?:boolean;publicSignature?:string;publicCursor?:number;publicComplete?:boolean;completedAt?:string};
type Candidate={kind?:string;url?:string;status?:string;territories?:string[];duplicateScan?:DuplicateScan};
type Existing={kind?:string;url?:string;title?:string;company?:string;workCommunes?:string[];discoveredBy?:string;verified?:boolean;review?:boolean;active?:boolean};
const TARGETS=new Set(['Angol','Collipulli','Ercilla','Renaico','Mininco','Los Sauces','Purén','Traiguén','Lumaco','Nacimiento','Negrete','Mulchén','Quilaco','Victoria']);
const chileDay=(date:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
const fold=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();

// Options are server-only. The HTTP route passes the request body as its first argument only.
export async function checkOneReview(body:unknown,options:{queuedJobId?:string}={}):Promise<ReviewCheck>{
 const input=body&&typeof body==='object'?body as Record<string,unknown>:{};
 const id=typeof input.id==='string'?input.id:'';
 const checkedAt=new Date().toISOString();
 const result=(status:ReviewCheck['status'],reason:string,extra:Partial<ReviewCheck>={}):ReviewCheck=>({status,reason,canPublish:false,checkedAt,...extra});
 if(!/^tc_[a-f0-9]{22}$/.test(id))return result('blocked','id_invalid');
 const [entry]=await db.get<Candidate>('radar_review_inbox',[id],{consistent:true});
 if(!entry||entry.kind!=='review_candidate'||typeof entry.url!=='string')return result('blocked','candidate_missing');
 const queued=options.queuedJobId==='tcq_'+id.slice(3)&&['submitting','queued_for_verification'].includes(entry.status||'');
 if(entry.status!=='ready_for_final_check'&&!queued)return result('blocked','mark_final_review_first');
 const save=async(value:ReviewCheck)=>{
  const [ok]=await db.tx.update('radar_review_inbox',[{id,record:{lastCheck:value,lastCheckedAt:checkedAt},if:{status:entry.status}}],{patch:true});
  if(!ok)throw Error('review_check_receipt_not_saved');return value;
 };
 const adapter=publicSourceAdapter(entry.url);
 if(!adapter||adapter.family==='aggregator')return save(result('blocked','primary_individual_source_required'));
 const page=await fetchPublicPage(entry.url,entry.url);
 const evidence={originalUrl:entry.url,finalUrl:page.url,httpStatus:page.status,sourceSha256:page.raw?createHash('sha256').update(page.raw).digest('hex'):null,checkedAt};
 const outcome=(status:ReviewCheck['status'],reason:string,extra:Partial<ReviewCheck>={})=>save(result(status,reason,{evidence,...extra}));
 if(page.error)return outcome('pending',page.error);
 const verification=evaluatePublicJob(entry.url,page.raw,page.url,page.status);
 if(verification.status==='rejected')return outcome('rejected',verification.reason);
 if(verification.status!=='verified'||!verification.source_published_at||!verification.work_commune||!verification.application)return outcome('pending',verification.reason);
 if((verification.company?.length||0)>2000||(verification.application?.length||0)>2000)return outcome('pending','source_field_budget_exceeded');
 const day=chileDay(new Date(verification.source_published_at)),today=chileDay(new Date(checkedAt));
 const age=Math.round((Date.parse(today+'T12:00:00Z')-Date.parse(day+'T12:00:00Z'))/86400000);
 if(!Number.isFinite(age)||age<0||age>20)return outcome('rejected','outside_20_day_admission_window',{publishedDate:day});
 if(!TARGETS.has(verification.work_commune))return outcome('blocked','workplace_outside_territory');
 if(entry.territories?.length&&!entry.territories.includes(verification.work_commune))return outcome('blocked','workplace_conflicts_with_research');
 const identity=publicFeedIdentity(entry.url);
 if(!identity)return outcome('blocked','identity_unconfirmed');
 const fingerprint=['jobs-scan-v4',identity,fold(verification.title||''),fold(verification.company||''),verification.work_commune,verification.source_published_at,verification.application,options.queuedJobId||''].join('|');
 const now=Date.now(),prior=entry.duplicateScan,same=prior?.fingerprint===fingerprint;
 const started=Date.parse(prior?.startedAt||''),completed=Date.parse(prior?.completedAt||'');
 const completeRecent=Boolean(same&&Number.isFinite(completed)&&now>=completed&&now-completed<5*60000);
 const runningRecent=Boolean(same&&!prior?.completedAt&&Number.isFinite(started)&&now>=started&&now-started<(queued?7*86400000:30*60000));
 const saved=completeRecent||runningRecent?prior:undefined;
 const snapshot=await currentPublicFeedManifest();
 if(!snapshot)return outcome('pending','public_duplicate_catalog_unavailable');
 // The key/identity inventory remains stable during mere revalidation. No growing-table drain.
 const publicSignature=createHash('sha256').update(JSON.stringify(snapshot.manifest.pages.map(page=>[page.keys,page.identities]))).digest('hex');
 const samePublic=saved?.publicSignature===publicSignature;
 const matches=(x:Existing)=> (typeof x.url==='string'&&publicFeedIdentity(x.url)===identity)||Boolean(x.title&&x.company&&x.workCommunes?.includes(verification.work_commune!)&&fold(x.title)===fold(verification.title||'')&&fold(x.company)===fold(verification.company||''));
 if(!(completeRecent&&samePublic)){
  let publicCursor=samePublic?saved?.publicCursor||0:0,publicComplete=samePublic&&saved?.publicComplete===true;
  if(!publicComplete){
   const pages=snapshot.manifest.pages.slice(publicCursor,publicCursor+2);
   const leaves=pages.length?await db.get<{entries:Array<{source:string;sourceId:string;item:Existing&{id?:string}}>}>('public_feed_versions',pages.map(page=>page.id),{consistent:true}):[];
   if(leaves.some(leaf=>!leaf||!Array.isArray(leaf.entries)))return outcome('pending','public_duplicate_page_unavailable');
   for(const leaf of leaves)for(const value of leaf!.entries){
    if(value.source==='radar_jobs'&&value.sourceId===options.queuedJobId)continue;
    if(value.item.kind==='job_offer'&&matches(value.item))return outcome('blocked','already_in_public_catalog',{existingPublicId:value.item.id||value.sourceId});
   }
   publicCursor+=pages.length;publicComplete=publicCursor>=snapshot.manifest.pages.length;
  }
  let cursor=saved?.cursor||undefined,processed=saved?.processed||0,pages=saved?.pages||0,inventoryComplete=saved?.inventoryComplete===true;
  if(!inventoryComplete){
   const batch=await db.list<Existing>('radar_jobs',{limit:120,...(cursor?{nextToken:cursor}:{})});
   const duplicate=batch.items.find(x=>x.id!==options.queuedJobId&&!(queued&&x.discoveredBy==='admin-review-inbox-v1'&&x.review===true&&x.verified===false&&x.active===true&&x.id>options.queuedJobId!)&&(!x.kind||x.kind==='job_offer')&&matches(x));
   if(duplicate)return outcome('blocked','already_in_internal_inventory');
   if(batch.nextToken&&batch.nextToken===cursor)return outcome('pending','duplicate_scan_cursor_stalled');
   cursor=batch.nextToken;processed+=batch.items.length;pages++;inventoryComplete=!batch.nextToken;
  }
  const done=inventoryComplete&&publicComplete;
  const checkpoint:DuplicateScan={fingerprint,startedAt:saved?.startedAt||checkedAt,cursor:cursor||null,processed,pages,inventoryComplete,publicSignature,publicCursor,publicComplete,...(done?{completedAt:checkedAt}:{})};
  const [ok]=await db.tx.update('radar_review_inbox',[{id,record:{duplicateScan:checkpoint},if:{status:entry.status}}],{patch:true});
  if(!ok)return outcome('pending','duplicate_scan_concurrent_change');
  if(!done)return outcome('pending','duplicate_check_in_progress',{scanned:processed});
 }
 return outcome('verified_for_final_review',verification.reason,{title:verification.title,company:verification.company,workCommune:verification.work_commune,publishedDate:day,application:verification.application,sourcePublishedAt:verification.source_published_at,source:verification.source,deadline:verification.valid_through||null,verificationMethod:verification.verification_method,evidence:{...evidence,method:verification.verification_method}});
}
