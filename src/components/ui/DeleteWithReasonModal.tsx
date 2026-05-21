'use client';

import { Modal } from './Modal';
import { Button } from './Button';
import { Input } from './Input';

interface Props {
  open: boolean;
  title: string;
  description?: string;
  reason: string;
  minLength?: number;
  busy?: boolean;
  onReasonChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}

export function DeleteWithReasonModal({
  open, title, description, reason, minLength = 50, busy, onReasonChange, onCancel, onConfirm,
}: Props) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      description={description ?? 'This permanently removes the record. The old value is captured in the audit log.'}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy} onClick={onConfirm}>
            Delete
          </Button>
        </div>
      }
    >
      <Input
        label="Reason"
        required
        placeholder={`Minimum ${minLength} characters.`}
        hint={`${reason.length}/${minLength} minimum`}
        value={reason}
        onChange={(e) => onReasonChange(e.target.value)}
      />
    </Modal>
  );
}
