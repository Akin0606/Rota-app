import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the manager's Supabase session on every authed page request.
 *
 * Why this exists: `@supabase/ssr`'s server client cannot write cookies from a
 * Server Component render — `lib/supabase-server.ts` swallows the write in a
 * try/catch, because Next forbids it. So nothing was refreshing the access
 * token on a server render, and a manager who left a tab open past the token's
 * lifetime came back to a session that had silently rotted. Middleware is the
 * one place in the App Router that CAN write the refreshed cookies back.
 *
 * Deliberately narrow in two ways:
 *
 *  1. **It refreshes; it does not redirect.** The `(manager)` layout already
 *     owns every routing decision (no session → /login, 401 → /login, 404 →
 *     /onboarding, incomplete setup_state → /onboarding). Duplicating any of
 *     that here would give two sources of truth for the same question, and the
 *     layout's version is the one that can tell a missing venue from an expired
 *     token. This file's whole job is to keep the cookie fresh.
 *
 *  2. **The matcher lists routes explicitly** rather than using Supabase's
 *     documented catch-all. This app has three auth models, not one: managers
 *     hold a Supabase session, staff authenticate with a PIN in sessionStorage
 *     under `/v/**`, and the admin console sends an `X-Admin-Secret` header.
 *     Running this on the staff PWA or the marketing site would add a pointless
 *     round-trip to the Supabase auth server on pages that have no Supabase
 *     session and never will.
 */
export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Nothing may run between createServerClient and getUser(): getUser() is what
  // revalidates the JWT against the auth server and triggers the refresh whose
  // cookies setAll writes back. getSession() alone reads the cookie without
  // revalidating, so it would not refresh anything.
  await supabase.auth.getUser();

  // Authed pages must never be cached by a shared cache — one manager's
  // rendered dashboard reaching another is exactly the leak this prevents.
  supabaseResponse.headers.set("Cache-Control", "private, no-store");

  // Returned as-is on purpose: building a fresh NextResponse here would drop
  // the refreshed cookies setAll just wrote, putting browser and server out of
  // sync and logging the manager out mid-session.
  return supabaseResponse;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/rota/:path*",
    "/scheduler/:path*",
    "/settings/:path*",
    "/team/:path*",
    "/leave/:path*",
    "/onboarding/:path*",
  ],
};
