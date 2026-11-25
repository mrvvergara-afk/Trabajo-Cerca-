import { useEffect, useRef, useState } from 'react';

// React-controlled inputs may synchronize defaultValue on rerender. A
// comparison to defaultValue alone is insufficient to protect unsent drafts.
// Track real interactions per mounted form (not across closed form elements).
const touchedForms = new WeakSet<HTMLFormElement>();
function trackFormInteraction(event: Event) {
  const target = event.target;
  if (
    !(target instanceof HTMLInputElement) &&
    !(target instanceof HTMLTextAreaElement) &&
    !(target instanceof HTMLSelectElement)
  ) return;
  if (target.disabled) return;
  if (
    target instanceof HTMLInputElement &&
    ['hidden', 'submit', 'button', 'reset'].includes(target.type)
  ) return;
  const form = target.form;
  if (form && form.getAttribute('role') !== 'search')
    touchedForms.add(form);
}

function hasUnsentInput(): boolean {
  // WeakSet entries for unmounted/closed forms are never inspected.
  for (const form of document.querySelectorAll<HTMLFormElement>('form')) {
    if (touchedForms.has(form)) return true;
  }
  const inputs = document.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >('form input, form textarea, form select');
  for (const input of inputs) {
    if (input.disabled || input.type === 'hidden' || input.type === 'submit')
      continue;
    if (
      input instanceof HTMLInputElement &&
      (input.type === 'checkbox' || input.type === 'radio')
    ) {
      if (input.checked !== input.defaultChecked) return true;
    } else if (input.value && input.value !== input.defaultValue) {
      return true;
    }
  }
  return false;
}

export function PwaUpdateNotice() {
  const [registration, setRegistration] =
    useState<ServiceWorkerRegistration | null>(null);
  const [deferred, setDeferred] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [newBundle, setNewBundle] = useState(false);
  const requested = useRef(false);

  useEffect(() => {
    // Capturing listeners see input events even when React uses controlled
    // values and updates the native defaultValue property.
    document.addEventListener('input', trackFormInteraction, true);
    document.addEventListener('change', trackFormInteraction, true);
    return () => {
      document.removeEventListener('input', trackFormInteraction, true);
      document.removeEventListener('change', trackFormInteraction, true);
    };
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let alive = true;
    let active: ServiceWorkerRegistration | null = null;
    const onWorkerState = () => {
      if (alive && active?.waiting && navigator.serviceWorker.controller)
        setRegistration(active);
    };
    const onUpdateFound = () => {
      active?.installing?.addEventListener('statechange', onWorkerState);
      onWorkerState();
    };
    const onControllerChanged = () => {
      if (requested.current) window.location.reload();
    };
    const check = () => {
      if (document.visibilityState === 'hidden') return;
      void navigator.serviceWorker
        .getRegistration('./')
        .then(reg => {
          if (!alive || !reg) return;
          if (active !== reg) {
            active?.removeEventListener('updatefound', onUpdateFound);
            active = reg;
            active.addEventListener('updatefound', onUpdateFound);
          }
          onWorkerState();
          void reg.update().catch(() => undefined);
        })
        .catch(() => undefined);
    };
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      onControllerChanged
    );
    document.addEventListener('visibilitychange', check);
    check();
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', check);
      navigator.serviceWorker.removeEventListener(
        'controllerchange',
        onControllerChanged
      );
      active?.removeEventListener('updatefound', onUpdateFound);
    };
  }, []);

  useEffect(() => {
    // The worker source may be identical after an app-only deployment.
    // Detect a changed Vite asset fingerprint without refreshing an open form.
    const localScript = Array.from(document.scripts)
      .map(script => script.src)
      .find(src => {
        try {
          const u = new URL(src, window.location.href);
          return u.origin === window.location.origin &&
            /\/assets\/[^/]+\.js$/.test(u.pathname);
        } catch { return false; }
      });
    if (!localScript) return;
    const current = new URL(localScript).pathname;
    let alive = true;
    let pending = false;
    async function checkCurrentAssets() {
      if (document.hidden || pending) return;
      pending = true;
      try {
        const endpoint = new URL('/', window.location.origin);
        endpoint.searchParams.set('tc_update_check', '1');
        const response = await fetch(endpoint, {
          cache: 'no-store', headers: { Accept: 'text/html' },
          signal: AbortSignal.timeout(7000),
        });
        if (!response.ok || !/text\/html/i.test(
          response.headers.get('content-type') || '')) return;
        const html = await response.text();
        if (html.length > 350000) return;
        const match = html.match(
          /<script\b[^>]*\bsrc=["']([^"']+\.js(?:\?[^"']*)?)["'][^>]*>/i
        );
        if (!match) return;
        const remote = new URL(match[1], response.url);
        if (alive && remote.origin === window.location.origin &&
          /\/assets\/[^/]+\.js$/.test(remote.pathname) &&
          remote.pathname !== current)
          setNewBundle(true);
      } catch {
        // Offline visitors keep their existing app and unsent forms.
      } finally { pending = false; }
    }
    const checkVisible = () => { if (!document.hidden) void checkCurrentAssets(); };
    document.addEventListener('visibilitychange', checkVisible);
    window.addEventListener('focus', checkVisible);
    const timer = window.setInterval(checkVisible, 10 * 60 * 1000);
    void checkCurrentAssets();
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', checkVisible);
      document.removeEventListener('visibilitychange', checkVisible);
    };
  }, []);

  useEffect(() => {
    const onLazyChunkError = (event: PromiseRejectionEvent) => {
      const reason = event.reason as { message?: unknown } | undefined;
      const detail = typeof reason?.message === 'string'
        ? reason.message : String(event.reason || '');
      if (/failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module/i.test(detail)) {
        // A stale chunk must trigger a user-approved refresh, never discard
        // an active form or force the service worker to skip waiting.
        setNewBundle(true);
        setDeferred(false);
      }
    };
    window.addEventListener('unhandledrejection', onLazyChunkError);
    return () => window.removeEventListener('unhandledrejection', onLazyChunkError);
  }, []);

  function update() {
    const worker = registration?.waiting;
    if (!worker && !newBundle) return;
    if (
      hasUnsentInput() &&
      !window.confirm(
        'Hay datos sin enviar. ¿Descartarlos y actualizar la aplicación?'
      )
    )
      return;
    requested.current = true;
    setUpdating(true);
    if (worker) worker.postMessage({ type: 'SKIP_WAITING' });
    else window.location.reload();
  }

  if ((!registration && !newBundle) || deferred) return null;
  return (
    <aside className="tcPwaUpdateNotice" role="status" aria-live="polite">
      <div>
        <strong>Actualización disponible</strong>
        <span>Instala una nueva versión de Trabajo Cerca en este dispositivo. Los formularios abiertos se protegen.</span>
      </div>
      <button
        type="button"
        disabled={updating}
        onClick={() => setDeferred(true)}
      >
        Más tarde
      </button>
      <button type="button" disabled={updating} onClick={update}>
        {updating ? 'Actualizando…' : 'Actualizar aquí'}
      </button>
    </aside>
  );
}
