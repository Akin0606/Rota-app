import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        accent: {
          DEFAULT: "#3b82f6",
          hover: "#2563eb",
          light: "#eff6ff",
          border: "#dbeafe",
        },
        ink: {
          DEFAULT: "#1a1a1a",
          label: "#374151",
          muted: "#6b7280",
          faint: "#9ca3af",
        },
        surface: {
          DEFAULT: "#fafaf9",
          page: "#f3f4f6",
          card: "#ffffff",
          subtle: "#f9fafb",
        },
        avail: {
          bg: "#dcfce7",
          border: "#22c55e",
          text: "#16a34a",
        },
        unavail: {
          bg: "#fee2e2",
          border: "#ef4444",
          text: "#ef4444",
        },
        preferred: {
          bg: "#fef9c3",
          border: "#eab308",
          text: "#ca8a04",
        },
        unset: {
          bg: "#f3f4f6",
          border: "#e5e7eb",
          text: "#9ca3af",
        },
        warn: { bg: "#fef3c7", text: "#92400e", dot: "#f59e0b" },
      },
      borderRadius: {
        card: "24px",
        panel: "16px",
        control: "14px",
        input: "12px",
      },
      boxShadow: {
        card: "0 8px 32px rgba(0,0,0,0.1)",
      },
      borderColor: {
        hairline: "rgba(0,0,0,0.04)",
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
