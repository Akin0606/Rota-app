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
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Orange — reserved for primary actions and status only.
        accent: {
          DEFAULT: "#ff4d00",
          hover: "#e64500",
          light: "#1f1108", // accent-bg: dark tinted surface behind accent chips
          border: "#7a2600", // accent-dim
        },
        // Text
        ink: {
          DEFAULT: "#f5f5f4", // text-primary
          label: "#c9c9c7",
          muted: "#8c8c8a", // text-secondary
          faint: "#545452", // text-muted
        },
        // Dark surfaces
        surface: {
          DEFAULT: "#141414",
          page: "#0d0d0d",
          card: "#141414",
          subtle: "#1a1a1a", // surface-2
        },
        // Status / shift-availability — tuned for contrast on #141414.
        avail: {
          bg: "#10231a",
          border: "#22c55e",
          text: "#4ade80",
        },
        unavail: {
          bg: "#2a1113",
          border: "#f87171",
          text: "#f87171",
        },
        preferred: {
          bg: "#241e0a",
          border: "#eab308",
          text: "#fbbf24",
        },
        unset: {
          bg: "#1a1a1a",
          border: "#2e2e2e",
          text: "#6b6b69",
        },
        warn: { bg: "#241c0a", text: "#fcd34d", dot: "#f59e0b" },
      },
      borderRadius: {
        card: "24px",
        panel: "16px",
        control: "14px",
        input: "12px",
      },
      boxShadow: {
        card: "0 8px 32px rgba(0,0,0,0.4)",
      },
      borderColor: {
        hairline: "#232323",
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
