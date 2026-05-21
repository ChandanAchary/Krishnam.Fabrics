'use client';

import { CalendarCheck, ClipboardList, Users, Wallet } from 'lucide-react';
import { Card, StatCard } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { fmtDate, fmtMonthYear, todayISO } from '@/lib/date';
import { fmtCurrency } from '@/lib/money';
import type { DashboardSummary as Summary } from '@/types/database';

interface Props {
  loading: boolean;
  summary: Summary | null;
  attendanceTaken: boolean;
}

export function DashboardSummary({ loading, summary, attendanceTaken }: Props) {
  if (loading || !summary) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="h-[112px] flex items-center justify-center">
            <Spinner />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <StatCard
        label="Active Labourers"
        value={summary.active_labourers}
        hint="Currently on roster"
        icon={<Users className="h-5 w-5" />}
      />
      <StatCard
        label="Present Today"
        value={attendanceTaken ? summary.present_today : '—'}
        hint={
          attendanceTaken
            ? `${summary.today_recorded_count} records on ${fmtDate(todayISO())}`
            : 'Attendance pending'
        }
        icon={<CalendarCheck className="h-5 w-5" />}
        tone={attendanceTaken ? 'success' : 'warning'}
      />
      <StatCard
        label="Unpaid This Month"
        value={fmtCurrency(summary.unpaid_total)}
        hint={`${summary.unpaid_count} labourers awaiting payment`}
        icon={<Wallet className="h-5 w-5" />}
        tone={summary.unpaid_total > 0 ? 'danger' : 'success'}
      />
      <StatCard
        label="Total Salary Due"
        value={fmtCurrency(summary.due_total)}
        hint={fmtMonthYear(summary.current_month, summary.current_year)}
        icon={<ClipboardList className="h-5 w-5" />}
      />
    </div>
  );
}
