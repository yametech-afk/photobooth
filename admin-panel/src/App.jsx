import React from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuth, RequireAdmin } from './auth/AuthContext';
import { SideNav } from './components/UI';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Photos from './pages/Photos';
import Filters from './pages/Filters';
import Revenue from './pages/Revenue';
import Events from './pages/Events';
import Bookings from './pages/Bookings';
import Notifications from './pages/Notifications';
import Settings from './pages/Settings';

function Shell({ children }) {
  const { user, signOut, isConfigured } = useAuth();
  const navigate = useNavigate();
  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };
  return (
    <div className="shell">
      <SideNav />
      <div className="main">
        <header className="topbar">
          <strong>Welcome back, {user?.name || user?.email?.split('@')[0] || 'Admin'}</strong>
          <div className="spacer" />
          {!isConfigured && <span className="hint">Demo mode — no Firebase env vars set</span>}
          <div className="avatar">{(user?.name || user?.email || 'A')[0].toUpperCase()}</div>
          <button className="btn ghost small" onClick={handleSignOut}>Sign out</button>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}

const guarded = (el) => <RequireAdmin><Shell>{el}</Shell></RequireAdmin>;

export default function App() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
      <Route path="/dashboard" element={guarded(<Dashboard />)} />
      <Route path="/users" element={guarded(<Users />)} />
      <Route path="/photos" element={guarded(<Photos />)} />
      <Route path="/filters" element={guarded(<Filters />)} />
      <Route path="/revenue" element={guarded(<Revenue />)} />
      <Route path="/events" element={guarded(<Events />)} />
      <Route path="/bookings" element={guarded(<Bookings />)} />
      <Route path="/notifications" element={guarded(<Notifications />)} />
      <Route path="/settings" element={guarded(<Settings />)} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
