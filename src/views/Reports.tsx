'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, FileBarChart2, FileSpreadsheet } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { supabase } from '@/lib/supabase';
import { fmtMonthYear } from '@/lib/date';
import { fmtCurrency } from '@/lib/money';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { exportCSV } from '@/lib/csv';
import { logAudit } from '@/lib/audit';
import type { AttendanceRecord, Labourer, MonthlySalary, SalaryMonth } from '@/types/database';
import { downloadBlob } from '@/lib/utils';

interface MonthSummary {
  month: number;
  year: number;
  total: number;
  paid: number;
  unpaid: number;
  unpaidCount: number;
  recordCount: number;
}

export function ReportsPage() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [summaries, setSummaries] = useState<MonthSummary[]>([]);
  const [exportingBackup, setExportingBackup] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: months, error } = await supabase.rpc('list_salary_months');
      if (error) {
        toast.error(`Could not load months: ${error.message}`);
        setLoading(false);
        return;
      }
      const list = ((months as SalaryMonth[]) ?? []).slice(0, 24);
      const out: MonthSummary[] = [];
      for (const m of list) {
        const { data } = await supabase
          .from('monthly_salaries')
          .select('calculated_salary, payment_status')
          .eq('month', m.month)
          .eq('year', m.year);
        const rows = (data ?? []) as { calculated_salary: number; payment_status: string }[];
        let total = 0,
          paid = 0,
          unpaid = 0,
          unpaidCount = 0;
        rows.forEach((r) => {
          total += Number(r.calculated_salary);
          if (r.payment_status === 'paid') paid += Number(r.calculated_salary);
          else {
            unpaid += Number(r.calculated_salary);
            unpaidCount++;
          }
        });
        out.push({
          month: m.month,
          year: m.year,
          total,
          paid,
          unpaid,
          unpaidCount,
          recordCount: rows.length,
        });
      }
      if (!cancelled) {
        setSummaries(out);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const handleAggregateCSV = () => {
    const headers = ['Year', 'Month', 'Records', 'Total Calculated', 'Paid', 'Unpaid', 'Unpaid Count'];
    const data = summaries.map((s) => [
      s.year,
      fmtMonthYear(s.month, s.year),
      s.recordCount,
      s.total.toFixed(2),
      s.paid.toFixed(2),
      s.unpaid.toFixed(2),
      s.unpaidCount,
    ]);
    exportCSV(`Krishnam_Reports_Aggregate.csv`, headers, data);
    toast.success('Aggregate CSV exported.');
    void logAudit({ action: 'export_report', table: null, newValue: { format: 'csv', kind: 'aggregate' } });
  };

  const handleJsonBackup = async () => {
    setExportingBackup(true);
    try {
      const [labs, atts, sals] = await Promise.all([
        supabase.from('labourers').select('*'),
        supabase.from('attendance').select('*'),
        supabase.from('monthly_salaries').select('*'),
      ]);
      const payload = {
        generated_at: new Date().toISOString(),
        labourers: (labs.data as Labourer[]) ?? [],
        attendance: (atts.data as AttendanceRecord[]) ?? [],
        monthly_salaries: (sals.data as MonthlySalary[]) ?? [],
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const today = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `Krishnam_Backup_${today}.json`);
      toast.success('JSON backup downloaded.');
      await logAudit({ action: 'export_report', table: null, newValue: { format: 'json', kind: 'full_backup' } });
    } finally {
      setExportingBackup(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Roll-up views across months. Drill into any month for full details."
        action={
          <>
            <Button
              variant="secondary"
              onClick={handleAggregateCSV}
              disabled={summaries.length === 0}
              leftIcon={<FileSpreadsheet className="h-4 w-4" />}
            >
              Aggregate CSV
            </Button>
            {isAdmin && (
              <Button
                variant="primary"
                onClick={handleJsonBackup}
                loading={exportingBackup}
                leftIcon={<Download className="h-4 w-4" />}
              >
                JSON backup
              </Button>
            )}
          </>
        }
      />

      <Card padded={false} className="overflow-hidden">
        <div className="p-5">
          <CardHeader title="Monthly summary" description="Most recent 24 months" />
        </div>
        {loading ? (
          <div className="py-12 flex justify-center">
            <Spinner label="Building report…" />
          </div>
        ) : summaries.length === 0 ? (
          <EmptyState
            title="No data yet"
            description="Reports appear once attendance has been recorded."
            icon={<FileBarChart2 className="h-6 w-6" />}
          />
        ) : (
          <div className="overflow-x-auto scroll-touch">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Month</th>
                  <th className="text-right px-4 py-3 font-medium">Labourers</th>
                  <th className="text-right px-4 py-3 font-medium">Total</th>
                  <th className="text-right px-4 py-3 font-medium">Paid</th>
                  <th className="text-right px-4 py-3 font-medium">Unpaid</th>
                  <th className="text-right px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summaries.map((s) => (
                  <tr key={`${s.year}-${s.month}`} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <Link href={`/salary/${s.year}/${s.month}`} className="hover:underline hover:text-brand-600">
                        {fmtMonthYear(s.month, s.year)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right">{s.recordCount}</td>
                    <td className="px-4 py-3 text-right font-medium">{fmtCurrency(s.total)}</td>
                    <td className="px-4 py-3 text-right text-emerald-700">{fmtCurrency(s.paid)}</td>
                    <td className="px-4 py-3 text-right text-red-700">{fmtCurrency(s.unpaid)}</td>
                    <td className="px-4 py-3 text-right">
                      {s.unpaidCount === 0 ? (
                        <Badge tone="green">All paid</Badge>
                      ) : (
                        <Badge tone="red">{s.unpaidCount} pending</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
