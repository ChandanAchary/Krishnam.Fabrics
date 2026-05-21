'use client';

import Link from 'next/link';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { fmtDate, todayISO } from '@/lib/date';

export function AttendanceWarningBanner() {
  return (
    <Link
      href={`/attendance/${todayISO()}`}
      className="mb-6 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 hover:bg-amber-100 transition-colors"
    >
      <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-amber-900">
          Attendance not taken yet for today ({fmtDate(todayISO())}).
        </p>
        <p className="text-xs text-amber-700 mt-0.5">Click here to record attendance now.</p>
      </div>
      <ChevronRight className="h-5 w-5 text-amber-700" />
    </Link>
  );
}
