import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { API_URL, setAuthToken } from '../api/config';

const AuthContext = createContext(null);
const STORAGE_KEY = 'hospital_auth';

function loadStored() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (data && data.token) {
      setAuthToken(data.token); // set before children make their first request
      return data;
    }
  } catch {
    /* ignore */
  }
  return { token: null, user: null };
}

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(loadStored);

  const persist = useCallback((data) => {
    setAuthToken(data.token);
    setAuth(data);
    try {
      if (data.token) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const clearAuth = useCallback(() => persist({ token: null, user: null }), [persist]);

  // Tell the server to revoke the token (best effort), then clear local state.
  const logout = useCallback(async () => {
    try {
      await axios.post(`${API_URL}/auth/logout`);
    } catch {
      /* already expired/revoked or offline: still sign out locally */
    }
    clearAuth();
  }, [clearAuth]);

  // Log out automatically if the server says the token is no longer valid.
  useEffect(() => {
    const id = axios.interceptors.response.use(
      (res) => res,
      (err) => {
        const url = err.config?.url || '';
        if (err.response?.status === 401 && !url.includes('/auth/')) clearAuth();
        return Promise.reject(err);
      }
    );
    return () => axios.interceptors.response.eject(id);
  }, [clearAuth]);

  const login = async (email, password) => {
    const { data } = await axios.post(`${API_URL}/auth/login`, { email, password });
    persist({ token: data.token, user: data.user });
  };

  // Creates the first admin (and logs in) when the system has no users yet.
  const registerFirstAdmin = async (name, email, password) => {
    const { data } = await axios.post(`${API_URL}/auth/register`, { name, email, password });
    persist({ token: data.token, user: data.user });
  };

  return (
    <AuthContext.Provider value={{ user: auth.user, token: auth.token, login, registerFirstAdmin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext);
}
