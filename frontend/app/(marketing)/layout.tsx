import type { Metadata } from "next";

import { archivo, ibmPlex, spaceGrotesk } from "@/lib/fonts";

import "./rotally.css";
import "./frames.css";

export const metadata: Metadata = {
  title: "Rotally — rota software for pubs and restaurants",
  description:
    "Your team sends their week from one link — no app, no accounts. Rotally solves the rota around their availability, approved holidays and UK working-time rules, then emails it out. Free while we're in pilot.",
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <div className={`rotally ${spaceGrotesk.variable} ${ibmPlex.variable} ${archivo.variable}`}>{children}</div>;
}
