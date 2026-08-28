import type { Metadata } from "next";

import AuthHashHandler from "@/components/auth-hash-handler";
import { ibmPlex, spaceGrotesk } from "@/lib/fonts";

import "./globals.css";

export const metadata: Metadata = {
  title: "Crewplan",
  description: "Rotas that write themselves — scheduling for pubs and restaurants",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: the pre-paint script below stamps `data-theme`
    // on this element before React hydrates, which React would otherwise flag
    // as a server/client attribute mismatch. It only suppresses the warning for
    // this one element's own attributes, not for its subtree.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before first paint to avoid a flash. Dark is
            the default; only "light" needs the attribute.

            Three keys, chosen by pathname:
            • Staff screens (/v/{venue_token}/…) have no accounts, so their
              choice is keyed to the venue link — same reason the PIN is.
            • The manager surface (login, onboarding and the manager app) is
              keyed to `crewplan-theme:manager`, scoped to the manager account.
            • Everything else (admin console, marketing) keeps the shared
              `crewplan_theme` key. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var p=location.pathname;var m=p.match(/^\\/v\\/([^/]+)/);var mgr=/^\\/(login|onboarding|dashboard|rota|scheduler|team|leave|settings)(\\/|$)/.test(p);var site=/^\\/(walkthrough)?$/.test(p);var k=m?'crewplan-theme:'+m[1]:(mgr?'crewplan-theme:manager':(site?'crewplan-theme:site':'crewplan_theme'));var v=localStorage.getItem(k);if(v==='light'){document.documentElement.setAttribute('data-theme','light')}else if(!v&&site&&window.matchMedia('(prefers-color-scheme: light)').matches){document.documentElement.setAttribute('data-theme','light')}}catch(e){}",
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
