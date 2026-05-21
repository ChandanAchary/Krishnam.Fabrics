'use client';

import { AdminGuard } from '@/components/auth/ProtectedRoute';
import { AuditLogsPage } from '@/views/AuditLogs';

export default function Page() {
  return (
    <AdminGuard>
      <AuditLogsPage />
    </AdminGuard>
  );
}
