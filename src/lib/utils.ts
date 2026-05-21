import clsx, { type ClassValue } from 'clsx';

export function cn(...args: ClassValue[]): string {
  return clsx(...args);
}

export function safeNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'string' ? parseFloat(value) : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function debounce<T extends (...args: any[]) => void>(fn: T, delay = 250) {
  let id: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (id) clearTimeout(id);
    id = setTimeout(() => fn(...args), delay);
  };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : plural ?? `${singular}s`;
}

export function isSupabaseConfigured(): boolean {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && key);
}
