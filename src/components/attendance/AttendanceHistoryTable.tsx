'use client';

import { useMemo } from 'react';
import { Edit3, Trash2 } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { fmtDate, fmtDateTime } from '@/lib/date';
import type { AttendanceRecord, AttendanceStatus } from '@/types/database';
import { AttendanceStatusBadge } from './StatusBadge';

interface Props {
  records: AttendanceRecord[];
  isAdmin: boolean;
  fromDate: string;
  toDate: string;
  status: AttendanceStatus | 'all';
  onFromDateChange: (v: string) => void;
  onToDateChange: (v: string) => void;
  onStatusChange: (v: AttendanceStatus | 'all') => void;
  onEdit?: (record: AttendanceRecord) => void;
  onDelete?: (record: AttendanceRecord) => void;
}

export function AttendanceHistoryTable({
  records,
  isAdmin,
  fromDate,
  toDate,
  status,
  onFromDateChange,
  onToDateChange,
  onStatusChange,
  onEdit,
  onDelete,
}: Props) {
  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (fromDate && r.date < fromDate) return false;
      if (toDate && r.date > toDate) return false;
      if (status !== 'all' && r.status !== status) return false;
      return true;
    });
  }, [records, fromDate, toDate, status]);

  return (
    <Card padded={false} className="overflow-hidden mb-6">
      <div className="p-5">
        <CardHeader
          title="Attendance history"
          description="Browse all recorded attendance with optional date and status filters."
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input
            label="From date"
            type="date"
            value={fromDate}
            max={toDate || undefined}
            onChange={(e) => onFromDateChange(e.target.value)}
          />
          <Input
            label="To date"
            type="date"
            value={toDate}
            min={fromDate || undefined}
            onChange={(e) => onToDateChange(e.target.value)}
          />
          <Select
            label="Status"
            value={status}
            onChange={(e) => onStatusChange(e.target.value as AttendanceStatus | 'all')}
          >
            <option value="all">All statuses</option>
            <option value="present">Present (P)</option>
            <option value="absent">Absent (A)</option>
            <option value="half_day">Half day (H)</option>
            <option value="double_duty">Double duty (DD)</option>
            <option value="one_and_half_duty">1.5 duty</option>
          </Select>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          Showing {filtered.length} of {records.length} record{records.length === 1 ? '' : 's'}.
        </p>
      </div>
      {filtered.length === 0 ? (
        <EmptyState title="No matching attendance" description="Adjust the filters above to see records." />
      ) : (
        <div className="overflow-x-auto scroll-touch max-h-96">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 sticky top-0">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Recorded at</th>
                <th className="text-left px-4 py-3 font-medium">Edit reason</th>
                {isAdmin && <th className="text-right px-4 py-3 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{fmtDate(r.date)}</td>
                  <td className="px-4 py-3">
                    <AttendanceStatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-700 text-xs">{fmtDateTime(r.recorded_at)}</td>
                  <td className="px-4 py-3 text-slate-700 text-xs">{r.edit_reason ?? '—'}</td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-1">
                        {onEdit && (
                          <Button size="sm" variant="ghost" onClick={() => onEdit(r)}>
                            <Edit3 className="h-3.5 w-3.5" /> Edit
                          </Button>
                        )}
                        {onDelete && (
                          <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => onDelete(r)}>
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </Button>
                        )}
                      </div>
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
