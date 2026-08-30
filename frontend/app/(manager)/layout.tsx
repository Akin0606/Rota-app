import { redirect } from "next/navigation";

import ManagerNav from "@/components/manager/nav";
import { createClient } from "@/lib/supabase-server";

// The status matters, not just success: a 404 means "signed in, no venue yet"
// (start onboarding) while a 401 means the token expired (sign in again). This
// used to collapse both to null, which sent every manager with a stale session
// into the onboarding wizard — where the boot only treats a 404 as "start
// fresh", so they landed on the BootError screen instead of the login page.
type VenueFetch =
  | { kind: "ok"; venue: Record<string, unknown> }
  | { kind: "unauthenticated" }
  | { kind: "no-venue" }
  | { kind: "error" };

async function getVenueServer(accessToken: string): Promise<VenueFetch> {
  let res: Response;
  try {
    res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/venue`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
  } catch {
    // Network failure / cold Supabase pool — not an auth signal.
    return { kind: "error" };
  }
  if (res.ok) return { kind: "ok", venue: await res.json() };
  if (res.status === 401 || res.status === 403) return { kind: "unauthenticated" };
  if (res.status === 404) return { kind: "no-venue" };
  return { kind: "error" };
}

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  const result = await getVenueServer(session.access_token);
  if (result.kind === "unauthenticated") {
    redirect("/login");
  }
  if (result.kind === "no-venue") {
    redirect("/onboarding");
  }
  if (result.kind === "error") {
    return (
      <div className="cp-manager flex min-h-screen items-center justify-center bg-surface-page px-6 text-ink">
        <div className="max-w-[420px] rounded-card border border-hairline bg-surface-card p-8 text-center">
          <div className="mb-3 text-2xl font-medium text-ink">Something went wrong</div>
          <div className="mb-6 text-sm text-ink-muted">
            We couldn&apos;t load your venue just now. This is usually temporary.
          </div>
          <a
            href="/dashboard"
            className="inline-block rounded-xl bg-accent px-5 py-3 text-sm font-medium text-accent-on"
          >
            Try again
          </a>
        </div>
      </div>
    );
  }
  const venue = result.venue as { setup_state?: unknown; is_active?: boolean; name?: string };

  // Resume gate: a manager who created a venue but never finished the wizard
  // (setup_state present and not completed) is sent back to resume — not
  // dropped onto a near-empty dashboard. Onboarding boot handles the rehydrate.
  const setupState = venue.setup_state as { completed?: boolean } | null;
  if (setupState && !setupState.completed) {
    redirect("/onboarding");
  }

  if (venue.is_active === false) {
    return (
      <div className="cp-manager flex min-h-screen items-center justify-center bg-surface-page px-6 text-ink">
        <div className="max-w-[420px] rounded-card border border-hairline bg-surface-card p-8 text-center">
          <div className="mb-3 text-2xl font-medium text-ink">Venue inactive</div>
          <div className="mb-6 text-sm text-ink-muted">
            {venue.name} is currently inactive. Please contact Rotally support to reactivate it.
          </div>
          <a
            href="/login"
            className="inline-block rounded-xl bg-accent px-5 py-3 text-sm font-medium text-accent-on"
          >
            Back to login
          </a>
        </div>
      </div>
    );
  }

  // Phone-width column on mobile, widening to a comfortable laptop width at md+
  // so the pages' existing desktop grids (dashboard `md:grid-cols-4` /
  // `lg:grid-cols-[1fr_380px]`, settings `md:grid-cols-2`) finally get room to
  // fire — they were being suffocated by a hard 460px cap. The whole manager
  // surface lives in one `.cp-manager` root so every colour utility resolves to
  // the reference palette (see globals.css).
  return (
    <div className="cp-manager min-h-screen bg-surface-page text-ink">
      <div className="mx-auto flex min-h-screen w-full max-w-[460px] flex-col md:max-w-[1120px]">
        <ManagerNav />
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
