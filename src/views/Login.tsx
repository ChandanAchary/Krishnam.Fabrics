'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { supabase } from '@/lib/supabase';
import { isSupabaseConfigured } from '@/lib/utils';

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type FormData = z.infer<typeof schema>;

export function LoginPage() {
  const { session, loading, signIn } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const from = searchParams.get('from') || '/dashboard';

  // Already signed in → bounce to the intended page.
  useEffect(() => {
    if (!loading && session) router.replace(from);
  }, [loading, session, from, router]);

  // If no admin account exists yet → send to Register to create it first.
  useEffect(() => {
    let active = true;
    supabase.rpc('admin_exists').then(({ data, error }) => {
      if (active && !error && data === false) router.replace('/register');
    });
    return () => {
      active = false;
    };
  }, [router]);

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setSubmitting(true);
    const result = await signIn(email, password);
    setSubmitting(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Signed in');
    router.replace(from);
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-brand-50 to-slate-100 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <Logo className="inline-block h-14 w-14 drop-shadow-md" />
          <h1 className="mt-4 text-2xl font-bold text-slate-900">Welcome to Krishnam HRMS</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in with your email and password.</p>
        </div>

        {!isSupabaseConfigured() && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <strong className="font-semibold">Setup required:</strong> Copy <code className="font-mono">.env.example</code> to <code className="font-mono">.env.local</code> and fill in your Supabase URL and anon key.
          </div>
        )}

        <div className="card p-6">
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <Input
              label="Email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              error={errors.email?.message}
              {...register('email')}
            />
            <Input
              label="Password"
              type={showPwd ? 'text' : 'password'}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              error={errors.password?.message}
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="text-slate-400 hover:text-slate-700 transition-colors"
                  aria-label={showPwd ? 'Hide password' : 'Show password'}
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
              {...register('password')}
            />
            <div className="flex justify-end text-xs">
              <Link href="/forgot-password" className="text-brand-600 hover:underline">
                Forgot password?
              </Link>
            </div>
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              loading={submitting}
              leftIcon={<LogIn className="h-4 w-4" />}
            >
              Sign in
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          By signing in you agree to follow your organisation&apos;s data handling policy.
        </p>
      </div>
    </div>
  );
}
