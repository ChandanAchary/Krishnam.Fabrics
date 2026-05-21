'use client';

import { useEffect, useState } from 'react';
import { Banknote, CreditCard, Wallet } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { fmtCurrency } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { Labourer, MonthlySalary, PaymentMethod } from '@/types/database';

type Row = MonthlySalary & { labourer: Pick<Labourer, 'name'> | null };

export interface PaymentPayload {
  amount: number;
  method: PaymentMethod;
  reference: string;
}

interface Props {
  open: boolean;
  row: Row | undefined;
  mode: 'mark_paid' | 'mark_unpaid';
  busy?: boolean;
  onCancel: () => void;
  onConfirmPaid: (payload: PaymentPayload) => void | Promise<void>;
  onConfirmUnpaid: (reason: string) => void | Promise<void>;
}

const METHODS: { value: PaymentMethod; label: string; hint: string; icon: React.ElementType }[] = [
  { value: 'online', label: 'Online', hint: 'UPI / wallet / app', icon: CreditCard },
  { value: 'bank', label: 'Bank Account', hint: 'NEFT / IMPS / transfer', icon: Banknote },
  { value: 'cash', label: 'Cash / In-hand', hint: 'Paid offline', icon: Wallet },
];

export function PaymentModal({ open, row, mode, busy, onCancel, onConfirmPaid, onConfirmUnpaid }: Props) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      // Default the amount to the net salary owed.
      setAmount(row ? Number(row.net_salary).toFixed(2) : '');
      setMethod('cash');
      setReference('');
      setError(null);
    }
  }, [open, row]);

  const handlePaidConfirm = () => {
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt < 0) {
      setError('Enter a valid amount (0 or more).');
      return;
    }
    setError(null);
    void onConfirmPaid({ amount: amt, method, reference });
  };

  if (mode === 'mark_unpaid') {
    return (
      <Modal
        open={open}
        onClose={onCancel}
        title="Mark salary as unpaid"
        description={row?.labourer?.name}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void onConfirmUnpaid(reference)}>
              Confirm
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-700">
            This clears the payment record (amount, method, date) for{' '}
            <span className="font-medium">{row?.labourer?.name}</span>.
          </p>
          <Input
            label="Reason (optional)"
            placeholder="Reason for reverting to unpaid"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="Confirm payment"
      description={row?.labourer?.name}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="success" loading={busy} onClick={handlePaidConfirm}>
            Confirm payment
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm flex items-center justify-between">
          <span className="text-slate-500">Net payable</span>
          <span className="font-semibold text-slate-900">{fmtCurrency(row?.net_salary ?? 0)}</span>
        </div>

        <Input
          label="Amount paid"
          type="number"
          required
          step="0.01"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={error ?? undefined}
          hint="Defaults to net payable; edit if you paid a different amount."
        />

        <div>
          <p className="label">Payment method <span className="text-red-500">*</span></p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {METHODS.map((m) => {
              const Icon = m.icon;
              const active = method === m.value;
              return (
                <button
                  type="button"
                  key={m.value}
                  onClick={() => setMethod(m.value)}
                  className={cn(
                    'flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors min-h-[44px]',
                    active
                      ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/20'
                      : 'border-slate-200 hover:border-slate-300'
                  )}
                  aria-pressed={active}
                >
                  <Icon className={cn('h-4 w-4', active ? 'text-brand-600' : 'text-slate-400')} />
                  <span className="text-sm font-medium text-slate-900">{m.label}</span>
                  <span className="text-[11px] text-slate-500">{m.hint}</span>
                </button>
              );
            })}
          </div>
        </div>

        <Input
          label="Payment reference (optional)"
          placeholder="e.g. UPI txn id, cheque no, remarks…"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
      </div>
    </Modal>
  );
}
