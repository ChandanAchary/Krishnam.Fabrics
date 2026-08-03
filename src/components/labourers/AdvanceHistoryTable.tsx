'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { fmtDate } from '@/lib/date';
import { fmtCurrency } from '@/lib/money';
import type { LabourerAdvance } from '@/types/database';

interface Props {
  advances: LabourerAdvance[];
  isAdmin: boolean;
  onDelete?: (advance: LabourerAdvance) => void;
  onRecordAdvance?: () => void;
}

export function AdvanceHistoryTable({ advances, isAdmin, onDelete, onRecordAdvance }: Props) {
  const total = advances.reduce((sum, a) => sum + Number(a.amount), 0);

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="p-5 flex items-start justify-between gap-3">
        <CardHeader
          title="Advance history"
          description="All dated advance entries, one row per payment given."
        />
        <div className="flex items-center gap-4 shrink-0">
          {advances.length > 0 && (
            <div className="text-right">
              <p className="text-xs text-slate-500">Total advanced</p>
              <p className="font-semibold text-slate-900">{fmtCurrency(total)}</p>
            </div>
          )}
          {onRecordAdvance && (
            <Button size="sm" variant="secondary" onClick={onRecordAdvance} leftIcon={<Plus className="h-4 w-4" />}>
              Record advance
            </Button>
          )}
        </div>
      </div>
      {advances.length === 0 ? (
        <EmptyState title="No advances recorded" description="Advances given to this labourer will appear here." />
      ) : (
        <div className="overflow-x-auto scroll-touch">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Date given</th>
                <th className="text-right px-4 py-3 font-medium">Amount</th>
                <th className="text-left px-4 py-3 font-medium">Note</th>
                {isAdmin && onDelete && <th className="text-right px-4 py-3 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {advances.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{fmtDate(a.given_on)}</td>
                  <td className="px-4 py-3 text-right text-amber-700">{fmtCurrency(a.amount)}</td>
                  <td className="px-4 py-3 text-slate-700">{a.note ?? '—'}</td>
                  {isAdmin && onDelete && (
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:bg-red-50"
                        onClick={() => onDelete(a)}
                        aria-label="Delete advance"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
