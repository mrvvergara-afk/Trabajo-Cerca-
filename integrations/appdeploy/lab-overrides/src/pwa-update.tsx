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

  function update() {
    const worker = registration?.waiting;
    if (!worker) return;
    if (
      hasUnsentInput() &&
      !window.confirm(
        'Hay datos sin enviar. ¿Descartarlos y actualizar la aplicación?'
      )
    )
      return;
    requested.current = true;
    setUpdating(true);
    worker.postMessage({ type: 'SKIP_WAITING' });
  }

  if (!registration || deferred) return null;
  return (
    <aside className="tcPwaUpdateNotice" role="status" aria-live="polite">
      <div>
        <strong>Actualización disponible</strong>
        <span>Puedes actualizar cuando termines tus formularios.</span>
      </div>
      <button
        type="button"
        disabled={updating}
        onClick={() => setDeferred(true)}
      >
        Más tarde
      </button>
      <button type="button" disabled={updating} onClick={update}>
        {updating ? 'Actualizando…' : 'Actualizar'}
      </button>
    </aside>
  );
}
