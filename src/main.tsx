import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App, { OperationsPanel } from './App';
import { PwaUpdateNotice } from './pwa-update';
import './index.css';
import './ux-admin-brand-hotfix.css';
import './ux-rc9-mobile.css';
import './ux-preview-transfer.css';
import './consolidated-ux.css';
import './form-guidance.css';
import './pwa-update.css';
import './official-mobile-fix.css';

// Keep the existing opt-in visual release preview for diagnostic comparisons.
if (new URLSearchParams(window.location.search).get('tc_release_preview') === '1') {
  document.documentElement.dataset.tcReleasePreview = '1';
}
const parts = window.location.pathname.split('/').filter(Boolean);
const route = parts[parts.length - 1] || '';
const params = new URLSearchParams(window.location.search);
const adminPage = route === 'admin' || route === 'administracion' ||
  window.location.hash === '#operacion' ||
  params.get('panel') === 'administracion';
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PwaUpdateNotice />
    {adminPage ? <OperationsPanel /> : <App />}
  </StrictMode>
);
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js', {
      scope: './', updateViaCache: 'none'
    }).then(registration => {
      // The new worker waits until the user approves, preserving open forms.
      void registration.update().catch(() => undefined);
    }).catch(() => undefined);
  });
}
