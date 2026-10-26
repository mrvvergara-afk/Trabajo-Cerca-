import { useState } from 'react';
import { api } from '@appdeploy/client';

/** Read-only admin handoff for the free local OCR pilot.
 * No credentials, document contents, database records or personal data are exported.
 */
type DocumentRef = {
  url: string;
  source: string;
  publisher_page: string;
  kind: 'document' | 'local_page' | 'rendered_page';
};

type ExportPayload = {
  schema: string;
  read_only: boolean;
  paid_provider_calls: number;
  created_at: string;
  documentWork: {
    schema: string;
    read_only: boolean;
    paid_provider_calls: number;
    coverage_complete: boolean;
    checked_at: string | null;
    items: DocumentRef[];
  };
};

function validDocument(value: unknown): value is DocumentRef {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<DocumentRef>;
  const safeLink = (link: unknown) => {
    if (typeof link !== 'string' || link.length > 2000) return false;
    try {
      const url = new URL(link);
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch { return false; }
  };
  return safeLink(data.url) && safeLink(data.publisher_page) &&
    typeof data.source === 'string' && data.source.length <= 160 &&
    ['document', 'local_page', 'rendered_page'].includes(data.kind || '');
}

export function DocumentWorkExport() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function download() {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await api.get('/api/admin/document-work');
      const payload = response.data as ExportPayload;
      if (payload?.schema !== 'trabajo-cerca.document-export.v1' ||
          payload?.documentWork?.schema !== 'trabajo-cerca.document-work.v1' ||
          payload?.read_only !== true || payload?.documentWork?.read_only !== true ||
          !Array.isArray(payload.documentWork.items) ||
          payload.documentWork.items.length > 100 ||
          !payload.documentWork.items.every(validDocument)) {
        throw new Error('invalid_document_manifest');
      }
      const contents = JSON.stringify(payload, null, 2) + '\n';
      const blob = new Blob([contents], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'trabajo-cerca-documentos-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
      setMessage('Archivo preparado: ' + payload.documentWork.items.length +
        ' enlaces públicos. No se han iniciado motores ni publicado avisos.');
    } catch {
      setMessage('No se pudo descargar la cola. Verifica tu sesión administrativa e inténtalo nuevamente.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label='Exportar documentos para OCR gratuito'>
      <h3>Documentos pendientes · OCR gratuito</h3>
      <p>Descarga únicamente enlaces municipales públicos para examinarlos en el lector gratuito. No incluye imágenes originales ni información privada. No publica avisos.</p>
      <div className='tcAdminActions'>
        <button type='button' onClick={() => void download()} disabled={busy}>
          {busy ? 'Preparando archivo…' : 'Descargar cola documental'}
        </button>
      </div>
      {message && <p role='status' aria-live='polite'>{message}</p>}
    </section>
  );
}

