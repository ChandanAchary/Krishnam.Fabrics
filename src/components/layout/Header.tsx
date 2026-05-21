'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Menu, ShieldCheck, User } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

interface HeaderProps {
  onToggleSidebar: () => void;
}

export function Header({ onToggleSidebar }: HeaderProps) {
  const { user, fullName, role, signOut } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    toast.success('Signed out successfully');
    router.replace('/login');
  };

  return (
    <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
      <div className="flex items-center justify-between px-4 sm:px-6 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:bg-slate-100"
            aria-label="Toggle menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {role === 'admin' ? (
            <Badge tone="blue" className="hidden sm:inline-flex">
              <ShieldCheck className="h-3 w-3" /> Admin
            </Badge>
          ) : (
            <Badge tone="slate" className="hidden sm:inline-flex">
              <User className="h-3 w-3" /> Manager
            </Badge>
          )}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100 transition-colors min-h-[44px]"
              aria-haspopup="menu"
              aria-expanded={open}
            >
              <div className="h-8 w-8 rounded-full bg-brand-600 text-white flex items-center justify-center text-sm font-semibold">
                {(fullName ?? user?.email ?? '?').slice(0, 1).toUpperCase()}
              </div>
              <div className="hidden md:block text-left">
                <p className="text-sm font-medium text-slate-900 leading-tight">{fullName ?? '—'}</p>
                <p className="text-xs text-slate-500 leading-tight truncate max-w-[180px]">{user?.email}</p>
              </div>
            </button>
            {open && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-slate-200 z-30 animate-slide-up">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <p className="text-sm font-medium text-slate-900 truncate">{fullName ?? '—'}</p>
                    <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                  </div>
                  <div className="p-1">
                    <Button
                      variant="ghost"
                      className="w-full justify-start text-red-600 hover:bg-red-50 hover:text-red-700"
                      leftIcon={<LogOut className="h-4 w-4" />}
                      onClick={handleSignOut}
                    >
                      Sign out
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
