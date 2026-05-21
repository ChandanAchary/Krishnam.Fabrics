'use client';

import { forwardRef, type SelectHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, required, children, className, id, ...props },
  ref
) {
  const selId = id ?? props.name ?? `sel-${Math.random().toString(36).slice(2, 9)}`;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selId} className="label">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <select
        id={selId}
        ref={ref}
        aria-invalid={!!error}
        className={cn(
          'input pr-8',
          error && 'border-red-500 focus:border-red-500 focus:ring-red-500/20',
          className
        )}
        {...props}
      >
        {children}
      </select>
      {error ? (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
});
