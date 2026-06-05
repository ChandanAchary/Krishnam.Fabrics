'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { fmtDate } from '@/lib/date';
import type { AttendanceRecord, AttendanceStatus } from '@/types/database';
import { AttendanceStatusBadge } from './StatusBadge';

interface Props {
  open: boolean;
  date: string | undefined;
  current: AttendanceRecord | undefined;
  onClose: () => void;
  onSave: (newStatus: AttendanceStatus, reason: string) => Promise<void> | void;
  busy?: boolean;
}

export function EditAttendanceModal({ open, date, current, onClose, onSave, busy }: Props) {
  const [status, setStatus] = useState<AttendanceStatus>('present');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) {
      setStatus(current?.status ?? 'present');
      setReason('');
    }
  }, [open, current]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={current ? `Edit attendance — ${fmtDate(date)}` : `Add attendance — ${fmtDate(date)}`}
      description={
        current
          ? 'Update the status for this day. Salary will recalculate automatically.'
          : 'Add a record for this day.'
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void onSave(status, reason.trim())}>
            Save change
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {current && (
          <div className="text-sm">
            Current status: <AttendanceStatusBadge status={current.status} />
          </div>
        )}
        <Select label="New status" value={status} onChange={(e) => setStatus(e.target.value as AttendanceStatus)}>
          <option value="present">Present (P) — ×1</option>
          <option value="absent">Absent (A) — ×0</option>
          <option value="half_day">Half day (H) — ×0.5</option>
          <option value="double_duty">Double duty (DD) — ×2</option>
          <option value="one_and_half_duty">1.5 duty — ×1.5</option>
        </Select>
        <Input
          label="Reason (optional)"
          placeholder="Add a note about this change…"
          hint="Optional — recorded in the audit log if provided."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
    </Modal>
  );
}
