import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token,   setToken]   = useState(() => localStorage.getItem('pm_token'));
  const [user,    setUser]    = useState(() => {
    try {
      const saved = localStorage.getItem('pm_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(() => {
    const savedToken = localStorage.getItem('pm_token');
    const savedUser = localStorage.getItem('pm_user');
    return !!(savedToken && !savedUser);
  });

  // Set axios default auth header and setup 401 interceptor
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchMe();
    } else {
      delete axios.defaults.headers.common['Authorization'];
      setUser(null);
      localStorage.removeItem('pm_user');
      setLoading(false);
    }

    let interceptor;
    if (axios.interceptors?.response?.use) {
      interceptor = axios.interceptors.response.use(
        (res) => res,
        (err) => {
          if (err?.response?.status === 401 && !err.config?.url?.includes('/api/auth/login')) {
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
      localStorage.setItem('pm_user', JSON.stringify(data));
    } catch {
      logout();
    } finally {
      setLoading(false);
    }
  }

  async function login(email, password) {
    const { data } = await axios.post('/api/auth/login', { email, password });
    if (data.requires2FA) {
      return data;
    }
    localStorage.setItem('pm_token', data.token);
    localStorage.setItem('pm_user', JSON.stringify(data.user));
    axios.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
    setToken(data.token);
    setUser(data.user);
    setLoading(false);
    return data.user;
  }

  function logout() {
    localStorage.removeItem('pm_token');
    localStorage.removeItem('pm_user');
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
