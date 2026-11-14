import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@appdeploy/client';
import { allocateAdvertising, type HouseCampaign, type CommercialAd, type Goal, type Selection, type Slot } from '../shared/house-ads';
import './house-advertising.css';
import {AdImage} from './ad-image';
import {presentHouseCreative} from './house-creative-presentation';
export type HouseAttribution = {campaignId:string; creativeId:string};
export function sendHouseEvent(a:HouseAttribution,event:'impression'|'click'|'form_started') {
  if (localStorage.getItem('tc_analytics_consent') !== 'yes') return;
  void api.post('/api/growth/house-events',{...a,event,eventId:crypto.randomUUID()}).catch(()=>undefined);
}
const readSession = <T,>(key:string,fallback:T):T => {try{return JSON.parse(sessionStorage.getItem(key)||'null')??fallback;}catch{return fallback;}};
export function completedHouseGoals():Goal[] {return readSession<Goal[]>('tc-house-completed',[]);}
export function completeHouseGoal(goal:Goal) {
  if (completedHouseGoals().includes(goal)) return;
  try {sessionStorage.setItem('tc-house-completed',JSON.stringify([...new Set([...completedHouseGoals(),goal])]));window.dispatchEvent(new Event('tc-house-completed'));}catch{/* Session-only suppression is best effort. */}
}
export function useAdvertising(place:string,category:string,page='home',requestedSlots:Slot[]=['search','listing','featured']) {
  const [catalog,setCatalog]=useState<{house:HouseCampaign[];commercial:CommercialAd[];complete:boolean}|null>(null);
  const [failed,setFailed]=useState(false);
  const [refreshKey,setRefreshKey]=useState(0);
  useEffect(()=>{
    let lastRefresh=0;
    const refresh=()=>{
      if(document.visibilityState!=='visible'||Date.now()-lastRefresh<1500)return;
      lastRefresh=Date.now();
      setRefreshKey(value=>value+1);
    };
    let delayedRefresh:number|undefined;
    const onStorage=(event:StorageEvent)=>{
      if(event.key!=='tc-commercial-updated')return;
      refresh();
      if(delayedRefresh!==undefined)window.clearTimeout(delayedRefresh);
      delayedRefresh=window.setTimeout(refresh,11000);
    };
    const onVisibility=()=>{if(document.visibilityState==='visible')refresh();};
    window.addEventListener('focus',refresh);
    window.addEventListener('storage',onStorage);
    window.addEventListener('tc-commercial-updated',refresh);
    document.addEventListener('visibilitychange',onVisibility);
    // El foco y la visibilidad actualizan al instante; el sondeo cubre cambios hechos desde otra sesión.
    const timer=window.setInterval(refresh,60000);
    return()=>{
      window.removeEventListener('focus',refresh);
      window.removeEventListener('storage',onStorage);
      window.removeEventListener('tc-commercial-updated',refresh);
      document.removeEventListener('visibilitychange',onVisibility);
      window.clearInterval(timer);
      if(delayedRefresh!==undefined)window.clearTimeout(delayedRefresh);
    };
  },[]);
  // A quiet in-place carousel: rotate only house inventory, never displace paid slots.
  // The visitor may pause; reduced-motion and hidden tabs do not autoplay.
  const [rotation,setRotation]=useState(0);
  const [paused,setPaused]=useState(false);
  useEffect(()=>{
    const timer=window.setInterval(()=>{
      if(paused||document.visibilityState!=='visible'||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
      setRotation(value=>(value+1)%120);
    },18000);
    return()=>window.clearInterval(timer);
  },[paused]);
  const [completed,setCompleted]=useState(completedHouseGoals);
  const [turn]=useState(()=>{
    const previous=readSession<number>('tc-house-turn',0);const next=Number.isSafeInteger(previous)?previous+1:1;
    try{sessionStorage.setItem('tc-house-turn',JSON.stringify(next));}catch{/* Memory allocation still works. */}return next;
  });
  const seen=useRef(readSession<Record<string,number>>('tc-house-seen',{}));
  useEffect(()=>{
    let active=true;
    void api.get('/api/growth/advertising?place='+encodeURIComponent(place)+'&page='+encodeURIComponent(page)+'&turn='+turn).then(r=>{if(active){setCatalog(r.data);setFailed(false);}}).catch(()=>{if(active){setCatalog(null);setFailed(true);}});
    return()=>{active=false;};
  },[place,page,turn,refreshKey]);
  useEffect(()=>{const changed=()=>setCompleted(completedHouseGoals());window.addEventListener('tc-house-completed',changed);return()=>window.removeEventListener('tc-house-completed',changed);},[]);
  // Vigencia evaluada en el navegador, incluso si la conexión o el inventario se retrasa.
  const [now,setNow]=useState(Date.now);
  useEffect(()=>{
    const nextExpiry=(catalog?.commercial??[])
      .map(ad=>Date.parse(ad.endAt))
      .filter(end=>Number.isFinite(end)&&end>Date.now())
      .sort((a,b)=>a-b)[0];
    if(!nextExpiry)return;
    const timeout=window.setTimeout(()=>setNow(Date.now()),Math.min(2147483647,Math.max(1,nextExpiry-Date.now()+80)));
    return()=>window.clearTimeout(timeout);
  },[catalog,now]);
  const slotsKey=requestedSlots.join('|');
  const selections=useMemo(()=>allocateAdvertising({house:catalog?.house??[],commercial:catalog?.commercial??[],complete:catalog?.complete===true,place,category,page,now,turn:turn+rotation,seen:seen.current,completed,slots:slotsKey.split('|') as Slot[]}),[catalog,place,category,page,now,turn,rotation,completed,slotsKey]);
  function impression(id:string){seen.current[id]=(seen.current[id]??0)+1;try{sessionStorage.setItem('tc-house-seen',JSON.stringify(seen.current));}catch{/* Keep in memory. */}}
  return {selections,impression,loading:!catalog&&!failed,failed,rotation,paused,toggleRotation:()=>setPaused(v=>!v)};
}
export function HouseBanner({selection,place,onGoal,onImpression}:{selection:Selection;place:string;onGoal:(goal:Goal,attribution:HouseAttribution)=>void;onImpression:(id:string)=>void}) {
  const node=useRef<HTMLElement>(null);const counted=useRef(new Set<string>());
  const house=selection?.type==='HOUSE_AD'?selection:null;
  const key=house?house.campaign.id+':'+house.creative.id:'';
  useEffect(()=>{
    if(!house||!node.current||typeof IntersectionObserver==='undefined')return;
    let timer:ReturnType<typeof setTimeout>|undefined;let visible=false;
    const cancel=()=>{if(timer)clearTimeout(timer);timer=undefined;};
    const observe=()=>{
      cancel();if(!visible||document.visibilityState!=='visible'||counted.current.has(key))return;
      timer=setTimeout(()=>{if(!visible||document.visibilityState!=='visible'||counted.current.has(key))return;counted.current.add(key);onImpression(house.campaign.id);sendHouseEvent({campaignId:house.campaign.id,creativeId:house.creative.id},'impression');},1000);
    };
    const observer=new IntersectionObserver(entries=>{visible=entries.some(e=>e.isIntersecting&&e.intersectionRatio>=0.5);observe();},{threshold:[0,0.5,1]});
    observer.observe(node.current);document.addEventListener('visibilitychange',observe);
    return()=>{cancel();observer.disconnect();document.removeEventListener('visibilitychange',observe);};
  },[key]);
  if(!house)return null;
  const creative=presentHouseCreative(house.campaign.id,house.creative);
  return <aside ref={node} className='tcHouseAd tcPremiumAd' aria-label='Campaña propia de Trabajo Cerca' data-ad-type='HOUSE_AD' data-campaign={house.campaign.id} data-creative-family={house.campaign.goal==='professional'?'services':house.campaign.goal==='advertiser'?'business':'jobs'}>
    <div className='tcCampaignVisual' aria-hidden='true'><AdImage url={creative.imageUrl}/><span className='tcCreativeFallback'>Trabajo Cerca</span></div>
    <div className='tcCampaignCopy'><small className='tcCampaignEyebrow'>{house.campaign.goal==='professional'?'SERVICIOS Y OFICIOS':house.campaign.goal==='advertiser'?'NEGOCIOS Y FUNDADORES':'EMPLEO Y TERRITORIO'} · FOTO ILUSTRATIVA</small><h3>{creative.title}</h3><p className='tcHouseDesktop'>{creative.message}</p><p className='tcHouseMobile'>{creative.mobileMessage}</p>
    <span className='tcHouseBenefits'>✓ Presencia local · ✓ Contacto directo</span>
    <button type='button' onClick={()=>{const a={campaignId:house.campaign.id,creativeId:house.creative.id};sendHouseEvent(a,'click');onGoal(house.campaign.goal,a);}}>{creative.button}</button></div>
  </aside>;
}
