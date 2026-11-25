import { db } from '@appdeploy/sdk';
import { sitemapWindow, type SitemapCursor } from './sitemap-window';
import { fetchPublicPage, openPublicResponse } from './public-source-http';
import { publicSourceAdapter,safePublicUrl } from './public-source-adapters';
import { evaluatePublicJob } from './public-source-verifier';
import { saveVerifiedPublicOffer } from './free-public-sources';
import { readPublicFeedItem } from './public-feed';
type Receipt={id:string;url?:string;storedAt:number};
type State={id:string;queue:string[];seen:string[];receipts:Receipt[];lastDiscovery:number;cursors?:Record<string,SitemapCursor>;retryAt?:number};
const TABLE='trabajando_targeted_state';
const root='https://www.trabajando.cl/sitemap.xml';
function eligible(value:string,base:string){const url=safePublicUrl(value.replace(/&amp;/g,'&'),base);if(!url)return null;const host=new URL(url).hostname.replace(/^www\./,'');return host==='trabajando.cl'?url:null;}
export async function trabajandoTargetedHandler(){
 const started=Date.now();
 const [old]=await db.get<State>(TABLE,['current'],{consistent:true});
 const state:State=old||{id:'current',queue:[],seen:[],receipts:[],lastDiscovery:0};
 const errors:string[]=[];let sitemapReads=0,links=0,details=0,verified=0,stored=0,visible=0;
 const pending:Receipt[]=[];const latencyMs:number[]=[];
 for(const receipt of state.receipts.slice(0,30)){try{const item=await readPublicFeedItem(receipt.id);if(item?.verified===true){visible++;latencyMs.push(Date.now()-receipt.storedAt);}else pending.push(receipt);}catch{pending.push(receipt);}}
 pending.push(...state.receipts.slice(30));
 const queue=new Set(state.queue),seen=new Set(state.seen);
 if(started-state.lastDiscovery>6*3600000){queue.add(root);state.lastDiscovery=started;seen.clear();}
 const cursors={...state.cursors};
 let retryAt=state.retryAt||0;
 const tasks=retryAt>started?[]:[...queue].sort((a,b)=>Number(!publicSourceAdapter(a))-Number(!publicSourceAdapter(b))).slice(0,4);
 for(const url of tasks){
  const adapter=publicSourceAdapter(url);
  if(!adapter && /sitemap[^/]*\.xml$/i.test(new URL(url).pathname)){
   if(queue.size>800)continue;
   try{
    const opened=await openPublicResponse(url,AbortSignal.timeout(12000),'application/xml,text/xml');
    if('error' in opened)throw Error(opened.error);
    const response=opened.response;
    if(response.status===429){retryAt=started+3600000;await response.body?.cancel();break;}
    if(response.status!==200||!response.body||! /^(application|text)\/xml(?:;|$)/i.test(response.headers.get('content-type')||'')){await response.body?.cancel();throw Error('sitemap_http_or_mime_'+response.status);}
    const window=await sitemapWindow(response.body,cursors[url],150);
    sitemapReads++;
    if(!window.verifiedCursor){delete cursors[url];continue;}
    for(const link of window.links){const target=eligible(link,url);if(target&&!seen.has(target)&&!queue.has(target)&&(publicSourceAdapter(target)||/sitemap[^/]*\.xml$/i.test(new URL(target).pathname))){queue.add(target);links++;}}
    queue.delete(url);
    if(window.next){cursors[url]=window.next;queue.add(url);}else{delete cursors[url];seen.add(url);}
   }catch(e){errors.push(url+':'+String(e).slice(0,120));queue.delete(url);queue.add(url);}
   continue;
  }
  const page=await fetchPublicPage(url,adapter?url:undefined);
  if(page.status===429){retryAt=started+3600000;break;}
  if(page.error||page.status!==200){errors.push(url+':'+(page.error||page.status));queue.delete(url);queue.add(url);continue;}
  queue.delete(url);seen.add(url);
  if(adapter){
   details++;
   const result=evaluatePublicJob(url,page.raw,page.url,page.status,Date.now());
   if(result.status==='verified'){verified++;try{const receipt=await saveVerifiedPublicOffer(result,Date.now());stored++;if(!pending.some(x=>x.id===receipt.id))pending.push({...receipt,storedAt:Date.now()});}catch(e){errors.push(String(e).slice(0,150));queue.add(url);}}
  }else{
   sitemapReads++;
   for(const match of page.raw.matchAll(/<loc\b[^>]*>([^<]+)<\/loc>|href=["']([^"']+)["']/gi)){
    const target=eligible(match[1]||match[2],url);if(!target||seen.has(target)||queue.has(target))continue;
    if(publicSourceAdapter(target)||/sitemap[^/]*\.xml$/i.test(new URL(target).pathname)){queue.add(target);links++;}
    if(queue.size>=1000)break;
   }
  }
 }
 const record={id:'current',queue:[...queue],seen:[...seen].slice(-3000),receipts:pending,lastDiscovery:state.lastDiscovery,cursors,retryAt};
 const [ok]=old?await db.tx.update(TABLE,[{id:'current',record}]):await db.tx.add(TABLE,[record]);if(!ok)throw Error('trabajando_checkpoint_failed');
 const report={at:new Date().toISOString(),sitemapReads,links,details,verified,stored,visible,latencyMs,pendingVisibility:pending.length,pendingLinks:queue.size,errors,durationMs:Date.now()-started};
 const [saved]=await db.add('trabajando_targeted_runs',[report]);if(!saved)throw Error('trabajando_receipt_failed');
 console.warn('TRABAJANDO_TARGETED '+JSON.stringify(report));return {statusCode:200};
}
