'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastApi {
  toast: (message: string, variant?: ToastVariant) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
}

const ToastContext = createContext<ToastApi | undefined>(undefined);

const AUTO_DISMISS_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, variant: ToastVariant = 'info') => {
      const id = Date.now() + Math.random();
      setItems((prev) => [...prev, { id, message, variant }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (m) => toast(m, 'success'),
      error: (m) => toast(m, 'error'),
      info: (m) => toast(m, 'info'),
      warning: (m) => toast(m, 'warning'),
    }),
    [toast]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-[calc(100vw-2rem)]">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              'relative flex items-start gap-3 overflow-hidden rounded-xl border px-4 py-3 shadow-lg bg-white animate-slide-in-right w-80 max-w-full',
              t.variant === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-900',
              t.variant === 'error' && 'border-red-200 bg-red-50 text-red-900',
              t.variant === 'warning' && 'border-amber-200 bg-amber-50 text-amber-900',
              t.variant === 'info' && 'border-slate-200 bg-white text-slate-900'
            )}
          >
            {t.variant === 'success' && <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5 animate-pop" />}
            {t.variant === 'error' && <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5 animate-pop" />}
            {t.variant === 'warning' && <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5 animate-pop" />}
            {t.variant === 'info' && <Info className="h-5 w-5 text-brand-600 flex-shrink-0 mt-0.5 animate-pop" />}
            <p className="flex-1 text-sm leading-snug">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="text-slate-400 hover:text-slate-600 transition-colors"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
            <span
              className={cn(
                'absolute bottom-0 left-0 h-1 w-full origin-left',
                t.variant === 'success' && 'bg-emerald-500/60',
                t.variant === 'error' && 'bg-red-500/60',
                t.variant === 'warning' && 'bg-amber-500/60',
                t.variant === 'info' && 'bg-brand-500/60'
              )}
              style={{ animation: `toastProgress ${AUTO_DISMISS_MS}ms linear forwards` }}
            />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
