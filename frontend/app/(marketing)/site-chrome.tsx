"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

/* Marketing-site chrome: the translucent nav, the theme toggle and the footer.
   Shared by the home page and /walkthrough so they can't drift apart.

   Theme key is `crewplan-theme:site` — deliberately its own key, not the app's.
   A visitor's choice about a marketing page shouldn't follow them into the
   product, and vice versa. The pre-paint script in the root layout reads the
   same key and falls back to the system setting when nothing is stored. */

const THEME_KEY = "crewplan-theme:site";

type Mode = "light" | "dark";

function systemMode(): Mode {
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function ThemeToggle() {
  // Starts null so the first paint matches whatever the pre-paint script did;
  // resolving it in an effect avoids a hydration mismatch.
  const [mode, setMode] = useState<Mode | null>(null);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(THEME_KEY);
    } catch {
      /* private mode / storage disabled — fall through to the system setting */
    }
    setMode(stored === "light" || stored === "dark" ? stored : systemMode());
  }, []);

  // Track the system setting while the visitor hasn't made a choice, so the
  // page follows them if they flip their OS theme mid-visit.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(THEME_KEY);
      } catch {
        /* ignore */
      }
      if (!stored) setMode(mq.matches ? "light" : "dark");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const apply = useCallback((next: Mode) => {
    setMode(next);
    if (next === "light") document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* choice just won't persist — the page still switches */
    }
  }, []);

  return (
    <div className="theme-toggle" role="group" aria-label="Colour theme">
      <button
        type="button"
        aria-label="Light"
        aria-pressed={mode === "light"}
        onClick={() => apply("light")}
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="3.1" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M8 1v1.6M8 13.4V15M15 8h-1.6M2.6 8H1M12.9 3.1l-1.1 1.1M4.2 11.8l-1.1 1.1M12.9 12.9l-1.1-1.1M4.2 4.2L3.1 3.1"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <button
        type="button"
        aria-label="Dark"
        aria-pressed={mode === "dark"}
        onClick={() => apply("dark")}
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.8 5.8 0 1 0 7.1 7.1Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}

export function SiteNav() {
  const pathname = usePathname();
  const onHome = pathname === "/";

  // The wordmark returns you to the top of the home page. On the home page
  // that's a scroll, not a navigation — a route change to the page you're
  // already on would do nothing and feel broken.
  function handleLogo(e: React.MouseEvent) {
    if (!onHome) return;
    e.preventDefault();
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }

  return (
    <header className="nav">
      <div className="wrap nav-inner">
        <Link href="/" className="logo" onClick={handleLogo} aria-label="Crewplan — back to top">
          crewplan<span className="dot">.</span>
        </Link>
        <nav className="nav-links" aria-label="Main">
          <Link href="/walkthrough" aria-current={pathname === "/walkthrough" ? "page" : undefined}>
            Walkthrough
          </Link>
          <Link href="/#features">Features</Link>
          <Link href="/#compliance">Compliance</Link>
          <Link href="/#roadmap">Roadmap</Link>
        </nav>
        <div className="nav-actions">
          <ThemeToggle />
          <Link href="/login" className="btn btn-ghost btn-sm nav-login">
            Log in
          </Link>
          <Link href="/#waitlist" className="btn btn-primary btn-sm">
            Join waitlist
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="footer">
      <div className="wrap footer-inner">
        <Link href="/" className="logo" style={{ fontSize: "1rem" }}>
          crewplan<span className="dot">.</span>
        </Link>
        <div className="footer-links">
          <Link href="/walkthrough">Walkthrough</Link>
          <Link href="/#features">Features</Link>
          <Link href="/#compliance">Compliance</Link>
          <Link href="/#roadmap">Roadmap</Link>
          <Link href="/#suggest">Tell us something</Link>
        </div>
        <div className="small">© 2026 Crewplan. Made for pubs.</div>
      </div>
    </footer>
  );
}
