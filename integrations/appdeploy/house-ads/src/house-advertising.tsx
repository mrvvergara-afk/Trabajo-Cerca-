import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@appdeploy/client';
import { allocateAdvertising, type HouseCampaign, type CommercialAd, type Goal, type Selection } from '../shared/house-ads';
import './house-advertising.css';
import {AdImage} from './ad-image';
import {presentHouseCreative} from './house-creative-presentation';
export type HouseAttribution = {campaignId:string; creativeId:string};
export function sendHouseEvent(a:HouseAttribution,event:'impression'|'click'|'form_started') {
  void api.post('/api/growth/house-events',{...a,event,eventId:crypto.randomUUID()}).catch(()=>undefined);
}
const readSession = <T,>(key:string,fallback:T):T => {try{return JSON.parse(sessionStorage.getItem(key)||'null')??fallback;}catch{return fallback;}};
export function completedHouseGoals():Goal[] {return readSession<Goal[]>('tc-house-completed',[]);}
export function completeHouseGoal(goal:Goal) {
  if (completedHouseGoals().includes(goal)) return;
  try {sessionStorage.setItem('tc-house-completed',JSON.stringify([...new Set([...completedHouseGoals(),goal])]));window.dispatchEvent(new Event('tc-house-completed'));}catch{/* Session-only suppression is best effort. */}
}
export function useAdvertising(place:string,category:string,page='home') {
  const [catalog,setCatalog]=useState<{house:HouseCampaign[];commercial:CommercialAd[];complete:boolean}|null>(null);
  const [failed,setFailed]=useState(false);
  const [completed,setCompleted]=useState(completedHouseGoals);
  const [turn]=useState(()=>{
    const previous=readSession<number>('tc-house-turn',0);const next=Number.isSafeInteger(previous)?previous+1:1;
    try{sessionStorage.setItem('tc-house-turn',JSON.stringify(next));}catch{/* Memory allocation still works. */}return next;
  });
  const seen=useRef(readSession<Record<string,number>>('tc-house-seen',{}));
  useEffect(()=>{
    let active=true;
    void api.get('/api/growth/advertising?place='+encodeURIComponent(place)+'&turn='+turn).then(r=>{if(active){setCatalog(r.data);setFailed(false);}}).catch(()=>{if(active)setFailed(true);});
    return()=>{active=false;};
  },[place,turn]);
  useEffect(()=>{const changed=()=>setCompleted(completedHouseGoals());window.addEventListener('tc-house-completed',changed);return()=>window.removeEventListener('tc-house-completed',changed);},[]);
  // Reassess editorial dates each minute without additional SDK requests.
  const [now,setNow]=useState(Date.now);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),60000);return()=>clearInterval(timer);},[]);
  const selections=useMemo(()=>allocateAdvertising({house:catalog?.house??[],commercial:catalog?.commercial??[],complete:catalog?.complete===true,place,category,page,now,turn,seen:seen.current,completed,slots:['search','listing']}),[catalog,place,category,page,now,turn,completed]);
  function impression(id:string){seen.current[id]=(seen.current[id]??0)+1;try{sessionStorage.setItem('tc-house-seen',JSON.stringify(seen.current));}catch{/* Keep in memory. */}}
  return {selections,impression,loading:!catalog&&!failed,failed};
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
  return <aside ref={node} className='tcHouseAd tcPremiumAd' aria-label='Campaña propia de Trabajo Cerca' data-ad-type='HOUSE_AD'>
    <div className='tcCampaignVisual' aria-hidden='true'><AdImage url={creative.imageUrl}/><span className='tcCreativeFallback'>Trabajo Cerca</span>{house.campaign.id==='house-advertisers'&&<span className='tcCreativeExample'>Ejemplo institucional</span>}</div>
    <div className='tcCampaignCopy'><small>CAMPAÑA PROPIA · {place==='Todas'?'TU ZONA':place}</small><h3>{creative.title}</h3><p className='tcHouseDesktop'>{creative.message}</p><p className='tcHouseMobile'>{creative.mobileMessage}</p>{house.campaign.goal==='advertiser'&&<small>Sin cobros automáticos. Condiciones en el formulario.</small>}
    <button type='button' onClick={()=>{const a={campaignId:house.campaign.id,creativeId:house.creative.id};sendHouseEvent(a,'click');onGoal(house.campaign.goal,a);}}>{creative.button} <span aria-hidden='true'>→</span></button></div>
  </aside>;
}
