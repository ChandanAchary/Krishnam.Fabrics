'use client';

import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { fmtMonthYear } from '@/lib/date';

interface CommonProps {
  month: number;
  year: number;
  busy?: boolean;
  reason: string;
  onReasonChange: (v: string) => void;
}

interface LockProps extends CommonProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}

export function LockMonthModal({ open, month, year, busy, reason, onReasonChange, onCancel, onConfirm }: LockProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={`Lock ${fmtMonthYear(month, year)}?`}
      description="No attendance or salary changes will be allowed after locking. Payment status can still be updated."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={onConfirm}>
            Lock month
          </Button>
        </div>
      }
    >
      <Input
        label="Lock reason (optional)"
        placeholder="e.g. End of month closeout."
        value={reason}
        onChange={(e) => onReasonChange(e.target.value)}
      />
    </Modal>
  );
}

interface UnlockProps extends CommonProps {
  open: boolean;
  password: string;
  onPasswordChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}

export function UnlockMonthModal({
  open, month, year, busy, reason, password, onReasonChange, onPasswordChange, onCancel, onConfirm,
}: UnlockProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={`Unlock ${fmtMonthYear(month, year)}?`}
      description="Unlocking requires your admin password and a reason (minimum 20 characters). Both will be recorded in the audit log."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy} onClick={onConfirm}>
            Confirm unlock
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Input
          label="Admin password"
          type="password"
          required
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          autoComplete="current-password"
        />
        <Input
          label="Reason"
          required
          placeholder="Minimum 20 characters."
          hint={`${reason.length}/20 minimum`}
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
        />
      </div>
    </Modal>
  );
}
