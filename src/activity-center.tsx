import {useEffect,useRef} from 'react';
import {Bell,X} from 'lucide-react';

export function ActivityCenter({places,place,count,unread,known,complete,failed,onPlace,onOpen,onRefresh,onPush,onClose}:{places:string[];place:string;count:number;unread:number;known:boolean;complete:boolean;failed:boolean;onPlace:(town:string)=>void;onOpen:(unreadOnly:boolean)=>void;onRefresh:()=>void;onPush:()=>void;onClose:()=>void}) {
 const node=useRef<HTMLDivElement>(null);
 const close=useRef(onClose);close.current=onClose;
 useEffect(()=>{
   const previous=document.activeElement as HTMLElement|null;
   const root=node.current;root?.focus();
   const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
   const key=(e:KeyboardEvent)=>{
     if(e.key==='Escape'){e.preventDefault();close.current();}
     if(e.key==='Tab'&&root){const controls=[...root.querySelectorAll<HTMLElement>('button:not(:disabled),select')];const first=controls[0],last=controls[controls.length-1];if(e.shiftKey&&(document.activeElement===first||document.activeElement===root)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
   };
   document.addEventListener('keydown',key);
   return()=>{document.removeEventListener('keydown',key);document.body.style.overflow=overflow;previous?.isConnected&&previous.focus();};
 },[]);
 return <div className='modal tcActivityBackdrop' role='presentation'>
  <div ref={node} className='tcActivityCenter' role='dialog' aria-modal='true' aria-labelledby='tc-activity-title' tabIndex={-1}>
    <button type='button' className='tcActivityClose' aria-label='Cerrar novedades' onClick={onClose}><X/></button>
    <div className='tcActivityHeading'><Bell aria-hidden='true'/><div><h2 id='tc-activity-title'>Novedades</h2><p>Ofertas incorporadas durante los últimos 7 días.</p></div></div>
    <label className='tcActivitySelect'>Localidad<select value={place} onChange={e=>onPlace(e.target.value)}>{places.map(town=><option key={town}>{town}</option>)}</select></label>
    <div className='tcActivityMetric' role='status'><strong>{failed?'—':!complete?'…':count}</strong><span>{failed?'No se pudo actualizar':!complete?'Cargando ofertas…':'ofertas incorporadas en 7 días'}</span></div>
    <div className='tcActivityActions'>
      <button type='button' onClick={()=>onOpen(false)}>Ver incorporadas</button>
      {known&&<button type='button' onClick={()=>onOpen(true)}>No leídas ({complete?unread:'…'})</button>}
      <button type='button' onClick={onRefresh}>Actualizar catálogo</button>
    </div>
    <button type='button' className='tcActivityPush' onClick={onPush}><Bell aria-hidden='true'/> Notificaciones automáticas (opcional)</button>
    <small>Estas novedades se pueden consultar sin cuenta. Solo las alertas con la app cerrada requieren iniciar sesión y permitir notificaciones en el teléfono.</small>
  </div>
 </div>;
}
