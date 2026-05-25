'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PlusCircle, Search, UserCog } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { supabase } from '@/lib/supabase';
import { fmtDate } from '@/lib/date';
import { fmtCurrency } from '@/lib/money';
import { useToast } from '@/context/ToastContext';
import type { Labourer } from '@/types/database';
import { debounce } from '@/lib/utils';

type StatusFilter = 'all' | 'active' | 'inactive';

const PAGE_SIZE = 25;

export function LabourersListPage() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Labourer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const setDebouncedSearchFn = useMemo(() => debounce(setDebouncedSearch, 300), []);

  useEffect(() => {
    setDebouncedSearchFn(search);
  }, [search, setDebouncedSearchFn]);

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, status]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let q = supabase
        .from('labourers')
        .select('*', { count: 'exact' })
        .order('name', { ascending: true })
        .range(from, to);
      const term = debouncedSearch.trim();
      if (term) {
        // [LF-FR70] server-side filtering. ILIKE for partial case-insensitive match.
        q = q.or(`name.ilike.%${term}%,phone.ilike.%${term}%`);
      }
      if (status === 'active') q = q.eq('is_active', true);
      if (status === 'inactive') q = q.eq('is_active', false);

      const { data, count, error } = await q;
      if (cancelled) return;
      if (error) {
        toast.error(`Could not load: ${error.message}`);
        setRows([]);
        setTotal(0);
      } else {
        setRows((data ?? []) as Labourer[]);
        setTotal(count ?? 0);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, status, page, toast]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        title="Labourers"
        description="Manage your workforce — search, filter, and view profiles."
        action={
          <Link href="/labourers/new" className="btn-primary">
            <PlusCircle className="h-4 w-4" /> Add labour
          </Link>
        }
      />

      <Card padded={false} className="overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Input
              leftIcon={<Search className="h-4 w-4" />}
              placeholder="Search by name or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search labourers"
            />
          </div>
          <div className="w-full sm:w-48">
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              aria-label="Filter by status"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </div>
        </div>

        <div>
          {loading ? (
            <TableSkeleton rows={8} cols={6} />
          ) : rows.length === 0 ? (
            <EmptyState
              title="No labourers found"
              description={
                debouncedSearch || status !== 'all'
                  ? 'Try adjusting your search or filters.'
                  : 'Get started by adding your first labourer.'
              }
              action={
                <Link href="/labourers/new" className="btn-primary">
                  <PlusCircle className="h-4 w-4" /> Add labour
                </Link>
              }
            />
          ) : (
            <div className="overflow-x-auto scroll-touch">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Name</th>
                    <th className="text-left px-4 py-3 font-medium">Designation</th>
                    <th className="text-left px-4 py-3 font-medium">Phone</th>
                    <th className="text-right px-4 py-3 font-medium">Daily wage</th>
                    <th className="text-right px-4 py-3 font-medium">Advance</th>
                    <th className="text-left px-4 py-3 font-medium">Joining</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-right px-4 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((l) => (
                    <tr key={l.id} className="transition-colors hover:bg-brand-50/40">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Link href={`/labourers/${l.id}`} className="font-semibold text-brand-700 hover:text-brand-900 hover:underline">
                          {l.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {l.designation ? <Badge tone="blue">{l.designation}</Badge> : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{l.phone ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">{fmtCurrency(l.daily_wage)}</td>
                      <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">
                        {l.advance && l.advance > 0 ? fmtCurrency(l.advance) : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{fmtDate(l.joining_date)}</td>
                      <td className="px-4 py-3">
                        {l.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="slate">Inactive</Badge>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/labourers/${l.id}`} className="btn-secondary" aria-label={`View ${l.name}`}>
                          <UserCog className="h-4 w-4" /> View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!loading && total > 0 && (
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs text-slate-500">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
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
