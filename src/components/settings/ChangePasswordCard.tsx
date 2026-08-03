'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';

export function ChangePasswordCard() {
  const { signOut } = useAuth();
  const toast = useToast();
  const router = useRouter();

  const [step, setStep] = useState<'input' | 'otp'>('input');
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const sendCode = async () => {
    if (pwd.length < 8 || !/[A-Za-z]/.test(pwd) || !/[0-9]/.test(pwd)) {
      toast.error('Password must be at least 8 characters and include a letter and a number.');
      return;
    }
    if (pwd !== confirm) {
      toast.error('Passwords do not match.');
      return;
    }
    setBusy(true);
    const res = await fetch('/api/account-otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purpose: 'password_change' }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      toast.error(data.error ?? 'Could not send verification code.');
      return;
    }
    setStep('otp');
    toast.success('Code sent to your email.');
  };

  const verifyAndUpdate = async () => {
    if (!/^\d{6}$/.test(code)) {
      toast.error('Enter the 6-digit code.');
      return;
    }
    setBusy(true);
    const res = await fetch('/api/account-otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purpose: 'password_change', code, newPassword: pwd }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      toast.error(data.error ?? 'Verification failed.');
      return;
    }
    toast.success('Password updated. Please sign in again.');
    await signOut();
    router.replace('/login');
  };

  return (
    <Card>
      <CardHeader title="Change password" description="Set a new password for your account." />
      {step === 'input' ? (
        <div className="space-y-4">
          <Input
            label="New password"
            type="password"
            leftIcon={<KeyRound className="h-4 w-4" />}
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            placeholder="At least 8 chars, 1 letter & 1 number"
            autoComplete="new-password"
          />
          <Input
            label="Confirm new password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
          <Button variant="primary" onClick={sendCode} loading={busy} leftIcon={<ShieldCheck className="h-4 w-4" />}>
            Send verification code
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <Input
            label="Verification code"
            inputMode="numeric"
            maxLength={6}
            placeholder="6-digit code"
            hint="Sent to your email. The code expires shortly."
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <div className="flex gap-2">
            <Button variant="primary" onClick={verifyAndUpdate} loading={busy}>
              Verify &amp; update password
            </Button>
            <Button variant="ghost" onClick={() => setStep('input')} disabled={busy}>
              Back
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
