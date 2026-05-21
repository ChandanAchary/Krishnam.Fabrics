import { Suspense } from 'react';
import { RegisterPage } from '@/views/Register';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <RegisterPage />
    </Suspense>
  );
}
