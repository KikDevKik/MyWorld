import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import VerificationPage from './pages/VerificationPage';
import './index.css'
import { initTheme } from './utils/theme';
import { reloadForNewVersion } from './utils/lazyView';
import './lib/firebase'; // 👈 IMPORTACIÓN DE LA IGNICIÓN (Efecto secundario)
import { initErrorReporting } from './services/errorReport';
initErrorReporting();

initTheme();

// Nov 2026: Vite avisa cuando no puede cargar un archivo de la versión anterior (pasa justo después de un deploy).
// Se recarga una vez para traer la versión nueva en lugar de dejar la app en negro.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadForNewVersion()) event.preventDefault();
});

// 🟢 MANUAL ROUTING (The Judge's Chambers)
const path = window.location.pathname;
const verifyMatch = path.match(/^\/verify\/([^/]+)$/);

const RootComponent = () => {
  if (verifyMatch) {
    const certificateId = verifyMatch[1];
    return <VerificationPage certificateId={certificateId} />;
  }
  return <App />;
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>,
)
