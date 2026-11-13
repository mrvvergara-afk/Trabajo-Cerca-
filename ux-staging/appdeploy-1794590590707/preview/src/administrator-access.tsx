import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
const HouseCampaignAdmin = lazy(() => import('./house-admin').then(module => ({ default: module.HouseCampaignAdmin })));
const CommercialOverview = lazy(() => import('./commercial-overview').then(module => ({ default: module.CommercialOverview })));
const BackupPanel = lazy(() => import('./backup-panel').then(module => ({ default: module.BackupPanel })));
const DocumentWorkExport = lazy(() => import('./document-work-export').then(module => ({ default: module.DocumentWorkExport })));
const RadarReviewInbox = lazy(() => import('./radar-review-inbox').then(module => ({ default: module.RadarReviewInbox })));
const PublicInventoryAudit = lazy(() => import('./public-inventory-audit').then(module => ({ default: module.PublicInventoryAudit })));
const InternalOfferReconciliation = lazy(() => import('./internal-offer-reconciliation').then(module => ({ default: module.InternalOfferReconciliation })));
const TerritorialCoverageAudit = lazy(() => import('./territorial-coverage-audit').then(module => ({ default: module.TerritorialCoverageAudit })));
const ChatGPTDirectConnector = lazy(() => import('./chatgpt-direct-connector').then(module => ({ default: module.ChatGPTDirectConnector })));
import { administratorPermission } from './administrator-permission';
import './administrator-access.css';
import './admin-workspace.css';
import { api, auth } from '@appdeploy/client';

