import {useEffect, useRef, useState} from 'react';
import {Radar} from 'lucide-react';

export const RADAR_TOWNS = [
  'Angol', 'Collipulli', 'Ercilla', 'Renaico', 'Mininco', 'Los Sauces',
  'Purén', 'Traiguén', 'Lumaco', 'Nacimiento', 'Negrete', 'Mulchén', 'Victoria',
] as const;

type RadarProps = {
  stats: Record<string, {jobs: number}>;
  ready: boolean;
  failed: boolean;
  updatedAt: string | null;
  selected: string;
  onSelect: (town: string) => void;
};

function knownTown(value: string) {
  return RADAR_TOWNS.includes(value as typeof RADAR_TOWNS[number]) ? value : null;
}

export function TerritorialRadar({stats, ready, failed, updatedAt, selected, onSelect}: RadarProps) {
  const node = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [foreground, setForeground] = useState(() => document.visibilityState === 'visible');
  const [expanded, setExpanded] = useState(() => window.matchMedia('(min-width:801px)').matches);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion:reduce)').matches);
  const [manual, setManual] = useState<string | null>(() => knownTown(selected));
  const [focusIndex, setFocusIndex] = useState(() => Math.floor(Date.now() / 3000) % RADAR_TOWNS.length);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => setVisible(entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.15)),
      {threshold: [0, 0.15]},
    );
    if (node.current) observer.observe(node.current);
    const changed = () => setForeground(document.visibilityState === 'visible');
    const media = window.matchMedia('(prefers-reduced-motion:reduce)');
    const motionChanged = () => setReducedMotion(media.matches);
    document.addEventListener('visibilitychange', changed);
    media.addEventListener('change', motionChanged);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', changed);
      media.removeEventListener('change', motionChanged);
    };
  }, []);

  useEffect(() => setManual(knownTown(selected)), [selected]);

  const rotating = ready && !failed && visible && foreground && expanded && !reducedMotion && !manual;
  useEffect(() => {
    if (!rotating) return;
    const timer = window.setInterval(() => setFocusIndex(index => (index + 1) % RADAR_TOWNS.length), 3000);
    return () => window.clearInterval(timer);
  }, [rotating]);

  const active = manual ?? RADAR_TOWNS[focusIndex];
  const count = (town: string) => {
    if (!ready || failed) return 'Sin datos';
    const jobs = stats[town]?.jobs ?? 0;
    return `${jobs} ${jobs === 1 ? 'oferta' : 'ofertas'}`;
  };

  return (
    <section id='neo-radar' ref={node} className='tcTerritorialRadar'
      aria-labelledby='tc-radar-title' data-animated={rotating}
      data-rotating={rotating} data-focus-town={active}>
      <div className='tcRadarHeading'>
        <div>
          <h2 id='tc-radar-title'>Radar territorial</h2>
          <p>Publicaciones del catálogo, sin rastreo en vivo.</p>
        </div>
        <Radar aria-hidden='true'/>
      </div>
      <details className='tcRadarDetails' open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
        <summary className='tcRadarExpand'>
          {expanded ? 'Ocultar las comunas' : 'Ver las 13 comunas'}
          <span aria-hidden='true'>{expanded ? '−' : '+'}</span>
        </summary>
        <div className='tcRadarExplorer'>
          <div className='tcRadarDial' aria-hidden='true'>
            <svg className='tcRadarGrid' viewBox='0 0 200 200' fill='none'>
              <circle cx='100' cy='100' r='98'/><circle cx='100' cy='100' r='65'/>
              <circle cx='100' cy='100' r='32'/><path d='M100 2v196M2 100h196'/>
            </svg>
            <div className='tcRadarSweep'/>
            {RADAR_TOWNS.map((town, index) => (
              <span key={town}
                className={'tcRadarPoint ' + (town === active ? 'selected' : failed || !ready ? 'unknown' : stats[town]?.jobs ? 'available' : 'empty')}
                style={{left: `${50 + Math.cos(index * 2.4) * (18 + (index % 3) * 10)}%`, top: `${50 + Math.sin(index * 2.4) * (18 + (index % 3) * 10)}%`}}/>
            ))}
            <div className='tcRadarCaption'>{active}<b>{count(active)}</b></div>
          </div>
          <div className='tcRadarTowns' role='group' aria-label='Localidades del radar'>
            {RADAR_TOWNS.map(town => (
              <button key={town} type='button' aria-pressed={manual === town}
                onClick={() => { setManual(town); onSelect(town); }}>
                <span>{town}</span><small>{count(town)}</small>
              </button>
            ))}
          </div>
        </div>
        <small className='tcRadarNote'>
          Cero publicaciones no significa ausencia de empleos.
          {updatedAt && Number.isFinite(Date.parse(updatedAt)) && <>
            {' '}Catálogo actualizado: <time dateTime={updatedAt}>{new Date(updatedAt).toLocaleString('es-CL')}</time>.
          </>}
        </small>
      </details>
    </section>
  );
}
