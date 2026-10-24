import {useEffect,useRef} from 'react';
import {X} from 'lucide-react';
export function ActivityCenter({places,place,count,unread,known,complete,failed,onPlace,onOpen,onRefresh,onPush,onClose}:{places:string[];place:string;count:number;unread:number;known:boolean;complete:boolean;failed:boolean;onPlace:(town:string)=>void;onOpen:(unreadOnly:boolean)=>void;onRefresh:()=>void;onPush:()=>void;onClose:()=>void}) {
 const node=useRef<HTMLDivElement>(null);const close=useRef(onClose);close.current=onClose;
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;const root=node.current;root?.focus();const overflow=document.body.style.overflow;document.body.style.overflow='hidden';const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();close.current();}if(e.key==='Tab'&&root){const controls=[...root.querySelectorAll<HTMLElement>('button:not(:disabled),select')];const first=controls[0],last=controls[controls.length-1];if(e.shiftKey&&(document.activeElement===first||document.activeElement===root)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);document.body.style.overflow=overflow;previous?.isConnected&&previous.focus();};},[]);
 return <div className='modal tcActivityBackdrop'><div ref={node} className='tcActivityCenter' role='dialog' aria-modal='true' aria-labelledby='tc-activity-title' tabIndex={-1}>
  <button className='tcActivityClose' aria-label='Cerrar novedades' onClick={onClose}><X/></button><h2 id='tc-activity-title'>Centro de novedades</h2>
  <p>Incorporaciones en Trabajo Cerca durante los últimos siete días. La fecha original del aviso se conserva.</p>
  <label>Localidad<select value={place} onChange={e=>onPlace(e.target.value)}>{places.map(town=><option key={town}>{town}</option>)}</select></label>
  <p role='status'>{failed?'No se pudo completar la consulta.':!complete?'Cargando más resultados…':`${count} incorporadas en siete días.`}</p>
  <button onClick={()=>onOpen(false)}>Ver incorporadas en 7 días</button>
  {known?<><p>{complete?unread:'…'} no leídas entre las incorporadas. Historial solo de este dispositivo.</p><button onClick={()=>onOpen(true)}>Ver no leídas</button></>:<p>Sin historial de lectura anterior en este dispositivo. No sabemos qué avisos has leído en otros lugares.</p>}
  <button onClick={onRefresh}>Actualizar catálogo</button><hr/><b>Notificaciones push: en preparación</b><p>El centro funciona sin permisos ni envíos externos.</p><button onClick={onPush}>Información sobre notificaciones push</button>
 </div></div>;
}
