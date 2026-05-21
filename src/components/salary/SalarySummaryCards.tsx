'use client';

import { Card } from '@/components/ui/Card';
import { fmtCurrency } from '@/lib/money';

interface Props {
  rowsCount: number;
  grossTotal: number;
  advanceTotal: number;
  netTotal: number;
  unpaidAmount: number;
  unpaidCount: number;
}

export function SalarySummaryCards({ rowsCount, grossTotal, advanceTotal, netTotal, unpaidAmount, unpaidCount }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
      <Card>
        <p className="text-sm font-medium text-slate-500">Total gross</p>
        <p className="text-2xl font-semibold text-slate-900 mt-1">{fmtCurrency(grossTotal)}</p>
        <p className="text-xs text-slate-500 mt-1">{rowsCount} records</p>
      </Card>
      <Card>
        <p className="text-sm font-medium text-amber-700">Total advance</p>
        <p className="text-2xl font-semibold text-slate-900 mt-1">{fmtCurrency(advanceTotal)}</p>
        <p className="text-xs text-slate-500 mt-1">Deducted from gross</p>
      </Card>
      <Card>
        <p className="text-sm font-medium text-slate-500">Total net payable</p>
        <p className="text-2xl font-semibold text-slate-900 mt-1">{fmtCurrency(netTotal)}</p>
        <p className="text-xs text-slate-500 mt-1">Gross − advance</p>
      </Card>
      <Card>
        <p className="text-sm font-medium text-red-700">Net unpaid</p>
        <p className="text-2xl font-semibold text-slate-900 mt-1">{fmtCurrency(unpaidAmount)}</p>
        <p className="text-xs text-slate-500 mt-1">{unpaidCount} awaiting payment</p>
      </Card>
    </div>
  );
}
