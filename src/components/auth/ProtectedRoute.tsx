'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { FullPageSpinner } from '@/components/ui/Spinner';

/**
 * Auth gating is primarily handled by `middleware.ts`. This client guard adds a
 * belt-and-suspenders check for the authenticated layout (covers client-side
 * navigations and session expiry without a full reload).
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { loading, session } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session) router.replace('/login');
  }, [loading, session, router]);

  if (loading) return <FullPageSpinner />;
  if (!session) return <FullPageSpinner />;
  return <>{children}</>;
}

/** Role guard for admin-only pages (Settings, Audit Logs). */
export function AdminGuard({ children }: { children: ReactNode }) {
  const { loading, session, isAdmin } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!session) router.replace('/login');
    else if (!isAdmin) router.replace('/dashboard?accessDenied=1');
  }, [loading, session, isAdmin, router]);

  if (loading || !session || !isAdmin) return <FullPageSpinner />;
  return <>{children}</>;
}