type AdminSummary={jobs:number;publicVisible:number;verified:number;pending:number;campaigns:number;requests:number;lastSweep?:string};
export function AdministratorAccess({summary}:{summary?:AdminSummary}) {
  const [message, setMessage] = useState('Inicia sesión para comprobar el acceso administrativo.');
  const [busy, setBusy] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [section,setSection] = useState<'inicio'|'solicitudes'|'campanas'|'ofertas'|'motores'|'importacion'|'respaldo'>('inicio');
  const sections=[
    {id:'inicio',title:'Panel general'},
    {id:'solicitudes',title:'Solicitudes'},
    {id:'campanas',title:'Publicidad y campañas'},
    {id:'ofertas',title:'Ofertas laborales'},
    {id:'motores',title:'Motores y fuentes'},
    {id:'importacion',title:'Importación y datos'},
    {id:'respaldo',title:'Configuración y respaldo'},
  ] as const;
  useEffect(()=>{
    let active=true;
    void auth.getUser().then(async user=>{
      if(!user)return;
      const response=await api.get('/api/admin/session');
      if(active&&response.data?.administrator===true){
        setAllowed(true);
        setMessage('Sesión administrativa restaurada.');
      }
    }).catch(()=>undefined);
    return()=>{active=false;};
  },[]);

  async function verify(signIn: boolean) {
    setBusy(true);
    setAllowed(false);
    try {
      if(signIn){await auth.signInWithRedirect({scope:'openid email profile offline_access'});return;}
      await auth.getUser();
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
      {!allowed && <button onClick={() => void verify(true)} disabled={busy}>Ingresar como administrador</button>}
      {!allowed && <button onClick={() => void verify(false)} disabled={busy}>Verificar acceso</button>}
      {allowed && <button onClick={() => void signOut()} disabled={busy}>Cerrar sesión</button>}
      </div>
      {allowed && <div className='tcAdminWorkspace'>
        <aside className='tcAdminSidebar'>
          <div className='tcAdminSidebarBrand'><strong>Trabajo Cerca</strong><small>Administración privada</small></div>
          <nav aria-label='Secciones administrativas'>
            {sections.map(item=><button key={item.id} type='button'
              aria-current={section===item.id?'page':undefined}
              className={section===item.id?'active':''}
              onClick={()=>setSection(item.id)}>{item.title}</button>)}
          </nav>
        </aside>
        <div className='tcAdminWorkspaceMain'>
          <Suspense fallback={<p className='tcAdminLoading' role='status'>Preparando esta sección…</p>}>
          {section==='inicio'&&<section className='tcAdminLanding' aria-label='Panel general'>
            <span className='tcAdminEyebrow'>RESUMEN OPERATIVO</span>
            <h3>Panel general</h3>
            <p>Controla las publicaciones y campañas desde un solo lugar.</p>
            <div className='tcAdminStatGrid'>
              <article><small>Ofertas visibles en Trabajo Cerca</small><strong>{summary?.publicVisible??'—'}</strong><span>{summary?.jobs??'—'} registros internos activos · {summary?.verified??'—'} verificados internamente</span></article>
              <article><small>Por revisar</small><strong>{summary?.pending??'—'}</strong><span>Candidatos laborales</span></article>
              <article><small>Solicitudes comerciales</small><strong>{summary?.requests??'—'}</strong><span>Registros recibidos</span></article>
              <article><small>Campañas activas</small><strong>{summary?.campaigns??'—'}</strong><span>Estado administrativo</span></article>
            </div>
            <h4>Accesos rápidos</h4>
            <div className='tcAdminTiles'>
              <button onClick={()=>setSection('solicitudes')}><strong>Solicitudes publicitarias</strong><span>Revisar clientes, autorizar anuncios y preparar imágenes.</span></button>
              <button onClick={()=>setSection('campanas')}><strong>Publicidad y campañas</strong><span>Comprobar vigencia, lugares y publicación de los anuncios.</span></button>
              <button onClick={()=>setSection('ofertas')}><strong>Ofertas laborales</strong><span>Auditar catálogo público y revisar avisos pendientes.</span></button>
              <button onClick={()=>setSection('motores')}><strong>Motores de rastreo</strong><span>Ver fuentes y diagnósticos del radar.</span></button>
            </div>
            <p className='tcAdminLatest'>Último barrido: {summary?.lastSweep?new Date(summary.lastSweep).toLocaleString('es-CL'):'Sin información disponible'}.</p>
          </section>}
          {section==='solicitudes'&&<HouseCampaignAdmin mode='solicitudes'/>}
          {section==='campanas'&&<section className='tcAdminCampaignManagement'>
            <h2>Publicidad y campañas</h2>
            <p>Revisa los anuncios comerciales y comprueba si aparecen en el catálogo público.</p>
            <CommercialOverview/>
            <details className='tcAdminAdvanced'>
              <summary>Campañas propias, promoción y configuración avanzada</summary>
              <HouseCampaignAdmin mode='campanas'/>
            </details>
          </section>}
          {section==='ofertas'&&<><TerritorialCoverageAudit/><InternalOfferReconciliation/><PublicInventoryAudit/><RadarReviewInbox/></>}
          {section==='motores'&&<section className='tcAdminInfo'>
            <h3>Motores y fuentes</h3>
            <p>Los motores automáticos siguen su programación. La ejecución manual permanece deshabilitada.</p>
            <p>El diagnóstico técnico está disponible en la sección inferior de esta página.</p>
            <a href='#ops-diagnostico'>Ir al diagnóstico</a>
          </section>}
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
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [message, setMessage] = useState('');
  const generation = useRef(0);
  const working = useRef(false);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    const current = ++generation.current;
    const session = Boolean(await auth.getUser().catch(() => null));
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
      await auth.signInWithRedirect({ scope:'openid email profile offline_access' });
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

  // En el menú público solo aparece Administración para una cuenta validada por el backend.
  if (inline && !allowed) return null;

  return (
    <div className={'tcAccountControl' + (inline ? ' tcAccountInline' : '')}>
      {allowed && <a className='tcAdminShortcut' href={window.location.pathname+'?panel=administracion'} target='_blank' rel='noopener noreferrer'>Administración</a>}
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

