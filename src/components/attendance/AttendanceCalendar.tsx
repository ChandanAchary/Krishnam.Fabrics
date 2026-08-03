'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { daysInCalendarMonth, fmtMonthYear, parseDate, toISODate, addMonths, subMonths } from '@/lib/date';
import { format } from 'date-fns';
import type { AttendanceRecord, AttendanceStatus } from '@/types/database';
import { cn } from '@/lib/utils';

interface Props {
  records: AttendanceRecord[];
  joiningDate: string;
  isAdmin: boolean;
  onEdit?: (date: string, current?: AttendanceRecord) => void;
  initialMonth?: { year: number; month: number };
  onMonthChange?: (year: number, month: number) => void;
}

const STATUS_COLOR: Record<AttendanceStatus | 'none', string> = {
  present: 'bg-emerald-100 border-emerald-300 text-emerald-800',
  absent: 'bg-rose-100 border-rose-300 text-rose-700',
  half_day: 'bg-amber-100 border-amber-300 text-amber-800',
  double_duty: 'bg-indigo-100 border-indigo-300 text-indigo-800',
  one_and_half_duty: 'bg-sky-100 border-sky-300 text-sky-800',
  none: 'bg-slate-50 border-slate-200 text-slate-400',
};

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: 'P',
  absent: 'A',
  half_day: 'H',
  double_duty: 'DD',
  one_and_half_duty: '1.5',
};

export function AttendanceCalendar({ records, joiningDate, isAdmin, onEdit, initialMonth, onMonthChange }: Props) {
  const now = new Date();
  const [cursor, setCursor] = useState<Date>(
    initialMonth
      ? new Date(initialMonth.year, initialMonth.month - 1, 1)
      : new Date(now.getFullYear(), now.getMonth(), 1)
  );

  useEffect(() => {
    onMonthChange?.(cursor.getFullYear(), cursor.getMonth() + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor]);

  const days = useMemo(
    () => daysInCalendarMonth(cursor.getFullYear(), cursor.getMonth() + 1),
    [cursor]
  );

  const byDate = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    for (const r of records) map.set(r.date, r);
    return map;
  }, [records]);

  const joining = parseDate(joiningDate);

  const counts = useMemo(() => {
    let p = 0, a = 0, h = 0, dd = 0, oh = 0;
    for (const d of days) {
      const iso = toISODate(d);
      const r = byDate.get(iso);
      if (!r) continue;
      if (r.status === 'present') p++;
      else if (r.status === 'absent') a++;
      else if (r.status === 'half_day') h++;
      else if (r.status === 'double_duty') dd++;
      else if (r.status === 'one_and_half_duty') oh++;
    }
    return { p, a, h, dd, oh };
  }, [days, byDate]);

  // Lay out cells aligned to a Monday-first week grid
  const leading = (days[0].getDay() + 6) % 7; // shift Sun=0 → 6
  const cells = useMemo(() => {
    const out: Array<Date | null> = [];
    for (let i = 0; i < leading; i++) out.push(null);
    for (const d of days) out.push(d);
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [days, leading]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setCursor((c) => subMonths(c, 1))} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <p className="text-sm font-semibold text-slate-900 min-w-[110px] text-center">
            {fmtMonthYear(cursor.getMonth() + 1, cursor.getFullYear())}
          </p>
          <Button variant="ghost" size="sm" onClick={() => setCursor((c) => addMonths(c, 1))} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="green">P: {counts.p}</Badge>
          <Badge tone="amber">H: {counts.h}</Badge>
          <Badge tone="indigo">DD: {counts.dd}</Badge>
          <Badge tone="sky">1.5: {counts.oh}</Badge>
          <Badge tone="red">A: {counts.a}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-xs text-slate-500 uppercase tracking-wider">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="text-center py-1 font-medium">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="aspect-square" />;
          const iso = toISODate(d);
          const r = byDate.get(iso);
          const beforeJoining = joining && d.getTime() < new Date(joining).setHours(0, 0, 0, 0);
          const future = d.getTime() > new Date().setHours(23, 59, 59, 999);
          const weekend = d.getDay() === 0 || d.getDay() === 6;
          const status: AttendanceStatus | 'none' = r ? r.status : 'none';
          return (
            <div
              key={i}
              className={cn(
                'aspect-square rounded-md border text-xs flex flex-col items-center justify-center relative',
                beforeJoining || future
                  ? 'bg-slate-50 border-slate-100 text-slate-300'
                  : STATUS_COLOR[status],
                weekend && status === 'none' && !beforeJoining && !future && 'bg-slate-100/70'
              )}
              title={`${format(d, 'dd MMM yyyy')} — ${r ? r.status : (beforeJoining ? 'Before joining' : future ? 'Future' : 'No record')}`}
            >
              <span className="font-semibold leading-none">{d.getDate()}</span>
              {r && <span className="text-[10px] mt-0.5 leading-none">{STATUS_LABEL[r.status]}</span>}
              {isAdmin && !beforeJoining && !future && onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(iso, r)}
                  className="absolute top-0.5 right-0.5 p-0.5 rounded text-slate-500 hover:bg-white/70"
                  aria-label={`Edit ${iso}`}
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
