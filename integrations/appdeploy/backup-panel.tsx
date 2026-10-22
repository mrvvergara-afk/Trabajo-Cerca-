import { useRef, useState } from 'react';
import { api } from '@appdeploy/client';
import { appendEncrypted, beginEncryptedBackup, verifyEncryptedBackup, type BackupEnvelope } from './backup-crypto';
import './backup-panel.css';

type Page = { kind: string; table?: string; items?: Array<Record<string, unknown> & { id: string }>; paths?: string[]; path?: string; content?: string; nextToken?: string | null };
const APP_ID = 'trabajo-cerca-laboratorio-3ojgro';
const dynamicTable = /^(radar_external_[a-f0-9]{32}|public_feed_page_[0-9]{1,8})$/;

function discoverTables(value: unknown, tables: string[], seen: Set<string>) {
  if (typeof value === 'string' && dynamicTable.test(value) && !seen.has(value)) { seen.add(value); tables.push(value); }
  else if (Array.isArray(value)) value.forEach(item => discoverTables(item, tables, seen));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => discoverTables(item, tables, seen));
}

export function BackupPanel() {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Crea una copia cifrada y guárdala fuera de este dispositivo.');
  const [download, setDownload] = useState<{ text: string; complete: boolean } | null>(null);
  const cancelled = useRef(false);

  async function createBackup() {
    if (password.length < 12 || password !== confirmation) { setMessage('Usa al menos 12 caracteres y repite la misma contraseña.'); return; }
    setBusy(true); setDownload(null); cancelled.current = false;
    let envelope: BackupEnvelope | null = null;
    try {
      const startedAt = new Date().toISOString();
      const encrypted = await beginEncryptedBackup(password);
      envelope = encrypted.envelope;
      let calls = 0;
      let encryptedBytes = 0;
      const add = async (value: unknown) => {
        await appendEncrypted(encrypted.envelope, encrypted.key, value);
        encryptedBytes += encrypted.envelope.parts[encrypted.envelope.parts.length - 1].content.length;
        if (encryptedBytes > 45000000) throw new Error('backup_limit');
      };
      const read = async (body: unknown): Promise<Page> => {
        if (cancelled.current || ++calls > 1000 || Date.now() - Date.parse(startedAt) > 600000) throw new Error('backup_limit');
        const response = await api.post('/api/admin/backup/page', body);
        return response.data;
      };
      const scope = await api.post('/api/admin/backup/page', { kind: 'scope' });
      if (!Array.isArray(scope.data.tables) || !scope.data.tables.length) throw new Error('invalid_scope');
      const tables: string[] = [...scope.data.tables];
      const known = new Set(tables);
      const counts: Array<{ table: string; count: number }> = [];
      for (let index = 0; index < tables.length; index++) {
        if (tables.length > 500) throw new Error('backup_limit');
        const table = tables[index];
        const ids = new Set<string>();
        const tokens = new Set<string>();
        let cursor: string | null = null;
        do {
          const page = await read({ kind: 'table', table, cursor });
          if (page.kind !== 'table' || page.table !== table || !Array.isArray(page.items)) throw new Error('invalid_page');
          for (const row of page.items) {
            if (typeof row.id !== 'string' || ids.has(row.id)) throw new Error('duplicate_id');
            ids.add(row.id);
          }
          discoverTables(page.items, tables, known);
          await add({ kind: 'table', table, items: page.items });
          cursor = page.nextToken || null;
          if (cursor && tokens.has(cursor)) throw new Error('pagination_loop');
          if (cursor) tokens.add(cursor);
          setMessage(`Copiando datos: ${index + 1} de ${tables.length} tablas; ${ids.size} registros en la tabla actual.`);
        } while (cursor);
        counts.push({ table, count: ids.size });
      }
      const paths = new Set<string>();
      const tokens = new Set<string>();
      let cursor: string | null = null;
      do {
        const page = await read({ kind: 'storage', cursor });
        if (!Array.isArray(page.paths)) throw new Error('invalid_storage_page');
        for (const path of page.paths) {
          if (paths.has(path)) throw new Error('duplicate_path');
          paths.add(path);
          const file = await read({ kind: 'file', path });
          if (file.kind !== 'file' || file.path !== path || typeof file.content !== 'string') throw new Error('missing_file');
          await add({ kind: 'file', path, content: file.content });
          setMessage(`Copiando archivos: ${paths.size}.`);
        }
        cursor = page.nextToken || null;
        if (cursor && tokens.has(cursor)) throw new Error('pagination_loop');
        if (cursor) tokens.add(cursor);
      } while (cursor);
      await add({ kind: 'manifest', complete: true, appId: APP_ID, revision: scope.data.revision, startedAt, finishedAt: new Date().toISOString(), consistency: 'rolling_non_atomic', fullPlatformBackup: false, dynamicCatalogueCertified: false, storageMetadataIncluded: false, tables: counts, files: paths.size, parts: encrypted.envelope.parts.length });
      const text = JSON.stringify(encrypted.envelope);
      const checked = await verifyEncryptedBackup(text, password);
      setDownload({ text, complete: true });
      setMessage(`Copia cifrada comprobada: ${checked.tables} tablas, ${checked.records} registros y ${checked.files} archivos. Descárgala ahora. Falta probar la restauración en una instancia aislada.`);
    } catch {
      if (envelope?.parts.length) setDownload({ text: JSON.stringify(envelope), complete: false });
      setMessage('La copia no se completó. Puede haberse alcanzado un límite o fallado una lectura. No se modificaron tus datos. Puedes conservar la copia parcial cifrada, pero no sirve como respaldo completo.');
    } finally { setBusy(false); }
  }

  function saveDownload() {
    if (!download) return;
    const url = URL.createObjectURL(new Blob([download.text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `trabajo-cerca-${download.complete ? 'copia' : 'PARCIAL'}-${new Date().toISOString().slice(0, 10)}.tcbackup`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  async function verifyFile(file?: File) {
    if (!file) return;
    if (!password || file.size > 60000000) { setMessage('Ingresa la contraseña de esa copia y selecciona un archivo de menos de 60 MB.'); return; }
    setBusy(true);
    try {
      const result = await verifyEncryptedBackup(await file.text(), password);
      setMessage(`Archivo íntegro: ${result.tables} tablas, ${result.records} registros y ${result.files} archivos. Se comprobó localmente; no se restauró ni modificó la app.`);
    } catch { setMessage('No se pudo validar: contraseña incorrecta, archivo alterado o copia incompleta. No se modificó la app.'); }
    finally { setBusy(false); }
  }

  return (
    <section className='tcBackupPanel' aria-label='Respaldo cifrado'>
      <h3>Respaldo cifrado</h3>
      <p>La contraseña se queda en tu dispositivo. Guárdala por separado: no podremos recuperar una copia si la pierdes.</p>
      <div className='tcBackupFields'>
        <label>Contraseña del respaldo<input type='password' autoComplete='new-password' value={password} onChange={event => setPassword(event.target.value)} disabled={busy} minLength={12} /></label>
        <label>Repetir contraseña<input type='password' autoComplete='new-password' value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy} /></label>
      </div>
      <div className='tcBackupActions'>
        <button onClick={() => void createBackup()} disabled={busy || password.length < 12 || password !== confirmation}>Crear copia cifrada</button>
        {busy && <button onClick={() => { cancelled.current = true; }}>Cancelar copia</button>}
        {download && <button onClick={saveDownload} disabled={busy}>{download.complete ? 'Descargar copia cifrada' : 'Descargar copia parcial'}</button>}
        <label className='tcBackupFile'>Comprobar una copia<input type='file' accept='.tcbackup,application/json' disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void verifyFile(file); }} /></label>
      </div>
      <p role='status' aria-live='polite'>{message}</p>
      <details><summary>Alcance y límites</summary><p>Incluye las tablas identificadas en el código, las tablas referenciadas durante la lectura y los archivos accesibles. No certifica tablas sin referencias ni incluye usuarios o secretos administrados por la plataforma, metadatos originales de archivos ni código fuente. Las lecturas ocurren mientras la app sigue funcionando: esta copia no es una instantánea atómica ni acredita una restauración completa. Los límites detienen la copia sin ocultar fallos.</p></details>
    </section>
  );
}
