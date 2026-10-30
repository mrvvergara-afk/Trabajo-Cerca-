import { HouseCampaignAdmin } from './house-admin';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackupPanel } from './backup-panel';
import { DocumentWorkExport } from './document-work-export';
import { RadarReviewInbox } from './radar-review-inbox';
import { administratorPermission } from './administrator-permission';
import './administrator-access.css';
import { api, auth } from '@appdeploy/client';

export function AdministratorAccess() {
  const [message, setMessage] = useState('Inicia sesión para comprobar el acceso administrativo.');
  const [busy, setBusy] = useState(false);
  const [allowed, setAllowed] = useState(false);

  async function verify(signIn: boolean) {
    setBusy(true);
    setAllowed(false);
    try {
      if (signIn) await auth.signIn({ scope: 'openid email profile offline_access' });
      const response = await api.get('/api/admin/session');
      if (response.data?.administrator !== true) throw new Error('invalid_admin_response');
      setAllowed(true);
      setMessage('Acceso administrativo confirmado. Puedes crear y comprobar una copia cifrada.');
    } catch (cause: unknown) {
      const failure = cause as { code?: string; response?: { status?: number } };
      if (failure.code === 'popup_closed') setMessage('Inicio de sesión cancelado. Puedes intentarlo nuevamente.');
      else if (failure.code === 'popup_blocked') setMessage('Permite la ventana de inicio de sesión y vuelve a intentarlo.');
      else if (failure.response?.status === 403) setMessage('Esta cuenta no tiene acceso administrativo.');
      else if (failure.response?.status === 401) setMessage('Inicia sesión con la cuenta administradora autorizada.');
      else setMessage('No se pudo comprobar el acceso. Puedes volver a intentarlo.');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      await auth.signOut();
      setAllowed(false);
      setMessage('Sesión cerrada.');
    } catch {
      setMessage('No se pudo cerrar la sesión. Inténtalo nuevamente.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className='opsCard tcAdminAccess' aria-label='Acceso administrativo'>
      <div className='tcAdminTitle'><h2>Acceso administrativo</h2><span className='tcAdminBadge' data-allowed={allowed}>{allowed ? 'Sesión autorizada' : 'Acceso restringido'}</span></div>
      <p role='status' aria-live='polite'>{message}</p>
      <div className='tcAdminActions'>
      <button onClick={() => void verify(true)} disabled={busy}>Ingresar como administrador</button>
      <button onClick={() => void verify(false)} disabled={busy}>Verificar acceso</button>
      <button onClick={() => void signOut()} disabled={busy}>Cerrar sesión</button>
      </div>
      {allowed && <><p>Las operaciones manuales del radar continúan deshabilitadas.</p><RadarReviewInbox /><DocumentWorkExport /><BackupPanel /><HouseCampaignAdmin /></>}
    </section>
  );
}

export function AdministratorShortcut({ inline = false }: { inline?: boolean }) {
  const [allowed, setAllowed] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [message, setMessage] = useState('');
  const generation = useRef(0);
  const working = useRef(false);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    const current = ++generation.current;
    const session = auth.isSignedIn();
    if (mounted.current) { setAllowed(false); setSignedIn(session); }
    const granted = await administratorPermission(session, () => api.get('/api/admin/session'));
    if (mounted.current && generation.current === current) setAllowed(granted);
    return granted;
  }, []);

  useEffect(() => {
    mounted.current = true;
    const check = () => { if (!working.current) void refresh(); };
    const visible = () => { if (document.visibilityState === 'visible') check(); };
    check();
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', visible);
    return () => {
      mounted.current = false;
      generation.current += 1;
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [refresh]);

  async function login() {
    working.current = true; setBusy(true); setMessage('');
    try {
      await auth.signIn({ scope: 'openid email profile offline_access' });
      const granted = await refresh();
      if (mounted.current) {
        setMessage(granted ? 'Cuenta administradora reconocida. Ya puedes abrir Administración.' : 'Sesión iniciada. Esta cuenta no tiene acceso administrativo.');
        setMenuOpen(true);
      }
    } catch (cause: unknown) {
      const code = (cause as { code?: string }).code;
      if (mounted.current) setMessage(code === 'popup_blocked' ? 'Permite la ventana emergente para iniciar sesión.' : code === 'popup_closed' ? 'Inicio de sesión cancelado.' : 'No se pudo iniciar sesión. Inténtalo nuevamente.');
    } finally { working.current = false; if (mounted.current) setBusy(false); }
  }

  async function logout() {
    working.current = true; setBusy(true);
    try {
      await auth.signOut();
      generation.current += 1;
      setAllowed(false); setSignedIn(false); setMenuOpen(false); setMessage('Sesión cerrada.');
    } catch { setMessage('No se pudo cerrar la sesión. Inténtalo nuevamente.'); }
    finally { working.current = false; setBusy(false); }
  }

  async function openPanel() {
    working.current = true; setBusy(true);
    const granted = await refresh();
    if (granted) { window.location.hash = 'operacion'; window.location.reload(); }
    else {
      setMessage('La sesión administrativa no está disponible. Inicia sesión nuevamente.');
      setMenuOpen(true); setBusy(false); working.current = false;
    }
  }

  // El menú público no muestra controles de sesión; solo la cuenta validada por /api/admin/session puede ver Administración.
  if (inline && !allowed) return null;

  return (
    <div className={'tcAccountControl' + (inline ? ' tcAccountInline' : '')}>
      {allowed && <button className='tcAdminShortcut' disabled={busy} onClick={() => void openPanel()}>Administración</button>}
      {!inline && <button className='tcAccountButton' disabled={busy} aria-expanded={menuOpen} onClick={() => { setMenuOpen(!menuOpen); }}>Mi cuenta</button>}
      {(inline || menuOpen) && <div className='tcAccountMenu' role='region' aria-label='Mi cuenta'>
        <b>{signedIn ? 'Tu sesión' : 'Accede a tu cuenta'}</b>
        <p>{signedIn ? 'Puedes cambiar o cerrar la sesión de este dispositivo.' : 'Inicia sesión para acceder a las funciones de tu cuenta.'}</p>
        <button onClick={() => void login()} disabled={busy}>{signedIn ? 'Cambiar cuenta' : 'Iniciar sesión'}</button>
        {signedIn && <button onClick={() => void logout()} disabled={busy}>Cerrar sesión</button>}
        {!inline && <button onClick={() => setMenuOpen(false)}>Cerrar menú</button>}
        {message && <p role='status'>{message}</p>}
      </div>}
      {!inline && !menuOpen && message && <span className='tcAccountFeedback' role='status'>{message}</span>}
    </div>
  );
}
