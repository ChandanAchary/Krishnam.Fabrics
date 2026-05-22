'use client';

import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { fmtCurrency } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { AttendanceStatus } from '@/types/database';

export interface MatrixRow {
  labourerId: string;
  name: string;
  designation: string | null;
  dailyWage: number;
  statuses: Partial<Record<number, AttendanceStatus>>; // day-of-month → status
  daysPresent: number;
  halfDays: number;
  gross: number;
  advance: number;
  net: number;
  paid: boolean;
}

interface Props {
  days: number[];
  rows: MatrixRow[];
}

const CELL: Record<AttendanceStatus | 'none', string> = {
  present: 'bg-emerald-100 text-emerald-800',
  absent: 'bg-red-100 text-red-700',
  half_day: 'bg-amber-100 text-amber-800',
  none: 'bg-slate-50 text-slate-300',
};

const MARK: Record<AttendanceStatus, string> = { present: 'P', absent: 'A', half_day: 'H' };

export function AttendanceMatrix({ days, rows }: Props) {
  if (rows.length === 0) {
    return <EmptyState title="No labourers for this month" description="Add labourers or pick another month." />;
  }
  return (
    <div className="overflow-x-auto scroll-touch">
      <table className="text-xs border-collapse">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="sticky left-0 z-10 bg-slate-50 text-left px-3 py-2 font-medium min-w-[160px] border-r border-slate-200">
              Labourer
            </th>
            {days.map((d) => (
              <th key={d} className="px-1.5 py-2 font-medium text-center w-7">{d}</th>
            ))}
            <th className="px-3 py-2 font-medium text-right">Days</th>
            <th className="px-3 py-2 font-medium text-right">Gross</th>
            <th className="px-3 py-2 font-medium text-right">Adv</th>
            <th className="px-3 py-2 font-medium text-right">Net</th>
            <th className="px-3 py-2 font-medium text-center">Paid</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.labourerId} className="hover:bg-slate-50/60">
              <td className="sticky left-0 z-10 bg-white px-3 py-2 border-r border-slate-200">
                <p className="font-semibold text-violet-700 whitespace-nowrap">{r.name}</p>
                {r.designation && <p className="text-[10px] text-slate-400">{r.designation}</p>}
              </td>
              {days.map((d) => {
                const status: AttendanceStatus | 'none' = r.statuses[d] ?? 'none';
                return (
                  <td key={d} className="p-0.5 text-center">
                    <span
                      className={cn(
                        'inline-flex h-6 w-6 items-center justify-center rounded font-semibold',
                        CELL[status]
                      )}
                      title={`Day ${d}: ${status === 'none' ? 'No record' : status}`}
                    >
                      {status === 'none' ? '·' : MARK[status]}
                    </span>
                  </td>
                );
              })}
              <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
                {r.daysPresent}
                {r.halfDays > 0 && <span className="text-slate-400"> +{r.halfDays}H</span>}
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap">{fmtCurrency(r.gross)}</td>
              <td className="px-3 py-2 text-right text-amber-700 whitespace-nowrap">{fmtCurrency(r.advance)}</td>
              <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">{fmtCurrency(r.net)}</td>
              <td className="px-3 py-2 text-center">
                {r.paid ? <Badge tone="green">Paid</Badge> : <Badge tone="red">No</Badge>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
