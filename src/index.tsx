import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css'
// ¡¡¡NUESTRA IGNICIÓN!!!
import { initializeApp } from "firebase/app";

// ¡¡¡TU "TESORO" VA AQUÍ!!!
// (Ahora cargado desde variables de entorno para seguridad)
const fallbackConfig = {
    apiKey: "AIzaSyChkUGxtxmczf_AxtB8scRu73Dwk3wh_rc",
    authDomain: "myword-67b03.firebaseapp.com",
    projectId: "myword-67b03",
    storageBucket: "myword-67b03.firebasestorage.app",
    messagingSenderId: "479346922706",
    appId: "1:479346922706:web:af7d76f5f6f707d75f090b",
    measurementId: "G-3PEQ1BGFZF"
};

const firebaseConfig = {
  apiKey: import.meta.env.VITE_GOOGLE_API_KEY || fallbackConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || fallbackConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || fallbackConfig.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || fallbackConfig.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || fallbackConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || fallbackConfig.appId,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || fallbackConfig.measurementId
};

// 🟢 TELEMETRÍA DE DIAGNÓSTICO (Protocolo Sutura V8.7)
console.log("[DEBUG] App Check attempt with ID:", firebaseConfig.appId);
console.log("[DEBUG] Firebase Project ID:", firebaseConfig.projectId);
console.table(firebaseConfig);

// ¡¡¡ARRANCAMOS EL COCHE!!!
initializeApp(firebaseConfig);

// ¡El resto del código de React que ya tenías!
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
