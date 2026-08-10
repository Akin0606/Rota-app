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
            the default; only "light" needs the attribute.

            Staff screens (/v/{venue_token}/…) have no accounts, so their
            choice is keyed to the venue link rather than shared with the
            manager app — same reason the PIN is. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var m=location.pathname.match(/^\\/v\\/([^/]+)/);var k=m?'crewplan-theme:'+m[1]:'crewplan_theme';if(localStorage.getItem(k)==='light')document.documentElement.setAttribute('data-theme','light')}catch(e){}",
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
