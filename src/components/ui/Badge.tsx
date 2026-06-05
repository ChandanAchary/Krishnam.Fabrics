'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Tone = 'green' | 'red' | 'yellow' | 'blue' | 'slate' | 'amber' | 'indigo' | 'sky';

const TONE_CLASSES: Record<Tone, string> = {
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  yellow: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  blue: 'bg-brand-50 text-brand-700 border-brand-200',
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  sky: 'bg-sky-50 text-sky-700 border-sky-200',
};

export function Badge({
  children,
  tone = 'slate',
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        TONE_CLASSES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
