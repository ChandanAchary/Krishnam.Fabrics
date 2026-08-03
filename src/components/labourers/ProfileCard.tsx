'use client';

import { Briefcase, CalendarDays, Phone, Power, Wallet, Coins } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { fmtDate } from '@/lib/date';
import { fmtCurrency } from '@/lib/money';
import type { Labourer, MonthlySalary } from '@/types/database';

interface Props {
  labourer: Labourer;
  currentMonthSalary: MonthlySalary | null;
  /** Human-readable label (e.g. "Aug 2026") for whichever month currentMonthSalary reflects. */
  monthLabel?: string;
}

export function ProfileCard({ labourer, currentMonthSalary, monthLabel }: Props) {
  return (
    <Card>
      <CardHeader title="Profile" />
      <dl className="space-y-3 text-sm">
        <div className="flex items-center gap-3">
          <Briefcase className="h-4 w-4 text-slate-400" />
          <span className="text-slate-500">Designation</span>
          <span className="ml-auto font-medium text-slate-900">{labourer.designation ?? '—'}</span>
        </div>
        <div className="flex items-center gap-3">
          <Phone className="h-4 w-4 text-slate-400" />
          <span className="text-slate-500">Phone</span>
          <span className="ml-auto font-medium text-slate-900">{labourer.phone ?? '—'}</span>
        </div>
        <div className="flex items-center gap-3">
          <Wallet className="h-4 w-4 text-slate-400" />
          <span className="text-slate-500">Daily wage</span>
          <span className="ml-auto font-medium text-slate-900">{fmtCurrency(labourer.daily_wage)}</span>
        </div>
        <div className="flex items-center gap-3">
          <Coins className="h-4 w-4 text-slate-400" />
          <span className="text-slate-500">{monthLabel ? `${monthLabel} advance` : "This month's advance"}</span>
          <span className="ml-auto font-medium text-slate-900">
            {currentMonthSalary && currentMonthSalary.advance_deducted > 0
              ? fmtCurrency(currentMonthSalary.advance_deducted)
              : 'None'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <CalendarDays className="h-4 w-4 text-slate-400" />
          <span className="text-slate-500">Joined</span>
          <span className="ml-auto font-medium text-slate-900">{fmtDate(labourer.joining_date)}</span>
        </div>
        <div className="flex items-center gap-3">
          <Power className="h-4 w-4 text-slate-400" />
          <span className="text-slate-500">Status</span>
          <span className="ml-auto">
            {labourer.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="slate">Inactive</Badge>}
          </span>
        </div>
      </dl>
      {currentMonthSalary ? (
        <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
          {monthLabel && <p className="text-xs font-medium text-slate-400">{monthLabel}</p>}
          <div className="grid grid-cols-2 gap-2 text-center">
            <div>
              <p className="text-xs text-slate-500">Days</p>
              <p className="font-semibold text-slate-900">{currentMonthSalary.days_present}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Half</p>
              <p className="font-semibold text-slate-900">{currentMonthSalary.half_days_count}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-500 shrink-0">Gross</span>
            <span className="ml-auto min-w-0 truncate font-medium text-slate-900">
              {fmtCurrency(currentMonthSalary.calculated_salary)}
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-500 shrink-0">Net</span>
            <span
              className={
                currentMonthSalary.net_salary < 0
                  ? 'ml-auto min-w-0 truncate font-semibold text-red-600'
                  : 'ml-auto min-w-0 truncate font-medium text-slate-900'
              }
            >
              {fmtCurrency(currentMonthSalary.net_salary)}
            </span>
          </div>
        </div>
      ) : (
        monthLabel && (
          <div className="mt-4 pt-4 border-t border-slate-100 text-center text-xs text-slate-400">
            No salary record for {monthLabel}
          </div>
        )
      )}
    </Card>
  );
}
