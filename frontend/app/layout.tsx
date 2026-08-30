import type { Metadata } from "next";

import AuthHashHandler from "@/components/auth-hash-handler";
import { archivo, ibmPlex, spaceGrotesk } from "@/lib/fonts";

import "./globals.css";

export const metadata: Metadata = {
  // Without this, relative OG/canonical URLs resolve against whichever host
  // served the page — so staging would advertise itself as the canonical site.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://rotally.co.uk"),
  title: "Rotally",
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
              keyed to `rotally-theme:manager`, scoped to the manager account.
            • Everything else (admin console, marketing) keeps the shared
              `rotally_theme` key. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var p=location.pathname;var m=p.match(/^\\/v\\/([^/]+)/);var mgr=/^\\/(login|onboarding|dashboard|rota|scheduler|team|leave|settings)(\\/|$)/.test(p);var site=/^\\/(walkthrough)?$/.test(p);var k=m?'rotally-theme:'+m[1]:(mgr?'rotally-theme:manager':(site?'rotally-theme:site':'rotally_theme'));var v=localStorage.getItem(k);if(v==='light'){document.documentElement.setAttribute('data-theme','light')}else if(!v&&site&&window.matchMedia('(prefers-color-scheme: light)').matches){document.documentElement.setAttribute('data-theme','light')}}catch(e){}",
          }}
        />
      </head>
      <body className={`min-h-screen antialiased ${spaceGrotesk.variable} ${ibmPlex.variable} ${archivo.variable}`}>
        <AuthHashHandler />
        {children}
      </body>
    </html>
  );
}
