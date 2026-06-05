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
            <ul className="divide-y divide-slate-100">
              {rows.map((l, idx) => (
                <li key={l.id}>
                  <Link
                    href={`/labourers/${l.id}`}
                    className="flex items-start gap-3 px-4 py-4 transition-colors hover:bg-brand-50/40 sm:gap-4 sm:px-5 sm:py-5"
                  >
                    <span
                      aria-hidden
                      className="mt-1 inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700"
                    >
                      {page * PAGE_SIZE + idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="truncate text-lg font-bold text-brand-700 sm:text-xl">
                          {l.name}
                        </h3>
                        {l.is_active ? (
                          <Badge tone="green">Active</Badge>
                        ) : (
                          <Badge tone="slate">Inactive</Badge>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-slate-600">
                        {l.designation && <Badge tone="blue">{l.designation}</Badge>}
                        {l.phone && <span>{l.phone}</span>}
                        <span className="font-semibold text-slate-800">
                          {fmtCurrency(l.daily_wage)}<span className="text-slate-400 font-normal"> /day</span>
                        </span>
                        {l.advance && l.advance > 0 ? (
                          <span className="text-amber-700">Adv {fmtCurrency(l.advance)}</span>
                        ) : null}
                        <span className="text-xs text-slate-400">Joined {fmtDate(l.joining_date)}</span>
                      </div>
                    </div>
                    <UserCog className="mt-1.5 h-5 w-5 flex-shrink-0 text-slate-400" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
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
