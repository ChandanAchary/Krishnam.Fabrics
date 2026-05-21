'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Layers, MailCheck, UserPlus } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { supabase } from '@/lib/supabase';
import { isSupabaseConfigured } from '@/lib/utils';
import { passwordSchema, emailSchema } from '@/lib/validation';

const schema = z
  .object({
    name: z.string().trim().min(2, 'Enter your full name').max(100),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type FormData = z.infer<typeof schema>;

export function RegisterPage() {
  const { signUp } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
  });

  // If an admin account already exists, registration is closed → go to Login.
  useEffect(() => {
    let active = true;
    supabase.rpc('admin_exists').then(({ data, error }) => {
      if (active && !error && data === true) router.replace('/login');
    });
    return () => {
      active = false;
    };
  }, [router]);

  const onSubmit = handleSubmit(async ({ name, email, password }) => {
    setSubmitting(true);
    const { error, needsConfirmation } = await signUp(name, email, password);
    setSubmitting(false);
    if (error) {
      toast.error(error);
      return;
    }
    if (needsConfirmation) {
      setConfirmSent(true);
      toast.success('Account created. Check your email to confirm, then sign in.');
      return;
    }
    toast.success('Account created. Welcome!');
    router.replace('/dashboard');
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-brand-50 to-slate-100 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 shadow-card">
            <Layers className="h-7 w-7 text-white" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-slate-900">Create the admin account</h1>
          <p className="mt-1 text-sm text-slate-500">
            No admin account found yet — create one to get started.
          </p>
        </div>

        {!isSupabaseConfigured() && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <strong className="font-semibold">Setup required:</strong> Add your Supabase keys to{' '}
            <code className="font-mono">.env.local</code> and restart the dev server.
          </div>
        )}

        <div className="card p-6">
          {confirmSent ? (
            <div className="text-center space-y-3">
              <div className="mx-auto h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center">
                <MailCheck className="h-6 w-6 text-emerald-600" />
              </div>
              <p className="text-sm text-slate-700">
                We&apos;ve sent a confirmation link to your email. Click it to activate your account, then sign in.
              </p>
              <Button variant="primary" className="w-full" onClick={() => router.replace('/login')}>
                Go to sign in
              </Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <Input label="Full name" required autoComplete="name" placeholder="e.g. Asha Verma"
                error={errors.name?.message} {...register('name')} />
              <Input label="Email" type="email" required autoComplete="email" placeholder="you@example.com"
                error={errors.email?.message} {...register('email')} />
              <Input
                label="Password"
                type={showPwd ? 'text' : 'password'}
                required
                autoComplete="new-password"
                placeholder="At least 8 chars, 1 letter & 1 number"
                error={errors.password?.message}
                rightIcon={
                  <button type="button" onClick={() => setShowPwd((v) => !v)}
                    className="text-slate-400 hover:text-slate-700" aria-label={showPwd ? 'Hide' : 'Show'}>
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
                {...register('password')}
              />
              <Input label="Confirm password" type={showPwd ? 'text' : 'password'} required
                autoComplete="new-password" placeholder="Re-enter your password"
                error={errors.confirmPassword?.message} {...register('confirmPassword')} />
              <Button type="submit" variant="primary" className="w-full" loading={submitting}
                leftIcon={<UserPlus className="h-4 w-4" />}>
                Create account
              </Button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link href="/login" className="text-brand-600 hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
