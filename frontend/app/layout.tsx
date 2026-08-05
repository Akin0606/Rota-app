import type { Metadata } from "next";

import { ibmPlex, spaceGrotesk } from "@/lib/fonts";

import "./globals.css";

export const metadata: Metadata = {
  title: "Crewplan",
  description: "Rotas that build themselves — scheduling for pubs and restaurants",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`min-h-screen antialiased ${spaceGrotesk.variable} ${ibmPlex.variable}`}>
        {children}
      </body>
    </html>
  );
}
