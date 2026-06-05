import type { AttendanceStatus } from '@/types/database';

/**
 * Single source of truth for attendance status presentation + salary math.
 * Every UI surface (selectors, badges, matrix cells, calendar, summaries)
 * should derive labels, codes, colors and multipliers from this map so the
 * five statuses stay perfectly in sync across the app.
 */

export interface StatusMeta {
  /** Short code shown in compact UI (matrix cells, calendar, selectors). */
  code: string;
  /** Human label. */
  label: string;
  /** Salary multiplier applied per day for this status. */
  multiplier: number;
  // Tailwind class fragments — soft Material tones
  bg: string;       // light tinted background (chips, soft tiles)
  text: string;     // foreground on light bg
  border: string;   // border on light bg
  ring: string;     // ring color when actively selected
  solid: string;    // bold solid bg + white text (matrix cells, picked toggle)
}

export const STATUS_META: Record<AttendanceStatus, StatusMeta> = {
  present: {
    code: 'P',
    label: 'Present',
    multiplier: 1,
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    ring: 'ring-emerald-500',
    solid: 'bg-emerald-500 text-white',
  },
  absent: {
    code: 'A',
    label: 'Absent',
    multiplier: 0,
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
    ring: 'ring-rose-500',
    solid: 'bg-rose-500 text-white',
  },
  half_day: {
    code: 'H',
    label: 'Half day',
    multiplier: 0.5,
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    ring: 'ring-amber-500',
    solid: 'bg-amber-500 text-white',
  },
  double_duty: {
    code: 'DD',
    label: 'Double duty',
    multiplier: 2,
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    border: 'border-indigo-200',
    ring: 'ring-indigo-500',
    solid: 'bg-indigo-500 text-white',
  },
  one_and_half_duty: {
    code: '1.5',
    label: '1.5 duty',
    multiplier: 1.5,
    bg: 'bg-sky-50',
    text: 'text-sky-700',
    border: 'border-sky-200',
    ring: 'ring-sky-500',
    solid: 'bg-sky-500 text-white',
  },
};

/** Ordered list used by selectors / displays — matches reference UI sequence. */
export const STATUS_ORDER: AttendanceStatus[] = [
  'present',
  'absent',
  'half_day',
  'double_duty',
  'one_and_half_duty',
];

/** Multiplier-only helper for non-UI use. */
export function multiplierFor(status: AttendanceStatus): number {
  return STATUS_META[status].multiplier;
}
