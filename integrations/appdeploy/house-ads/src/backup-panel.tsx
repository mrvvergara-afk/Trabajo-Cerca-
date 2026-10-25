import { useRef, useState } from 'react';
import { RestoreRehearsalPanel } from './restore-panel';
import { api, auth } from '@appdeploy/client';
import { verifyEncryptedBackup } from './backup-crypto';
import { advanceBackup, backupFailure, backupProgress, checkBackupRun, newBackupRun, type BackupRun } from './backup-runner';
import './backup-panel.css';

export function BackupPanel() {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState('Crea una copia cifrada y guárdala fuera de este dispositivo.');
  const [download, setDownload] = useState<{ text: string; complete: boolean } | null>(null);
  const cancelled = useRef(false);
  const run = useRef<BackupRun | null>(null);
  const [canResume, setCanResume] = useState(false);
  const [needsSession, setNeedsSession] = useState(false);

  async function createBackup(resume = false) {
    if (password.length < 12 || password !== confirmation) { setMessage('Usa al menos 12 caracteres y repite la misma contraseña.'); return; }
    setBusy(true); setCanResume(false); setNeedsSession(false); cancelled.current = false;
    try {
      if (!resume || !run.current) { run.current = await newBackupRun(password); setDownload(null); }
      const batchStarted = Date.now();
      let batchSteps = 0;
      while (run.current.phase !== 'complete') {
        if (cancelled.current || ++batchSteps > 1000 || Date.now() - batchStarted > 600000) {
          setCanResume(true);
          setMessage('Copia pausada. El avance se conserva mientras mantengas este panel abierto. Puedes reanudar desde la última página confirmada.');
          break;
        }
        const current = run.current;
        setMessage(backupProgress(current));
        run.current = await advanceBackup(current, async body => {
          const response = await api.post('/api/admin/backup/page', body);
          return response.data;
        });
      }
      if (run.current.phase === 'complete') {
        const checked = await checkBackupRun(run.current, password);
        setDownload({ text: JSON.stringify(run.current.envelope), complete: true });
        setMessage(`Copia cifrada comprobada: ${checked.tables} tablas, ${checked.records} registros y ${checked.files} archivos. Descárgala ahora. Falta probar la restauración en una instancia aislada.`);
      } else if (run.current.envelope.parts.length) {
        setDownload({ text: JSON.stringify(run.current.envelope), complete: false });
      }
    } catch (cause: unknown) {
      const failure = backupFailure(cause);
      if (run.current?.envelope.parts.length) setDownload({ text: JSON.stringify(run.current.envelope), complete: false });
      setCanResume(failure.resumable && Boolean(run.current));
      setNeedsSession(failure.code === 'backup_session');
      const stage = run.current ? backupProgress(run.current) : 'Preparación del cifrado';
      setMessage(`Copia incompleta. Etapa: ${stage}. Código: ${failure.code}. ${failure.message} No se modificaron tus datos.`);
    } finally { setBusy(false); }
  }

  async function resumeBackup() {
    if (needsSession) {
      setBusy(true);
      try { await auth.signIn({ scope: 'openid email profile offline_access' }); }
      catch { setMessage('No se renovó la sesión. El avance sigue disponible en este panel.'); setBusy(false); return; }
    }
    await createBackup(true);
  }

  function discardProgress() {
    run.current = null; setCanResume(false); setDownload(null);
    setMessage('Avance local descartado. Puedes crear una copia nueva. Los datos de la app no se modificaron.');
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
        <label>Contraseña del respaldo<input type='password' autoComplete='new-password' value={password} onChange={event => setPassword(event.target.value)} disabled={busy || Boolean(run.current)} minLength={12} /></label>
        <label>Repetir contraseña<input type='password' autoComplete='new-password' value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy || Boolean(run.current)} /></label>
      </div>
      <div className='tcBackupActions'>
        {!run.current && <button onClick={() => void createBackup()} disabled={busy || password.length < 12 || password !== confirmation}>Crear copia cifrada</button>}
        {canResume && <button onClick={() => void resumeBackup()} disabled={busy}>{needsSession ? 'Renovar sesión y reanudar' : 'Reanudar copia'}</button>}
        {run.current && !busy && <button onClick={discardProgress}>Descartar avance y crear otra copia</button>}
        {busy && !restoring && <button onClick={() => { cancelled.current = true; }}>Pausar copia</button>}
        {download && <button onClick={saveDownload} disabled={busy}>{download.complete ? 'Descargar copia cifrada' : 'Descargar copia parcial'}</button>}
        <label className='tcBackupFile'>Comprobar una copia<input type='file' accept='.tcbackup,application/json' disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void verifyFile(file); }} /></label>
      </div>
      <p role='status' aria-live='polite'>{message}</p>
      <details><summary>Alcance y límites</summary><p>Incluye las tablas identificadas en el código, las tablas referenciadas durante la lectura y los archivos accesibles. No certifica tablas sin referencias ni incluye usuarios o secretos administrados por la plataforma, metadatos originales de archivos ni código fuente. Las lecturas ocurren mientras la app sigue funcionando: esta copia no es una instantánea atómica ni acredita una restauración completa. Los límites detienen la copia sin ocultar fallos. La reanudación conserva el avance solo mientras este panel permanezca abierto; cerrar sesión, recargar o cerrar la app descarta ese avance. Las copias parciales de versiones anteriores no se pueden reanudar.</p></details>
      <RestoreRehearsalPanel password={password} disabled={busy} onBusy={value => { setRestoring(value); setBusy(value); }} />
    </section>
  );
}

