'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AttendanceTable } from '@/components/attendance/AttendanceTable';
import { AttendanceControls } from '@/components/attendance/AttendanceControls';
import { OverwriteConfirmModal } from '@/components/attendance/OverwriteConfirmModal';
import { supabase } from '@/lib/supabase';
import { fmtDate, todayISO } from '@/lib/date';
import { useToast } from '@/context/ToastContext';
import type { AttendanceStatus, Labourer, MonthLock, SaveAttendanceResult } from '@/types/database';

interface Row {
  labourer: Labourer;
  status: AttendanceStatus;
  existing: boolean;
}

export function AttendancePage() {
  const params = useParams<{ date?: string | string[] }>();
  const routeDate = Array.isArray(params.date) ? params.date[0] : params.date;
  const router = useRouter();
  const toast = useToast();
  const [date, setDate] = useState<string>(
    routeDate && /^\d{4}-\d{2}-\d{2}$/.test(routeDate) ? routeDate : todayISO()
  );
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasExisting, setHasExisting] = useState(false);
  const [overwriteOpen, setOverwriteOpen] = useState(false);
  const [lock, setLock] = useState<MonthLock | null>(null);
  const [filter, setFilter] = useState('');
  const [conflictInfo, setConflictInfo] = useState<{ recordedAt: string | null; recordedByEmail: string | null }>({
    recordedAt: null,
    recordedByEmail: null,
  });
  const today = todayISO();
  const isFuture = date > today;
  const initialRowsRef = useRef<Map<string, AttendanceStatus>>(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    const month = Number(date.slice(5, 7));
    const year = Number(date.slice(0, 4));

    const [labRes, attRes, lockRes] = await Promise.all([
      supabase
        .from('labourers')
        .select('*')
        .eq('is_active', true)
        .lte('joining_date', date)
        .order('name', { ascending: true }),
      supabase.from('attendance').select('*').eq('date', date),
      supabase.from('month_locks').select('*').eq('month', month).eq('year', year).eq('is_locked', true).maybeSingle(),
    ]);

    if (labRes.error) toast.error(`Could not load labourers: ${labRes.error.message}`);
    const labs = (labRes.data as Labourer[]) ?? [];
    const att = (attRes.data ?? []) as Array<{
      labourer_id: string;
      status: AttendanceStatus;
      recorded_at: string | null;
      recorded_by: string | null;
    }>;
    setLock((lockRes.data as MonthLock | null) ?? null);

    const map = new Map<string, AttendanceStatus>();
    att.forEach((a) => map.set(a.labourer_id, a.status));
    initialRowsRef.current = new Map(map);

    // [LF-NFR07] capture latest update info for conflict surfacing
    let latestAt: string | null = null;
    let latestUid: string | null = null;
    for (const a of att) {
      if (!latestAt || (a.recorded_at && a.recorded_at > latestAt)) {
        latestAt = a.recorded_at;
        latestUid = a.recorded_by;
      }
    }
    let recordedByEmail: string | null = null;
    if (latestUid) {
      const { data: appUser } = await supabase
        .from('app_users')
        .select('full_name')
        .eq('user_id', latestUid)
        .maybeSingle();
      recordedByEmail = appUser?.full_name ?? null;
    }
    setConflictInfo({ recordedAt: latestAt, recordedByEmail });

    setHasExisting(att.length > 0);
    setRows(
      labs.map((l) => ({
        labourer: l,
        status: map.get(l.id) ?? 'absent',
        existing: map.has(l.id),
      }))
    );
    setLoading(false);
  }, [date, toast]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (routeDate !== date) {
      router.replace(`/attendance/${date}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const setStatus = (labourerId: string, status: AttendanceStatus) => {
    setRows((prev) => prev.map((r) => (r.labourer.id === labourerId ? { ...r, status } : r)));
  };
  const markAll = (status: AttendanceStatus) =>
    setRows((prev) => prev.map((r) => ({ ...r, status })));

  const filtered = useMemo(() => {
    if (!filter.trim()) return rows;
    const term = filter.toLowerCase().trim();
    return rows.filter((r) => r.labourer.name.toLowerCase().includes(term));
  }, [rows, filter]);

  const summary = useMemo(() => {
    let p = 0, a = 0, h = 0;
    for (const r of rows) {
      if (r.status === 'present') p++;
      else if (r.status === 'absent') a++;
      else h++;
    }
    return { p, a, h };
  }, [rows]);

  const performSave = async (overwrite: boolean) => {
    setSaving(true);
    const entries = rows.map((r) => ({ labourer_id: r.labourer.id, status: r.status }));
    const { data, error } = await supabase.rpc('save_daily_attendance', {
      p_date: date,
      p_entries: entries,
      p_overwrite: overwrite,
    });
    setSaving(false);
    if (error) {
      if (!overwrite && error.message.includes('overwrite flag required')) {
        setOverwriteOpen(true);
        return;
      }
      toast.error(`Save failed: ${error.message}`);
      return;
    }
    const result = data as SaveAttendanceResult;
    toast.success(
      `${result.present} Present, ${result.absent} Absent, ${result.half_day} Half-Day saved for ${fmtDate(date)}.`
    );
    setOverwriteOpen(false);
    void load();
  };

  const handleSave = () => {
    if (isFuture) return;
    if (hasExisting) {
      setOverwriteOpen(true);
      return;
    }
    void performSave(false);
  };

  return (
    <div>
      <PageHeader
        title="Take attendance"
        description="Record Present, Absent or Half-Day for each active labourer."
      />

      <AttendanceControls
        date={date}
        today={today}
        isFuture={isFuture}
        lock={lock}
        filter={filter}
        summary={summary}
        onDateChange={setDate}
        onFilterChange={setFilter}
        onMarkAll={markAll}
      />

      <Card padded={false} className="overflow-hidden mb-24">
        <div className="p-5">
          <CardHeader
            title={`Attendance — ${fmtDate(date)}`}
            description={`${rows.length} active labourer${rows.length === 1 ? '' : 's'}`}
          />
        </div>
        <AttendanceTable
          loading={loading}
          rows={filtered}
          totalRows={rows.length}
          disabled={isFuture || Boolean(lock)}
          onStatusChange={setStatus}
        />
      </Card>

      {!loading && rows.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-lg p-4 z-10 lg:left-64">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            <p className="text-sm text-slate-700">
              Saving for <span className="font-semibold">{fmtDate(date)}</span> — {rows.length} record
              {rows.length === 1 ? '' : 's'}
            </p>
            <Button
              variant="primary"
              loading={saving}
              disabled={isFuture || Boolean(lock)}
              onClick={handleSave}
              leftIcon={<Save className="h-4 w-4" />}
            >
              Save attendance
            </Button>
          </div>
        </div>
      )}

      <OverwriteConfirmModal
        open={overwriteOpen}
        date={date}
        busy={saving}
        conflictInfo={conflictInfo}
        onCancel={() => setOverwriteOpen(false)}
        onConfirm={() => performSave(true)}
      />
    </div>
  );
}
