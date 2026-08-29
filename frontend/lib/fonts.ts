import { Archivo, IBM_Plex_Sans, Space_Grotesk } from "next/font/google";

// Loaded once here and reused across the whole app (root layout) and the
// marketing landing so the font files aren't requested twice.
export const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

export const ibmPlex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

// The Rotally wordmark only. Deliberately scoped to the logo rather than made
// the app-wide display face — switching the whole UI to Archivo is a separate,
// visually verifiable change.
export const archivo = Archivo({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-mark",
  display: "swap",
});
