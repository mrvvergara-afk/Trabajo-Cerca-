import {useEffect,useState} from 'react';
import {api} from '@appdeploy/client';
import {cityCounts,executiveKpis,knownCount,type AdminSnapshot} from './executive-metrics';
import './executive-control-center.css';

type TerritoryResult={readOnly?:boolean;checkedAt?:string;feedComplete?:boolean;sourceAuditComplete?:boolean;communes?:unknown[]};
type GeminiStatus={state?:string;at?:string;received?:number;queued?:number;alreadyQueued?:number;needsReview?:number;verificationRetriesPending?:number};
type Health={motorB?:unknown;motorC?:unknown;motorCGithubPull?:unknown};

function dateText(input:unknown) {
  if(typeof input!=='string'||!Number.isFinite(Date.parse(input)))return 'Sin datos';
  return new Date(input).toLocaleString('es-CL',{dateStyle:'short',timeStyle:'short'});
}
function isRecord(value:unknown):value is Record<string,unknown> {
  return value!==null&&typeof value==='object'&&!Array.isArray(value);
}

/** Private read-only executive overview. Parent mounts this ONLY after admin session verification. */
export function ExecutiveControlCenter({summary}:{summary?:AdminSnapshot}){
  const [territory,setTerritory]=useState<TerritoryResult|null>(null);
  const [gemini,setGemini]=useState<GeminiStatus|null>(null);
  const [health,setHealth]=useState<Health|null>(null);
  const [retry,setRetry]=useState(0);
  const [loading,setLoading]=useState(true);
  const [issues,setIssues]=useState<string[]>([]);
  useEffect(()=>{
    let active=true;
    setLoading(true);
    const urls=[
      '/api/admin/territorial-coverage',
      '/api/admin/gemini/status',
      '/api/admin/motors/health',
    ];
    void Promise.allSettled(urls.map(url=>api.get(url))).then(results=>{
      if(!active)return;
      const bad:string[]=[];
      const take=(index:number)=>{
        const result=results[index];
        if(result.status!=='fulfilled'||!isRecord(result.value.data)){bad.push(urls[index]);return null;}
        return result.value.data;
      };
      const sources=take(0),g=take(1),h=take(2);
      setTerritory(sources as TerritoryResult|null);
      setGemini(g as GeminiStatus|null);
      setHealth(h as Health|null);
      setIssues(bad);setLoading(false);
    });
    return()=>{active=false;};
  },[retry]);
  const cards=executiveKpis(summary);
  const cities=cityCounts(territory);
  const availableMotors=[
    ['Motor A','Sin reporte comparable'],
    ['Motor B',isRecord(health?.motorB)?'Registro disponible':'Sin datos'],
    ['Motor C',isRecord(health?.motorC)?'Registro disponible':'Sin datos'],
    ['Motor D','Sin reporte comparable'],
    ['Motor ChatGPT','Sin reporte comparable'],
    ['Motor Gemini',gemini?.state?'Importación: '+gemini.state:'Sin datos'],
  ];
  return <div className='tcExecCenter' aria-label='Centro de Control ejecutivo'>
    <header className='tcExecHeading'>
      <div><strong>Centro de Control</strong>
        <p>Indicadores confirmados. Una fuente intentada no equivale a una lectura útil.</p></div>
      <button type='button' onClick={()=>setRetry(n=>n+1)} disabled={loading}>{loading?'Consultando…':'Actualizar datos'}</button>
    </header>
    <div className='tcExecKpis'>
      {cards.map(card=><article key={card.key}>
        <span>{card.label}</span><strong>{card.value}</strong><small>{card.note}</small>
      </article>)}
    </div>
    <p className='tcExecContext'>Las ofertas visibles son el total actual del catálogo, no altas del día. Las cifras de cobertura y salud se mostrarán cuando los seis motores informen lecturas útiles y ejecuciones comparables.</p>
    {issues.length>0&&<p className='tcExecNotice' role='status'>Datos administrativos parciales: no respondieron {issues.length} de 3 consultas. Las métricas no disponibles se muestran sin inventar valores.</p>}
    <div className='tcExecColumns'>
      <section className='tcExecCard' aria-label='Rastreo e importación'>
        <h4>Rastreo e importación</h4>
        <p>Estado de los motores; no confirma ofertas nuevas publicadas.</p>
        <dl>{availableMotors.map(([name,status])=><div key={name}><dt>{name}</dt><dd>{status}</dd></div>)}</dl>
        <p className='tcExecMeta'>Puente Gemini · registros recibidos: {knownCount(gemini?.received)} · encolados nuevos: {knownCount(gemini?.queued)} · reintentos pendientes: {knownCount(gemini?.verificationRetriesPending)}</p>
        <p className='tcExecMeta'>Último registro de importación Gemini: {dateText(gemini?.at)}</p>
      </section>
      <section className='tcExecCard' aria-label='Control territorial'>
        <h4>Control territorial</h4>
        <p>Solo 12 comunas principales. Temuco y Los Ángeles se gestionan aparte.</p>
        <p className='tcExecMeta'>Catálogo completo: {territory?.feedComplete===true?'Sí':territory?.feedComplete===false?'No acreditado':'Sin datos'} · Auditoría de fuentes completa: {territory?.sourceAuditComplete===true?'Sí':territory?.sourceAuditComplete===false?'No acreditada':'Sin datos'}</p>
        <details>
          <summary>Ver detalle por comuna</summary>
          <div className='tcExecTableWrap'><table>
            <thead><tr><th scope='col'>Comuna</th><th scope='col'>Visibles</th><th scope='col'>Auditadas / previstas</th><th scope='col'>Con falla</th></tr></thead>
            <tbody>{cities.map(row=><tr key={row.city}><th scope='row'>{row.city}</th><td>{row.visible}</td><td>{row.audited} / {row.expected}</td><td>{row.failed}</td></tr>)}</tbody>
          </table></div>
        </details>
        <p className='tcExecMeta'>«Auditadas» significa con registro de inspección, no lectura efectiva ni ofertas encontradas.</p>
        <p className='tcExecMeta'>Fuente: informe territorial administrativo · {dateText(territory?.checkedAt)}</p>
      </section>
    </div>
    <footer className='tcExecFooter'>Solo lectura · Sin información personal · Sin publicaciones ni ejecuciones manuales</footer>
  </div>;
}
