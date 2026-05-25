'use client';

import { createBrowserClient } from '@supabase/ssr';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Accept either the classic anon-key name or the newer publishable-key name.
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.error(
    '[Krishnam HRMS] Missing NEXT_PUBLIC_SUPABASE_URL or the Supabase key. ' +
      'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY ' +
      '(or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) in .env.local.'
  );
}

/**
 * Browser Supabase client (cookie-based session via @supabase/ssr so Next.js
 * middleware can read the session). Used by all client components.
 */
export const supabase = createBrowserClient(url ?? 'http://localhost:54321', anonKey ?? 'anon-key');

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Krishnam HRMS';
