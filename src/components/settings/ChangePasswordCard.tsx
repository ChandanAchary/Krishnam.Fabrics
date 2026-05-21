'use client';

import { useState } from 'react';
import { KeyRound, Save } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';

export function ChangePasswordCard() {
  const { updatePassword } = useAuth();
  const toast = useToast();
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (pwd.length < 8 || !/[A-Za-z]/.test(pwd) || !/[0-9]/.test(pwd)) {
      toast.error('Password must be at least 8 characters and include a letter and a number.');
      return;
    }
    if (pwd !== confirm) {
      toast.error('Passwords do not match.');
      return;
    }
    setBusy(true);
    const { error } = await updatePassword(pwd);
    setBusy(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success('Password updated successfully.');
    setPwd('');
    setConfirm('');
  };

  return (
    <Card>
      <CardHeader title="Change password" description="Set a new password for your account." />
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
        <Button variant="primary" onClick={save} loading={busy} leftIcon={<Save className="h-4 w-4" />}>
          Update password
        </Button>
      </div>
    </Card>
  );
}
