'use client';

import { Badge } from '@/components/ui/Badge';
import type { AttendanceStatus } from '@/types/database';

export function AttendanceStatusBadge({ status }: { status: AttendanceStatus }) {
  if (status === 'present') return <Badge tone="green">Present</Badge>;
  if (status === 'half_day') return <Badge tone="yellow">Half day</Badge>;
  return <Badge tone="red">Absent</Badge>;
}
