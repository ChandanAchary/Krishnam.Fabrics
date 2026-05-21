'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, KeyRound, Layers, ShieldCheck } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { supabase } from '@/lib/supabase';
import { passwordSchema } from '@/lib/validation';

const schema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type FormData = z.infer<typeof schema>;

/**
 * Landing page for the password-reset link emailed by Supabase. The recovery
 * token in the URL is exchanged for a temporary session (detectSessionInUrl),
 * after which updateUser({ password }) can set the new password.
 */
export function ResetPasswordPage() {
  const { updatePassword, signOut } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema), defaultValues: { password: '', confirmPassword: '' } });

  useEffect(() => {
    // The recovery link establishes a session and fires a PASSWORD_RECOVERY event.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setRecovered(true);
      }
      setReady(true);
    });
    // Also check if a session already exists (link processed before listener attached).
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setRecovered(true);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const onSubmit = handleSubmit(async ({ password }) => {
    setSubmitting(true);
    const { error } = await updatePassword(password);
    setSubmitting(false);
    if (error) {
      toast.error(error);
      return;
    }
    setDone(true);
    toast.success('Password updated. Please sign in.');
    // Sign out the temporary recovery session so the user logs in fresh.
    await signOut();
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-brand-50 to-slate-100 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 shadow-card">
            <Layers className="h-7 w-7 text-white" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-slate-900">Set a new password</h1>
        </div>

        <div className="card p-6">
          {done ? (
            <div className="text-center space-y-3">
              <div className="mx-auto h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center">
                <ShieldCheck className="h-6 w-6 text-emerald-600" />
              </div>
              <p className="text-sm text-slate-700">Your password has been updated.</p>
              <Button variant="primary" className="w-full" onClick={() => router.replace('/login')}>
                Go to sign in
              </Button>
            </div>
          ) : !ready ? (
            <p className="text-sm text-slate-500 text-center py-6">Verifying your reset link…</p>
          ) : !recovered ? (
            <div className="text-center space-y-3">
              <p className="text-sm text-slate-700">
                This reset link is invalid or has expired. Please request a new one.
              </p>
              <Link href="/forgot-password" className="btn-primary inline-flex">
                Request new link
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <Input
                label="New password"
                type={showPwd ? 'text' : 'password'}
                required
                autoComplete="new-password"
                placeholder="At least 8 chars, 1 letter & 1 number"
                leftIcon={<KeyRound className="h-4 w-4" />}
                rightIcon={
                  <button type="button" onClick={() => setShowPwd((v) => !v)}
                    className="text-slate-400 hover:text-slate-700" aria-label={showPwd ? 'Hide' : 'Show'}>
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
                error={errors.password?.message}
                {...register('password')}
              />
              <Input label="Confirm new password" type={showPwd ? 'text' : 'password'} required
                autoComplete="new-password" placeholder="Re-enter new password"
                error={errors.confirmPassword?.message} {...register('confirmPassword')} />
              <Button type="submit" variant="primary" className="w-full" loading={submitting}>
                Update password
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
