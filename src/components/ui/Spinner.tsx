'use client';

import { cn } from '@/lib/utils';

type SpinnerSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE: Record<SpinnerSize, string> = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-9 w-9 border-[3px]',
  xl: 'h-14 w-14 border-4',
};

/** Branded dual-ring spinner — a soft track with a spinning brand-coloured arc. */
export function Spinner({
  size = 'sm',
  className,
  label,
}: {
  size?: SpinnerSize;
  className?: string;
  label?: string;
}) {
  return (
    <div className="inline-flex items-center gap-2.5 text-slate-500" role="status" aria-live="polite">
      <span
        className={cn(
          'inline-block animate-spin rounded-full border-brand-100 border-t-brand-600',
          SIZE[size],
          className
        )}
        aria-hidden
      />
      {label && <span className="text-sm font-medium animate-pulse-soft">{label}</span>}
      <span className="sr-only">{label ?? 'Loading'}</span>
    </div>
  );
}

export function FullPageSpinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-4">
      <Spinner size="xl" />
      <p className="text-sm font-medium text-slate-500 animate-pulse-soft">{label}</p>
    </div>
  );
}

/** Three bouncing dots — great for inline "working…" hints. */
export function LoadingDots({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-end gap-1', className)} aria-hidden>
      <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce-dot [animation-delay:-0.32s]" />
      <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce-dot [animation-delay:-0.16s]" />
      <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce-dot" />
    </span>
  );
}

/** Indeterminate progress bar — slim animated sweep for top-of-content loads. */
export function ProgressBar({ className }: { className?: string }) {
  return (
    <div
      className={cn('relative h-1 w-full overflow-hidden rounded-full bg-brand-100', className)}
      role="progressbar"
      aria-label="Loading"
    >
      <div className="absolute inset-y-0 left-0 w-1/2 rounded-full bg-brand-600 animate-bar-indeterminate" />
    </div>
  );
}
