import { api } from '@appdeploy/client';

/** Light first-party deduplication of accidental ad reloads.
 * This is a client optimization, NOT proof of fraud resistance or unique users.
 * We do not store visitor identity, email, phone or a cross-session identifier.
 */
type AdEvent = 'impression' | 'click';
type Placement = 'search' | 'listing' | 'featured' | 'form';
const recent=new Map<string,number>();
export function recordCommercialEvent(args:{
  campaignId:string;event:AdEvent;place:string;placement:Placement;
}):void {
  if(!args.campaignId||!args.place)return;
  const key='tc_ad_event_v1:'+args.campaignId+':'+args.place+':'+args.placement+':'+args.event;
  const now=Date.now(),cooldown=args.event==='impression'?5*60*1000:1200;
  let previous=recent.get(key)||0;
  try {previous=Math.max(previous,Number(sessionStorage.getItem(key)||0));}catch{}
  if(previous>0&&now>=previous&&now-previous<cooldown)return;
  recent.set(key,now);
  try {sessionStorage.setItem(key,String(now));}catch{}
  void api.post('/api/growth/commercial-events',{...args,eventId:crypto.randomUUID()}).catch(()=>undefined);
}
