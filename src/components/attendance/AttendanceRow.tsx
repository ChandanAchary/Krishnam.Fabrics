'use client';

import { Check } from 'lucide-react';
import { fmtCurrency } from '@/lib/money';
import type { AttendanceStatus, Labourer } from '@/types/database';
import { cn } from '@/lib/utils';

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: 'Present',
  half_day: 'Half Day',
  absent: 'Absent',
};

interface Props {
  index: number;
  labourer: Labourer;
  status: AttendanceStatus;
  previouslyRecorded: boolean;
  disabled?: boolean;
  onChange: (status: AttendanceStatus) => void;
}

export function AttendanceRow({ index, labourer, status, previouslyRecorded, disabled, onChange }: Props) {
  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-3 text-slate-500">{index + 1}</td>
      <td className="px-4 py-3">
        <p className="font-medium text-slate-900">{labourer.name}</p>
        {previouslyRecorded && <p className="text-[11px] text-slate-400">Previously recorded</p>}
      </td>
      <td className="px-4 py-3 text-right text-slate-700">{fmtCurrency(labourer.daily_wage)}</td>
      <td className="px-4 py-3">
        <div className="flex justify-center gap-1" role="radiogroup" aria-label={`Status for ${labourer.name}`}>
          {(['present', 'half_day', 'absent'] as AttendanceStatus[]).map((s) => (
            <button
              type="button"
              key={s}
              role="radio"
              aria-checked={status === s}
              onClick={() => onChange(s)}
              disabled={disabled}
              className={cn(
                'min-h-[44px] px-3 py-1.5 rounded-md border text-xs font-medium transition-colors flex items-center gap-1.5',
                status === s
                  ? s === 'present'
                    ? 'bg-emerald-600 border-emerald-700 text-white'
                    : s === 'half_day'
                      ? 'bg-amber-500 border-amber-600 text-white'
                      : 'bg-red-600 border-red-700 text-white'
                  : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
              )}
            >
              {status === s && <Check className="h-3 w-3" />}
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </td>
    </tr>
  );
}
