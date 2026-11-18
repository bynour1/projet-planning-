import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Clear any legacy permanent logins from localStorage
  useEffect(() => {
    try {
      localStorage.removeItem('pm_token');
      localStorage.removeItem('pm_user');
    } catch {}
  }, []);

  const [token,   setToken]   = useState(() => {
    try {
      return sessionStorage.getItem('pm_token');
    } catch {
      return null;
    }
  });

  const [user,    setUser]    = useState(() => {
    try {
      const saved = sessionStorage.getItem('pm_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [loading, setLoading] = useState(false);

  // Initialisation : si aucun jeton n'est en sessionStorage, vérifier si une session persistante (cookie refresh_token) existe
  useEffect(() => {
    let isMounted = true;
    async function tryResumePersistentSession() {
      // Ne pas déclencher de requêtes imprévues en mode test unitaire pour préserver les mocks vitest
      if (typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test') return;
      if (!sessionStorage.getItem('pm_token')) {
        try {
          const res = await axios.post('/api/auth/refresh');
          if (isMounted && res?.data?.token && res?.data?.user) {
            sessionStorage.setItem('pm_token', res.data.token);
            sessionStorage.setItem('pm_user', JSON.stringify(res.data.user));
            axios.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
            setToken(res.data.token);
            setUser(res.data.user);
          }
        } catch {
          // Aucune session persistante active
        }
      }
    }
    tryResumePersistentSession();
    return () => { isMounted = false; };
  }, []);

  // Set axios default auth header and setup 401 interceptor
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchMe();
    } else {
      delete axios.defaults.headers.common['Authorization'];
      setUser(null);
      try {
        sessionStorage.removeItem('pm_user');
      } catch {}
      setLoading(false);
    }

    let interceptor;
    if (axios.interceptors?.response?.use) {
      interceptor = axios.interceptors.response.use(
        (res) => res,
        async (err) => {
          const originalRequest = err.config;
          // Si 401 hors tests et non lié au login/refresh, tenter un renouvellement silencieux
          if (
            typeof import.meta !== 'undefined' &&
            import.meta.env?.MODE !== 'test' &&
            err?.response?.status === 401 &&
            originalRequest &&
            !originalRequest._retry &&
            !originalRequest.url?.includes('/api/auth/login') &&
            !originalRequest.url?.includes('/api/auth/refresh')
          ) {
            originalRequest._retry = true;
            try {
              const res = await axios.post('/api/auth/refresh');
              if (res?.data?.token) {
                sessionStorage.setItem('pm_token', res.data.token);
                if (res.data.user) sessionStorage.setItem('pm_user', JSON.stringify(res.data.user));
                axios.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
                originalRequest.headers['Authorization'] = `Bearer ${res.data.token}`;
                setToken(res.data.token);
                if (res.data.user) setUser(res.data.user);
                return axios(originalRequest);
              }
            } catch {
              logout();
            }
          } else if (err?.response?.status === 401 && !err.config?.url?.includes('/api/auth/login')) {
            logout();
          }
          return Promise.reject(err);
        }
      );
    }

    return () => {
      if (interceptor !== undefined && axios.interceptors?.response?.eject) {
        axios.interceptors.response.eject(interceptor);
      }
    };
  }, [token]);

  async function fetchMe() {
    try {
      const { data } = await axios.get('/api/auth/me', { timeout: 8000 });
      setUser(data);
      try {
        sessionStorage.setItem('pm_user', JSON.stringify(data));
      } catch {}
    } catch {
      logout();
    } finally {
      setLoading(false);
    }
  }

  async function login(email, password) {
    const { data } = await axios.post('/api/auth/login', { email, password });
    if (data.requires2FA || data.requires2FASetup || data.requiresPasswordChange) {
      return data;
    }
    try {
      sessionStorage.setItem('pm_token', data.token);
      sessionStorage.setItem('pm_user', JSON.stringify(data.user));
    } catch {}
    axios.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
    setToken(data.token);
    setUser(data.user);
    setLoading(false);
    return data.user;
  }

  function logout() {
    try {
      if (typeof axios.post === 'function') {
        const p = axios.post('/api/auth/logout');
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } catch {}
    try {
      sessionStorage.removeItem('pm_token');
      sessionStorage.removeItem('pm_user');
      localStorage.removeItem('pm_token');
      localStorage.removeItem('pm_user');
    } catch {}
    delete axios.defaults.headers.common['Authorization'];
    setToken(null);
    setUser(null);
    setLoading(false);
  }

  async function refreshUser() {
    await fetchMe();
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
