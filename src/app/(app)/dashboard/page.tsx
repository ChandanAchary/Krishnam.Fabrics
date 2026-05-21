import { Suspense } from 'react';
import { DashboardPage } from '@/views/Dashboard';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <DashboardPage />
    </Suspense>
  );
}
