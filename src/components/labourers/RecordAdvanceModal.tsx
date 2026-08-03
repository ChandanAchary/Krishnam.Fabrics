'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { todayISO } from '@/lib/date';

interface InitialValues {
  given_on: string;
  amount: number;
  note: string;
}

interface Props {
  open: boolean;
  mode?: 'create' | 'edit';
  initialValues?: InitialValues;
  busy?: boolean;
  onCancel: () => void;
  onSubmit: (values: { given_on: string; amount: number; note: string }) => void | Promise<void>;
}

export function RecordAdvanceModal({ open, mode = 'create', initialValues, busy, onCancel, onSubmit }: Props) {
  const [givenOn, setGivenOn] = useState(todayISO());
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setGivenOn(initialValues?.given_on ?? todayISO());
      setAmount(initialValues ? String(initialValues.amount) : '');
      setNote(initialValues?.note ?? '');
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleConfirm = () => {
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Enter an amount greater than 0.');
      return;
    }
    if (!givenOn || givenOn > todayISO()) {
      setError('Date cannot be in the future.');
      return;
    }
    setError(null);
    void onSubmit({ given_on: givenOn, amount: amt, note: note.trim() });
  };

  const isEdit = mode === 'edit';

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={isEdit ? 'Edit advance' : 'Record an advance'}
      description="Deducted from that month's salary only — not carried into other months."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={handleConfirm}>
            {isEdit ? 'Save changes' : 'Record advance'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Input
          label="Date given"
          type="date"
          required
          max={todayISO()}
          value={givenOn}
          onChange={(e) => setGivenOn(e.target.value)}
        />
        <Input
          label="Amount"
          type="number"
          required
          step="0.01"
          min="0.01"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={error ?? undefined}
        />
        <Input
          label="Note (optional)"
          placeholder="e.g. cash advance for festival"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </Modal>
  );
}
