import { Suspense } from 'react';
import { LoginPage } from '@/views/Login';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LoginPage />
    </Suspense>
  );
}
