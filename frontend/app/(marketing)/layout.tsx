import type { Metadata } from "next";

import { ibmPlex, spaceGrotesk } from "@/lib/fonts";

import "./crewplan.css";

export const metadata: Metadata = {
  title: "Crewplan — Rotas that build themselves",
  description:
    "Your team sends in when they're free. Crewplan builds the week's rota. You check it once on Saturday morning, and it's out to everyone.",
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <div className={`crewplan ${spaceGrotesk.variable} ${ibmPlex.variable}`}>{children}</div>;
}
