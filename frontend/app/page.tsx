import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase-server";

async function hasVenue(accessToken: string): Promise<boolean> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/venue`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  return res.ok;
}

export default async function Home() {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  if (await hasVenue(session.access_token)) {
    redirect("/dashboard");
  }

  redirect("/onboarding");
}
