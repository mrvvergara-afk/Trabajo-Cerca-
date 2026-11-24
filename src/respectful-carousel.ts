import {useEffect,useRef,useState,type TouchEvent} from 'react';
/** Artwork only, NOT a billing/view event. Auto-rotate only while >=50% visible.
 * Reduced-motion and manual interaction prevent automatic movement. */
export function useRespectfulCarousel(identity:string,count=3){
 const total=Math.max(1,Math.min(6,Math.floor(count)||1));
 const ref=useRef<HTMLElement|null>(null),start=useRef<{x:number;y:number}|null>(null);
 const [index,setIndex]=useState(0),[visible,setVisible]=useState(false);
 const [motion,setMotion]=useState(false),[paused,setPaused]=useState(false),[hover,setHover]=useState(false);
 const attach=(node:HTMLElement|null)=>{ref.current=node;};
 useEffect(()=>{setIndex(0);setPaused(false);setHover(false);},[identity]);
 useEffect(()=>{
  const node=ref.current;if(!node||typeof IntersectionObserver==='undefined')return;
  let intersecting=false;
  const refresh=()=>setVisible(intersecting&&document.visibilityState==='visible');
  const obs=new IntersectionObserver(events=>{intersecting=events.some(e=>e.isIntersecting&&e.intersectionRatio>=0.5);refresh();},{threshold:[0,.5,1]});
  obs.observe(node);document.addEventListener('visibilitychange',refresh);
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');
  const changed=()=>setMotion(!media.matches);changed();media.addEventListener('change',changed);
  return()=>{obs.disconnect();document.removeEventListener('visibilitychange',refresh);media.removeEventListener('change',changed);};
 },[identity]);
 useEffect(()=>{
  if(!visible||!motion||paused||hover)return;
  const timer=window.setInterval(()=>setIndex(n=>(n+1)%total),5500);
  return()=>window.clearInterval(timer);
 },[visible,motion,paused,hover,identity,total]);
 const choose=(n:number)=>{setPaused(true);setIndex(((n%total)+total)%total);};
 const onTouchStart=(e:TouchEvent<HTMLElement>)=>{const t=e.touches[0];if(t)start.current={x:t.clientX,y:t.clientY};};
 const onTouchEnd=(e:TouchEvent<HTMLElement>)=>{
  const prior=start.current;start.current=null;const t=e.changedTouches[0];if(!prior||!t)return;
  const dx=t.clientX-prior.x,dy=t.clientY-prior.y;
  if(Math.abs(dx)>=36&&Math.abs(dx)>1.5*Math.abs(dy)){setPaused(true);setIndex(n=>(n+(dx<0?1:total-1))%total);}
 };
 const hoverHandlers={
  onMouseEnter:()=>setHover(true),onMouseLeave:()=>setHover(false),
  onFocusCapture:()=>setHover(true),
  onBlurCapture:(e:{currentTarget:HTMLElement;relatedTarget:EventTarget|null})=>{
   if(!e.currentTarget.contains(e.relatedTarget as Node|null))setHover(false);
  }
 };
 return{index,choose,attach,onTouchStart,onTouchEnd,hoverHandlers};
}
