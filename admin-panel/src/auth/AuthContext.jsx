/**
 * Auth context + guard.
 *
 * SECURITY: client-side admin checks are UX only. Real enforcement must
 * happen in Firestore Security Rules (admins can read/write everything,
 * users only their own docs) and via custom claims:
 *
 *   admin.auth().setCustomUserClaims(uid, { role: 'superadmin' })
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { adminSignOut, isConfigured, watchAuth } from '../services/firebase';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

const SESSION_KEY = 'pb_admin_session';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
  });

  useEffect(() => {
    if (!isConfigured) return; // mock mode: session persisted locally
    const unsub = watchAuth((u) => {
      if (u) {
        const enriched = { ...u, role: user?.role || 'admin' };
        setUser(enriched);
        localStorage.setItem(SESSION_KEY, JSON.stringify(enriched));
      } else {
        setUser(null);
        localStorage.removeItem(SESSION_KEY);
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(
    () => ({
      user,
      isConfigured,
      signIn: (u) => {
        setUser(u);
        localStorage.setItem(SESSION_KEY, JSON.stringify(u));
      },
      signOut: async () => {
        if (isConfigured) await adminSignOut();
        setUser(null);
        localStorage.removeItem(SESSION_KEY);
      },
    }),
    [user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Route guard: unauthenticated visitors are bounced to /login. */
export function RequireAdmin({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}
