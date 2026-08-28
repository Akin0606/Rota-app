import type { Metadata } from "next";

import { ibmPlex, spaceGrotesk } from "@/lib/fonts";

import "./crewplan.css";
import "./frames.css";

export const metadata: Metadata = {
  title: "Crewplan — rota software for pubs and restaurants",
  description:
    "Your team sends their week from one link — no app, no accounts. Crewplan solves the rota around their availability, approved holidays and UK working-time rules, then emails it out. Free while we're in pilot.",
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <div className={`crewplan ${spaceGrotesk.variable} ${ibmPlex.variable}`}>{children}</div>;
}
