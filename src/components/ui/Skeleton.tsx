'use client';

import { cn } from '@/lib/utils';
import { Spinner } from './Spinner';

/** A single shimmering placeholder block. */
export function Skeleton({ className }: { className?: string }) {
  return <span className={cn('skeleton block', className)} aria-hidden />;
}

/** A multi-line text placeholder. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn('h-3.5', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}

/**
 * Animated table placeholder used while rows load. Mirrors the real table's
 * column count so the layout doesn't jump when data arrives.
 */
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full p-4" aria-hidden>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className="grid items-center gap-3 rounded-lg"
            style={{ gridTemplateColumns: `1.6fr repeat(${Math.max(cols - 1, 1)}, 1fr)`, animationDelay: `${r * 60}ms` }}
          >
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-full" />
              <Skeleton className="h-3.5 w-28" />
            </div>
            {Array.from({ length: Math.max(cols - 1, 1) }).map((_, c) => (
              <Skeleton key={c} className="h-3.5 w-full" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** A grid of card placeholders for dashboards / summary rows. */
export function CardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card flex items-start gap-4 p-5">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Translucent overlay shown on top of content while a blocking action runs
 * (saving, deleting, recalculating). Keeps context visible behind a soft blur.
 */
export function LoadingOverlay({ show, label = 'Working…' }: { show: boolean; label?: string }) {
  if (!show) return null;
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center rounded-[inherit] bg-white/70 backdrop-blur-[2px] animate-fade-in">
      <div className="flex flex-col items-center gap-3 rounded-xl bg-white px-6 py-5 shadow-card animate-scale-in">
        <Spinner size="lg" />
        <p className="text-sm font-medium text-slate-600">{label}</p>
      </div>
    </div>
  );
}
