import { notFound } from "next/navigation";

import ManagerPreview from "./manager-preview";

// Local dev tool only — hidden on any production build. Manager pages can't be
// previewed at their real paths (the (manager) layout is a server auth gate that
// redirects before any client stub can run), so they're hosted here instead and
// reached from the Device Lab's Manager quick-routes.
export const dynamic = "force-dynamic";

export default async function DevLabManagerPage({ params }: { params: Promise<{ page: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { page } = await params;
  return <ManagerPreview page={page} />;
}
