import { useRef } from 'react';
import { Menu } from 'lucide-react';
import { AdministratorShortcut } from './administrator-access';
type Props = { onAlerts:()=>void; onInstall:()=>void; onService:()=>void; onContribute:()=>void; onCities:()=>void; onNews:()=>void; onPeople:()=>void; onAdvertise:()=>void };
export function SiteMenu(props:Props) {
  const menu=useRef<HTMLDetailsElement>(null);
  function close(){if(menu.current)menu.current.open=false;}
  function action(callback:()=>void){close();callback();}
  return <details className='tcSiteMenu' ref={menu} onKeyDown={event=>{
    if(event.key==='Escape'){close();menu.current?.querySelector('summary')?.focus();event.stopPropagation();}
  }}>
    <summary aria-label='Abrir menú de Trabajo Cerca'><Menu aria-hidden='true'/><span>Menú</span></summary>
    <div className='tcSiteMenuPanel' role='region' aria-label='Menú de Trabajo Cerca'>
      <nav aria-label='Más opciones'>
        <button onClick={()=>action(props.onAdvertise)}>Promocionar mi negocio</button>
        <button onClick={()=>action(props.onPeople)}>Ver personas y oficios</button>
        <button onClick={()=>action(props.onService)}>Necesito un servicio</button>
        <button onClick={()=>action(()=>document.getElementById('neo-radar')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}))}>Radar territorial</button>
        <button onClick={()=>action(props.onCities)}>Buscar en otras ciudades</button>
        <button onClick={()=>action(props.onNews)}>Actualidad laboral</button>
        <button onClick={()=>action(props.onContribute)}>Compartir un aviso con el Radar</button>
        <button onClick={()=>action(props.onAlerts)}>Configurar avisos</button>
        <button onClick={()=>action(props.onInstall)}>Instalar app</button>
      </nav>
      <AdministratorShortcut inline/>
      <button className='tcCloseSiteMenu' onClick={()=>{close();menu.current?.querySelector('summary')?.focus();}}>Cerrar menú principal</button>
    </div>
  </details>;
}
