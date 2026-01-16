import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css'
import './lib/firebase'; // 👈 IMPORTACIÓN DE LA IGNICIÓN (Efecto secundario)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
