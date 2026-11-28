import { useEffect, useState } from 'react';
import { api } from '@appdeploy/client';
import { administratorDenialStatus } from './administrator-permission';
import { knownCount } from './executive-metrics';
import { TerritorialCoverageAudit, type TerritorialCoverageReport } from './territorial-coverage-audit';

type Source = { id: string; status?: string; checkedAt?: string | null; candidates?: number | null };
type Coverage = TerritorialCoverageReport & { sources: Source[] };

function localTime(value?: string | null) {
  return value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString('es-CL', { timeZone: 'America/Santiago' }) : 'Sin registro';
}

export function SourceManagement({ onSessionDenied }: { onSessionDenied?: (status: 401 | 403) => void }) {
  const [data, setData] = useState<Coverage | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    void api.get('/api/admin/territorial-coverage').then(response => {
      const report = response.data as Coverage;
      if (!Array.isArray(report?.sources)) throw new Error('missing_sources');
      if (active) setData(report);
    }).catch(cause => {
      if (!active) return;
      const status = administratorDenialStatus(cause);
      if (status) onSessionDenied?.(status);
      setData(null);
      setError(true);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh, onSessionDenied]);

  const query = filter.trim().toLocaleLowerCase('es-CL');
  const sources = (data?.sources ?? []).filter(source => source.id.toLocaleLowerCase('es-CL').includes(query));
  return <section className="tcSourceManagement" aria-label="Fuentes y cobertura">
    <header><h3>Fuentes y cobertura</h3><button type="button" onClick={() => setRefresh(n => n + 1)} disabled={loading}>{loading ? 'Consultando…' : 'Actualizar fuentes'}</button></header>
    {error && <p role="alert">No fue posible consultar las fuentes.</p>}
    {data && <>
      <p role="status">{data.sources.length} fuentes · Consulta {data.sourceAuditComplete === true ? 'completa' : data.sourceAuditComplete === false ? 'parcial' : 'sin confirmar'} · {localTime(data.checkedAt)}</p>
      <TerritorialCoverageAudit report={data}/>
      <label>Buscar fuente <input value={filter} onChange={event => setFilter(event.target.value)} placeholder="OMIL, municipio, empresa, portal…"/></label>
      {!sources.length ? <p>{query ? 'No hay coincidencias.' : 'El informe no incluyó fuentes.'}</p> :
        <div className="tcSourceTableWrap" tabIndex={0} role="region" aria-label="Inventario de fuentes">
          <table>
            <thead><tr><th scope="col">Fuente</th><th scope="col">Acceso registrado</th><th scope="col">Avisos detectados</th><th scope="col">Última revisión</th></tr></thead>
            <tbody>{sources.map(source => <tr key={source.id}>
              <th scope="row">{source.id}</th>
              <td>{source.status === 'ok' ? 'Consulta registrada' : source.status === 'not_checked' ? 'Sin comprobar' : source.status || 'Sin diagnóstico'}</td>
              <td>{knownCount(source.candidates)}</td><td>{localTime(source.checkedAt)}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      <p>La auditoría registra el acceso a cada fuente. La extracción de fichas requiere medición propia.</p>
    </>}
  </section>;
}
