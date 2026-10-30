import {api} from '@appdeploy/client';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, MapPin, Megaphone, Newspaper } from 'lucide-react';
import { EXPLORATION_CITIES, safeSponsorUrl, sponsorMatchesPlace } from './territorial-exploration';
import { LABOR_NEWS, LABOR_NEWS_REVIEWED_ON, LABOR_RESOURCES, visibleLaborNews } from './labor-news';
import './territorial-sections.css';
import {AdImage} from './ad-image';

type Sponsor = {
  id:string; businessName:string; category:string; headline:string; detail:string;
  communes:string[]; url?:string; scope:string; imageUrl?:string; logoUrl?:string;endAt?:string;
};
type Track = (event:string, properties:Record<string,string|number|boolean|undefined>) => void;

export function NearbyCities({ stats, ready, failed, current, onExplore, onReturn, origin, compact=false }:{
  stats:Record<string,{jobs:number}>; ready:boolean; failed:boolean; current:string;
  onExplore:(city:string)=>void; onReturn:()=>void; origin:string; compact?:boolean;
}) {
  return <section className='tcExplore' aria-labelledby='tc-explore-title'>
    <div className='tcExploreIntro'>
      <h2 id='tc-explore-title' className='tcVisuallyHidden'>Buscar también en</h2>
      <p>Explora otras ciudades si te interesa trasladarte.</p>
    </div>
    <div className='tcExploreCities'>{EXPLORATION_CITIES.slice(0,compact?2:undefined).map(city => <button type='button'
      key={city} aria-pressed={current === city} onClick={() => onExplore(city)}>
      <MapPin aria-hidden='true'/><span><strong>{city}</strong><small>{failed ? 'Recuento no disponible' : !ready ? 'Consultando oportunidades…' : `${stats[city]?.jobs ?? 0} ${(stats[city]?.jobs ?? 0) === 1 ? 'oferta publicada' : 'ofertas publicadas'}`}</small></span><ArrowRight aria-hidden='true'/>
    </button>)}</div>
    {compact&&EXPLORATION_CITIES.length>2&&<details className='tcMoreCities'><summary>Ver otras ciudades</summary><div className='tcExploreCities'>{EXPLORATION_CITIES.slice(2).map(city=><button type='button' key={city} aria-pressed={current===city} onClick={()=>onExplore(city)}><MapPin aria-hidden='true'/><span><strong>{city}</strong><small>{failed?'Recuento no disponible':!ready?'Consultando oportunidades…':`${stats[city]?.jobs??0} ofertas publicadas`}</small></span><ArrowRight aria-hidden='true'/></button>)}</div></details>}
    {EXPLORATION_CITIES.some(city => city === current) && <button className='tcReturn' type='button' onClick={onReturn}>Volver a {origin === 'Todas' ? 'mi zona local' : origin}</button>}
    <small className='tcExploreNote'>Conteos publicados. Cero avisos no significa que no haya empleos en la ciudad.</small>
  </section>;
}

