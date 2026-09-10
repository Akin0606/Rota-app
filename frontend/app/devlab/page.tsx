import { notFound } from "next/navigation";

import DeviceLab from "./device-lab";

// Local dev tool only — a phone harness for the Browser pane. Hidden on any
// production build (staging/prod on Vercel) so it never ships as a route.
export const dynamic = "force-dynamic";

export default function DevLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DeviceLab />;
}
