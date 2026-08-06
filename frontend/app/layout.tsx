import type { Metadata } from "next";

import AuthHashHandler from "@/components/auth-hash-handler";
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
      <head>
        {/* Apply the saved theme before first paint to avoid a flash. Dark is
            the default; only "light" needs the attribute. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('crewplan_theme')==='light')document.documentElement.setAttribute('data-theme','light')}catch(e){}",
          }}
        />
      </head>
      <body className={`min-h-screen antialiased ${spaceGrotesk.variable} ${ibmPlex.variable}`}>
        <AuthHashHandler />
        {children}
      </body>
    </html>
  );
}
