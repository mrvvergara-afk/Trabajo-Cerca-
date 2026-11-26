import { useEffect, useState } from 'react';
import { api } from '@appdeploy/client';
import {
  safeInstitutionalImage, validatePublicManifest, type InstitutionalManifest,
} from '../shared/house-autonomy';

const ROUTE = '/api/growth/institutional';
const ADMIN = '/api/admin/marketing/institutional';
let cached: { until: number; manifest: InstitutionalManifest | null } | undefined;
let request: Promise<InstitutionalManifest | null> | undefined;

function manifest() {
  if (cached && cached.until > Date.now()) return Promise.resolve(cached.manifest);
  request ??= api.get(ROUTE).then(response => {
    const good = validatePublicManifest(response.data?.manifest);
    if (good) cached = { manifest: good, until: Date.now() + 300_000 };
    return good ?? cached?.manifest ?? null;
  }).catch(() => cached?.manifest ?? null).finally(() => { request = undefined; });
  return request;
}
export function useInstitutionalRelease(enabled: boolean) {
  const [value, setValue] = useState<InstitutionalManifest | null>(() => cached?.manifest ?? null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const update = () => {
      if (document.visibilityState !== 'visible') return;
      void manifest().then(result => { if (alive && result) setValue(result); });
    };
    update();
    const timer = window.setInterval(update, 300_000);
    document.addEventListener('visibilitychange', update);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, [enabled]);
  return value;
}
export function InstitutionalPhoto({ url, alt }: { url: string; alt: string }) {
  const [failed, fail] = useState(false);
  if (failed || !safeInstitutionalImage(url)) return null;
  return <img className="tcAdImage" src={url} alt={alt}
    width={840} height={560} loading="lazy" decoding="async"
    referrerPolicy="no-referrer" onError={() => fail(true)} />;
}

type SocialMetric = { network: string; reach: number | null; impressions: number | null; clicks: number | null; views: number | null };
type AdminState = {
  active: InstitutionalManifest | null;
  previousRevision: string | null;
  checkedAt: string | null;
  exception: string | null;
  pendingBackups: number;
  socialMetrics?: { from: string; to: string; networks: SocialMetric[] } | null;
};
const problems: Record<string, string> = {
  banco_no_verificado: 'El banco no pudo verificarse. Revisa el catálogo y los archivos de GitHub.',
  respaldo_pendiente: 'GitHub no confirmó uno o más respaldos después de varios intentos.',
  sin_version_valida: 'El carrusel está usando sus imágenes de respaldo. Revisa el almacenamiento institucional.',
};
export function InstitutionalAdmin() {
  const [data, setData] = useState<AdminState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    void api.get(ADMIN).then(response => {
      if (active) setData(response.data);
    }).catch(() => { if (active) setMessage('El estado del carrusel no está disponible.'); });
    return () => { active = false; };
  }, []);
  async function apply(action: 'refresh' | 'restore') {
    if (action === 'restore' && !window.confirm('¿Volver a la versión anterior del carrusel?')) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await api.post(ADMIN, { action, revision: data?.active?.revision });
      setData(response.data);
      cached = undefined;
    } catch {
      setMessage('No se confirmó el cambio. Recarga antes de reintentar.');
    } finally {
      setBusy(false);
    }
  }
  return <section aria-label="Gestor publicitario autónomo">
    <h3>Carrusel institucional</h3>
    {data?.active && <p>Edición del {data.active.period} · {data.active.territory} · {data.active.slides.length} diapositivas.</p>}
    {data && !data.active && <p>En espera de la primera edición verificada.</p>}
    {data?.checkedAt && <p>Última comprobación {new Date(data.checkedAt).toLocaleString('es-CL', { timeZone: 'America/Santiago' })}.</p>}
    {data?.exception && <p role="alert">{problems[data.exception] || 'El gestor requiere revisión.'}</p>}
    {data && <p>Respaldos por confirmar en GitHub: {data.pendingBackups}.</p>}
    {message && <p role="status">{message}</p>}
    <button type="button" disabled={busy} onClick={() => void apply('refresh')}>Comprobar banco</button>
    {data?.previousRevision && <button type="button" disabled={busy} onClick={() => void apply('restore')}>Restaurar edición anterior</button>}
    <h3>Campañas orgánicas</h3>
    {data?.socialMetrics ? <>
      <p>Métricas de Metricool del {data.socialMetrics.from} al {data.socialMetrics.to}.</p>
      <div className="tcHouseTable"><table>
        <thead><tr><th>Red</th><th>Alcance</th><th>Impresiones</th><th>Clics en enlaces</th><th>Visualizaciones</th></tr></thead>
        <tbody>{data.socialMetrics.networks.map(row => <tr key={row.network}>
          <th>{row.network}</th><td>{row.reach ?? 'Sin datos'}</td><td>{row.impressions ?? 'Sin datos'}</td>
          <td>{row.clicks ?? 'Sin datos'}</td><td>{row.views ?? 'Sin datos'}</td>
        </tr>)}</tbody>
      </table></div>
    </> : <p>En espera de datos de Metricool.</p>}
  </section>;
}
