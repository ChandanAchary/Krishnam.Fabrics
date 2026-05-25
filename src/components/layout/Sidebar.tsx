'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  CalendarRange,
  Wallet,
  FileBarChart2,
  Settings,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { useSettings } from '@/context/SettingsContext';
import { Logo } from '@/components/ui/Logo';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

interface Item {
  to: string;
  label: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}

const ITEMS: Item[] = [
  { to: '/dashboard',        label: 'Dashboard',        icon: LayoutDashboard },
  { to: '/labourers',        label: 'Labourers',        icon: Users },
  { to: '/attendance',       label: 'Attendance',       icon: CalendarCheck },
  { to: '/attendance-sheet', label: 'Attendance Sheet', icon: CalendarRange },
  { to: '/salary',           label: 'Monthly Salary',   icon: Wallet },
  { to: '/reports',     label: 'Reports',       icon: FileBarChart2 },
  { to: '/settings',    label: 'Settings',      icon: Settings, adminOnly: true },
  { to: '/audit-logs',  label: 'Audit Logs',    icon: ShieldCheck, adminOnly: true },
];

const STORAGE_KEY = 'lf-sidebar-collapsed';

export function Sidebar({ open, onClose }: SidebarProps) {
  const { isAdmin } = useAuth();
  const { settings } = useSettings();
  const pathname = usePathname();
  const items = ITEMS.filter((i) => !i.adminOnly || isAdmin);

  // Desktop-only collapse state, persisted between visits.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === '1');
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  };

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-sm lg:hidden animate-fade-in" onClick={onClose} aria-hidden />
      )}
      <aside
        className={cn(
          'fixed lg:sticky top-0 left-0 z-40 h-screen flex-shrink-0 w-64 bg-slate-900 text-slate-200 flex flex-col',
          'transition-[width,transform] duration-300 ease-out',
          collapsed ? 'lg:w-20' : 'lg:w-64',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
        aria-label="Primary navigation"
      >
        {/* Collapse / expand toggle — floats on the sidebar's right edge (desktop only) */}
        <button
          type="button"
          onClick={toggleCollapsed}
          className="absolute -right-3 top-7 z-50 hidden h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md transition-colors hover:text-brand-600 lg:flex"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>

        <Link
          href="/dashboard"
          onClick={onClose}
          aria-label="Krishnam HRMS — go to dashboard"
          title="Go to dashboard"
          className={cn(
            'flex items-center gap-2 border-b border-slate-800 py-5 transition-colors hover:bg-slate-800/50',
            collapsed ? 'justify-center px-2' : 'px-5'
          )}
        >
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand-600">
            <Logo className="h-5 w-5 text-white" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-white">Krishnam HRMS</p>
              <p className="truncate text-xs text-slate-400">{settings.company_name}</p>
            </div>
          )}
        </Link>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3">
          <ul className="space-y-1">
            {items.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.to || pathname.startsWith(item.to + '/');
              return (
                <li key={item.to} className={cn(collapsed && 'flex justify-center')}>
                  <Link
                    href={item.to}
                    onClick={onClose}
                    title={collapsed ? item.label : undefined}
                    aria-label={item.label}
                    className={cn(
                      'flex items-center rounded-lg text-sm font-medium transition-colors',
                      collapsed ? 'h-11 w-11 justify-center' : 'min-h-[44px] gap-3 px-3 py-2.5',
                      active
                        ? 'bg-brand-600/20 text-white border border-brand-600/40'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" aria-hidden />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div
          className={cn(
            'border-t border-slate-800 py-4 text-xs text-slate-500',
            collapsed ? 'px-2 text-center' : 'px-5'
          )}
        >
          {collapsed ? 'v1.0' : `v1.0 · ${new Date().getFullYear()}`}
        </div>
      </aside>
    </>
  );
}
