'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { fmtMonthYear, monthName, fmtDate } from '@/lib/date';
import { exportCSV } from '@/lib/csv';
import { generateSalaryPDF } from '@/lib/pdf';
import { logAudit } from '@/lib/audit';
import { useSettings } from '@/context/SettingsContext';
import { useAuth } from '@/context/AuthContext';
import type { Row } from '@/components/salary/SalaryTable';

interface Totals {
  daysPresent: number;
  halfDays: number;
  calculated: number;
  advance: number;
  net: number;
}

export function useSalaryActions(month: number, year: number, rows: Row[], totals: Totals, reload: () => void) {
  const toast = useToast();
  const { settings } = useSettings();
  const { user, fullName } = useAuth();

  const [markingId, setMarkingId] = useState<string | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const [payModal, setPayModal] = useState<{ open: boolean; row?: Row; mode: 'mark_paid' | 'mark_unpaid' }>({
    open: false, mode: 'mark_paid',
  });
  const [lockModal, setLockModal] = useState<'lock' | 'unlock' | null>(null);
  const [lockReason, setLockReason] = useState('');
  const [unlockPassword, setUnlockPassword] = useState('');
  const [lockBusy, setLockBusy] = useState(false);
  const [deleteSal, setDeleteSal] = useState<{ open: boolean; row?: Row }>({ open: false });
  const [deletingSal, setDeletingSal] = useState(false);

  const handleMarkPaid = async (payload: { amount: number; method: string; reference: string }) => {
    if (!payModal.row) return;
    setMarkingId(payModal.row.id);
    const { error } = await supabase.rpc('mark_salary_paid', {
      p_salary_id: payModal.row.id,
      p_reference: payload.reference || null,
      p_amount: payload.amount,
      p_method: payload.method,
    });
    setMarkingId(null);
    if (error) {
      toast.error(`Failed: ${error.message}`);
      return;
    }
    toast.success(`Marked ${payModal.row.labourer?.name ?? 'salary'} as paid.`);
    setPayModal({ open: false, mode: 'mark_paid' });
    reload();
  };

  const handleMarkUnpaid = async (reason: string) => {
    if (!payModal.row) return;
    setMarkingId(payModal.row.id);
    const { error } = await supabase.rpc('mark_salary_unpaid', {
      p_salary_id: payModal.row.id,
      p_reason: reason || null,
    });
    setMarkingId(null);
    if (error) {
      toast.error(`Failed: ${error.message}`);
      return;
    }
    toast.success(`Marked ${payModal.row.labourer?.name ?? 'salary'} as unpaid.`);
    setPayModal({ open: false, mode: 'mark_paid' });
    reload();
  };

  const handleRecalculate = async () => {
    setRecalculating(true);
    const { error } = await supabase.rpc('recalculate_month_for_all', {
      p_month: month, p_year: year, p_trigger_reason: 'manual_admin',
    });
    setRecalculating(false);
    if (error) {
      toast.error(`Recalc failed: ${error.message}`);
      return;
    }
    toast.success(`Recalculated salaries for ${fmtMonthYear(month, year)}.`);
    reload();
  };

  const handleLock = async () => {
    setLockBusy(true);
    const { error } = await supabase.rpc('lock_month', { p_month: month, p_year: year, p_reason: lockReason || null });
    setLockBusy(false);
    if (error) { toast.error(`Lock failed: ${error.message}`); return; }
    toast.success(`${fmtMonthYear(month, year)} locked.`);
    setLockModal(null);
    setLockReason('');
    reload();
  };

  const handleUnlock = async () => {
    if (lockReason.trim().length < 20) { toast.error('Reason must be at least 20 characters.'); return; }
    if (!unlockPassword) { toast.error('Admin password is required.'); return; }
    setLockBusy(true);
    const { error } = await supabase.rpc('unlock_month', {
      p_month: month, p_year: year, p_reason: lockReason, p_password: unlockPassword,
    });
    setLockBusy(false);
    if (error) { toast.error(`Unlock failed: ${error.message}`); return; }
    toast.success(`${fmtMonthYear(month, year)} unlocked.`);
    setLockModal(null);
    setLockReason('');
    setUnlockPassword('');
    reload();
  };

  const handleDeleteSalary = async () => {
    if (!deleteSal.row) return;
    setDeletingSal(true);
    const { error } = await supabase.rpc('admin_delete_salary', {
      p_salary_id: deleteSal.row.id, p_reason: null,
    });
    setDeletingSal(false);
    if (error) { toast.error(`Delete failed: ${error.message}`); return; }
    toast.success('Salary record deleted.');
    setDeleteSal({ open: false });
    reload();
  };

  const handleExportCSV = async () => {
    const headers = [
      'Labourer Name', 'Phone', 'Designation', 'Days Present', 'Half Days', 'Effective Days',
      `Daily Wage (${settings.currency_symbol})`, `Gross Salary (${settings.currency_symbol})`,
      `Advance (${settings.currency_symbol})`, `Net Salary (${settings.currency_symbol})`,
      'Payment Status', 'Paid On',
    ];
    const data = rows.map((r) => [
      r.labourer?.name ?? '',
      r.labourer?.phone ?? '',
      r.labourer?.designation ?? '',
      r.days_present, r.half_days_count, r.effective_days,
      Number(r.daily_wage_used).toFixed(2),
      Number(r.calculated_salary).toFixed(2),
      Number(r.advance_deducted).toFixed(2),
      Number(r.net_salary).toFixed(2),
      r.payment_status === 'paid' ? 'Paid' : 'Not Paid',
      r.paid_on ? fmtDate(r.paid_on) : '',
    ]);
    data.push([
      'TOTAL', '', '', totals.daysPresent, totals.halfDays, '', '',
      totals.calculated.toFixed(2), totals.advance.toFixed(2), totals.net.toFixed(2), '', '',
    ]);
    exportCSV(`Krishnam_Salary_${monthName(month).slice(0, 3)}_${year}.csv`, headers, data);
    await logAudit({ action: 'export_report', table: null, recordId: null, newValue: { format: 'csv', month, year } });
    toast.success('CSV exported.');
  };

  const handleExportPDF = async () => {
    generateSalaryPDF({
      companyName: settings.company_name,
      month, year,
      generatedBy: fullName ?? user?.email ?? 'user',
      rows: rows.map((r) => ({
        salary: r,
        labourer: r.labourer ?? { name: '—', phone: null, designation: null },
      })),
    });
    await logAudit({ action: 'export_report', table: null, recordId: null, newValue: { format: 'pdf', month, year } });
    toast.success('PDF generated.');
  };

  return {
    markingId,
    recalculating,
    payModal, setPayModal,
    lockModal, setLockModal,
    lockReason, setLockReason,
    unlockPassword, setUnlockPassword,
    lockBusy,
    deleteSal, setDeleteSal,
    deletingSal,
    handleMarkPaid,
    handleMarkUnpaid,
    handleRecalculate,
    handleLock,
    handleUnlock,
    handleDeleteSalary,
    handleExportCSV,
    handleExportPDF,
  };
}
