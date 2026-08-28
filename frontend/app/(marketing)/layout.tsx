import type { Metadata } from "next";

import { ibmPlex, spaceGrotesk } from "@/lib/fonts";

import "./crewplan.css";
import "./frames.css";

export const metadata: Metadata = {
  title: "Crewplan — rotas that write themselves",
  description:
    "Your team sends their week from a link. Crewplan works out the best rota it can from that — availability, holidays, the law — and emails it out.",
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <div className={`crewplan ${spaceGrotesk.variable} ${ibmPlex.variable}`}>{children}</div>;
}
