'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { supabase } from '@/lib/supabase';
import { fmtDateTime } from '@/lib/date';
import { useToast } from '@/context/ToastContext';
import type { AuditLog } from '@/types/database';

const ACTIONS = [
  'all',
  'add_labourer',
  'edit_labourer',
  'deactivate_labourer',
  'activate_labourer',
  'add_attendance',
  'edit_attendance',
  'overwrite_attendance',
  'mark_paid',
  'mark_unpaid',
  'recalculate_salary',
  'lock_month',
  'unlock_month',
  'change_wage',
  'export_report',
  'update_settings',
];

const PAGE_SIZE = 25;

interface LogRow extends AuditLog {
  expanded?: boolean;
}

export function AuditLogsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [action, setAction] = useState<string>('all');
  const [table, setTable] = useState<string>('');
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      let q = supabase
        .from('audit_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (action !== 'all') q = q.eq('action', action);
      if (table) q = q.eq('table_name', table);
      if (from) q = q.gte('created_at', `${from}T00:00:00.000Z`);
      if (to) q = q.lte('created_at', `${to}T23:59:59.999Z`);
      const { data, count, error } = await q;
      if (cancelled) return;
      if (error) {
        toast.error(`Could not load logs: ${error.message}`);
      } else {
        setRows((data ?? []) as LogRow[]);
        setTotal(count ?? 0);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [action, table, from, to, page, toast]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const toggle = (id: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, expanded: !r.expanded } : r)));
  };

  const filterChip = useMemo(() => {
    const parts: string[] = [];
    if (action !== 'all') parts.push(`action=${action}`);
    if (table) parts.push(`table=${table}`);
    if (from) parts.push(`from=${from}`);
    if (to) parts.push(`to=${to}`);
    return parts.join(' · ');
  }, [action, table, from, to]);

  return (
    <div>
      <PageHeader
        title="Audit logs"
        description="Immutable record of every state-changing action in LabourFlow."
        action={
          <Badge tone="blue">
            <ShieldCheck className="h-3 w-3" /> Admin only
          </Badge>
        }
      />

      <Card className="mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Select label="Action" value={action} onChange={(e) => { setAction(e.target.value); setPage(0); }}>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a === 'all' ? 'All actions' : a.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>
          <Input
            label="Table"
            leftIcon={<Search className="h-4 w-4" />}
            placeholder="e.g. attendance"
            value={table}
            onChange={(e) => { setTable(e.target.value); setPage(0); }}
          />
          <Input label="From" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} />
          <Input label="To" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} />
        </div>
        {filterChip && <p className="text-xs text-slate-500 mt-3">Filters: {filterChip}</p>}
      </Card>

      <Card padded={false} className="overflow-hidden">
        {loading ? (
          <div className="py-12 flex justify-center">
            <Spinner label="Loading…" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title="No audit events" description="Adjust filters or perform actions to generate logs." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={r.id} className="p-4 hover:bg-slate-50">
                <button
                  type="button"
                  className="w-full flex items-start gap-3 text-left"
                  onClick={() => toggle(r.id)}
                  aria-expanded={Boolean(r.expanded)}
                >
                  {r.expanded ? (
                    <ChevronDown className="h-4 w-4 text-slate-400 mt-0.5" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-400 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="blue">{r.action.replace(/_/g, ' ')}</Badge>
                      {r.table_name && <Badge tone="slate">{r.table_name}</Badge>}
                      <span className="text-xs text-slate-500">{fmtDateTime(r.created_at)}</span>
                    </div>
                    {r.reason && <p className="mt-1 text-sm text-slate-700 truncate">Reason: {r.reason}</p>}
                  </div>
                </button>
                {r.expanded && (
                  <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-slate-500 font-medium mb-1">Old value</p>
                      <pre className="rounded-md bg-slate-50 border border-slate-200 p-3 overflow-auto max-h-64">
{JSON.stringify(r.old_value ?? null, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <p className="text-slate-500 font-medium mb-1">New value</p>
                      <pre className="rounded-md bg-slate-50 border border-slate-200 p-3 overflow-auto max-h-64">
{JSON.stringify(r.new_value ?? null, null, 2)}
                      </pre>
                    </div>
                    {(r.record_id || r.user_id) && (
                      <div className="lg:col-span-2 flex gap-4 text-slate-500">
                        {r.record_id && <span>Record: <code className="font-mono">{r.record_id}</code></span>}
                        {r.user_id && <span>User: <code className="font-mono">{r.user_id.slice(0, 8)}…</code></span>}
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {!loading && rows.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-3 flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs text-slate-500">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
