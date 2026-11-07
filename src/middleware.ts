import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/register', '/forgot-password', '/reset-password'];

type CookieToSet = { name: string; value: string; options: CookieOptions };

// Maximum time to wait for Supabase auth check before timing out gracefully (in milliseconds)
const SUPABASE_AUTH_TIMEOUT_MS = 3000;

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'));

  // 1. Fast-path check: Check if any Supabase session cookies exist
  // Cookies created by @supabase/ssr match `sb-<project-ref>-auth-token` (or chunked .0, .1)
  const allCookies = request.cookies.getAll();
  const hasAuthCookie = allCookies.some(
    (c) => (c.name.startsWith('sb-') && c.name.includes('-auth-token')) || c.name.includes('supabase')
  );

  // If the user has no session cookies:
  // - If hitting a public path: proceed immediately without any network calls (0ms)
  // - If hitting a protected path: redirect immediately to /login without any network calls (0ms)
  if (!hasAuthCookie) {
    if (isPublic) {
      return response;
    }
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    if (path !== '/') {
      url.searchParams.set('from', path);
    }
    return NextResponse.redirect(url);
  }

  // 2. Environment variable check
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.warn('[Middleware] Missing NEXT_PUBLIC_SUPABASE_URL or Anon Key');
    if (isPublic) return response;
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // 3. User has session cookies; verify and refresh session with Supabase
  let user = null;
  try {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });

    // Guard with a strict timeout so the Edge runtime never reaches Vercel's 504 limit
    const authPromise = supabase.auth.getUser().then(({ data }) => data?.user ?? null);
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), SUPABASE_AUTH_TIMEOUT_MS)
    );

    user = await Promise.race([authPromise, timeoutPromise]);
  } catch (err) {
    console.error('[Middleware] Error verifying Supabase auth:', err);
    user = null;
  }

  // 4. Routing logic based on auth outcome
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    if (path !== '/') {
      url.searchParams.set('from', path);
    }
    return NextResponse.redirect(url);
  }

  if (user && (path === '/login' || path === '/register' || path === '/')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Skip all API routes (they do their own auth) and static assets.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
