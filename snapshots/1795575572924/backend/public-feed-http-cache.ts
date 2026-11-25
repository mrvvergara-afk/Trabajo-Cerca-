import { readPublicFeedPage } from './public-feed';

// Bounded per-runtime cache of public, already approved pages only.
// Importers, administration and the identity-reconciliation endpoint bypass it.
type PublicPage = Awaited<ReturnType<typeof readPublicFeedPage>>;
type ValidPage = NonNullable<PublicPage>;
type CachedPage = { page:ValidPage; savedAt:number };
const PUBLIC_TTL_MS = 20_000;
const EMERGENCY_STALE_MS = 180_000;
const MAX_ENTRIES = 40;
const ready = new Map<string,CachedPage>();
const running = new Map<string,Promise<PublicPage>>();

function gatewayUnavailable(cause:unknown):boolean {
  const message=cause instanceof Error ? cause.message : String(cause);
  return /AppDatabaseGatewayUnavailable|AppDatabaseQuotaExceeded|Rate Exceeded|insufficient capacity|throttl|timed?\s?out|ECONNRESET/i.test(message);
}

export function readCachedPublicPage(cursor?:string, fresh=false):Promise<PublicPage> {
  const key=cursor||'__first__';
  const previous=ready.get(key);
  if(!fresh && previous && Date.now()-previous.savedAt<PUBLIC_TTL_MS)
    return Promise.resolve(previous.page);
  const active=running.get(key);
  if(active)return active;
  const request=readPublicFeedPage(cursor)
    .then(page=>{
      if(page && Array.isArray(page.items) && page.items.length<=40 &&
        (!('degraded' in page) || page.degraded!==true)){
        ready.delete(key);
        ready.set(key,{page,savedAt:Date.now()});
        while(ready.size>MAX_ENTRIES){
          const oldest=ready.keys().next().value;
          if(!oldest)break;
          ready.delete(oldest);
        }
      }
      // A rebuilding manifest returns null without throwing. Preserve a recent,
      // previously approved page as a clearly provisional response.
      if(!page && !cursor && previous && Date.now()-previous.savedAt<EMERGENCY_STALE_MS){
        console.warn('PUBLIC_FEED_LAST_READABLE_CACHE '+JSON.stringify({page:'first',reason:'manifest_rebuilding',ageSeconds:Math.floor((Date.now()-previous.savedAt)/1000)}));
        return {...previous.page,degraded:true,feedRebuilding:true,feedState:'degraded_last_good',totalsProvisional:true,cacheAgeSeconds:Math.floor((Date.now()-previous.savedAt)/1000)};
      }
      return page;
    })
    .catch(cause=>{
      const last=ready.get(key);
      const age=last?Date.now()-last.savedAt:Infinity;
      if(last && age>=0 && age<EMERGENCY_STALE_MS && gatewayUnavailable(cause)){
        console.warn('PUBLIC_FEED_LAST_READABLE_CACHE '+JSON.stringify({
          page:cursor?'paginated':'first',ageSeconds:Math.floor(age/1000),
          reason:'database_gateway_unavailable',
        }));
        return {...last.page,degraded:true,feedRebuilding:true,
          feedState:'degraded_last_good',totalsProvisional:true,
          cacheAgeSeconds:Math.floor(age/1000)};
      }
      throw cause;
    })
    .finally(()=>{if(running.get(key)===request)running.delete(key);});
  running.set(key,request);
  return request;
}
