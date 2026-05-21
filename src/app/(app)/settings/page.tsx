'use client';

import { AdminGuard } from '@/components/auth/ProtectedRoute';
import { SettingsPage } from '@/views/Settings';

export default function Page() {
  return (
    <AdminGuard>
      <SettingsPage />
    </AdminGuard>
  );
}
