import { createClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client — server-only. Used strictly inside API route
 * handlers to (a) read/write auth_otps (which intentionally has no RLS
 * policies — service role only) and (b) perform the privileged email/password
 * update via auth.admin after OTP verification. Never import this from a
 * 'use client' file or any code reachable by the browser bundle.
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (server-only).');
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
