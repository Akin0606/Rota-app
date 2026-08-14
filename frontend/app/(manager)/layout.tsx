import { redirect } from "next/navigation";

import ManagerNav from "@/components/manager/nav";
import { createClient } from "@/lib/supabase-server";

async function getVenueServer(accessToken: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/venue`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  const venue = await getVenueServer(session.access_token);
  if (!venue) {
    redirect("/onboarding");
  }

  if (venue.is_active === false) {
    return (
      <div className="cp-manager flex min-h-screen items-center justify-center bg-surface-page px-6 text-ink">
        <div className="max-w-[420px] rounded-card border border-hairline bg-surface-card p-8 text-center">
          <div className="mb-3 text-2xl font-medium text-ink">Venue inactive</div>
          <div className="mb-6 text-sm text-ink-muted">
            {venue.name} is currently inactive. Please contact Crewplan support to reactivate it.
          </div>
          <a
            href="/login"
            className="inline-block rounded-xl bg-accent px-5 py-3 text-sm font-medium text-white"
          >
            Back to login
          </a>
        </div>
      </div>
    );
  }

  // The reference is a centred, phone-width column — the whole manager surface
  // lives in one `.cp-manager` root so every colour utility resolves to the
  // reference palette (see globals.css). Not-yet-rebuilt pages already ship a
  // mobile layout (they used to have a bottom nav), so they render coherently
  // inside this column while later phases restyle them one by one.
  return (
    <div className="cp-manager min-h-screen bg-surface-page text-ink">
      <div className="mx-auto flex min-h-screen w-full max-w-[460px] flex-col">
        <ManagerNav />
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
