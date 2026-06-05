'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Download, FileSpreadsheet, FileText, Lock, RefreshCcw, Unlock,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SalaryTable, type Row } from '@/components/salary/SalaryTable';
import { PaymentModal } from '@/components/salary/PaymentModal';
import { LockMonthModal, UnlockMonthModal } from '@/components/salary/LockMonthModals';
import { SalaryFilterBar } from '@/components/salary/SalaryFilterBar';
import { SalarySummaryCards } from '@/components/salary/SalarySummaryCards';
import { useSalaryActions } from '@/hooks/useSalaryActions';
import { supabase } from '@/lib/supabase';
import { fmtMonthYear } from '@/lib/date';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import type { MonthLock, SalaryMonth } from '@/types/database';

type PaymentFilter = 'all' | 'paid' | 'not_paid';

export function SalaryPage() {
  const params = useParams<{ year?: string; month?: string }>();
  const router = useRouter();
  const now = new Date();
  const [month, setMonth] = useState<number>(Number(params.month) || now.getMonth() + 1);
  const [year, setYear] = useState<number>(Number(params.year) || now.getFullYear());
  const [rows, setRows] = useState<Row[]>([]);
  const [available, setAvailable] = useState<SalaryMonth[]>([]);
  const [filter, setFilter] = useState<PaymentFilter>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [lock, setLock] = useState<MonthLock | null>(null);
  const { isAdmin } = useAuth();
  const toast = useToast();

  const refreshLock = useCallback(async () => {
    const { data } = await supabase
      .from('month_locks')
      .select('*')
      .eq('month', month)
      .eq('year', year)
      .maybeSingle();
    setLock((data as MonthLock | null) ?? null);
  }, [month, year]);

  const load = useCallback(async () => {
    setLoading(true);
    const [salRes, monthsRes] = await Promise.all([
      supabase
        .from('monthly_salaries')
        .select('*, labourer:labourers(name, phone, is_active, designation)')
        .eq('month', month)
        .eq('year', year)
        .order('id', { ascending: true }),
      supabase.rpc('list_salary_months'),
    ]);
    if (salRes.error) toast.error(`Could not load: ${salRes.error.message}`);
    let data = (salRes.data as Row[]) ?? [];
    data = data.sort((a, b) => (a.labourer?.name ?? '').localeCompare(b.labourer?.name ?? ''));
    setRows(data);
    setAvailable(((monthsRes.data as SalaryMonth[]) ?? []) as SalaryMonth[]);
    await refreshLock();
    setLoading(false);
  }, [month, year, toast, refreshLock]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { router.replace(`/salary/${year}/${month}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);
  useEffect(() => {
    const ch = supabase
      .channel('salary-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monthly_salaries' }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === 'paid' && r.payment_status !== 'paid') return false;
      if (filter === 'not_paid' && r.payment_status !== 'not_paid') return false;
      if (term && !(r.labourer?.name ?? '').toLowerCase().includes(term)) return false;
      return true;
    });
  }, [rows, filter, search]);

  const totals = useMemo(() => {
    return rows.reduce((acc, r) => {
      acc.daysPresent += r.days_present;
      acc.halfDays += r.half_days_count;
      acc.doubleDuties += r.double_duty_count ?? 0;
      acc.oneAndHalfDuties += r.one_and_half_duty_count ?? 0;
      acc.absents += r.absent_count ?? 0;
      acc.calculated += Number(r.calculated_salary);
      acc.advance += Number(r.advance_deducted);
      acc.net += Number(r.net_salary);
      if (r.payment_status === 'not_paid') {
        acc.unpaidAmount += Number(r.net_salary);
        acc.unpaidCount += 1;
      } else {
        acc.paidAmount += Number(r.net_salary);
      }
      return acc;
    }, {
      daysPresent: 0, halfDays: 0, doubleDuties: 0, oneAndHalfDuties: 0, absents: 0,
      calculated: 0, advance: 0, net: 0, unpaidAmount: 0, unpaidCount: 0, paidAmount: 0,
    });
  }, [rows]);

  const actions = useSalaryActions(month, year, rows, totals, load);

  const years = useMemo(() => {
    const set = new Set<number>();
    available.forEach((m) => set.add(m.year));
    set.add(now.getFullYear());
    return Array.from(set).sort((a, b) => b - a);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available]);

  return (
    <div>
      <PageHeader
        title="Monthly salary"
        description={`Salary calculations and payment status for ${fmtMonthYear(month, year)}`}
        action={
          <>
            <Button variant="secondary" onClick={actions.handleExportCSV} disabled={rows.length === 0}
              leftIcon={<FileSpreadsheet className="h-4 w-4" />}>Download CSV</Button>
            <Button variant="secondary" onClick={actions.handleExportPDF} disabled={rows.length === 0}
              leftIcon={<FileText className="h-4 w-4" />}>Download PDF</Button>
            {isAdmin && (
              <Button variant="secondary" onClick={actions.handleRecalculate}
                loading={actions.recalculating}
                disabled={Boolean(lock?.is_locked) || rows.length === 0}
                leftIcon={<RefreshCcw className="h-4 w-4" />}>Recalculate</Button>
            )}
            {isAdmin && !lock?.is_locked && (
              <Button variant="primary" onClick={() => actions.setLockModal('lock')}
                leftIcon={<Lock className="h-4 w-4" />}>Lock month</Button>
            )}
            {isAdmin && lock?.is_locked && (
              <Button variant="danger" onClick={() => actions.setLockModal('unlock')}
                leftIcon={<Unlock className="h-4 w-4" />}>Unlock month</Button>
            )}
          </>
        }
      />

      <SalaryFilterBar
        month={month}
        year={year}
        years={years}
        filter={filter}
        search={search}
        lock={lock}
        onMonthChange={setMonth}
        onYearChange={setYear}
        onFilterChange={setFilter}
        onSearchChange={setSearch}
      />

      <SalarySummaryCards
        rowsCount={rows.length}
        grossTotal={totals.calculated}
        advanceTotal={totals.advance}
        netTotal={totals.net}
        unpaidAmount={totals.unpaidAmount}
        unpaidCount={totals.unpaidCount}
      />

      <Card padded={false} className="overflow-hidden">
        {loading ? (
          <TableSkeleton rows={8} cols={7} />
        ) : (
          <SalaryTable
            rows={filtered}
            isAdmin={isAdmin}
            markingId={actions.markingId}
            onMarkPaid={(row) => actions.setPayModal({ open: true, row, mode: 'mark_paid' })}
            onMarkUnpaid={(row) => actions.setPayModal({ open: true, row, mode: 'mark_unpaid' })}
            onDelete={isAdmin ? (row) => actions.setDeleteSal({ open: true, row }) : undefined}
            totals={totals}
            hasAnyRows={rows.length > 0}
          />
        )}
        {!loading && rows.length === 0 && (
          <div className="px-4 py-3 text-sm">
            <Link href="/attendance" className="text-brand-600 hover:underline">
              <Download className="inline h-4 w-4" /> Take attendance
            </Link>
          </div>
        )}
      </Card>

      <PaymentModal
        open={actions.payModal.open}
        row={actions.payModal.row}
        mode={actions.payModal.mode}
        busy={Boolean(actions.markingId)}
        onCancel={() => actions.setPayModal({ open: false, mode: 'mark_paid' })}
        onConfirmPaid={actions.handleMarkPaid}
        onConfirmUnpaid={actions.handleMarkUnpaid}
      />

      <LockMonthModal
        open={actions.lockModal === 'lock'}
        month={month}
        year={year}
        busy={actions.lockBusy}
        reason={actions.lockReason}
        onReasonChange={actions.setLockReason}
        onCancel={() => actions.setLockModal(null)}
        onConfirm={actions.handleLock}
      />

      <UnlockMonthModal
        open={actions.lockModal === 'unlock'}
        month={month}
        year={year}
        busy={actions.lockBusy}
        reason={actions.lockReason}
        password={actions.unlockPassword}
        onReasonChange={actions.setLockReason}
        onPasswordChange={actions.setUnlockPassword}
        onCancel={() => actions.setLockModal(null)}
        onConfirm={actions.handleUnlock}
      />

      <ConfirmDialog
        open={actions.deleteSal.open}
        title="Delete salary record?"
        description={
          actions.deleteSal.row
            ? `This permanently removes the salary record for ${actions.deleteSal.row.labourer?.name ?? 'this labourer'}. The old value is captured in the audit log.`
            : 'This permanently removes the salary record. The old value is captured in the audit log.'
        }
        confirmLabel="Delete record"
        variant="danger"
        onConfirm={actions.handleDeleteSalary}
        onCancel={() => actions.setDeleteSal({ open: false })}
      />
    </div>
  );
}
