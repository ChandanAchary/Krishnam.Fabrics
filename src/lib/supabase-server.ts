import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Server-only Supabase client for Route Handlers — reads the session from the
 * request's cookies (same @supabase/ssr pattern as src/middleware.ts) so the
 * authenticated user can be identified without trusting any client-supplied id.
 */
export function createSupabaseServerClient() {
  if (!url || !anonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or the Supabase anon key (server).');
  }
  const cookieStore = cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Route Handlers can set cookies; this guards the rare case this helper
          // gets called from a context that can't (e.g. a Server Component).
        }
      },
    },
  });
}
