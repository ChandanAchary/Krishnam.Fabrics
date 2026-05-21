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
}

export function ProfileCard({ labourer, currentMonthSalary }: Props) {
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
          <span className="text-slate-500">Advance</span>
          <span className="ml-auto font-medium text-slate-900">
            {labourer.advance && labourer.advance > 0 ? fmtCurrency(labourer.advance) : 'No advance'}
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
      {currentMonthSalary && (
        <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-xs text-slate-500">Days</p>
            <p className="font-semibold text-slate-900">{currentMonthSalary.days_present}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Half</p>
            <p className="font-semibold text-slate-900">{currentMonthSalary.half_days_count}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Salary</p>
            <p className="font-semibold text-slate-900">{fmtCurrency(currentMonthSalary.calculated_salary)}</p>
          </div>
        </div>
      )}
    </Card>
  );
}
