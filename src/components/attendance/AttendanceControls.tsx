'use client';

import { Calendar, CheckCheck, Lock, X } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { fmtMonthYear } from '@/lib/date';
import type { AttendanceStatus, MonthLock } from '@/types/database';

interface Props {
  date: string;
  today: string;
  isFuture: boolean;
  lock: MonthLock | null;
  filter: string;
  summary: { p: number; a: number; h: number };
  onDateChange: (v: string) => void;
  onFilterChange: (v: string) => void;
  onMarkAll: (status: AttendanceStatus) => void;
}

export function AttendanceControls({
  date, today, isFuture, lock, filter, summary, onDateChange, onFilterChange, onMarkAll,
}: Props) {
  return (
    <Card className="mb-4">
      <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
        <div className="lg:w-56">
          <label className="label">Date</label>
          <Input
            type="date"
            value={date}
            max={today}
            onChange={(e) => onDateChange(e.target.value)}
            leftIcon={<Calendar className="h-4 w-4" />}
          />
        </div>
        <div className="flex-1">
          <label className="label">Search</label>
          <Input placeholder="Filter by name…" value={filter} onChange={(e) => onFilterChange(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => onMarkAll('present')} leftIcon={<CheckCheck className="h-4 w-4" />}>
            Mark all present
          </Button>
          <Button variant="secondary" onClick={() => onMarkAll('absent')} leftIcon={<X className="h-4 w-4" />}>
            Mark all absent
          </Button>
        </div>
      </div>
      {isFuture && (
        <div className="mt-3 rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">
          Cannot record attendance for a future date.
        </div>
      )}
      {lock && (
        <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 text-sm flex items-center gap-2">
          <Lock className="h-4 w-4" /> This month ({fmtMonthYear(lock.month, lock.year)}) is locked — attendance edits are blocked.
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge tone="green">{summary.p} Present</Badge>
        <Badge tone="red">{summary.a} Absent</Badge>
        <Badge tone="yellow">{summary.h} Half-Day</Badge>
      </div>
    </Card>
  );
}
