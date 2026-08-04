import { redirect } from "next/navigation";

import BottomNav from "@/components/bottom-nav";
import Sidebar from "@/components/sidebar";
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

  return (
    <div className="flex min-h-screen">
      <Sidebar venueName={venue.name} managerEmail={session.user.email ?? undefined} />
      <div className="flex-1 pb-16 md:pb-0">{children}</div>
      <BottomNav />
    </div>
  );
}
