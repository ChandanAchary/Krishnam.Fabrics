'use client';

import { useState } from 'react';
import { Mail, Save } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';

export function ChangeEmailCard() {
  const { user, updateEmail } = useAuth();
  const toast = useToast();
  const [newEmail, setNewEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newEmail.trim())) {
      toast.error('Enter a valid new email address.');
      return;
    }
    setBusy(true);
    const { error } = await updateEmail(newEmail.trim());
    setBusy(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success('Confirmation links sent. Check both your current and new inbox to finish the change.');
    setNewEmail('');
  };

  return (
    <Card>
      <CardHeader title="Change email" description={`Current: ${user?.email ?? '—'}`} />
      <div className="space-y-4">
        <Input
          label="New email"
          type="email"
          leftIcon={<Mail className="h-4 w-4" />}
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder="new@example.com"
          hint="A confirmation link is emailed to verify the change."
        />
        <Button variant="primary" onClick={save} loading={busy} leftIcon={<Save className="h-4 w-4" />}>
          Update email
        </Button>
      </div>
    </Card>
  );
}
