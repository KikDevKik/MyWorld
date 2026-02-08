// 🟢 PROTOCOLO "FIRST-STRIKE" (Operación Tierra Quemada)
if (window.location.hostname === "localhost") {
  console.log("🔥 [FIRST-STRIKE] Initiating Localhost Override Protocol...");

  // 1. INYECCIÓN DE TOKEN MAESTRO (Antes de cualquier import de Firebase)
  (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = "C2E1F3B5-CB81-43C4-B0F0-D5AE210621C8";
  console.log("💉 [FIRST-STRIKE] INJECTION SUCCESS: Master Token Active.");

  // 2. LIMPIEZA DE CACHÉ DE BLOQUEO (IndexedDB)
  // Intentamos borrar la base de datos interna de App Check para forzar un nuevo handshake.
  const DB_NAME = "firebase-app-check-database";
  const req = indexedDB.deleteDatabase(DB_NAME);

  req.onsuccess = () => {
    console.log("🧹 [FIRST-STRIKE] CACHE CLEARED: Throttling state reset.");
  };
  req.onerror = () => {
    console.warn("⚠️ [FIRST-STRIKE] Cache clear failed (non-critical).");
  };
  req.onblocked = () => {
    console.warn("⚠️ [FIRST-STRIKE] Cache clear blocked. Close other tabs.");
  };
}

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import VerificationPage from './pages/VerificationPage';
import './index.css'
import './lib/firebase'; // 👈 IMPORTACIÓN DE LA IGNICIÓN (Efecto secundario)

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
