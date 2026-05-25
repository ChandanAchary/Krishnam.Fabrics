'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { BarChart3, CalendarCheck, Lock, PlusCircle, Wallet } from 'lucide-react';
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
      <div className="relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-r from-brand-700 via-brand-600 to-violet-600 px-6 py-7 text-white shadow-lg sm:px-8">
        <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-white/10" aria-hidden />
        <div className="pointer-events-none absolute -bottom-20 right-28 h-48 w-48 rounded-full bg-white/5" aria-hidden />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide backdrop-blur">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
              </span>
              Live overview
            </span>
            <h1 className="mt-3 text-2xl font-bold leading-tight sm:text-3xl">
              Welcome back{fullName ? `, ${fullName.split(' ')[0]}` : ''}
            </h1>
            <p className="mt-1 text-sm text-white/80">
              {settings.company_name} · {fmtDate(todayISO())}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/labourers/new"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-brand-700 shadow-sm transition hover:bg-white/90 active:scale-[0.97]"
            >
              <PlusCircle className="h-4 w-4" /> Add labour
            </Link>
            <Link
              href="/reports"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-white/40 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20 active:scale-[0.97]"
            >
              <BarChart3 className="h-4 w-4" /> View reports
            </Link>
          </div>
        </div>
      </div>

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
