import {useEffect,useRef,useState} from 'react';
import {Radar} from 'lucide-react';
export const RADAR_TOWNS=['Angol','Collipulli','Ercilla','Renaico','Mininco','Los Sauces','Purén','Traiguén','Lumaco','Nacimiento','Negrete','Mulchén','Victoria'] as const;
export function TerritorialRadar({stats,ready,failed,updatedAt,selected,onSelect}:{stats:Record<string,{jobs:number}>;ready:boolean;failed:boolean;updatedAt:string|null;selected:string;onSelect:(town:string)=>void}) {
 const node=useRef<HTMLElement>(null);const [visible,setVisible]=useState(false);const [foreground,setForeground]=useState(()=>document.visibilityState==='visible');const [expanded,setExpanded]=useState(()=>window.matchMedia('(min-width:801px)').matches);
 useEffect(()=>{const observer=new IntersectionObserver(entries=>setVisible(entries.some(e=>e.isIntersecting)));if(node.current)observer.observe(node.current);const changed=()=>setForeground(document.visibilityState==='visible');document.addEventListener('visibilitychange',changed);return()=>{observer.disconnect();document.removeEventListener('visibilitychange',changed);};},[]);
 const active=RADAR_TOWNS.includes(selected as typeof RADAR_TOWNS[number])?selected:'Angol';
 const count=(town:string)=>!ready||failed?'Sin datos':`${stats[town]?.jobs??0} ${(stats[town]?.jobs??0)===1?'oferta':'ofertas'}`;
 return <section id='neo-radar' ref={node} className='tcTerritorialRadar' aria-labelledby='tc-radar-title' data-animated={visible&&foreground}>
  <div className='tcRadarHeading'><div><h2 id='tc-radar-title'>Explora tu territorio</h2><p>Publicaciones del catálogo, sin rastreo en vivo.</p></div><Radar aria-hidden='true'/></div>
  <details className='tcRadarDetails' open={expanded} onToggle={event=>setExpanded(event.currentTarget.open)}>
   <summary className='tcRadarExpand'>{expanded?'Ocultar comunas':'Explorar las 13 localidades'} <span aria-hidden='true'>{expanded?'−':'+'}</span></summary>
   <div className='tcRadarExplorer'><div className='tcRadarDial' aria-hidden='true'><svg className='tcRadarGrid' viewBox='0 0 200 200' fill='none'><circle cx='100' cy='100' r='98'/><circle cx='100' cy='100' r='65'/><circle cx='100' cy='100' r='32'/><path d='M100 2v196M2 100h196'/></svg><div className='tcRadarSweep'/>{RADAR_TOWNS.map((town,i)=><span key={town} className={'tcRadarPoint '+(town===active?'selected':failed||!ready?'unknown':stats[town]?.jobs?'available':'empty')} style={{left:`${50+Math.cos(i*2.4)*(18+(i%3)*10)}%`,top:`${50+Math.sin(i*2.4)*(18+(i%3)*10)}%`}}/>)}<div className='tcRadarCaption'>{active}<b>{count(active)}</b></div></div>
   <div className='tcRadarTowns' role='group' aria-label='Localidades del radar'>{RADAR_TOWNS.map(town=><button key={town} type='button' aria-pressed={selected===town} onClick={()=>onSelect(town)}><span>{town}</span><small>{count(town)}</small></button>)}</div></div>
   <small className='tcRadarNote'>Cero publicaciones no significa ausencia de empleos. {updatedAt&&Number.isFinite(Date.parse(updatedAt))&&<>Catálogo actualizado: <time dateTime={updatedAt}>{new Date(updatedAt).toLocaleString('es-CL')}</time>.</>}</small>
  </details>
 </section>;
}
