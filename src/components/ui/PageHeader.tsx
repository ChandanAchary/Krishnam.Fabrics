'use client';

import type { ReactNode } from 'react';

/**
 * Modern hero-style page header. A soft brand-tinted gradient panel with
 * rounded corners and a gentle shadow — used on every app page for a
 * consistent "dashboard" feel. Optional `children` slot renders extra content
 * inside the hero (e.g. live count chips on the Attendance page).
 */
export function PageHeader({
  title,
  description,
  action,
  breadcrumbs,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  breadcrumbs?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="relative mb-6 overflow-hidden rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 via-white to-brand-50 shadow-md">
      {/* decorative soft blobs */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-brand-100/60" aria-hidden />
      <div className="pointer-events-none absolute -bottom-20 right-32 h-44 w-44 rounded-full bg-brand-100/40" aria-hidden />
      <div className="relative px-5 py-5 sm:px-7 sm:py-6">
        {breadcrumbs && <div className="mb-2 text-xs text-slate-500">{breadcrumbs}</div>}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-brand-700 sm:text-2xl">{title}</h1>
            {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
          </div>
          {action && <div className="flex flex-wrap gap-2">{action}</div>}
        </div>
        {children && <div className="relative mt-4">{children}</div>}
      </div>
    </div>
  );
}
