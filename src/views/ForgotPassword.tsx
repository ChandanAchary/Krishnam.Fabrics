'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Eye, EyeOff, KeyRound, Layers, Mail, ShieldCheck } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { emailSchema, passwordSchema } from '@/lib/validation';

const emailForm = z.object({ email: emailSchema });
const otpForm = z
  .object({
    code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type EmailForm = z.infer<typeof emailForm>;
type OtpForm = z.infer<typeof otpForm>;

export function ForgotPasswordPage() {
  const { resetPassword, verifyPasswordResetOtp } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'otp' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);

  const emailApi = useForm<EmailForm>({ resolver: zodResolver(emailForm), defaultValues: { email: '' } });
  const otpApi = useForm<OtpForm>({
    resolver: zodResolver(otpForm),
    defaultValues: { code: '', password: '', confirmPassword: '' },
  });

  const sendCode = emailApi.handleSubmit(async ({ email: e }) => {
    setBusy(true);
    const { error } = await resetPassword(e);
    setBusy(false);
    if (error) {
      toast.error(error);
      return;
    }
    setEmail(e);
    setStep('otp');
    toast.success('If an account exists, a 6-digit code has been emailed to you.');
  });

  const verify = otpApi.handleSubmit(async ({ code, password }) => {
    setBusy(true);
    const { error } = await verifyPasswordResetOtp(email, code, password);
    setBusy(false);
    if (error) {
      toast.error(error);
      return;
    }
    setStep('done');
    toast.success('Password updated. Please sign in.');
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-brand-50 to-slate-100 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 shadow-card">
            <Layers className="h-7 w-7 text-white" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-slate-900">Reset your password</h1>
          <p className="mt-1 text-sm text-slate-500">
            {step === 'email' && 'Enter your email to receive a verification code.'}
            {step === 'otp' && `Enter the 6-digit code sent to ${email} and set a new password.`}
            {step === 'done' && 'Your password has been reset.'}
          </p>
        </div>

        <div className="card p-6">
          {step === 'email' && (
            <form onSubmit={sendCode} className="space-y-4" noValidate>
              <Input
                label="Email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                leftIcon={<Mail className="h-4 w-4" />}
                error={emailApi.formState.errors.email?.message}
                {...emailApi.register('email')}
              />
              <Button type="submit" variant="primary" className="w-full" loading={busy}
                leftIcon={<ShieldCheck className="h-4 w-4" />}>
                Send verification code
              </Button>
            </form>
          )}

          {step === 'otp' && (
            <form onSubmit={verify} className="space-y-4" noValidate>
              <Input
                label="Verification code"
                inputMode="numeric"
                maxLength={6}
                placeholder="6-digit code"
                hint={`Sent to ${email}. The code expires shortly.`}
                error={otpApi.formState.errors.code?.message}
                {...otpApi.register('code')}
              />
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
                error={otpApi.formState.errors.password?.message}
                {...otpApi.register('password')}
              />
              <Input
                label="Confirm new password"
                type={showPwd ? 'text' : 'password'}
                required
                autoComplete="new-password"
                placeholder="Re-enter new password"
                error={otpApi.formState.errors.confirmPassword?.message}
                {...otpApi.register('confirmPassword')}
              />
              <Button type="submit" variant="primary" className="w-full" loading={busy}>
                Verify &amp; update password
              </Button>
              <button type="button" onClick={() => setStep('email')}
                className="w-full text-center text-xs text-slate-500 hover:text-brand-600">
                Use a different email
              </button>
            </form>
          )}

          {step === 'done' && (
            <div className="text-center space-y-3">
              <div className="mx-auto h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center">
                <ShieldCheck className="h-6 w-6 text-emerald-600" />
              </div>
              <p className="text-sm text-slate-700">Your password has been updated successfully.</p>
              <Button variant="primary" className="w-full" onClick={() => router.replace('/login')}>
                Go to sign in
              </Button>
            </div>
          )}
        </div>

        <Link href="/login"
          className="mt-6 flex items-center justify-center gap-1 text-sm text-slate-600 hover:text-brand-600">
          <ArrowLeft className="h-4 w-4" /> Back to login
        </Link>
      </div>
    </div>
  );
}
