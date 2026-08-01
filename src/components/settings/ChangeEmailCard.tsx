'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, ShieldCheck } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';

export function ChangeEmailCard() {
  const { user, signOut } = useAuth();
  const toast = useToast();
  const router = useRouter();

  const [step, setStep] = useState<'input' | 'otp'>('input');
  const [newEmail, setNewEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const sendCode = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newEmail.trim())) {
      toast.error('Enter a valid new email address.');
      return;
    }
    setBusy(true);
    const res = await fetch('/api/account-otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purpose: 'email_change', newEmail: newEmail.trim() }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      toast.error(data.error ?? 'Could not send verification code.');
      return;
    }
    setStep('otp');
    toast.success(`Code sent to ${newEmail.trim()}.`);
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
      body: JSON.stringify({ purpose: 'email_change', code, newEmail: newEmail.trim() }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      toast.error(data.error ?? 'Verification failed.');
      return;
    }
    toast.success('Email updated. Please sign in again.');
    await signOut();
    router.replace('/login');
  };

  return (
    <Card>
      <CardHeader title="Change email" description={`Current: ${user?.email ?? '—'}`} />
      {step === 'input' ? (
        <div className="space-y-4">
          <Input
            label="New email"
            type="email"
            leftIcon={<Mail className="h-4 w-4" />}
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="new@example.com"
            hint="A 6-digit verification code is emailed to this address."
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
            hint={`Sent to ${newEmail.trim()}. The code expires shortly.`}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <div className="flex gap-2">
            <Button variant="primary" onClick={verifyAndUpdate} loading={busy}>
              Verify &amp; update email
            </Button>
            <Button variant="ghost" onClick={() => setStep('input')} disabled={busy}>
              Use a different email
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
