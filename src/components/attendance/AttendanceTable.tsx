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

/**
 * Card list of attendance rows. No table / no horizontal scroll — each row is
 * a self-contained card with the labourer's info and 5 circular selectors.
 */
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
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No matches"
        description="No labourer matches your search."
      />
    );
  }
  return (
    <ul className="space-y-2 p-3 sm:p-4">
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
    </ul>
  );
}
