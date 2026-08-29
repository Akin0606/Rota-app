"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

export const THEME_KEY = "rotally_theme";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    setTheme(localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark");
  }, []);

  function apply(next: Theme) {
    setTheme(next);
    localStorage.setItem(THEME_KEY, next);
    if (next === "light") document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
  }

  return (
    <div className="inline-flex rounded-[10px] border border-hairline bg-surface-subtle p-1">
      {(["dark", "light"] as Theme[]).map((t) => (
        <button
          key={t}
          onClick={() => apply(t)}
          className={`rounded-lg px-4 py-1.5 text-[13px] font-semibold capitalize transition ${
            theme === t ? "bg-accent text-white" : "text-ink-muted"
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
