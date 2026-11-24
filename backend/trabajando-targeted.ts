import {createHash} from 'node:crypto';
import { db } from '@appdeploy/sdk';
import { fetchPublicPage, openPublicResponse } from './public-source-http';
import { publicSourceAdapter,safePublicUrl } from './public-source-adapters';
import { evaluatePublicJob } from './public-source-verifier';
import { saveVerifiedPublicOffer } from './free-public-sources';
import { currentPublicFeedManifest, readPublicFeedItem } from './public-feed';
import { sitemapWindow, type SitemapCursor } from './sitemap-window';
import { workingLinkKind, workingLinkRank } from './trabajando-queue-policy';

type Receipt={id:string;table?:string;storedAt:number};
type TrackedReceipt=Receipt & {status:string;table:string};
type Task={url:string;discoveredAt?:string;attempts?:number;due?:number;cursor?:SitemapCursor};
type State={id:string;queue:Array<string|Task>;seen:string[];receipts:Receipt[];lastDiscovery:number;receiptCursor?:string;runId?:string;hostRetryAt?:number};
const TABLE='trabajando_targeted_state';
const ROOT='https://www.trabajando.cl/sitemap.xml';
const MAX_PENDING_BYTES=100_000;

function eligible(value:string,base:string) {
 const url=safePublicUrl(value.replace(/&amp;/g,'&'),base);
 if(!url || url.length>2048)return null;
 const address=new URL(url);
 if(address.protocol!=='https:' || !['www.trabajando.cl','trabajando.cl'].includes(address.hostname))return null;
 return workingLinkKind(url)?url:null;
}
const identity=(url:string)=>publicSourceAdapter(url)?.identityUrl||url;
const fingerprint=(url:string)=>createHash('sha256').update(identity(url)).digest('hex');
async function enqueue(queue:Map<string,Task>,seen:Set<string>,links:string[],base:string,at:string) {
 let bytes=Buffer.byteLength(JSON.stringify([...queue.values()]));
 const queued=new Set([...queue.keys()].map(fingerprint));
 const proposed=new Map<string,string>();
 for(const link of links){
  const target=eligible(link,base);
  if(!target)continue;
  const key=fingerprint(target);
  if(!seen.has(key)&&!queued.has(key)&&!proposed.has(key))proposed.set(key,target);
 }
 const entries=[...proposed];
 for(let offset=0;offset<entries.length;offset+=150){
  const batch=entries.slice(offset,offset+150);
  const blocked=await db.get<{eligibleAfter:number}>('trabajando_blocked_work_v1',batch.map(([id])=>id),{consistent:true});
  for(let i=0;i<batch.length;i++){
   const [key,target]=batch[i];
   if(blocked[i]&&blocked[i]!.eligibleAfter>Date.parse(at))continue;
   const task={url:target,discoveredAt:at};
   bytes+=Buffer.byteLength(JSON.stringify(task))+1;
   if(bytes>MAX_PENDING_BYTES)return false;
   queue.set(target,task);
  }
 }
 return true;
}
function retry(task:Task,now:number,retryAfter?:string|null) {
 const attempts=(task.attempts||0)+1;
 const hint=retryAfter && (/^\d+$/.test(retryAfter)?now+1000*Number(retryAfter):Date.parse(retryAfter));
 const due=Math.max(now+Math.min(24*3600000,15*60000*2**Math.min(attempts,8)),Number(hint)||0);
 return {...task,attempts,due};
}

