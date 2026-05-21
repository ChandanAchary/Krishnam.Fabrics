'use client';

import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <div className="inline-flex items-center gap-2 text-slate-500">
      <Loader2 className={cn('h-4 w-4 animate-spin', className)} aria-hidden />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

export function FullPageSpinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <Spinner label={label} className="h-6 w-6 text-brand-600" />
    </div>
  );
}
