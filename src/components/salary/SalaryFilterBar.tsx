'use client';

import { Lock } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { monthName, fmtDateTime } from '@/lib/date';
import type { MonthLock } from '@/types/database';

export type PaymentFilter = 'all' | 'paid' | 'not_paid';

interface Props {
  month: number;
  year: number;
  years: number[];
  filter: PaymentFilter;
  search: string;
  lock: MonthLock | null;
  onMonthChange: (m: number) => void;
  onYearChange: (y: number) => void;
  onFilterChange: (f: PaymentFilter) => void;
  onSearchChange: (s: string) => void;
}

export function SalaryFilterBar({
  month, year, years, filter, search, lock,
  onMonthChange, onYearChange, onFilterChange, onSearchChange,
}: Props) {
  return (
    <Card className="mb-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
        <Select label="Month" value={month} onChange={(e) => onMonthChange(Number(e.target.value))}>
          {Array.from({ length: 12 }).map((_, i) => (
            <option key={i + 1} value={i + 1}>{monthName(i + 1)}</option>
          ))}
        </Select>
        <Select label="Year" value={year} onChange={(e) => onYearChange(Number(e.target.value))}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </Select>
        <Select label="Payment status" value={filter} onChange={(e) => onFilterChange(e.target.value as PaymentFilter)}>
          <option value="all">All</option>
          <option value="paid">Paid</option>
          <option value="not_paid">Not paid</option>
        </Select>
        <Input label="Search labourer" value={search} onChange={(e) => onSearchChange(e.target.value)} placeholder="Name…" />
      </div>
      {lock?.is_locked && (
        <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 text-sm flex items-center gap-2">
          <Lock className="h-4 w-4" />
          <span>
            <strong>This month is locked.</strong> Locked on {fmtDateTime(lock.locked_at)}. Payment status remains editable.
          </span>
        </div>
      )}
    </Card>
  );
}
