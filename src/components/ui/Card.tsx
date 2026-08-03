'use client';

import type { ReactNode } from 'react';
import { TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Card({
  className,
  children,
  padded = true,
  hover = false,
}: {
  className?: string;
  children: ReactNode;
  padded?: boolean;
  hover?: boolean;
}) {
  return (
    <div className={cn('card', padded && 'p-5', hover && 'hover:shadow-card-hover hover:-translate-y-0.5', className)}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

type StatTone = 'default' | 'success' | 'warning' | 'danger' | 'blue' | 'emerald' | 'amber' | 'violet' | 'rose';

// Soft, tinted accents (no saturated gradients) for a calm Material look.
const STAT_TONES: Record<StatTone, { bar: string; tile: string }> = {
  default: { bar: 'bg-brand-300', tile: 'bg-brand-50 text-brand-700' },
  blue:    { bar: 'bg-brand-300', tile: 'bg-brand-50 text-brand-700' },
  success: { bar: 'bg-emerald-300', tile: 'bg-emerald-50 text-emerald-700' },
  emerald: { bar: 'bg-emerald-300', tile: 'bg-emerald-50 text-emerald-700' },
  warning: { bar: 'bg-amber-300', tile: 'bg-amber-50 text-amber-700' },
  amber:   { bar: 'bg-amber-300', tile: 'bg-amber-50 text-amber-700' },
  violet:  { bar: 'bg-indigo-300', tile: 'bg-indigo-50 text-indigo-700' },
  danger:  { bar: 'bg-rose-300', tile: 'bg-rose-50 text-rose-700' },
  rose:    { bar: 'bg-rose-300', tile: 'bg-rose-50 text-rose-700' },
};

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
  trend,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: StatTone;
  /** Optional positive/neutral chip shown top-right, e.g. "+4 this month". */
  trend?: string;
}) {
  const t = STAT_TONES[tone] ?? STAT_TONES.default;

  return (
    <Card hover padded={false} className="group relative overflow-hidden">
      <span className={cn('absolute inset-x-0 top-0 h-1', t.bar)} aria-hidden />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          {icon && (
            <div
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110',
                t.tile
              )}
            >
              {icon}
            </div>
          )}
          {trend && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-600">
              <TrendingUp className="h-3 w-3" />
              {trend}
            </span>
          )}
        </div>
        <p className="mt-4 truncate text-2xl font-bold text-slate-900 sm:text-3xl">{value}</p>
        <p className="mt-1 text-sm font-medium text-slate-600">{label}</p>
        {hint && <p className="mt-1 text-xs font-medium text-slate-500">{hint}</p>}
      </div>
    </Card>
  );
}
