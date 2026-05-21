'use client';

import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  required?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, leftIcon, rightIcon, className, id, required, ...props },
  ref
) {
  const inputId = id ?? props.name ?? `input-${Math.random().toString(36).slice(2, 9)}`;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="label">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
            {leftIcon}
          </span>
        )}
        <input
          id={inputId}
          ref={ref}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined}
          className={cn(
            'input',
            leftIcon && 'pl-10',
            rightIcon && 'pr-10',
            error && 'border-red-500 focus:border-red-500 focus:ring-red-500/20',
            className
          )}
          {...props}
        />
        {rightIcon && (
          <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400">
            {rightIcon}
          </span>
        )}
      </div>
      {error ? (
        <p id={`${inputId}-err`} className="mt-1 text-xs text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
