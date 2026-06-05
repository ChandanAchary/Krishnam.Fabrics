'use client';

import { fmtCurrency } from '@/lib/money';
import { STATUS_META, STATUS_ORDER } from '@/lib/attendance';
import type { AttendanceStatus, Labourer } from '@/types/database';
import { cn } from '@/lib/utils';

interface Props {
  index: number;
  labourer: Labourer;
  status: AttendanceStatus;
  previouslyRecorded: boolean;
  disabled?: boolean;
  onChange: (status: AttendanceStatus) => void;
}

/**
 * One labourer's attendance card. Renders the name (highlighted) + wage and a
 * single row of 5 compact circular selectors (P / A / H / DD / 1.5) so all
 * statuses fit on one line on phones — no horizontal scrolling.
 */
export function AttendanceRow({ index, labourer, status, previouslyRecorded, disabled, onChange }: Props) {
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md sm:p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-medium text-slate-400 tabular-nums">{index + 1}.</span>
            <p className="truncate text-base font-bold text-brand-700 sm:text-lg">{labourer.name}</p>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            <span className="font-medium text-slate-700">{fmtCurrency(labourer.daily_wage)}</span>
            <span className="text-slate-400"> /day</span>
            {labourer.designation ? <span className="ml-2 text-slate-400">· {labourer.designation}</span> : null}
            {previouslyRecorded ? <span className="ml-2 text-[11px] text-amber-600">· previously recorded</span> : null}
          </p>
        </div>
      </div>

      <div
        className="flex flex-wrap items-center gap-1.5 sm:gap-2"
        role="radiogroup"
        aria-label={`Status for ${labourer.name}`}
      >
        {STATUS_ORDER.map((s) => {
          const meta = STATUS_META[s];
          const active = status === s;
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={meta.label}
              title={`${meta.label} (×${meta.multiplier})`}
              onClick={() => onChange(s)}
              disabled={disabled}
              className={cn(
                'inline-flex h-10 min-w-[44px] items-center justify-center rounded-full border px-2.5 text-sm font-bold transition-all',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                active
                  ? cn(meta.solid, 'border-transparent shadow-sm scale-[1.04]', meta.ring)
                  : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50',
                disabled && 'opacity-50 cursor-not-allowed hover:bg-white'
              )}
            >
              {meta.code}
            </button>
          );
        })}
      </div>
    </li>
  );
}
