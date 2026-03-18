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
