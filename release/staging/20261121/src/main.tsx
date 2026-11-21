import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App, { OperationsPanel } from './App';
import './index.css';
import './ux-admin-brand-hotfix.css';
import './ux-rc9-mobile.css';
import './consolidated-ux.css';
import './form-guidance.css';
import { PwaUpdateNotice } from './pwa-update';
import './pwa-update.css';
import './ux-preview-transfer.css';

// Opt-in visual release preview only. No changes for regular visitors.
if (new URLSearchParams(window.location.search).get('tc_release_preview') === '1')
  document.documentElement.dataset.tcReleasePreview = '1';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PwaUpdateNotice />
    {(window.location.pathname.split('/').filter(Boolean).slice(-1)[0] === 'admin' || window.location.pathname.split('/').filter(Boolean).slice(-1)[0] === 'administracion' || window.location.hash === '#operacion' || new URLSearchParams(window.location.search).get('panel') === 'administracion') ? <OperationsPanel /> : <App />}
  </StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js', { scope:'./', updateViaCache:'none' }).then(registration => {
      // Check for a newer shell when the page is opened. Never reload automatically:
      // a forced refresh could discard a job application or publication form.
      void registration.update().catch(() => undefined);
    }).catch(() => undefined);
  });
}
