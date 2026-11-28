import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Activity, Briefcase, Database, Download, House, Inbox, LifeBuoy, Megaphone, Radar, Store } from 'lucide-react';
const HouseCampaignAdmin = lazy(() => import('./house-admin').then(module => ({ default: module.HouseCampaignAdmin })));
const ExecutiveControlCenter = lazy(() => import('./executive-control-center').then(module => ({ default: module.ExecutiveControlCenter })));
const CommercialOverview = lazy(() => import('./commercial-overview').then(module => ({ default: module.CommercialOverview })));
const BackupPanel = lazy(() => import('./backup-panel').then(module => ({ default: module.BackupPanel })));
const DocumentWorkExport = lazy(() => import('./document-work-export').then(module => ({ default: module.DocumentWorkExport })));
const RadarReviewInbox = lazy(() => import('./radar-review-inbox').then(module => ({ default: module.RadarReviewInbox })));
const PublicInventoryAudit = lazy(() => import('./public-inventory-audit').then(module => ({ default: module.PublicInventoryAudit })));
const InternalOfferReconciliation = lazy(() => import('./internal-offer-reconciliation').then(module => ({ default: module.InternalOfferReconciliation })));
const ChatGPTDirectConnector = lazy(() => import('./chatgpt-direct-connector').then(module => ({ default: module.ChatGPTDirectConnector })));
const LocalDirectoryModeration = lazy(() => import('./local-directory').then(module => ({ default: module.LocalDirectoryModeration })));
import { administratorDenialStatus, administratorPermission } from './administrator-permission';
import './administrator-access.css';
import './admin-workspace.css';
import { api, auth } from '@appdeploy/client';
import { SourceManagement } from './source-management';

type AdminSummary={jobs:number;publicVisible:number;verified:number;pending:number;campaigns:number;requests:number;lastSweep?:string};
const sections = [
  { id: 'inicio', title: 'Inicio', icon: House },
  { id: 'ofertas', title: 'Empleos', icon: Briefcase },
  { id: 'rescate', title: 'Rescate', icon: LifeBuoy },
  { id: 'motores', title: 'Motores', icon: Activity },
  { id: 'fuentes', title: 'Fuentes', icon: Radar },
  { id: 'solicitudes', title: 'Solicitudes', icon: Inbox },
  { id: 'campanas', title: 'Publicidad', icon: Megaphone },
  { id: 'moderacion', title: 'Negocios y servicios', icon: Store },
  { id: 'respaldo', title: 'Respaldo', icon: Database },
  { id: 'importacion', title: 'Importación y datos', icon: Download },
] as const;
type Section = typeof sections[number]['id'];
function requestedSection(): Section {
  const route = new URLSearchParams(window.location.search).get('seccion');
  return sections.find(section => section.id === route)?.id ?? 'inicio';
}

