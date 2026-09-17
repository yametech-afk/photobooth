import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { signInWithEmail, signUpWithEmail, signOut, type UserProfile } from '../services/auth';

type AuthState = {
  user: User | null;
  profile: UserProfile | null;
  initializing: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setInitializing(false);
    });
    return unsubscribe;
  }, []);

  // Live profile subscription (plan, credits, stats) whenever the user changes.
  // Read-only: `users/{uid}` is created and mutated by Cloud Functions only
  // (firestore.rules: create/update are server-owned for plan + credits).
  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        setProfile(snap.exists() ? ({ ...snap.data(), uid: snap.id } as UserProfile) : null);
      },
      (error) => {
        // A denied read must not break the session — the callables still work.
        console.warn('[photobooth] users/{uid} listener failed:', error?.code ?? error);
      }
    );
    return unsubscribe;
  }, [user]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      profile,
      initializing,
      // Both paths go through the backend bootstrapSession callable — the client
      // never writes the profile document itself (QA finding F-1).
      signIn: async (email, password) => {
        await signInWithEmail(email, password);
      },
      signUp: async (email, password, displayName) => {
        await signUpWithEmail(email, password, displayName);
      },
      logout: async () => {
        await signOut();
      },
    }),
    [user, profile, initializing]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuthContext must be used inside <AuthProvider>');
  }
  return ctx;
}