import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [token,   setToken]   = useState(() => localStorage.getItem('pm_token'));
  const [loading, setLoading] = useState(true);

  // Set axios default auth header and setup 401 interceptor
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      if (!user) {
        fetchMe();
      }
    } else {
      delete axios.defaults.headers.common['Authorization'];
      setUser(null);
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
      const { data } = await axios.get('/api/auth/me');
      setUser(data);
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
    axios.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }

  function logout() {
    localStorage.removeItem('pm_token');
    delete axios.defaults.headers.common['Authorization'];
    setToken(null);
    setUser(null);
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
