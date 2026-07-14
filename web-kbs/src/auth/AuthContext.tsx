import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { loadStaffKbsPerms, type StaffKbsPerms } from '../lib/staffKbsPermissions';

type AuthState = {
  session: Session | null;
  loading: boolean;
  staffPerms: StaffKbsPerms | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [staffPerms, setStaffPerms] = useState<StaffKbsPerms | null>(null);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void supabase.auth.getSession().then(({ data }) => setSession(data.session));
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      sub.subscription.unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) {
      setStaffPerms(null);
      return;
    }
    let active = true;
    void loadStaffKbsPerms(uid).then((p) => {
      if (active) setStaffPerms(p);
    });
    return () => {
      active = false;
    };
  }, [session?.user?.id]);

  const value = useMemo<AuthState>(
    () => ({
      session,
      loading,
      staffPerms,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        return { error: error?.message ?? null };
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, loading, staffPerms]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
