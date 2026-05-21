'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { AppRole } from '@/types/database';

interface AuthState {
  loading: boolean;
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  fullName: string | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    name: string,
    email: string,
    password: string
  ) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  verifyPasswordResetOtp: (
    email: string,
    code: string,
    newPassword: string
  ) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  updateEmail: (email: string) => Promise<{ error: string | null }>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

function readRoleFromSession(session: Session | null): AppRole | null {
  if (!session) return null;
  // JWT claim "app_role" injected by custom_access_token_hook.
  const claim = (session.user.app_metadata as Record<string, unknown> | undefined)?.app_role
    ?? (session.user.user_metadata as Record<string, unknown> | undefined)?.app_role
    // Decode from access_token if needed (claim added by hook lands in payload).
    ?? null;
  if (claim === 'admin' || claim === 'manager') return claim;
  return null;
}

function decodeJWTRole(accessToken: string | undefined): AppRole | null {
  if (!accessToken) return null;
  try {
    const [, payload] = accessToken.split('.');
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    const r = json.app_role;
    if (r === 'admin' || r === 'manager') return r;
    return null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const hydrateProfile = useCallback(async (newSession: Session | null) => {
    if (!newSession) {
      setRole(null);
      setFullName(null);
      return;
    }
    // Try JWT claims first (fast, no round-trip)
    const claimRole = readRoleFromSession(newSession) ?? decodeJWTRole(newSession.access_token);
    if (claimRole) {
      setRole(claimRole);
    }
    // Fetch app_users row for full_name (+ fallback role)
    const { data, error } = await supabase
      .from('app_users')
      .select('full_name, role')
      .eq('user_id', newSession.user.id)
      .maybeSingle();
    if (!error && data) {
      setFullName(data.full_name);
      if (!claimRole && (data.role === 'admin' || data.role === 'manager')) {
        setRole(data.role);
      }
    } else if (!claimRole) {
      setRole('manager');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      void hydrateProfile(data.session).finally(() => setLoading(false));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      void hydrateProfile(newSession);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [hydrateProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: 'Invalid email or password. Please try again.' };
    return { error: null };
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });
    if (error) return { error: error.message, needsConfirmation: false };
    // No session returned → Supabase "Confirm email" is ON → user must verify.
    const needsConfirmation = !data.session;
    return { error: null, needsConfirmation };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setRole(null);
    setFullName(null);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    // Sends a recovery email. With the email template showing {{ .Token }}, the
    // user receives a 6-digit OTP (and a fallback link to /reset-password).
    const redirectTo = `${window.location.origin}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) return { error: error.message };
    return { error: null };
  }, []);

  const verifyPasswordResetOtp = useCallback(
    async (email: string, code: string, newPassword: string) => {
      // Verify the 6-digit recovery code → establishes a session → set password.
      const { error: vErr } = await supabase.auth.verifyOtp({ email, token: code, type: 'recovery' });
      if (vErr) return { error: 'Invalid or expired code. Please try again.' };
      const { error: uErr } = await supabase.auth.updateUser({ password: newPassword });
      if (uErr) return { error: uErr.message };
      // Sign out the temporary recovery session so the user logs in fresh.
      await supabase.auth.signOut();
      return { error: null };
    },
    []
  );

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { error: error.message };
    return { error: null };
  }, []);

  const updateEmail = useCallback(async (email: string) => {
    // Sends a confirmation link to the new address (via your Supabase SMTP / Brevo).
    const { error } = await supabase.auth.updateUser(
      { email },
      { emailRedirectTo: `${window.location.origin}/login` }
    );
    if (error) return { error: error.message };
    return { error: null };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      role,
      fullName,
      signIn,
      signUp,
      signOut,
      resetPassword,
      verifyPasswordResetOtp,
      updatePassword,
      updateEmail,
      isAdmin: role === 'admin',
    }),
    [
      loading,
      session,
      role,
      fullName,
      signIn,
      signUp,
      signOut,
      resetPassword,
      verifyPasswordResetOtp,
      updatePassword,
      updateEmail,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
