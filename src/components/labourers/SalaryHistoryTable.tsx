'use client';

import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { fmtDateTime, fmtMonthYear } from '@/lib/date';
import { fmtCurrency } from '@/lib/money';
import type { MonthlySalary } from '@/types/database';

export function SalaryHistoryTable({ salaries }: { salaries: MonthlySalary[] }) {
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="p-5">
        <CardHeader
          title="Salary history"
          description="All historical monthly records, retained indefinitely."
        />
      </div>
      {salaries.length === 0 ? (
        <EmptyState
          title="No salary records yet"
          description="Salary records appear after attendance is recorded."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Month / Year</th>
                <th className="text-right px-4 py-3 font-medium">Days</th>
                <th className="text-right px-4 py-3 font-medium">Half</th>
                <th className="text-right px-4 py-3 font-medium">Wage used</th>
                <th className="text-right px-4 py-3 font-medium">Gross</th>
                <th className="text-right px-4 py-3 font-medium">Advance</th>
                <th className="text-right px-4 py-3 font-medium">Net</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Paid on</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {salaries.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{fmtMonthYear(s.month, s.year)}</td>
                  <td className="px-4 py-3 text-right">{s.days_present}</td>
                  <td className="px-4 py-3 text-right">{s.half_days_count}</td>
                  <td className="px-4 py-3 text-right">{fmtCurrency(s.daily_wage_used)}</td>
                  <td className="px-4 py-3 text-right">{fmtCurrency(s.calculated_salary)}</td>
                  <td className="px-4 py-3 text-right text-amber-700">{fmtCurrency(s.advance_deducted)}</td>
                  <td className="px-4 py-3 text-right font-medium">{fmtCurrency(s.net_salary)}</td>
                  <td className="px-4 py-3">
                    {s.payment_status === 'paid' ? (
                      <Badge tone="green">Paid</Badge>
                    ) : (
                      <Badge tone="red">Not paid</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{fmtDateTime(s.paid_on)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
