import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App, { OperationsPanel } from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {window.location.hash === '#operacion' ? <OperationsPanel /> : <App />}
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
