import {
  format,
  parseISO,
  isValid,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  subMonths,
  addMonths,
  startOfDay,
} from 'date-fns';

export function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function toISODate(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

export function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = parseISO(s);
  return isValid(d) ? d : null;
}

export function fmtDate(s: string | null | undefined): string {
  const d = parseDate(s);
  return d ? format(d, 'dd-MMM-yyyy') : '—';
}

export function fmtDateTime(s: string | null | undefined): string {
  const d = parseDate(s);
  return d ? format(d, 'dd-MMM-yyyy HH:mm') : '—';
}

export function fmtMonthYear(month: number, year: number): string {
  return format(new Date(year, month - 1, 1), 'MMM yyyy');
}

export function monthName(month: number): string {
  return format(new Date(2000, month - 1, 1), 'MMMM');
}

export function daysInCalendarMonth(year: number, month: number): Date[] {
  const start = startOfMonth(new Date(year, month - 1, 1));
  const end = endOfMonth(start);
  return eachDayOfInterval({ start, end });
}

export function isFutureDate(s: string): boolean {
  const d = parseDate(s);
  if (!d) return false;
  return startOfDay(d).getTime() > startOfDay(new Date()).getTime();
}

export function lastNMonths(n: number): Array<{ year: number; month: number }> {
  const out: Array<{ year: number; month: number }> = [];
  let cursor = new Date();
  for (let i = 0; i < n; i++) {
    out.push({ year: cursor.getFullYear(), month: cursor.getMonth() + 1 });
    cursor = subMonths(cursor, 1);
  }
  return out;
}

export { isSameDay, addMonths, subMonths, startOfMonth, endOfMonth, format };
