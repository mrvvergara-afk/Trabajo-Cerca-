import { useEffect, useState } from 'react';
import { api } from '@appdeploy/client';
import {
  cityCounts,
  executiveKpis,
  knownCount,
  type AdminSnapshot,
  type Telemetry,
} from './executive-metrics';
import {
  ActivityChart,
  SourceDonut,
  TerritoryBars,
  EnginesTable,
  ExecutiveStatusBar,
} from './executive-charts';
import './executive-control-center.css';
import { EngineCommand } from './engine-command';

type TerritoryResult = {
  readOnly?: boolean;
  checkedAt?: string;
  feedComplete?: boolean;
  sourceAuditComplete?: boolean;
  communes?: unknown[];
  sources?: Array<{id:string;communes:string[];status:string;checkedAt:string|null;candidates:number|null}>;
};
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
  });
}
export function ExecutiveControlCenter({
  summary,
}: {
  summary?: AdminSnapshot;
}) {
  const [territory, setTerritory] = useState<TerritoryResult | null>(null);
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
      '/api/admin/territorial-coverage',
      '/api/admin/ops-telemetry',
      '/api/listings?limit=1',
    ];
    void Promise.allSettled(urls.map(url => api.get(url))).then(results => {
      if (!active) return;
      const problems: string[] = [];
      const first = results[0],
        second = results[1];
      if (first.status === 'fulfilled' && isRecord(first.value.data)) {
        setTerritory(first.value.data as TerritoryResult);
      } else {
        setTerritory(null);
        problems.push('cobertura por comuna');
      }
      if (second.status === 'fulfilled' && isTelemetry(second.value.data)) {
        setTelemetry(second.value.data);
      } else {
        setTelemetry(null);
        problems.push('telemetría de motores');
      }
      const third = results[2];
      const publicData = third?.status === 'fulfilled' && isRecord(third.value.data)
        ? third.value.data : null;
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
  }, [refresh]);
  useEffect(()=>{
    const timer=setInterval(()=>setRefresh(n=>n+1),4*60_000);
    return ()=>clearInterval(timer);
  },[]);
  const cards = executiveKpis(summary, telemetry, publicVerifiedTotal);
  const cities = cityCounts(territory);
  return (
    <section
      className="tcExecCenter"
      aria-label="Centro de Control de Trabajo Cerca"
    >
      <header className="tcExecHero">
        <div className="tcExecHeroTitle">
          <span className="tcExecEyebrow">
            ADMINISTRACIÓN / INTELIGENCIA OPERATIVA
          </span>
          <h3>Centro de Control</h3>
          <p>
            Rastreo, publicaciones y publicidad local, con cifras verificables y
            trazabilidad.
          </p>
        </div>
        <div className="tcExecHeroActions">
          <small>
            Datos de los motores: {timeText(telemetry?.generatedAt || territory?.checkedAt)}
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
      <ExecutiveStatusBar telemetry={telemetry} />
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
      {telemetry?.stageRead?.some(s=>s.latest) && <section className='tcBCJoint'><div><strong>Registros individuales B y C</strong><small>Recepciones de etapa verificables</small></div><div className='tcBCJointStats'>{telemetry.stageRead.map(s=><span key={s.engine}><b>Motor {s.engine}</b><small>{s.latest?`${knownCount(s.latest.processed)} revisados · ${s.engine==='C'?`${knownCount(s.latest.inputCount)} detectados · ${knownCount(s.latest.already)} ya revisados`:'etapa PDF'} · ${s.latest.status==='completed'?'Ciclo finalizado':'Error'}`:'Sin registro nuevo'}</small><small>{s.latest?timeText(s.latest.at):'—'}</small></span>)}</div><small>Las cifras individuales representan etapas, no publicaciones confirmadas.</small></section>}
      {telemetry?.bcOperations && <section className='tcBCJoint'><div><strong>Actividad verificable B/C</strong><small>Última recepción: {timeText(telemetry.bcOperations.at)}</small></div><div className='tcBCJointStats'><span><b>{knownCount(telemetry.bcOperations.html.found)}</b><small>Enlaces detectados C</small></span><span><b>{knownCount(telemetry.bcOperations.html.already)}</b><small>Ya revisados C</small></span><span><b>{knownCount(telemetry.bcOperations.html.checked)}</b><small>Revisados C</small></span><span><b>{knownCount(telemetry.bcOperations.html.deferredOutside)}</b><small>Diferidos C</small></span></div><small>El total detectado incluye enlaces ya revisados. No equivale a nuevas ofertas.</small></section>}
      {telemetry?.jointBC && <section className='tcBCJoint'><div><strong>Procesamiento conjunto B/C</strong><small>Último checkpoint con trabajo: {timeText(telemetry.jointBC.at)}</small></div><div className='tcBCJointStats'><span><b>{knownCount(telemetry.jointBC.scanned)}</b><small>Documentos revisados</small></span><span><b>{knownCount(telemetry.jointBC.remainingPdf)}</b><small>Documentos pendientes</small></span><span><b>{knownCount(telemetry.jointBC.html?.verified)}</b><small>HTML verificados</small></span><span><b>{knownCount(telemetry.jointBC.decisions?.not_job)}</b><small>Sin oferta</small></span></div><small>Checkpoint histórico del trabajo útil, distinto de la última ejecución. Los ceros no prueban productividad.</small></section>}
      <div className="tcBIChartsBottom">
        <TerritoryBars cities={cities} feedComplete={territory?.feedComplete} />
        <div className="tcBIChartCard tcBIManagement">
          <header className="tcBIChartHead">
            <div>
              <h4>Control territorial</h4>
              <p>Cobertura de las 12 comunas y estado del proceso.</p>
            </div>
          </header>
          <dl>
            <div>
              <dt>Comunas principales</dt>
              <dd>12</dd>
            </div>
            <div>
              <dt>Catálogo público</dt>
              <dd>
                {territory?.feedComplete === true
                  ? 'Completo'
                  : territory?.feedComplete === false
                    ? 'Parcial'
                    : 'Sin datos'}
              </dd>
            </div>
            <div>
              <dt>Auditoría de fuentes</dt>
              <dd>
                {territory?.sourceAuditComplete === true
                  ? 'Consulta completa'
                  : territory?.sourceAuditComplete === false
                    ? 'Consulta parcial'
                    : 'Sin datos'}
              </dd>
            </div>
            <div>
              <dt>Última revisión territorial</dt>
              <dd>{timeText(territory?.checkedAt)}</dd>
            </div>
          </dl>
          <details className="tcBICityDetails">
            <summary>Ver cobertura detallada por comuna</summary>
            <div className="tcBITableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Comuna</th>
                    <th>Ofertas visibles</th>
                    <th>Fuentes revisadas</th>
                    <th>Fuentes previstas</th>
                    <th>Fallidas</th>
                  </tr>
                </thead>
                <tbody>
                  {cities.map(r => (
                    <tr key={r.city}>
                      <th scope="row">{r.city}</th>
                      <td>{r.visible}</td>
                      <td>{r.audited}</td>
                      <td>{r.expected}</td>
                      <td>{r.failed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <p className="tcExecCaution">Fuentes revisadas no significa ofertas encontradas.</p>
          <p className='tcExecCaution'>La gestión individual de acceso, lectura y extracción está en la sección Fuentes.</p>
        </div>
      </div>
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
