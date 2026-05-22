'use client';

import Link from 'next/link';
import { CheckCircle2, XCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { fmtCurrency } from '@/lib/money';
import type { Labourer, MonthlySalary } from '@/types/database';

export type Row = MonthlySalary & {
  labourer: Pick<Labourer, 'name' | 'phone' | 'is_active' | 'designation'> | null;
};

interface Props {
  rows: Row[];
  isAdmin: boolean;
  markingId: string | null;
  onMarkPaid: (row: Row) => void;
  onMarkUnpaid: (row: Row) => void;
  onDelete?: (row: Row) => void;
  totals: {
    daysPresent: number;
    halfDays: number;
    calculated: number;
    advance: number;
    net: number;
    unpaidAmount: number;
    unpaidCount: number;
  };
  hasAnyRows: boolean;
}

export function SalaryTable({
  rows, isAdmin, markingId, onMarkPaid, onMarkUnpaid, onDelete, totals, hasAnyRows,
}: Props) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No salary records"
        description={
          !hasAnyRows
            ? 'No data for this month. Record attendance to generate salaries.'
            : 'No matches for the current filters.'
        }
      />
    );
  }

  const paymentActions = (r: Row) =>
    r.payment_status === 'not_paid' ? (
      <Button
        size="sm"
        variant="success"
        loading={markingId === r.id}
        onClick={() => onMarkPaid(r)}
        leftIcon={<CheckCircle2 className="h-4 w-4" />}
      >
        Mark paid
      </Button>
    ) : (
      <Button
        size="sm"
        variant="danger"
        loading={markingId === r.id}
        onClick={() => onMarkUnpaid(r)}
        leftIcon={<XCircle className="h-4 w-4" />}
      >
        Mark unpaid
      </Button>
    );

  return (
    <>
      {/* Desktop: full table */}
      <div className="hidden overflow-x-auto scroll-touch lg:block">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">Designation</th>
              <th className="text-right px-4 py-3 font-medium">Days</th>
              <th className="text-right px-4 py-3 font-medium">Half</th>
              <th className="text-right px-4 py-3 font-medium">Wage</th>
              <th className="text-right px-4 py-3 font-medium">Gross</th>
              <th className="text-right px-4 py-3 font-medium">Advance</th>
              <th className="text-right px-4 py-3 font-medium">Net</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-right px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id} className="transition-colors hover:bg-brand-50/40">
                <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">
                  <Link href={`/labourers/${r.labourer_id}`} className="hover:underline hover:text-brand-600">
                    {r.labourer?.name ?? '—'}
                  </Link>
                  {r.labourer && !r.labourer.is_active && (
                    <Badge tone="slate" className="ml-2">
                      Inactive
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-700">{r.labourer?.designation ?? '—'}</td>
                <td className="px-4 py-3 text-right">{r.days_present}</td>
                <td className="px-4 py-3 text-right">{r.half_days_count}</td>
                <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">{fmtCurrency(r.daily_wage_used)}</td>
                <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">{fmtCurrency(r.calculated_salary)}</td>
                <td className="px-4 py-3 text-right text-amber-700 whitespace-nowrap">{fmtCurrency(r.advance_deducted)}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900 whitespace-nowrap">{fmtCurrency(r.net_salary)}</td>
                <td className="px-4 py-3">
                  {r.payment_status === 'paid' ? (
                    <div className="flex flex-col gap-0.5">
                      <Badge tone="green">Paid</Badge>
                      {r.payment_method && (
                        <span className="text-[11px] text-slate-500 capitalize">
                          {r.payment_method === 'bank' ? 'Bank a/c' : r.payment_method}
                          {r.paid_amount != null ? ` · ${fmtCurrency(r.paid_amount)}` : ''}
                        </span>
                      )}
                    </div>
                  ) : (
                    <Badge tone="red">Not paid</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-1">
                    {paymentActions(r)}
                    {isAdmin && onDelete && (
                      <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => onDelete(r)} aria-label="Delete salary record">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50 text-sm">
            <tr>
              <td className="px-4 py-3 font-semibold text-slate-900" colSpan={2}>TOTAL</td>
              <td className="px-4 py-3 text-right font-semibold">{totals.daysPresent}</td>
              <td className="px-4 py-3 text-right font-semibold">{totals.halfDays}</td>
              <td className="px-4 py-3"></td>
              <td className="px-4 py-3 text-right font-bold text-slate-900">{fmtCurrency(totals.calculated)}</td>
              <td className="px-4 py-3 text-right font-semibold text-amber-700">{fmtCurrency(totals.advance)}</td>
              <td className="px-4 py-3 text-right font-bold text-slate-900">{fmtCurrency(totals.net)}</td>
              <td className="px-4 py-3 text-xs text-red-700 font-medium" colSpan={2}>
                Unpaid: {fmtCurrency(totals.unpaidAmount)} ({totals.unpaidCount})
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Mobile / tablet: stacked cards */}
      <ul className="divide-y divide-slate-100 lg:hidden">
        {rows.map((r) => (
          <li key={r.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/labourers/${r.labourer_id}`}
                  className="font-medium text-slate-900 hover:text-brand-600 hover:underline"
                >
                  {r.labourer?.name ?? '—'}
                </Link>
                <p className="text-xs text-slate-500">
                  {r.labourer?.designation ?? 'No designation'}
                  {r.labourer && !r.labourer.is_active ? ' · Inactive' : ''}
                </p>
              </div>
              {r.payment_status === 'paid' ? <Badge tone="green">Paid</Badge> : <Badge tone="red">Not paid</Badge>}
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-slate-50 py-2">
                <p className="text-[11px] text-slate-500">Days</p>
                <p className="text-sm font-semibold text-slate-900">
                  {r.days_present}
                  {r.half_days_count ? <span className="text-slate-400"> +{r.half_days_count}½</span> : null}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 py-2">
                <p className="text-[11px] text-slate-500">Advance</p>
                <p className="text-sm font-semibold text-amber-700">{fmtCurrency(r.advance_deducted)}</p>
              </div>
              <div className="rounded-lg bg-brand-50 py-2">
                <p className="text-[11px] text-brand-700/70">Net</p>
                <p className="text-sm font-bold text-brand-700">{fmtCurrency(r.net_salary)}</p>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-end gap-2">
              {paymentActions(r)}
              {isAdmin && onDelete && (
                <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => onDelete(r)} aria-label="Delete salary record">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </li>
        ))}
        <li className="flex items-center justify-between bg-slate-50 px-4 py-3 text-sm">
          <span className="font-semibold text-slate-900">Net total</span>
          <span className="font-bold text-slate-900">{fmtCurrency(totals.net)}</span>
        </li>
      </ul>
    </>
  );
}
