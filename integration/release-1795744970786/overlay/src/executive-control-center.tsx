import { useEffect, useState } from 'react';
import { api } from '@appdeploy/client';
import { administratorDenialStatus } from './administrator-permission';
import {
  executiveKpis,
  knownCount,
  type AdminSnapshot,
  type Telemetry,
} from './executive-metrics';
import {
  ActivityChart,
  SourceDonut,
  ExecutiveStatusBar,
} from './executive-charts';
import './executive-control-center.css';
import { EngineCommand } from './engine-command';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function isTelemetry(value: unknown): value is Telemetry {
  const r = isRecord(value) ? value : {};
  return (
    r.schemaVersion === 1 &&
    r.readOnly === true &&
    Array.isArray(r.engines) &&
    isRecord(r.rollup) &&
    Array.isArray(r.history)
  );
}
function timeText(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))
    return 'Sin datos';
  return new Date(value).toLocaleString('es-CL', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Santiago',
  });
}
export function ExecutiveControlCenter({
  summary,
  onSessionDenied,
}: {
  summary?: AdminSnapshot;
  onSessionDenied?: (status: 401 | 403) => void;
}) {
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [publicVerifiedTotal, setPublicVerifiedTotal] = useState<number | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failures, setFailures] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    const urls = [
      '/api/admin/ops-telemetry',
      '/api/listings?limit=1',
    ];
    const requests = urls.map(url => api.get(url).catch(cause => {
      const status = administratorDenialStatus(cause);
      if (active && status && url.startsWith('/api/admin/')) onSessionDenied?.(status);
      throw cause;
    }));
    void Promise.allSettled(requests).then(results => {
      if (!active) return;
      const problems: string[] = [];
      const [motorReport, catalogue] = results;
      if (motorReport.status === 'fulfilled' && isTelemetry(motorReport.value.data)) {
        setTelemetry(motorReport.value.data);
      } else {
        setTelemetry(null);
        problems.push('telemetría de motores');
      }
      const publicData = catalogue.status === 'fulfilled' && isRecord(catalogue.value.data)
        ? catalogue.value.data : null;
      const count = publicData?.totalVerifiedJobOffers;
      if (publicData && Array.isArray(publicData.items) &&
          publicData.items.length > 0 &&
          Number.isSafeInteger(count) && typeof count === 'number' &&
          count >= publicData.items.length &&
          publicData.degraded !== true &&
          publicData.feedRebuilding !== true &&
          publicData.totalsProvisional !== true) {
        setPublicVerifiedTotal(count);
      } else {
        setPublicVerifiedTotal(null);
        problems.push('catálogo público verificado');
      }
      setFailures(problems);
      setCheckedAt(new Date().toISOString());
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [refresh, onSessionDenied]);
  useEffect(()=>{
    const timer=setInterval(()=>setRefresh(n=>n+1),4*60_000);
    return ()=>clearInterval(timer);
  },[]);
  const cards = executiveKpis(summary, telemetry, publicVerifiedTotal);
  return (
    <section
      className="tcExecCenter"
      aria-label="Centro de Control de Trabajo Cerca"
    >
      <header className="tcExecHero">
        <div className="tcExecHeroTitle">
          <h3>Motores de rastreo</h3>
        </div>
        <div className="tcExecHeroActions">
          <small>
            Datos de los motores: {timeText(telemetry?.generatedAt)}
          </small>
          <small role="status">
            Consulta del tablero: {checkedAt ? timeText(checkedAt) : 'En curso'}
          </small>
          <button
            type="button"
            onClick={() => setRefresh(n => n + 1)}
            disabled={loading}
          >
            {loading ? 'Actualizando…' : 'Actualizar tablero'}
          </button>
        </div>
      </header>
      <div className="tcExecKpis">
        {cards.map(card => (
          <article
            key={card.key}
            className="tcExecKpi"
            data-accent={card.accent}
          >
            <span className="tcExecKpiTitle">{card.label}</span>
            <strong className="tcExecKpiValue">{card.value}</strong>
            <small>{card.note}</small>
          </article>
        ))}
      </div>
      {failures.length > 0 && (
        <p className="tcExecNotice" role="status">
          Los siguientes informes no respondieron: {failures.join(', ')}. Sus
          valores aparecen como «Sin datos».
        </p>
      )}
      {/* El detalle individual conserva los controles productivos anteriores. */}
      <EngineCommand telemetry={telemetry} />
      {telemetry?.historyComplete===false && <p className="tcExecNotice" role="status">
        El historial de 30 días aún es parcial. No se interpretan las fechas faltantes como cero.
      </p>}
      {telemetry?.historyQuality && <details className="tcBICityDetails">
        <summary>Ver procedencia e integridad del historial</summary>
        <p>Período: {telemetry.historyQuality.windowDays} días.
          Los resultados de D y Gemini representan el último barrido diario, no sumas de publicaciones.</p>
        <div className="tcBITableWrap"><table>
          <thead><tr><th>Tabla</th><th>Registros</th><th>Páginas</th><th>Completitud</th></tr></thead>
          <tbody>{telemetry.historyQuality.sources.map(s=><tr key={s.table}>
            <th scope="row">{s.table}</th><td>{s.scanned}</td><td>{s.pages}</td>
            <td>{s.readError?'Error de lectura':s.complete?'Paginada':'Parcial'}</td>
          </tr>)}</tbody>
        </table></div>
        <p>Días de historial en GitHub: {Object.entries(
          telemetry.historyQuality.producerHistoryDaysByEngine||{}).map(
          ([id,days])=>id+': '+days).join(' · ')||'Sin datos'}.</p>
        {(telemetry.historyQuality.warnings||[]).map((w,i)=><p key={i}>{w}</p>)}
      </details>}
      <div className="tcBIChartsTop">
        <ActivityChart
          history={telemetry?.history}
          complete={telemetry?.historyComplete}
        />
        <SourceDonut engines={telemetry?.engines} />
      </div>
      {telemetry?.jointBC && <details className="tcBICityDetails">
        <summary>Último trabajo registrado del proceso conjunto B/C</summary>
        <div className="tcBCJointStats">
          <span><b>{knownCount(telemetry.jointBC.scanned)}</b><small>Documentos revisados</small></span>
          <span><b>{knownCount(telemetry.jointBC.remainingPdf)}</b><small>Documentos pendientes</small></span>
          <span><b>{knownCount(telemetry.jointBC.html?.verified)}</b><small>HTML verificados</small></span>
          <span><b>{knownCount(telemetry.jointBC.decisions?.not_job)}</b><small>Sin oferta</small></span>
        </div>
        <p>Registro del {timeText(telemetry.jointBC.at)}.</p>
      </details>}
      {/* El detalle de los motores se consulta desde el panel compacto. */}
      <section className='tcBILiveProcesses' hidden><h4>Procesos automáticos: último resultado registrado</h4>{(((telemetry as (Telemetry & {operational?:Array<{name:string;at:string|null;state:string;details:Record<string,unknown>}>})|null)?.operational)||[]).map(p=><article key={p.name}><strong>{p.name==='fast_bc_pipeline_latest'?'Procesamiento rápido B/C':p.name==='chatgpt_bridge_latest'?'Importador ChatGPT':'Importador GitHub C'}</strong><span>{p.at?new Date(p.at).toLocaleString('es-CL'):'Sin registro'}</span><span>Estado: {p.state}</span><details><summary>Detalle de resultados</summary><pre>{JSON.stringify(p.details,null,2)}</pre></details></article>)}</section>
      <footer className="tcExecFooter">
        <strong>Lectura responsable:</strong> el total visible procede del
        catálogo; las cifras de cada motor corresponden a sus ejecuciones y no
        deben sumarse como nuevas ofertas publicadas. Los datos faltantes
        permanecen explícitos. Panel privado, de solo lectura y sin información
        personal.
      </footer>
    </section>
  );
}
