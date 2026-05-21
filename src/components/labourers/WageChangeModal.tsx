'use client';

import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { fmtCurrency } from '@/lib/money';

interface Props {
  open: boolean;
  newWage?: number;
  busy?: boolean;
  onCancel: () => void;
  onApply: (policy: 'current_month' | 'future_only') => void | Promise<void>;
}

export function WageChangeModal({ open, newWage, busy, onCancel, onApply }: Props) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="Apply wage change"
      description="The daily wage was changed. Choose how this should affect salary records."
      footer={
        <div className="flex justify-end gap-2 flex-wrap">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={() => onApply('future_only')} loading={busy}>
            Future months only
          </Button>
          <Button variant="primary" onClick={() => onApply('current_month')} loading={busy}>
            Apply to current month
          </Button>
        </div>
      }
    >
      <div className="text-sm text-slate-700 space-y-2">
        <p>
          New wage: <span className="font-semibold">{newWage !== undefined && fmtCurrency(newWage)}</span>
        </p>
        <ul className="list-disc pl-5 text-xs text-slate-500 space-y-1">
          <li>
            <strong>Current month</strong> — wage snapshot is updated and this month&apos;s salary is recalculated.
          </li>
          <li>
            <strong>Future months only</strong> — wage takes effect from next salary record.
          </li>
        </ul>
      </div>
    </Modal>
  );
}
