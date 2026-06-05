'use client';

import { CalendarCheck, ClipboardList, Users, Wallet } from 'lucide-react';
import { StatCard } from '@/components/ui/Card';
import { CardGridSkeleton } from '@/components/ui/Skeleton';
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
      <div className="mb-6">
        <CardGridSkeleton count={4} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <StatCard
        label="Active Labourers"
        value={summary.active_labourers}
        hint="Currently on roster"
        icon={<Users className="h-6 w-6" />}
        tone="blue"
      />
      <StatCard
        label="Total Present Today"
        value={attendanceTaken ? summary.present_today : '—'}
        hint={
          attendanceTaken
            ? `Includes H, DD & 1.5 · ${summary.today_recorded_count} marked`
            : 'Attendance pending'
        }
        icon={<CalendarCheck className="h-6 w-6" />}
        tone={attendanceTaken ? 'emerald' : 'amber'}
      />
      <StatCard
        label="Unpaid This Month"
        value={fmtCurrency(summary.unpaid_total)}
        hint={`${summary.unpaid_count} labourers awaiting payment`}
        icon={<Wallet className="h-6 w-6" />}
        tone={summary.unpaid_total > 0 ? 'rose' : 'emerald'}
      />
      <StatCard
        label="Total Salary Due"
        value={fmtCurrency(summary.due_total)}
        hint={fmtMonthYear(summary.current_month, summary.current_year)}
        icon={<ClipboardList className="h-6 w-6" />}
        tone="violet"
      />
    </div>
  );
}
