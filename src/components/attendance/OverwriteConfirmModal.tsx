'use client';

import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { fmtDate } from '@/lib/date';

interface Props {
  open: boolean;
  date: string;
  busy?: boolean;
  conflictInfo: { recordedAt: string | null; recordedByEmail: string | null };
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}

export function OverwriteConfirmModal({ open, date, busy, conflictInfo, onCancel, onConfirm }: Props) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="Overwrite existing attendance?"
      description={`Attendance for ${fmtDate(date)} already exists. Saving will overwrite previous values; the old values are preserved in audit logs.`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={onConfirm}>
            Yes, overwrite
          </Button>
        </div>
      }
    >
      <div className="text-sm text-slate-700 space-y-3">
        {conflictInfo.recordedAt && (
          <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-amber-900">
            <p className="font-medium">Concurrent update detected</p>
            <p className="text-xs mt-0.5">
              This record was last updated
              {conflictInfo.recordedByEmail ? ` by ${conflictInfo.recordedByEmail}` : ''} at{' '}
              {new Date(conflictInfo.recordedAt).toLocaleString()}.
            </p>
            <p className="text-xs mt-1">
              If another user has just edited this date, consider clicking Cancel and refreshing first.
            </p>
          </div>
        )}
        <p>This will update the records and trigger salary recalculation.</p>
      </div>
    </Modal>
  );
}