export function LocalAdvertising({ sponsor, place, loading, onAdvertise, track, placement='search' }:{
  sponsor:Sponsor|null; place:string; loading:boolean; onAdvertise:()=>void; track:Track; placement?:'search'|'listing';
}) {
  const element = useRef<HTMLElement>(null);
  const shown = useRef(new Set<string>());
  const eligible = sponsorMatchesPlace(sponsor, place) ? sponsor : null;
  const url = safeSponsorUrl(eligible?.url);
  function commercialEvent(event:'impression'|'click'){if(eligible)void api.post('/api/growth/commercial-events',{campaignId:eligible.id,event,eventId:crypto.randomUUID(),place,placement}).catch(()=>undefined);}
  useEffect(() => {
    const node = element.current;
    if (loading || !eligible || !node || typeof IntersectionObserver === 'undefined') return;
    const key = eligible.id + ':' + place + ':' + placement;
    if (shown.current.has(key)) return;
    let timer:ReturnType<typeof setTimeout>|undefined;
    const cancel = () => { if (timer) clearTimeout(timer); timer=undefined; };
    const observer = new IntersectionObserver(entries => {
      cancel();
      if (!entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.5) || document.visibilityState !== 'visible') return;
      timer = setTimeout(() => {
        if (document.visibilityState !== 'visible' || shown.current.has(key)) return;
        shown.current.add(key);
        commercialEvent('impression');
        track('tc_sponsor_viewable_impression', { sponsor_id:eligible.id, commune:place, scope:eligible.scope, surface:placement, visible_ms:1000 });
        observer.disconnect();
      }, 1000);
    }, { threshold:[0,0.5,1] });
    observer.observe(node);
    const visibilityChanged = () => { if (document.visibilityState !== 'visible') cancel(); };
    document.addEventListener('visibilitychange',visibilityChanged);
    return () => { cancel(); observer.disconnect(); document.removeEventListener('visibilitychange',visibilityChanged); };
  }, [eligible?.id, eligible?.scope, place, placement, loading]);
  return <section ref={element} className='tcLocalAdvertising' aria-label={'Publicidad · '+ (place === 'Todas' ? 'zona local' : place)} data-placement={placement}>
    <div className='tcAdLabel'><Megaphone aria-hidden='true'/><span>PUBLICIDAD{eligible?.scope === 'regional' ? ' REGIONAL' : ' LOCAL'}</span>
      <small>{place === 'Todas' ? 'Tu zona' : place}</small></div>
    {eligible && !loading ? <div className='tcAdContent tcPremiumCommercial' data-has-image={Boolean(eligible.imageUrl)}>{eligible.imageUrl&&<div className='tcCommercialVisual'><AdImage url={eligible.imageUrl}/><span className='tcCreativeFallback'>Publicidad local</span></div>}<div><div className='tcAdBusiness'><AdImage url={eligible.logoUrl} logo/><strong>{eligible.businessName}</strong></div><b>{eligible.headline}</b><p>{eligible.detail}</p>{eligible.endAt&&<small>Vigente hasta {new Date(eligible.endAt).toLocaleDateString('es-CL',{timeZone:'America/Santiago'})}</small>}</div>
      {url && <a href={url} target='_blank' rel='noopener noreferrer' onClick={() => {commercialEvent('click');track('tc_sponsor_click', { sponsor_id:eligible.id, commune:place, scope:eligible.scope, surface:placement });}}>{url.startsWith('https://wa.me/')?'Hablar por WhatsApp':'Conocer negocio'} <ArrowRight aria-hidden='true'/></a>}
    </div> : <div className='tcAdContent'><div><strong>{loading ? 'Consultando publicidad de esta zona…' : `Tu negocio, cerca de quienes buscan trabajo${place === 'Todas' ? '' : ' en '+place}`}</strong>
      <p>Espacio disponible para comercios y servicios locales. Sin cobros activos.</p></div><button type='button' onClick={onAdvertise}>Anunciar aquí <ArrowRight aria-hidden='true'/></button></div>}
  </section>;
}

export function LaborNewsSection() {
  const news = visibleLaborNews(LABOR_NEWS);
  const [expanded,setExpanded]=useState(false);
  const shown=expanded?news:news.slice(0,2);
  const resource=(item:typeof LABOR_RESOURCES[number])=><a key={item.source} href={item.url} target='_blank' rel='noopener noreferrer'><span><b>{item.source}</b><small>{item.title}</small></span><ArrowRight aria-hidden='true'/></a>;
  return <section className='tcLaborNews tcCompactNews' data-expanded={expanded} aria-labelledby='tc-news-title'>
    <header><div><h2 id='tc-news-title' className='tcVisuallyHidden'>Actualidad laboral de La Araucanía</h2><p>Noticias y enlaces útiles para tu vida laboral.</p></div><Newspaper aria-hidden='true'/></header>
    <div className='tcNewsLayout'><div className='tcNewsArticles'>
      {shown.length?shown.map(item=><article key={item.id} data-news-id={item.id}>
        <span className='tcNewsTopic'>{item.topic}</span><h3>{item.title}</h3><p>{item.summary}</p>
        <div className='tcNewsBottom'><small>{item.source} · <time dateTime={item.publishedOn}>{item.publishedOn.split('-').reverse().join('/')}</time></small><a href={item.url} target='_blank' rel='noopener noreferrer'>Leer noticia <ArrowRight aria-hidden='true'/></a></div>
      </article>):<p className='tcNewsEmpty'>Todavía no hay noticias recientes revisadas. Puedes consultar las fuentes oficiales.</p>}
      {news.length>0&&<button className='tcNewsExpand' type='button' aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded?'Volver al resumen':'Ver toda la actualidad'} <span aria-hidden='true'>{expanded?'−':'+'}</span></button>}
      <small className='tcNewsReview'>Selección revisada el {LABOR_NEWS_REVIEWED_ON.split('-').reverse().join('/')}. Las noticias no son ofertas.</small>
    </div><aside aria-labelledby='tc-resources-title'><h3 id='tc-resources-title'>Trámites y fuentes oficiales</h3>
      {LABOR_RESOURCES.slice(0,3).map(resource)}
      <details className='tcResourceMore'><summary>Ver todos los recursos <span aria-hidden='true'>+</span></summary>{LABOR_RESOURCES.slice(3).map(resource)}</details>
    </aside></div>
  </section>;
}
