import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css'
// ¡¡¡NUESTRA IGNICIÓN!!!
import { initializeApp } from "firebase/app";

// ¡¡¡TU "TESORO" VA AQUÍ!!!
// (Ahora cargado desde variables de entorno para seguridad)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// 🟢 TELEMETRÍA DE DIAGNÓSTICO (Protocolo Sutura V8.7)
console.log("[DEBUG] App Check attempt with ID:", firebaseConfig.appId);
console.log("[DEBUG] Firebase Project ID:", firebaseConfig.projectId);

// ¡¡¡ARRANCAMOS EL COCHE!!!
initializeApp(firebaseConfig);

// ¡El resto del código de React que ya tenías!
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
