"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

/* Marketing-site chrome: the translucent nav, the theme toggle, the mobile
   menu and the footer. Shared by the home page and /walkthrough so they can't
   drift apart.

   Theme key is `crewplan-theme:site` — deliberately its own key, not the app's.
   A visitor's choice about a marketing page shouldn't follow them into the
   product, and vice versa. The pre-paint script in the root layout reads the
   same key and falls back to the system setting when nothing is stored. */

const THEME_KEY = "crewplan-theme:site";

type Mode = "light" | "dark";

/* One list, rendered twice — the desktop bar and the mobile menu. Two hand-kept
   copies is how a nav ends up with a link in one place and not the other. */
const NAV_LINKS: [string, string][] = [
  ["/walkthrough", "Walkthrough"],
  ["/#features", "Features"],
  ["/#compliance", "The law"],
  ["/#pricing", "Pricing"],
];

function systemMode(): Mode {
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/* Theme state lives in SiteNav, not here, because this renders in two places at
   once (the bar and the mobile menu). Local state in each copy would let the
   two disagree the moment someone used the one in the menu. */
function ThemeToggle({ mode, onPick }: { mode: Mode | null; onPick: (m: Mode) => void }) {
  return (
    <div className="theme-toggle" role="group" aria-label="Colour theme">
      <button
        type="button"
        aria-label="Light"
        aria-pressed={mode === "light"}
        onClick={() => onPick("light")}
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
        onClick={() => onPick("dark")}
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

/* Roadmap is deliberately NOT in the primary nav. It's the most honest section
   on the site and it stays on the page, but a cold visitor who clicks it first
   reads a list of what's missing before they know what exists. It lives in the
   menu and the footer, where someone already interested goes looking. Pricing
   takes the slot instead: it answers the question every operator arrives with,
   and the answer is free. */
export function SiteNav() {
  const pathname = usePathname();
  const onHome = pathname === "/";

  // Starts null so the first paint matches whatever the pre-paint script did;
  // resolving it in an effect avoids a hydration mismatch.
  const [mode, setMode] = useState<Mode | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const menuPanel = useRef<HTMLDivElement>(null);

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

  // Escape closes and hands focus back to the trigger, so a keyboard user is
  // never left inside a panel whose edges they can't see.
  useEffect(() => {
    if (!menuOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false);
        menuBtn.current?.focus();
      }
    }
    function onPointer(e: PointerEvent) {
      const t = e.target as Node;
      if (menuPanel.current?.contains(t) || menuBtn.current?.contains(t)) return;
      setMenuOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [menuOpen]);

  // A same-page anchor doesn't change `pathname`, so closing has to hang off
  // the click itself rather than off navigation.
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  // The wordmark returns you to the top of the home page. On the home page
  // that's a scroll, not a navigation — a route change to the page you're
  // already on would do nothing and feel broken.
  function handleLogo(e: React.MouseEvent) {
    closeMenu();
    if (!onHome) return;
    e.preventDefault();
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }

  return (
    <header className="nav">
      <div className="wrap nav-inner">
        <Link href="/" className="logo" onClick={handleLogo} aria-label="Crewplan — back to top">
          crewplan<span className="dot">.</span>
        </Link>
        <nav className="nav-links" aria-label="Main">
          {NAV_LINKS.map(([href, label]) => (
            <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="nav-actions">
          <div className="nav-theme-bar">
            <ThemeToggle mode={mode} onPick={apply} />
          </div>
          <Link href="/login" className="btn btn-ghost btn-sm nav-login">
            Log in
          </Link>
          <Link href="/#waitlist" className="btn btn-primary btn-sm" onClick={closeMenu}>
            Claim a place
          </Link>
          <button
            type="button"
            ref={menuBtn}
            className="nav-burger"
            aria-expanded={menuOpen}
            aria-controls="site-menu"
            aria-label={menuOpen ? "Close menu" : "Menu"}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              {menuOpen ? (
                <path
                  d="m5 5 10 10M15 5 5 15"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="M3 6h14M3 13h14"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Always rendered so it can transition in both directions;
          `visibility: hidden` when closed keeps its links out of the tab order
          and out of the accessibility tree. */}
      <div
        id="site-menu"
        className={menuOpen ? "nav-menu is-open" : "nav-menu"}
        ref={menuPanel}
        aria-hidden={!menuOpen}
      >
        <div className="wrap nav-menu-inner">
          {NAV_LINKS.map(([href, label]) => (
            <Link key={href} href={href} onClick={closeMenu}>
              {label}
            </Link>
          ))}
          <Link href="/#roadmap" onClick={closeMenu}>
            Roadmap
          </Link>
          <Link href="/login" onClick={closeMenu}>
            Log in
          </Link>
          <div className="nav-menu-theme">
            <span className="small">Theme</span>
            <ThemeToggle mode={mode} onPick={apply} />
          </div>
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
          <Link href="/#compliance">The law</Link>
          <Link href="/#pricing">Pricing</Link>
          <Link href="/#roadmap">Roadmap</Link>
          <Link href="/#suggest">Tell us something</Link>
          <Link href="/login">Log in</Link>
        </div>
        <div className="small">© 2026 Crewplan. Made for pubs.</div>
      </div>
    </footer>
  );
}
