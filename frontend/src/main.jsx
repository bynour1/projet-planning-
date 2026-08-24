import React    from 'react';
import ReactDOM from 'react-dom/client';
import App      from './App';
import './index.css';

import axios from 'axios';
import { registerSW } from 'virtual:pwa-register';

if (import.meta.env.VITE_API_URL) {
  axios.defaults.baseURL = import.meta.env.VITE_API_URL;
}

registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
