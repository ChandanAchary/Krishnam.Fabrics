'use client';

import { Badge } from '@/components/ui/Badge';
import { STATUS_META } from '@/lib/attendance';
import type { AttendanceStatus } from '@/types/database';

type Tone = 'green' | 'red' | 'amber' | 'indigo' | 'sky';

const TONE: Record<AttendanceStatus, Tone> = {
  present: 'green',
  absent: 'red',
  half_day: 'amber',
  double_duty: 'indigo',
  one_and_half_duty: 'sky',
};

export function AttendanceStatusBadge({ status }: { status: AttendanceStatus }) {
  const m = STATUS_META[status];
  return (
    <Badge tone={TONE[status]}>
      <span className="font-bold">{m.code}</span> {m.label}
    </Badge>
  );
}
