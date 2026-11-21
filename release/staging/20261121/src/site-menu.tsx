import { useEffect, useRef, useState } from 'react';
import { Menu, UserRound } from 'lucide-react';
import { api, auth } from '@appdeploy/client';
import { administratorPermission } from './administrator-permission';
type Props = {
  accountIcon?: boolean;
  showInstall?: boolean;
  onRadar?: () => void;
  onAlerts: () => void;
  onInstall: () => void;
  onService: () => void;
  onContribute: () => void;
  onCities: () => void;
  onNews?: () => void;
  onPeople: () => void;
  onAdvertise: () => void;
};
export function SiteMenu(props: Props) {
  const menu = useRef<HTMLDetailsElement>(null);
  const [session, setSession] = useState<'checking' | 'active' | 'guest'>('checking');
  const [isAdministrator, setIsAdministrator] = useState(false);
  const [accountError, setAccountError] = useState('');
  const checkingId = useRef(0);

  async function refreshAccount() {
    const request = ++checkingId.current;
    try {
      const user = await auth.getUser();
      if (request !== checkingId.current) return;
      if (!user?.email) {
        setSession('guest');
        setIsAdministrator(false);
        return;
      }
      // Only the server decides the role. Never infer admin from an email,
      // a local flag or a previously stored account.
      const authorized = await administratorPermission(true, () =>
        api.get('/api/admin/session')
      );
      if (request !== checkingId.current) return;
      setSession('active');
      setIsAdministrator(authorized);
    } catch {
      if (request !== checkingId.current) return;
      setSession('guest');
      setIsAdministrator(false);
    }
  }

  useEffect(() => {
    void refreshAccount();
    const checkOnFocus = () => void refreshAccount();
    const checkOnVisible = () => {
      if (document.visibilityState === 'visible') void refreshAccount();
    };
    window.addEventListener('focus', checkOnFocus);
    document.addEventListener('visibilitychange', checkOnVisible);
    return () => {
      checkingId.current += 1;
      window.removeEventListener('focus', checkOnFocus);
      document.removeEventListener('visibilitychange', checkOnVisible);
    };
  }, []);

  async function openSignIn() {
    setAccountError('');
    try {
      await auth.signInWithRedirect({ scope: 'openid email offline_access' });
    } catch {
      setAccountError('No se pudo abrir el acceso. Inténtalo nuevamente.');
    }
  }

  async function closeSession() {
    checkingId.current += 1;
    setAccountError('');
    try {
      await auth.signOut();
      setSession('guest');
      setIsAdministrator(false);
    } catch {
      setAccountError('No se pudo cerrar sesión. Vuelve a intentarlo.');
      void refreshAccount();
    }
  }
  function close() {
    if (menu.current) menu.current.open = false;
  }
  function action(callback: () => void) {
    close();
    callback();
  }
  return (
    <details
      className="tcSiteMenu"
      ref={menu}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          close();
          menu.current?.querySelector('summary')?.focus();
          event.stopPropagation();
        }
      }}
    >
      <summary aria-label="Abrir menú de Trabajo Cerca">
        {props.accountIcon ? (
          <UserRound aria-hidden="true" />
        ) : (
          <Menu aria-hidden="true" />
        )}
        <span>Menú</span>
      </summary>
      <div
        className="tcSiteMenuPanel"
        role="region"
        aria-label="Menú de Trabajo Cerca"
      >
        <nav aria-label="Opciones adicionales">
          <button type="button" onClick={() => action(props.onAdvertise)}>
            Promocionar negocio
          </button>
          <button type="button" onClick={() => action(props.onAlerts)}>
            Avisos y notificaciones
          </button>
          <button type="button" onClick={() => action(props.onContribute)}>
            Compartir oferta laboral
          </button>
          {props.showInstall !== false && (
            <button type="button" onClick={() => action(props.onInstall)}>
              Instalar gratis
            </button>
          )}
        </nav>
        <div className="tcMenuAccount" aria-live="polite">
          <strong>Mi cuenta</strong>
          <span>{session === 'checking' ? 'Comprobando sesión…' :
            session === 'active' ? 'Sesión activa' : 'Sin iniciar sesión'}</span>
          {session === 'guest' && (
            <button type="button" onClick={() => void openSignIn()}>
              Entrar con correo
            </button>
          )}
          {session === 'active' && isAdministrator && (
            <a className="tcVerifiedAdminEntry" href="/admin"
              aria-label="Abrir panel de administración autorizado">
              Panel de administración
            </a>
          )}
          {session === 'active' && (
            <button type="button" onClick={() => void closeSession()}>
              Cerrar sesión
            </button>
          )}
          {accountError && <small role="alert">{accountError}</small>}
        </div>
        <button
          className="tcCloseSiteMenu"
          onClick={() => {
            close();
            menu.current?.querySelector('summary')?.focus();
          }}
        >
          Cerrar menú principal
        </button>
      </div>
    </details>
  );
}
