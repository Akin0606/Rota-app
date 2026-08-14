"use client";

import ManagerIcon from "./icon";

// The manager light/dark choice is scoped to the manager account (one key for
// the whole surface — login, onboarding and the app), unlike the staff side
// where it's keyed per venue link. The pre-paint script in app/layout.tsx reads
// the same key.
export const MANAGER_THEME_KEY = "crewplan-theme:manager";

export default function ModeToggle() {
  // Deliberately stateless. The knob position and the sun/moon glyph are both
  // driven by [data-theme] in CSS (see globals.css .cpm-knob), so they are
  // already correct on first paint and there is nothing for hydration to
  // disagree about.
  function toggle() {
    const root = document.documentElement;
    const next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
    if (next === "light") root.setAttribute("data-theme", "light");
    else root.removeAttribute("data-theme");
    try {
      localStorage.setItem(MANAGER_THEME_KEY, next);
    } catch {
      // Private-mode Safari and friends — the toggle still works for this
      // session, it just won't be remembered.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle light or dark mode"
      className="cp-hairline relative h-[25px] w-[46px] shrink-0 rounded-[13px] bg-cp-icon transition-colors duration-[350ms]"
    >
      <span className="cpm-knob absolute left-[2.5px] top-[2.5px] flex h-[19px] w-[19px] items-center justify-center rounded-full bg-accent text-white">
        <ManagerIcon name="moon" size={10} className="cpm-knob-moon" />
        <ManagerIcon name="sun" size={10} className="cpm-knob-sun" />
      </span>
    </button>
  );
}
