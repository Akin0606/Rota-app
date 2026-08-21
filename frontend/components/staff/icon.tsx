// Tabler-style stroke icons, inlined. The reference HTML pulls the Tabler
// webfont off a CDN; a local SVG set keeps the staff PWA self-contained (no
// third-party request, no icon-font flash on a slow pub wifi connection) at
// the cost of hand-maintaining the handful of glyphs the design uses.

export type IconName =
  | "moon"
  | "sun"
  | "home"
  | "arrow-left"
  | "arrow-right"
  | "chevron-right"
  | "check"
  | "plus"
  | "minus"
  | "x"
  | "clock"
  | "clock-hour-4"
  | "circle-check"
  | "circle-x"
  | "info-circle"
  | "calendar-plus"
  | "calendar-week"
  | "calendar-check"
  | "arrows-exchange"
  | "arrow-back-up"
  | "user-share"
  | "beach"
  | "bell";

const PATHS: Record<IconName, string[]> = {
  moon: ["M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z"],
  sun: [
    "M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0",
    "M3 12h1M12 3v1M20 12h1M12 20v1M5.6 5.6l.7 .7M18.4 5.6l-.7 .7M17.7 17.7l.7 .7M6.3 17.7l-.7 .7",
  ],
  home: [
    "M5 12l-2 0l9 -9l9 9l-2 0",
    "M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7",
    "M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6",
  ],
  "arrow-left": ["M5 12l14 0", "M5 12l6 6", "M5 12l6 -6"],
  "arrow-right": ["M5 12l14 0", "M13 18l6 -6", "M13 6l6 6"],
  "chevron-right": ["M9 6l6 6l-6 6"],
  check: ["M5 12l5 5l10 -10"],
  plus: ["M12 5l0 14", "M5 12l14 0"],
  minus: ["M5 12l14 0"],
  x: ["M18 6l-12 12", "M6 6l12 12"],
  clock: ["M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0", "M12 7v5l3 3"],
  "clock-hour-4": ["M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0", "M12 12l3 2", "M12 7v5"],
  "circle-check": ["M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0", "M9 12l2 2l4 -4"],
  "circle-x": ["M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0", "M10 10l4 4", "M14 10l-4 4"],
  "info-circle": ["M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0", "M12 9h.01", "M11 12h1v4h1"],
  "calendar-plus": [
    "M12.5 21h-6.5a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v6",
    "M16 3v4",
    "M8 3v4",
    "M4 11h16",
    "M16 19h6",
    "M19 16v6",
  ],
  "calendar-week": [
    "M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z",
    "M16 3v4",
    "M8 3v4",
    "M4 11h16",
    "M7 15h1",
    "M11.5 15h1",
    "M16 15h1",
  ],
  "calendar-check": [
    "M11.5 21h-5.5a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v5",
    "M16 3v4",
    "M8 3v4",
    "M4 11h16",
    "M15 19l2 2l4 -4",
  ],
  "arrows-exchange": ["M7 10h14l-4 -4", "M17 14h-14l4 4"],
  "arrow-back-up": ["M9 14l-4 -4l4 -4", "M5 10h11a4 4 0 1 1 0 8h-1"],
  "user-share": [
    "M8 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0",
    "M6 21v-2a4 4 0 0 1 4 -4h4",
    "M16 22l5 -5",
    "M21 22v-5h-5",
  ],
  bell: [
    "M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6",
    "M9 17v1a3 3 0 0 0 6 0v-1",
  ],
  beach: [
    "M17.553 16.75a7.5 7.5 0 0 0 -10.606 0",
    "M18 3.804a6 6 0 0 0 -8.196 2.196l10.392 6a6 6 0 0 0 -2.196 -8.196z",
    "M16.732 10c1.658 -2.87 2.225 -5.644 1.268 -6.196c-.957 -.552 -3.075 1.326 -4.732 4.196",
    "M15 9l-3 5.196",
    "M3 19.25a2.4 2.4 0 0 1 1 -.25a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 1 -.25",
  ],
};

type IconProps = {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
};

export default function Icon({ name, size = 20, strokeWidth = 1.75, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ flexShrink: 0 }}
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