export async function trabajandoTargetedHandler(){
 const started=Date.now(),runId=String(Math.floor(started/(15*60000)));
 const [claimed]=await db.tx.add('trabajando_targeted_run_slots_v1',[{id:runId,at:new Date(started).toISOString()}]);
 if(!claimed)return {statusCode:200};
 const [old]=await db.get<State>(TABLE,['current'],{consistent:true});
 const state:State=old||{id:'current',queue:[],seen:[],receipts:[],lastDiscovery:0};
 const queue=new Map(state.queue.map(item=>{
  const task=typeof item==='string'?{url:item}:item;
  return [task.url,task] as const;
 }).filter(([url])=>eligible(url,ROOT)===url));
 const seen=new Set(state.seen.map(value=>/^[a-f0-9]{64}$/.test(value)?value:fingerprint(value)));
 const errors:string[]=[];
 let hostRetryAt=state.hostRetryAt??0,parked=0;
 async function defer(task:Task,reason:string,retryAfter?:string|null){
  const next=retry(task,started,retryAfter);
  if(reason==='detail_http_429'||reason==='sitemap_http_429')hostRetryAt=Math.max(hostRetryAt,next.due);
  if(next.attempts<5){queue.set(task.url,next);return;}
  const id=fingerprint(task.url);
  const [saved]=await db.tx.update('trabajando_blocked_work_v1',[{id,record:{
   id,url:task.url,reason,attempts:next.attempts,at:new Date(started).toISOString(),
   eligibleAfter:Math.max(next.due,started+7*24*3600_000),
  }}]);
  if(!saved)throw Error('trabajando_blocked_write_unconfirmed');
  queue.delete(task.url);seen.add(id);parked++;
 }
 let sitemapReads=0,details=0,verified=0,inserted=0,updated=0,visible=0,rejected=0,pendingEvidence=0;
 const receiptPage=await db.list<TrackedReceipt>('trabajando_visibility_pending_v1',{
  limit:30,...(state.receiptCursor?{nextToken:state.receiptCursor}:{})
 });
 const waiting=receiptPage.items.filter(receipt=>receipt.status==='stored');
 const manifest=waiting.length?await currentPublicFeedManifest().catch(()=>null):null;
 const keys=manifest?new Set(manifest.manifest.pages.flatMap(page=>page.keys)):null;
 for(const receipt of waiting){
  if(!manifest || !keys?.has(receipt.table+':'+receipt.id))continue;
  try{
   const item=await readPublicFeedItem(receipt.id,manifest);
   if(item?.verified!==true)continue;
   await db.transact([
    db.tx.update('trabajando_publication_receipts_v1',[{
     id:receipt.id,if:{status:'stored'},record:{...receipt,status:'visible',observedAt:started,
      manifestId:manifest.manifestId,latencyMs:started-receipt.storedAt}
    }]),
    db.tx.delete('trabajando_visibility_pending_v1',[receipt.id]),
   ]);
   visible++;
  }catch{errors.push('publication_receipt_pending');}
 }
 if(started-state.lastDiscovery>6*3600000 && !queue.has(ROOT)){
  queue.set(ROOT,{url:ROOT});state.lastDiscovery=started;seen.clear();
 }

 const due=hostRetryAt>started?[]:[...queue.values()].filter(task=>!task.due||task.due<=started);
 const detailsDue=due.filter(task=>workingLinkKind(task.url)==='detail');
 const ranked=[...detailsDue].sort((a,b)=>workingLinkRank(a.url)-workingLinkRank(b.url));
 // Reserve two slots for older links without a territorial slug. The verifier decides the actual worksite.
 const selected=[...ranked.slice(0,6)];
 for(const task of detailsDue)if(selected.length<8 && !selected.includes(task))selected.push(task);
 for(let offset=0;offset<selected.length && hostRetryAt<=started;offset+=4){
  await Promise.all(selected.slice(offset,offset+4).map(async task=>{
   const {url}=task;
   try{
    details++;
    if(!publicSourceAdapter(url))throw Error('unsupported_job_identity');
    const page=await fetchPublicPage(url,url);
    if(page.error || (page.status!==200 && ![404,410].includes(page.status))){
     const reason=page.error||'detail_http_'+page.status;
     errors.push(reason);
     await defer(task,reason,page.retryAfter);return;
    }
    const result=evaluatePublicJob(url,page.raw,page.url,page.status,Date.now());
    if(result.status==='verified'){
     verified++;
     const receipt=await saveVerifiedPublicOffer(result,Date.now(),{runId,discoveredAt:task.discoveredAt});
     if(receipt.created)inserted++;
     else updated++;
    }else if(result.status!=='rejected'){
     pendingEvidence++;await defer(task,result.reason);return;
    }else rejected++;
    queue.delete(url);seen.add(fingerprint(url));
   }catch(error){
    const reason=error instanceof Error?error.message.slice(0,120):'detail_failed';
    errors.push(reason);await defer(task,reason);
   }
  }));
 }
 const discovery=due.find(task=>workingLinkKind(task.url)!=='detail');
 if(discovery && hostRetryAt<=started && Buffer.byteLength(JSON.stringify([...queue.values()]))<MAX_PENDING_BYTES*0.85){
  try{
   if(workingLinkKind(discovery.url)==='sitemap'){
    const opened=await openPublicResponse(discovery.url,AbortSignal.timeout(12_000),'application/xml,text/xml');
    if('error' in opened)throw Error(opened.error);
    const {response,url}=opened;
    if(response.status!==200 || !response.body || workingLinkKind(url)!=='sitemap' ||
       !/^(?:application|text)\/xml(?:;|$)/i.test(response.headers.get('content-type')||'')){
     await response.body?.cancel();
     await defer(discovery,'sitemap_http_'+response.status,response.headers.get('retry-after'));
     throw Error('sitemap_http_or_mime_'+response.status);
    }
    const page=await sitemapWindow(response.body,discovery.cursor,150);
    sitemapReads++;
    if(!page.verifiedCursor)queue.set(discovery.url,{url:discovery.url});
    else if(await enqueue(queue,seen,page.links,url,new Date(started).toISOString())){
     if(page.next){
      // Rotate checkpoints so another index/landing gets its turn.
      queue.delete(discovery.url);queue.set(discovery.url,{url:discovery.url,cursor:page.next});
     }else{queue.delete(discovery.url);seen.add(fingerprint(discovery.url));}
    }
   }else{
    const page=await fetchPublicPage(discovery.url);
    if(page.error||page.status!==200)throw Error(page.error||'landing_http_'+page.status);
    const links=[...page.raw.matchAll(/href=["']([^"']+)["']/gi)].map(match=>match[1]);
    if(await enqueue(queue,seen,links,page.url,new Date(started).toISOString())){queue.delete(discovery.url);seen.add(fingerprint(discovery.url));}
   }
  }catch(error){
   errors.push(String(error).slice(0,120));
   if(queue.get(discovery.url)===discovery)await defer(discovery,error instanceof Error?error.message:'discovery_failed');
  }
 }

 const record={id:'current',runId,queue:[...queue.values()],seen:[...seen].slice(-1000),receipts:state.receipts,lastDiscovery:state.lastDiscovery,hostRetryAt,receiptCursor:receiptPage.nextToken};
 if(Buffer.byteLength(JSON.stringify(record))>230*1024)throw Error('trabajando_checkpoint_byte_budget');
 const [ok]=old?await db.tx.update(TABLE,[{id:'current',record,...(old.runId?{if:{runId:old.runId}}:{})}]):await db.tx.add(TABLE,[record]);
 if(!ok)throw Error('trabajando_checkpoint_failed');
 const report={runId,at:new Date().toISOString(),sitemapReads,details,verified,inserted,updated,visible,rejected,pendingEvidence,parked,hostRetryAt,
  sampledPendingVisibility:waiting.length-visible,legacyVisibilityReceipts:state.receipts.length,pendingLinks:queue.size,errors,durationMs:Date.now()-started};
 const [saved]=await db.add('trabajando_targeted_runs',[report]);
 if(!saved)throw Error('trabajando_receipt_failed');
 console.warn('TRABAJANDO_TARGETED '+JSON.stringify(report));return {statusCode:200};
}
