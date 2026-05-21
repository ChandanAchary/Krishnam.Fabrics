'use client';

import Link from 'next/link';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { fmtDateTime } from '@/lib/date';
import type { AuditLog } from '@/types/database';

export function RecentActivity({ rows }: { rows: AuditLog[] }) {
  return (
    <Card>
      <CardHeader
        title="Recent activity"
        description="Last 5 audit events"
        action={
          <Link href="/audit-logs" className="text-sm text-brand-600 hover:underline">
            View all →
          </Link>
        }
      />
      {rows.length === 0 ? (
        <EmptyState title="No activity yet" description="Audit events will appear here as users act." />
      ) : (
        <ul className="space-y-3">
          {rows.map((a) => (
            <li key={a.id} className="flex items-start gap-3">
              <div className="h-2 w-2 rounded-full bg-brand-500 mt-2 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-800">
                  <span className="font-medium">{a.action.replace(/_/g, ' ')}</span>{' '}
                  {a.table_name && <span className="text-slate-500">on {a.table_name}</span>}
                </p>
                <p className="text-xs text-slate-500">{fmtDateTime(a.created_at)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
