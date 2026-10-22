import { useRef, useState } from 'react';
import { rehearseRestore } from './restore-rehearsal';

export function RestoreRehearsalPanel({ password, disabled, onBusy }: { password: string; disabled: boolean; onBusy: (value: boolean) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('Reconstruye y compara los datos en una base temporal de este navegador. No restaura ni sobrescribe la app.');
  const [report, setReport] = useState<Awaited<ReturnType<typeof rehearseRestore>> | null>(null);
  const cancelled = useRef(false);

  async function run() {
    if (!file || !password || file.size > 60000000) { setMessage('Selecciona tu copia cifrada (máximo 60 MB) e ingresa su contraseña arriba.'); return; }
    setRunning(true); onBusy(true); setReport(null); cancelled.current = false;
    try {
      const result = await rehearseRestore(await file.text(), password, { progress: setMessage, cancelled: () => cancelled.current });
      setReport(result);
      setMessage(`Prueba local aprobada: ${result.tables} tablas lógicas, ${result.records} registros, ${result.files} archivos y ${result.mismatches} diferencias. La base temporal fue eliminada. La recuperación funcional en AppDeploy sigue pendiente.`);
    } catch {
      setMessage('La prueba local no se completó. Puede haberse cancelado, fallado la contraseña, la integridad o el almacenamiento temporal. No se modificó la app. Si cerraste la pestaña durante la prueba, los registros temporales quedan cifrados con una clave efímera.');
    } finally { setRunning(false); onBusy(false); }
  }

  function saveReport() {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'trabajo-cerca-prueba-recuperacion.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  return (
    <section className='tcBackupPanel' aria-label='Prueba de recuperación local'>
      <h3>Prueba de recuperación local</h3>
      <p>Selecciona la copia que ya descargaste. Usa su contraseña en el campo de arriba. El archivo y la contraseña permanecen en tu dispositivo.</p>
      <label className='tcBackupFile'>Copia para la prueba<input type='file' accept='.tcbackup,application/json' disabled={disabled || running} onChange={event => { setFile(event.target.files?.[0] || null); setReport(null); }} /></label>
      <div className='tcBackupActions'>
        <button onClick={() => void run()} disabled={disabled || running || !file || !password}>Probar recuperación local</button>
        {running && <button onClick={() => { cancelled.current = true; }}>Cancelar prueba</button>}
        {report && <button onClick={saveReport}>Descargar informe de prueba</button>}
      </div>
      <p role='status' aria-live='polite'>{message}</p>
      <p>No comprueba usuarios o secretos de la plataforma ni certifica contenido ausente de la copia. Cero archivos recuperados no demuestra que el almacenamiento original esté vacío.</p>
    </section>
  );
}
