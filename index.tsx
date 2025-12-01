import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css'
// ¡¡¡NUESTRA IGNICIÓN!!!
import { initializeApp } from "firebase/app";

// ¡¡¡TU "TESORO" VA AQUÍ!!!
// (¡Pega el 'firebaseConfig' que copiaste de Firebase!)
const firebaseConfig = {
  apiKey: "AIzaSyChkUGxtxmczf_AxtB8scRu73Dwk3wh_rc", // ¡PON TU LLAVE REAL AQUÍ!
  authDomain: "myword-67b03.firebaseapp.com",
  projectId: "myword-67b03",
  storageBucket: "myword-67b03.appspot.com",
  messagingSenderId: "479346922786",
  appId: "1:479346922786:web:af7d76f5f6f707d75f090b",
  measurementId: "G-3PEQ1BGFZF"
};

// ¡¡¡ARRANCAMOS EL COCHE!!!
initializeApp(firebaseConfig);

// ¡El resto del código de React que ya tenías!
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)