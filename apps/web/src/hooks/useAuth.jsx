import React, { createContext, useContext, useState, useCallback } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('billu_user')); } catch { return null; }
  });
  const [token, setToken] = useState(() => localStorage.getItem('billu_token') || null);

  const saveAuth = useCallback((token, user) => {
    localStorage.setItem('billu_token', token);
    localStorage.setItem('billu_user', JSON.stringify(user));
    setToken(token);
    setUser(user);
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    saveAuth(data.token, data.user);
    return data;
  }, [saveAuth]);

  const register = useCallback(async (businessName, email, password) => {
    const { data } = await api.post('/auth/register', { businessName, email, password });
    const u = { id: data.user?.id, email, role: 'admin', name: businessName + ' Admin', tenantId: data.tenant.id, outletId: data.user?.outletId };
    saveAuth(data.token, u);
    return { ...data, isNewUser: true };
  }, [saveAuth]);

  const googleLogin = useCallback(async (credential, businessName) => {
    const { data } = await api.post('/auth/google', { credential, businessName });
    saveAuth(data.token, data.user);
    return data;
  }, [saveAuth]);

  const logout = useCallback(() => {
    localStorage.removeItem('billu_token');
    localStorage.removeItem('billu_user');
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, register, googleLogin, logout, isAuth: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
