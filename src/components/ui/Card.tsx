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
    <div className="flex items-start justify-between gap-3 mb-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

type StatTone = 'default' | 'success' | 'warning' | 'danger' | 'blue' | 'emerald' | 'amber' | 'violet' | 'rose';

const STAT_TONES: Record<StatTone, { bar: string; icon: string }> = {
  default: { bar: 'from-brand-500 to-brand-600', icon: 'from-brand-500 to-brand-600' },
  blue:    { bar: 'from-brand-500 to-brand-600', icon: 'from-brand-500 to-brand-600' },
  success: { bar: 'from-emerald-400 to-emerald-600', icon: 'from-emerald-500 to-emerald-600' },
  emerald: { bar: 'from-emerald-400 to-emerald-600', icon: 'from-emerald-500 to-emerald-600' },
  warning: { bar: 'from-amber-400 to-orange-500', icon: 'from-amber-500 to-orange-500' },
  amber:   { bar: 'from-amber-400 to-orange-500', icon: 'from-amber-500 to-orange-500' },
  violet:  { bar: 'from-violet-400 to-purple-600', icon: 'from-violet-500 to-purple-600' },
  danger:  { bar: 'from-rose-400 to-red-600', icon: 'from-rose-500 to-red-600' },
  rose:    { bar: 'from-rose-400 to-red-600', icon: 'from-rose-500 to-red-600' },
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
      <span className={cn('absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r', t.bar)} aria-hidden />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          {icon && (
            <div
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm transition-transform duration-200 group-hover:scale-110',
                t.icon
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
