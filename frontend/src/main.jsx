import React    from 'react';
import ReactDOM from 'react-dom/client';
import App      from './App';
import './index.css';

import axios from 'axios';
import { registerSW } from 'virtual:pwa-register';

axios.defaults.withCredentials = true;

if (import.meta.env.VITE_API_URL) {
  axios.defaults.baseURL = import.meta.env.VITE_API_URL;
}

registerSW({ immediate: true });

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then((reg) => {
        console.log('[SW Register] Service worker prêt sur :', reg.scope);
      })
      .catch((err) => {
        console.warn('[SW Register] Erreur fallback:', err);
      });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
