import { useEffect, useRef } from 'react';
import { ArrowRight, MapPin, Megaphone, Newspaper } from 'lucide-react';
import { EXPLORATION_CITIES, safeSponsorUrl, sponsorMatchesPlace } from './territorial-exploration';
import { LABOR_NEWS, LABOR_NEWS_REVIEWED_ON, LABOR_RESOURCES, visibleLaborNews } from './labor-news';
import './territorial-sections.css';

type Sponsor = {
  id:string; businessName:string; category:string; headline:string; detail:string;
  communes:string[]; url?:string; scope:string;
};
type Track = (event:string, properties:Record<string,string|number|boolean|undefined>) => void;

export function NearbyCities({ stats, ready, failed, current, onExplore, onReturn, origin }:{
  stats:Record<string,{jobs:number}>; ready:boolean; failed:boolean; current:string;
  onExplore:(city:string)=>void; onReturn:()=>void; origin:string;
}) {
  return <section className='tcExplore' aria-labelledby='tc-explore-title'>
    <div className='tcExploreIntro'><span className='neoKicker'>TÚ ELIGES HASTA DÓNDE BUSCAR</span>
      <h2 id='tc-explore-title'>Buscar también en</h2>
      <p>Explora estas ciudades si te interesa trasladarte. Sus ofertas se consultan aparte de tu zona local.</p>
    </div>
    <div className='tcExploreCities'>{EXPLORATION_CITIES.map(city => <button type='button'
      key={city} aria-pressed={current === city} onClick={() => onExplore(city)}>
      <MapPin aria-hidden='true'/><span><strong>{city}</strong><small>{failed ? 'Recuento no disponible' : !ready ? 'Consultando oportunidades…' : `${stats[city]?.jobs ?? 0} ${(stats[city]?.jobs ?? 0) === 1 ? 'oferta publicada' : 'ofertas publicadas'}`}</small></span><ArrowRight aria-hidden='true'/>
    </button>)}</div>
    {EXPLORATION_CITIES.some(city => city === current) && <button className='tcReturn' type='button' onClick={onReturn}>Volver a {origin === 'Todas' ? 'mi zona local' : origin}</button>}
    <small className='tcExploreNote'>Conteos del inventario completo publicado. Cero ofertas no significa que no existan empleos en la ciudad.</small>
  </section>;
}

export function LocalAdvertising({ sponsor, place, loading, onAdvertise, track, placement='search' }:{
  sponsor:Sponsor|null; place:string; loading:boolean; onAdvertise:()=>void; track:Track; placement?:'search'|'listing';
}) {
  const element = useRef<HTMLElement>(null);
  const shown = useRef(new Set<string>());
  const eligible = sponsorMatchesPlace(sponsor, place) ? sponsor : null;
  const url = safeSponsorUrl(eligible?.url);
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
    {eligible && !loading ? <div className='tcAdContent'><div><strong>{eligible.businessName}</strong><b>{eligible.headline}</b><p>{eligible.detail}</p></div>
      {url && <a href={url} target='_blank' rel='noopener noreferrer' onClick={() => track('tc_sponsor_click', { sponsor_id:eligible.id, commune:place, scope:eligible.scope, surface:placement })}>Conocer negocio <ArrowRight aria-hidden='true'/></a>}
    </div> : <div className='tcAdContent'><div><strong>{loading ? 'Consultando publicidad de esta zona…' : `Tu negocio, cerca de quienes buscan trabajo${place === 'Todas' ? '' : ' en '+place}`}</strong>
      <p>Espacio disponible para comercios y servicios locales. Sin cobros activos.</p></div><button type='button' onClick={onAdvertise}>Anunciar aquí <ArrowRight aria-hidden='true'/></button></div>}
  </section>;
}

export function LaborNewsSection() {
  const news = visibleLaborNews(LABOR_NEWS);
  return <section className='tcLaborNews' id='actualidad-laboral' aria-labelledby='tc-news-title'>
    <header><div><span className='neoKicker'>INFORMACIÓN ÚTIL PARA TU VIDA LABORAL</span><h2 id='tc-news-title'>Actualidad laboral de La Araucanía</h2>
      <p>Empleo, ferias, capacitación, concursos y previsión. Selección informativa, sin contenido político ni sindical.</p></div><Newspaper aria-hidden='true'/></header>
    <div className='tcNewsLayout'><div className='tcNewsArticles'>{news.length ? news.map(item => <article key={item.id}>
      <span className='tcNewsTopic'>{item.topic} · {item.region}</span><h3>{item.title}</h3><p>{item.summary}</p>
      <small>{item.source} · Publicado el <time dateTime={item.publishedOn}>{item.publishedOn.split('-').reverse().join('/')}</time></small>
      <a href={item.url} target='_blank' rel='noopener noreferrer'>Leer en la fuente original <ArrowRight aria-hidden='true'/></a>
    </article>) : <p className='tcNewsEmpty'>Todavía no hay noticias recientes revisadas. Puedes consultar las fuentes oficiales de esta sección.</p>}
      <small className='tcNewsReview'>Selección revisada el {LABOR_NEWS_REVIEWED_ON.split('-').reverse().join('/')}. Las noticias no son ofertas ni suman al contador.</small>
    </div><aside aria-labelledby='tc-resources-title'><h3 id='tc-resources-title'>Trámites y fuentes oficiales</h3><p>Accesos permanentes; no son noticias nuevas ni recomendaciones comerciales.</p>
      {LABOR_RESOURCES.map(item => <a key={item.source} href={item.url} target='_blank' rel='noopener noreferrer'><span><b>{item.title}</b><small>{item.source}</small></span><ArrowRight aria-hidden='true'/></a>)}
    </aside></div>
  </section>;
}

