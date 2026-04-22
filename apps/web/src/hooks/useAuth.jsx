import React, { createContext, useContext, useState, useCallback } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('billu_user')); } catch { return null; }
  });
  const [token, setToken] = useState(() => localStorage.getItem('billu_token') || null);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('billu_token', data.token);
    localStorage.setItem('billu_user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    return data;
  }, []);

  const register = useCallback(async (businessName, email, password) => {
    const { data } = await api.post('/auth/register', { businessName, email, password });
    localStorage.setItem('billu_token', data.token);
    localStorage.setItem('billu_user', JSON.stringify({ email, role: 'admin', tenantId: data.tenant.id }));
    setToken(data.token);
    setUser({ email, role: 'admin', tenantId: data.tenant.id });
    return data;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('billu_token');
    localStorage.removeItem('billu_user');
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, isAuth: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
