import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-body)", "IBM Plex Sans", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Space Grotesk", "sans-serif"],
        mark: ["var(--font-mark)", "Archivo", "system-ui", "sans-serif"],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // All theme colours resolve to CSS variables so light/dark can be
        // switched at runtime (see globals.css). "accent" is the primary
        // ACTION colour and is deliberately neutral — paper on dark, ink on
        // light. The brand orange lives in `mark` and nothing else uses it.
        accent: {
          DEFAULT: "var(--c-accent)",
          hover: "var(--c-accent-hover)",
          // Foreground for content sitting ON an accent surface: near-black on
          // dark, white on light. Resolves per theme in globals.css.
          on: "var(--c-accent-on)",
          light: "var(--c-accent-light)",
          border: "var(--c-accent-border)",
        },
        // The brand orange. Wordmark and wheel only — never a button, never a
        // link. Colour in the UI is reserved for coverage state.
        mark: {
          DEFAULT: "var(--c-mark)",
        },
        ink: {
          DEFAULT: "var(--c-ink)",
          label: "var(--c-ink-label)",
          muted: "var(--c-ink-muted)",
          faint: "var(--c-ink-faint)",
        },
        surface: {
          DEFAULT: "var(--c-surface)",
          page: "var(--c-surface-page)",
          card: "var(--c-surface-card)",
          subtle: "var(--c-surface-subtle)",
        },
        avail: {
          bg: "var(--c-avail-bg)",
          border: "var(--c-avail-border)",
          text: "var(--c-avail-text)",
        },
        unavail: {
          bg: "var(--c-unavail-bg)",
          border: "var(--c-unavail-border)",
          text: "var(--c-unavail-text)",
        },
        preferred: {
          bg: "var(--c-preferred-bg)",
          border: "var(--c-preferred-border)",
          text: "var(--c-preferred-text)",
        },
        unset: {
          bg: "var(--c-unset-bg)",
          border: "var(--c-unset-border)",
          text: "var(--c-unset-text)",
        },
        warn: { bg: "var(--c-warn-bg)", text: "var(--c-warn-text)", dot: "var(--c-warn-dot)" },
        // Staff PWA only — status + surface tones the manager palette has no
        // equivalent for. Defined in globals.css under `.cp-staff`.
        cp: {
          green: "var(--cp-green)",
          "green-soft": "var(--cp-green-soft)",
          amber: "var(--cp-amber)",
          "amber-soft": "var(--cp-amber-soft)",
          // red only exists inside the manager palette (.cp-manager) — the
          // staff surface never defines it.
          red: "var(--cp-red)",
          "red-soft": "var(--cp-red-soft)",
          icon: "var(--cp-icon-bg)",
          track: "var(--cp-track)",
        },
      },
      borderRadius: {
        card: "24px",
        panel: "16px",
        control: "14px",
        input: "12px",
        // Staff PWA radii — cards 12–14px, controls 8–11px, chips/badges
        // smaller still. Named so screens never hardcode their own.
        "cp-card": "14px",
        "cp-tile": "13px",
        "cp-panel": "12px",
        "cp-control": "11px",
        "cp-slot": "9px",
        "cp-chip": "7px",
        "cp-badge": "6px",
      },
      boxShadow: {
        card: "0 8px 32px var(--c-shadow)",
      },
      borderColor: {
        hairline: "var(--c-hairline)",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        fadeIn: "fadeIn 0.3s ease",
      },
    },
  },
  plugins: [],
};
export default config;
