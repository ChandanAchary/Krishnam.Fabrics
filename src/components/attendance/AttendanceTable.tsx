'use client';

import { AttendanceRow } from './AttendanceRow';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import type { AttendanceStatus, Labourer } from '@/types/database';

export interface RowData {
  labourer: Labourer;
  status: AttendanceStatus;
  existing: boolean;
}

interface Props {
  loading: boolean;
  rows: RowData[];
  totalRows: number;
  disabled: boolean;
  onStatusChange: (labourerId: string, status: AttendanceStatus) => void;
}

export function AttendanceTable({ loading, rows, totalRows, disabled, onStatusChange }: Props) {
  if (loading) {
    return (
      <div className="py-12 flex justify-center">
        <Spinner label="Loading…" />
      </div>
    );
  }
  if (totalRows === 0) {
    return (
      <EmptyState
        title="No active labourers"
        description="Add labourers, or ensure their joining date is on or before this date."
      />
    );
  }
  return (
    <div className="overflow-x-auto scroll-touch">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="text-left px-4 py-3 font-medium w-12">#</th>
            <th className="text-left px-4 py-3 font-medium">Name</th>
            <th className="text-right px-4 py-3 font-medium">Wage</th>
            <th className="text-center px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <AttendanceRow
              key={r.labourer.id}
              index={i}
              labourer={r.labourer}
              status={r.status}
              previouslyRecorded={r.existing}
              disabled={disabled}
              onChange={(s) => onStatusChange(r.labourer.id, s)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
