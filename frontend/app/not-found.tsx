import type { Metadata } from "next";
import Link from "next/link";

import Wordmark from "@/components/wordmark";

export const metadata: Metadata = {
  title: "Page not found — Rotally",
};

// Root not-found — catches every unmatched path app-wide (typed URLs, stale
// links), replacing Next's bare unstyled default. Renders in the root layout
// outside any palette scope, so it styles off the global brand tokens directly.
// The Wordmark carries the seven-segment brand wheel, so the page is on-brand
// and theme-aware (the pre-paint script sets the shared theme for unknown paths).
export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "2rem",
        gap: "1.1rem",
        color: "var(--c-ink)",
      }}
    >
      <Wordmark className="text-[26px]" />
      <div
        style={{
          fontSize: "0.72rem",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--c-ink-muted)",
        }}
      >
        Error 404
      </div>
      <h1
        style={{
          fontSize: "clamp(1.5rem, 4vw, 2rem)",
          fontWeight: 500,
          margin: 0,
        }}
      >
        This page doesn&rsquo;t exist
      </h1>
      <p
        style={{
          color: "var(--c-ink-muted)",
          maxWidth: "22rem",
          lineHeight: 1.6,
          margin: 0,
        }}
      >
        The link may be old or mistyped. Let&rsquo;s get you back to something
        real.
      </p>
      <Link
        href="/"
        style={{
          marginTop: "0.4rem",
          display: "inline-flex",
          alignItems: "center",
          padding: "0.75rem 1.25rem",
          borderRadius: "0.75rem",
          background: "var(--c-ink)",
          color: "var(--c-surface-page)",
          fontWeight: 500,
          textDecoration: "none",
        }}
      >
        Back to home
      </Link>
    </main>
  );
}
