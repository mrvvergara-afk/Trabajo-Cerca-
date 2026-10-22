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
    void navigator.serviceWorker.register('./sw.js', { scope:'./' }).catch(() => undefined);
  });
}

