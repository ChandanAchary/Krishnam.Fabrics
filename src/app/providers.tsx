'use client';

import type { ReactNode } from 'react';
import { ToastProvider } from '@/context/ToastContext';
import { AuthProvider } from '@/context/AuthContext';
import { SettingsProvider } from '@/context/SettingsContext';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AuthProvider>
        <SettingsProvider>{children}</SettingsProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
