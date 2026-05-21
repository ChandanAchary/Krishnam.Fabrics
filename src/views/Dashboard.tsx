'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CalendarCheck, Lock, PlusCircle, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { AttendanceWarningBanner } from '@/components/dashboard/AttendanceWarningBanner';
import { DashboardSummary } from '@/components/dashboard/DashboardSummary';
import { TopSalaries } from '@/components/dashboard/TopSalaries';
import { RecentActivity } from '@/components/dashboard/RecentActivity';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useSettings } from '@/context/SettingsContext';
import { supabase } from '@/lib/supabase';
import { fmtDate, todayISO } from '@/lib/date';
import type { AuditLog, DashboardSummary as Summary, MonthlySalary, Labourer } from '@/types/database';

type SalaryWithLabourer = MonthlySalary & { labourer: Pick<Labourer, 'name'> | null };

export function DashboardPage() {
  const { isAdmin, fullName } = useAuth();
  const { settings } = useSettings();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [recent, setRecent] = useState<AuditLog[]>([]);
  const [topSalaries, setTopSalaries] = useState<SalaryWithLabourer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (searchParams.get('accessDenied')) {
      toast.error('Access denied — admin role required.');
      router.replace(pathname);
    }
  }, [searchParams, pathname, router, toast]);

  const load = async () => {
    setLoading(true);
    const [summaryRes, recentRes, salariesRes] = await Promise.all([
      supabase.rpc('dashboard_summary'),
      isAdmin
        ? supabase
            .from('audit_logs')
            .select('id, user_id, action, table_name, record_id, new_value, created_at')
            .order('created_at', { ascending: false })
            .limit(5)
        : Promise.resolve({ data: null as AuditLog[] | null, error: null }),
      supabase
        .from('monthly_salaries')
        .select('*, labourer:labourers(name)')
        .eq('month', new Date().getMonth() + 1)
        .eq('year', new Date().getFullYear())
        .order('calculated_salary', { ascending: false })
        .limit(5),
    ]);

    if (summaryRes.error) toast.error(`Summary failed: ${summaryRes.error.message}`);
    else setSummary(summaryRes.data as Summary);

    if (recentRes?.data) setRecent(recentRes.data as AuditLog[]);
    if (salariesRes.data) setTopSalaries(salariesRes.data as SalaryWithLabourer[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    const ch = supabase
      .channel('dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monthly_salaries' }, () => load())
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const attendanceTaken = summary?.today_attendance_taken ?? false;

  return (
    <div>
      <PageHeader
        title={`Welcome${fullName ? `, ${fullName.split(' ')[0]}` : ''}`}
        description={`${settings.company_name} · ${fmtDate(todayISO())}`}
      />

      {!loading && !attendanceTaken && <AttendanceWarningBanner />}

      <DashboardSummary loading={loading} summary={summary} attendanceTaken={attendanceTaken} />

      <Card className="mb-6">
        <CardHeader title="Quick actions" description="Common tasks at your fingertips" />
        <div className="flex flex-wrap gap-2">
          <Link href={`/attendance/${todayISO()}`} className="btn-primary">
            <CalendarCheck className="h-4 w-4" /> Take attendance
          </Link>
          <Link href="/labourers/new" className="btn-secondary">
            <PlusCircle className="h-4 w-4" /> Add labour
          </Link>
          <Link href="/salary" className="btn-secondary">
            <Wallet className="h-4 w-4" /> View monthly salary
          </Link>
          {isAdmin && (
            <Link href="/salary" className="btn-secondary">
              <Lock className="h-4 w-4" /> Lock month
            </Link>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {summary && (
          <TopSalaries rows={topSalaries} month={summary.current_month} year={summary.current_year} />
        )}
        {isAdmin && <RecentActivity rows={recent} />}
      </div>
    </div>
  );
}
