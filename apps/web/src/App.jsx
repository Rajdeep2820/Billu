import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import Products from './pages/Products';
import Inventory from './pages/Inventory';
import Import from './pages/Import';
import Settings from './pages/Settings';
import Outlets from './pages/Outlets';
import CombinedAnalytics from './pages/CombinedAnalytics';
import Staff from './pages/Staff';

function ProtectedRoute({ children, allowedRoles }) {
  const { isAuth, user } = useAuth();
  if (!isAuth) return <Navigate to="/login" />;
  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    // Redirect to the best page for their role
    const fallback = user?.role === 'admin' || user?.role === 'manager'
      ? '/dashboard'
      : '/pos';
    return <Navigate to={fallback} />;
  }
  return children;
}

const ADMIN_ONLY   = ['admin'];
const ADMIN_MGR    = ['admin', 'manager'];

function AppRoutes() {
  return (
    <Routes>
      <Route path="/"           element={<Landing />} />
      <Route path="/login"      element={<Login />} />
      <Route path="/register"   element={<Register />} />
      <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />

      {/* Admin + Manager */}
      <Route path="/dashboard"  element={<ProtectedRoute allowedRoles={ADMIN_MGR}><Dashboard /></ProtectedRoute>} />
      <Route path="/products"   element={<ProtectedRoute allowedRoles={ADMIN_MGR}><Products /></ProtectedRoute>} />
      <Route path="/inventory"  element={<ProtectedRoute allowedRoles={ADMIN_MGR}><Inventory /></ProtectedRoute>} />
      <Route path="/import"     element={<ProtectedRoute allowedRoles={ADMIN_MGR}><Import /></ProtectedRoute>} />

      {/* Admin only */}
      <Route path="/staff"      element={<ProtectedRoute allowedRoles={ADMIN_ONLY}><Staff /></ProtectedRoute>} />
      <Route path="/outlets"    element={<ProtectedRoute allowedRoles={ADMIN_ONLY}><Outlets /></ProtectedRoute>} />
      <Route path="/analytics"  element={<ProtectedRoute allowedRoles={ADMIN_ONLY}><CombinedAnalytics /></ProtectedRoute>} />

      {/* All authenticated users */}
      <Route path="/settings"   element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="/pos"        element={<ProtectedRoute><POS /></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );


export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
