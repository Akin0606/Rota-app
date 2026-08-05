import type { Metadata } from "next";
import { IBM_Plex_Sans, Space_Grotesk } from "next/font/google";

import "./crewplan.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const ibmPlex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Crewplan — Rotas that build themselves",
  description:
    "Your team sends in when they're free. Crewplan builds the week's rota. You check it once on Saturday morning, and it's out to everyone.",
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <div className={`crewplan ${spaceGrotesk.variable} ${ibmPlex.variable}`}>{children}</div>;
}
