'use client';

import { useState, type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

export function AppLayout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 min-w-0 flex flex-col">
        <Header onToggleSidebar={() => setSidebarOpen((v) => !v)} />
        <main className="flex-1 px-4 sm:px-6 py-6 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
