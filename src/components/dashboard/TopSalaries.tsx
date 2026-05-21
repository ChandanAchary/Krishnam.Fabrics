'use client';

import Link from 'next/link';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { fmtCurrency } from '@/lib/money';
import { fmtMonthYear } from '@/lib/date';
import type { Labourer, MonthlySalary } from '@/types/database';

type SalaryWithLabourer = MonthlySalary & { labourer: Pick<Labourer, 'name'> | null };

interface Props {
  rows: SalaryWithLabourer[];
  month: number;
  year: number;
}

export function TopSalaries({ rows, month, year }: Props) {
  return (
    <Card>
      <CardHeader
        title="Current month — top salaries"
        description={fmtMonthYear(month, year)}
        action={
          <Link href="/salary" className="text-sm text-brand-600 hover:underline">
            View all →
          </Link>
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          title="No salary records yet"
          description="Record attendance to generate salary calculations."
        />
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((s) => (
            <li key={s.id} className="py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{s.labourer?.name ?? '—'}</p>
                <p className="text-xs text-slate-500">
                  {s.days_present} present · {s.half_days_count} half-day
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-slate-900">{fmtCurrency(s.calculated_salary)}</p>
                {s.payment_status === 'paid' ? <Badge tone="green">Paid</Badge> : <Badge tone="red">Not paid</Badge>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