export function AdministratorAccess({summary}:{summary?:AdminSummary}) {
  const [message, setMessage] = useState('Inicia sesión para comprobar el acceso administrativo.');
  const [busy, setBusy] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [section,setSection] = useState<Section>(requestedSection);
  const [jobView,setJobView] = useState<'pendientes'|'catalogo'>('pendientes');
  const [campaignView,setCampaignView] = useState<'comerciales'|'propias'>('comerciales');
  const checkGeneration = useRef(0);
  const changingSession = useRef(false);
  const denyAccess = useCallback((status: 401 | 403) => {
    checkGeneration.current += 1;
    setAllowed(false);
    setSection('inicio');
    setMessage(status === 403 ? 'Esta cuenta no tiene acceso administrativo.' : 'Inicia sesión con la cuenta administradora autorizada.');
  }, []);

  useEffect(() => {
    let active = true;
    let pending = false;
    const check = async () => {
      if (pending || changingSession.current) return;
      pending = true;
      const generation = checkGeneration.current;
      const current = () => active && generation === checkGeneration.current;
      try {
        const user = await auth.getUser();
        if (!current()) return;
        if (!user) { denyAccess(401); return; }
        const response = await api.get('/api/admin/session');
        if (!current()) return;
        if (response.data?.administrator !== true) { denyAccess(403); return; }
        setAllowed(true);
        setMessage('Sesión administrativa restaurada.');
      } catch (cause) {
        const status = administratorDenialStatus(cause);
        if (current() && status) denyAccess(status);
      } finally { pending = false; }
    };
    const onFocus = () => { void check(); };
    const onVisibility = () => { if (document.visibilityState === 'visible') onFocus(); };
    onFocus();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [denyAccess]);

  async function verify(signIn: boolean) {
    changingSession.current = true;
    checkGeneration.current += 1;
    setBusy(true);
    setAllowed(false);
    try {
      if(signIn){await auth.signInWithRedirect({scope:'openid email offline_access'});return;}
      await auth.getUser();
      const response = await api.get('/api/admin/session');
      if (response.data?.administrator !== true) throw new Error('invalid_admin_response');
      setAllowed(true);
      setMessage('Acceso administrativo confirmado. Puedes crear y comprobar una copia cifrada.');
    } catch (cause: unknown) {
      const failure = cause as { code?: string } | null;
      const status = administratorDenialStatus(cause);
      if (failure?.code === 'popup_closed') setMessage('Inicio de sesión cancelado. Puedes intentarlo nuevamente.');
      else if (failure?.code === 'popup_blocked') setMessage('Permite la ventana de inicio de sesión y vuelve a intentarlo.');
      else if (status) denyAccess(status);
      else setMessage('No se pudo comprobar el acceso. Puedes volver a intentarlo.');
    } finally {
      changingSession.current = false;
      setBusy(false);
    }
  }

  async function signOut() {
    changingSession.current = true;
    checkGeneration.current += 1;
    setBusy(true);
    try {
      await auth.signOut();
      setAllowed(false);
      setSection('inicio');
      setMessage('Sesión cerrada.');
    } catch {
      setMessage('No se pudo cerrar la sesión. Inténtalo nuevamente.');
    } finally {
      changingSession.current = false;
      setBusy(false);
    }
  }

  return (
    <section className='opsCard tcAdminAccess' aria-label='Acceso administrativo'>
      <div className='tcAdminTitle'>
        {!allowed && <h2>Acceso administrativo</h2>}
        <span className='tcAdminBadge' data-allowed={allowed}>{allowed ? 'Sesión autorizada' : 'Acceso restringido'}</span>
        {allowed && <button type='button' className='tcAdminSignout' onClick={() => void signOut()} disabled={busy}>Cerrar sesión</button>}
      </div>
      {!allowed && <p role='status' aria-live='polite'>{message}</p>}
      {!allowed && <div className='tcAdminActions'>
        <button onClick={() => void verify(true)} disabled={busy}>Ingresar como administrador</button>
        <button onClick={() => void verify(false)} disabled={busy}>Verificar acceso</button>
      </div>}
      {allowed && <div className='tcAdminWorkspace'>
        <nav className='tcAdminNav' aria-label='Secciones administrativas'>
          {sections.map(({ id, title, icon: Icon }) => <button key={id} type='button'
            aria-current={section===id?'page':undefined}
            onClick={()=>setSection(id)}><Icon aria-hidden='true'/><span>{title}</span></button>)}
        </nav>
        <div className='tcAdminWorkspaceMain' id='tc-admin-content'>
          <Suspense fallback={<p className='tcAdminLoading' role='status'>Preparando esta sección…</p>}>
          {section==='inicio'&&<section className='tcAdminLanding' aria-label='Resumen ejecutivo'>
            <h3>Resumen</h3>
            <dl className='tcAdminHomeStats'>
              <div><dt>Publicaciones en portada</dt><dd>{summary?.publicVisible??'—'}</dd></div>
              <div><dt>Ofertas en revisión interna</dt><dd>{summary?.pending??'—'}</dd></div>
              <div><dt>Solicitudes publicitarias</dt><dd>{summary?.requests??'—'}</dd></div>
              <div><dt>Campañas activas</dt><dd>{summary?.campaigns??'—'}</dd></div>
            </dl>
            <p className='tcAdminLatest'>Último barrido: {summary?.lastSweep?new Date(summary.lastSweep).toLocaleString('es-CL'):'Sin información disponible'}.</p>
          </section>}
          {section==='solicitudes'&&<HouseCampaignAdmin mode='solicitudes'/>}
          {section==='campanas'&&<section className='tcAdminCampaignManagement'>
            <nav className='tcAdminSubnav' aria-label='Vistas de publicidad'>
              <button type='button' aria-current={campaignView==='comerciales'?'page':undefined} onClick={()=>setCampaignView('comerciales')}>Comerciales</button>
              <button type='button' aria-current={campaignView==='propias'?'page':undefined} onClick={()=>setCampaignView('propias')}>Campañas propias</button>
            </nav>
            {campaignView==='comerciales'?<CommercialOverview/>:<HouseCampaignAdmin mode='campanas'/>}
          </section>}
          {section==='ofertas'&&<>
            <nav className='tcAdminSubnav' aria-label='Vistas de empleos'>
              <button type='button' aria-current={jobView==='pendientes'?'page':undefined} onClick={()=>setJobView('pendientes')}>En revisión</button>
              <button type='button' aria-current={jobView==='catalogo'?'page':undefined} onClick={()=>setJobView('catalogo')}>Catálogo público</button>
            </nav>
            {jobView==='pendientes'?<RadarReviewInbox/>:<PublicInventoryAudit/>}
          </>}
          {section==='rescate'&&<InternalOfferReconciliation/>}
          {section==='motores'&&<ExecutiveControlCenter summary={summary} onSessionDenied={denyAccess}/>}
          {section==='fuentes'&&<SourceManagement onSessionDenied={denyAccess}/>}
          {section==='moderacion'&&<LocalDirectoryModeration/>}
          {section==='importacion'&&<><ChatGPTDirectConnector/><DocumentWorkExport/></>}
          {section==='respaldo'&&<BackupPanel/>}
          </Suspense>
        </div>
      </div>
    }</section>
  );
}

export function AdministratorShortcut({ inline = false }: { inline?: boolean }) {
  const [allowed, setAllowed] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [message, setMessage] = useState('');
  const generation = useRef(0);
  const working = useRef(false);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    const current = ++generation.current;
    const session = Boolean(await auth.getUser().catch(() => null));
    if (mounted.current && generation.current === current) {
      setSignedIn(session);
      if (!session) setAllowed(false);
    }
    const granted = await administratorPermission(session, () => api.get('/api/admin/session'));
    if (mounted.current && generation.current === current) {
      setAllowed(granted);
      setChecking(false);
    }
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
      await auth.signInWithRedirect({ scope:'openid email offline_access' });
    } catch (cause: unknown) {
      const code = (cause as { code?: string }).code;
      if (mounted.current) setMessage(code === 'auth/storage-unavailable' ? 'Habilita el almacenamiento del navegador.' : 'No se pudo iniciar sesión. Inténtalo nuevamente.');
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

  // El acceso a cuenta siempre está disponible; la administración real se concede
  // exclusivamente al validar la sesión contra el backend, nunca por estado local.
  return (
    <div className={'tcAccountControl' + (inline ? ' tcAccountInline' : '')}>
      {allowed && <a className='tcAdminShortcut' href='./admin'>Administración</a>}
      {!inline && <button className='tcAccountButton' disabled={busy} aria-expanded={menuOpen} onClick={() => { setMenuOpen(!menuOpen); }}>Mi cuenta</button>}
      {(inline || menuOpen) && <div className='tcAccountMenu' role='region' aria-label='Mi cuenta'>
        <b>{checking ? 'Comprobando cuenta…' : signedIn ? 'Tu sesión' : 'Mi cuenta'}</b>
        <p>{checking
          ? 'Restaurando el acceso de este navegador.'
          : signedIn
            ? allowed ? 'Administración autorizada en este dispositivo.' : 'Sesión iniciada. Puedes cambiar de cuenta si necesitas acceso administrativo.'
            : 'En este navegador necesitas iniciar sesión. La cuenta del teléfono no se transfiere automáticamente.'}</p>
        <button type='button' onClick={() => void login()} disabled={busy||checking}>{signedIn ? 'Cambiar cuenta' : 'Iniciar sesión'}</button>
        {signedIn && <button type='button' onClick={() => void logout()} disabled={busy||checking}>Cerrar sesión</button>}
        {!allowed && <a className='tcAdminEntryLink' href='./admin'>Acceso administrativo</a>}
        {!inline && <button onClick={() => setMenuOpen(false)}>Cerrar menú</button>}
        {message && <p role='status'>{message}</p>}
      </div>}
      {!inline && !menuOpen && message && <span className='tcAccountFeedback' role='status'>{message}</span>}
    </div>
  );
}

