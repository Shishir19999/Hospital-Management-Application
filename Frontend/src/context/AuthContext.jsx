import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { setAuthToken } from '../api/config';
import { api } from '../api';
import { setUnauthorizedHandler } from '../api/errors';

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
      await api.auth.logout();
    } catch {
      /* already expired/revoked or offline: still sign out locally */
    }
    clearAuth();
  }, [clearAuth]);

  // Sign out automatically when the server says the token is no longer valid.
  useEffect(() => {
    setUnauthorizedHandler(clearAuth);
    return () => setUnauthorizedHandler(null);
  }, [clearAuth]);

  const login = async (email, password) => {
    const data = await api.auth.login(email, password);
    persist({ token: data.token, user: data.user });
  };

  // Creates the first admin (and logs in) when the system has no users yet.
  const registerFirstAdmin = async (name, email, password) => {
    const data = await api.auth.register(name, email, password);
    persist({ token: data.token, user: data.user });
  };

  return (
    <AuthContext.Provider
      value={{ user: auth.user, token: auth.token, role: auth.user?.role, login, registerFirstAdmin, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext);
}
