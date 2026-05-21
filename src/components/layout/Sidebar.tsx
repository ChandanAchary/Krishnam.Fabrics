'use client';

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
  Layers,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { useSettings } from '@/context/SettingsContext';

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

export function Sidebar({ open, onClose }: SidebarProps) {
  const { isAdmin } = useAuth();
  const { settings } = useSettings();
  const pathname = usePathname();
  const items = ITEMS.filter((i) => !i.adminOnly || isAdmin);

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden" onClick={onClose} aria-hidden />
      )}
      <aside
        className={cn(
          'fixed lg:sticky top-0 left-0 z-40 h-screen flex-shrink-0 w-64 bg-slate-900 text-slate-200 flex flex-col transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
        aria-label="Primary navigation"
      >
        <div className="px-5 py-5 border-b border-slate-800 flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-brand-600 flex items-center justify-center">
            <Layers className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-base font-semibold text-white truncate">LabourFlow</p>
            <p className="text-xs text-slate-400 truncate">{settings.company_name}</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-3">
          <ul className="space-y-1">
            {items.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.to || pathname.startsWith(item.to + '/');
              return (
                <li key={item.to}>
                  <Link
                    href={item.to}
                    onClick={onClose}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors min-h-[44px]',
                      active
                        ? 'bg-brand-600/20 text-white border border-brand-600/40'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    )}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="px-5 py-4 border-t border-slate-800 text-xs text-slate-500">
          v1.0 · {new Date().getFullYear()}
        </div>
      </aside>
    </>
  );
}
