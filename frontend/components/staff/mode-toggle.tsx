"use client";

import Icon from "./icon";

// Staff screens are PIN-routed — there is no account to hang a preference off,
// so the light/dark choice is keyed to the venue link the staff member opened.
// The pre-paint script in app/layout.tsx reads the same key.
export function staffThemeKey(venueToken: string): string {
  return `rotally-theme:${venueToken}`;
}

export default function ModeToggle({ venueToken }: { venueToken: string }) {
  // Deliberately stateless. The knob position and the sun/moon glyph are both
  // driven by [data-theme] in CSS, so they are already correct on first paint
  // and there is nothing for hydration to disagree about.
  function toggle() {
    const root = document.documentElement;
    const next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
    if (next === "light") root.setAttribute("data-theme", "light");
    else root.removeAttribute("data-theme");
    try {
      localStorage.setItem(staffThemeKey(venueToken), next);
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
      // 28px visual, but an invisible ~44px hit area (before:-inset-2) so it
      // clears the touch-target minimum without changing the look.
      className="cp-hairline relative h-7 w-[52px] shrink-0 rounded-full bg-cp-icon transition-colors duration-[350ms] before:absolute before:-inset-2 before:content-['']"
    >
      <span className="cp-knob absolute left-[2.5px] top-[2.5px] flex h-[22px] w-[22px] items-center justify-center rounded-full bg-accent text-accent-on">
        <Icon name="moon" size={13} className="cp-knob-moon" />
        <Icon name="sun" size={13} className="cp-knob-sun" />
      </span>
    </button>
  );
}
