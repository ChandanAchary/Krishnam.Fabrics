'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { AttendanceMatrix, type MatrixRow } from '@/components/attendance/AttendanceMatrix';
import { supabase } from '@/lib/supabase';
import { daysInCalendarMonth, fmtMonthYear, monthName, toISODate } from '@/lib/date';
import { fmtCurrency } from '@/lib/money';
import { exportCSV } from '@/lib/csv';
import { logAudit } from '@/lib/audit';
import { useToast } from '@/context/ToastContext';
import { useSettings } from '@/context/SettingsContext';
import type { AttendanceRecord, AttendanceStatus, Labourer, MonthlySalary, SalaryMonth } from '@/types/database';

export function AttendanceSheetPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [rows, setRows] = useState<MatrixRow[]>([]);
  const [available, setAvailable] = useState<SalaryMonth[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const { settings } = useSettings();

  const dayNums = useMemo(() => daysInCalendarMonth(year, month).map((d) => d.getDate()), [year, month]);

  const load = useCallback(async () => {
    setLoading(true);
    const monthDays = daysInCalendarMonth(year, month);
    const firstISO = toISODate(monthDays[0]);
    const lastISO = toISODate(monthDays[monthDays.length - 1]);

    const [labRes, attRes, salRes, monthsRes] = await Promise.all([
      supabase.from('labourers').select('*').order('name', { ascending: true }),
      supabase.from('attendance').select('labourer_id, date, status').gte('date', firstISO).lte('date', lastISO),
      supabase.from('monthly_salaries').select('*').eq('month', month).eq('year', year),
      supabase.rpc('list_salary_months'),
    ]);

    if (labRes.error) toast.error(`Could not load: ${labRes.error.message}`);
    const labourers = (labRes.data as Labourer[]) ?? [];
    const attendance = (attRes.data as Pick<AttendanceRecord, 'labourer_id' | 'date' | 'status'>[]) ?? [];
    const salaries = (salRes.data as MonthlySalary[]) ?? [];
    setAvailable(((monthsRes.data as SalaryMonth[]) ?? []) as SalaryMonth[]);

    const attByLabourer = new Map<string, Record<number, AttendanceStatus>>();
    for (const a of attendance) {
      const day = Number(a.date.slice(8, 10));
      if (!attByLabourer.has(a.labourer_id)) attByLabourer.set(a.labourer_id, {});
      attByLabourer.get(a.labourer_id)![day] = a.status;
    }
    const salByLabourer = new Map<string, MonthlySalary>();
    for (const s of salaries) salByLabourer.set(s.labourer_id, s);

    // Show active labourers + anyone who has a salary/attendance record this month
    const matrix: MatrixRow[] = labourers
      .filter((l) => l.is_active || salByLabourer.has(l.id) || attByLabourer.has(l.id))
      .map((l) => {
        const sal = salByLabourer.get(l.id);
        return {
          labourerId: l.id,
          name: l.name,
          designation: l.designation,
          dailyWage: Number(l.daily_wage),
          statuses: attByLabourer.get(l.id) ?? {},
          daysPresent: sal?.days_present ?? 0,
          halfDays: sal?.half_days_count ?? 0,
          gross: Number(sal?.calculated_salary ?? 0),
          advance: Number(sal?.advance_deducted ?? 0),
          net: Number(sal?.net_salary ?? 0),
          paid: sal?.payment_status === 'paid',
        };
      });
    setRows(matrix);
    setLoading(false);
  }, [month, year, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => {
          acc.gross += r.gross;
          acc.advance += r.advance;
          acc.net += r.net;
          return acc;
        },
        { gross: 0, advance: 0, net: 0 }
      ),
    [rows]
  );

  const years = useMemo(() => {
    const set = new Set<number>([now.getFullYear()]);
    available.forEach((m) => set.add(m.year));
    return Array.from(set).sort((a, b) => b - a);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available]);

  const handleExportCSV = async () => {
    const headers = [
      'Labourer', 'Designation', `Daily Wage (${settings.currency_symbol})`,
      ...dayNums.map((d) => String(d)),
      'Days Present', 'Half Days', `Gross (${settings.currency_symbol})`,
      `Advance (${settings.currency_symbol})`, `Net (${settings.currency_symbol})`, 'Paid',
    ];
    const MARK: Record<AttendanceStatus, string> = { present: 'P', absent: 'A', half_day: 'H' };
    const data = rows.map((r) => [
      r.name,
      r.designation ?? '',
      r.dailyWage.toFixed(2),
      ...dayNums.map((d) => (r.statuses[d] ? MARK[r.statuses[d]] : '-')),
      r.daysPresent,
      r.halfDays,
      r.gross.toFixed(2),
      r.advance.toFixed(2),
      r.net.toFixed(2),
      r.paid ? 'Yes' : 'No',
    ]);
    exportCSV(`LabourFlow_AttendanceSheet_${monthName(month).slice(0, 3)}_${year}.csv`, headers, data);
    await logAudit({ action: 'export_report', table: null, newValue: { format: 'csv', kind: 'attendance_sheet', month, year } });
    toast.success('Attendance sheet exported.');
  };

  return (
    <div>
      <PageHeader
        title="Attendance sheet"
        description={`Complete monthly matrix — all labourers × every day of ${fmtMonthYear(month, year)}`}
        action={
          <Button variant="primary" onClick={handleExportCSV} disabled={rows.length === 0}
            leftIcon={<FileSpreadsheet className="h-4 w-4" />}>
            Export CSV
          </Button>
        }
      />

      <Card className="mb-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
          <Select label="Month" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {Array.from({ length: 12 }).map((_, i) => (
              <option key={i + 1} value={i + 1}>{monthName(i + 1)}</option>
            ))}
          </Select>
          <Select label="Year" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <span className="text-slate-500">Legend:</span>
          <span className="text-emerald-700 font-medium">P = Present</span>
          <span className="text-amber-700 font-medium">H = Half day</span>
          <span className="text-red-700 font-medium">A = Absent</span>
          <span className="text-slate-400">· = No record</span>
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <Card>
          <p className="text-sm font-medium text-slate-500">Total gross</p>
          <p className="text-2xl font-semibold text-slate-900 mt-1">{fmtCurrency(totals.gross)}</p>
        </Card>
        <Card>
          <p className="text-sm font-medium text-amber-700">Total advance</p>
          <p className="text-2xl font-semibold text-slate-900 mt-1">{fmtCurrency(totals.advance)}</p>
        </Card>
        <Card>
          <p className="text-sm font-medium text-slate-500">Total net payable</p>
          <p className="text-2xl font-semibold text-slate-900 mt-1">{fmtCurrency(totals.net)}</p>
        </Card>
      </div>

      <Card padded={false} className="overflow-hidden">
        {loading ? (
          <div className="py-12 flex justify-center"><Spinner label="Building sheet…" /></div>
        ) : (
          <AttendanceMatrix days={dayNums} rows={rows} />
        )}
      </Card>
    </div>
  );
}
