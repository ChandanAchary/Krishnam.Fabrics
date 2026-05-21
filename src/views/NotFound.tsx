'use client';

import Link from 'next/link';
import { Home } from 'lucide-react';

export function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="text-center max-w-md">
        <p className="text-6xl font-bold text-brand-600">404</p>
        <h1 className="mt-4 text-2xl font-bold text-slate-900">Page not found</h1>
        <p className="mt-2 text-sm text-slate-500">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link href="/dashboard" className="btn-primary mt-6 inline-flex">
          <Home className="h-4 w-4" /> Go to dashboard
        </Link>
      </div>
    </div>
  );
}
