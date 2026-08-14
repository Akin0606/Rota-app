// Tabler-style stroke icons, inlined for the manager surface. The reference
// HTML (crewplan-manager-reference.html) pulls the Tabler webfont off a CDN; a
// local SVG set keeps the manager app self-contained — no third-party request,
// no icon-font flash — at the cost of hand-maintaining the glyphs the design
// uses. Grown per phase; Phase 1 covers login + the mode toggle.

export type ManagerIconName =
  | "moon"
  | "sun"
  | "arrow-left"
  | "arrow-right"
  | "check"
  | "calendar-bolt"
  | "mail"
  | "mail-check"
  | "lock-open"
  | "plus"
  | "x"
  | "alert-triangle"
  | "circle-check"
  | "clock"
  | "send"
  | "download"
  | "file-text"
  | "table"
  | "photo"
  | "chevron-right"
  | "chevron-down";

const PATHS: Record<ManagerIconName, string[]> = {
  moon: ["M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z"],
  sun: [
    "M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0",
    "M3 12h1M12 3v1M20 12h1M12 20v1M5.6 5.6l.7 .7M18.4 5.6l-.7 .7M17.7 17.7l.7 .7M6.3 17.7l-.7 .7",
  ],
  "arrow-left": ["M5 12l14 0", "M5 12l6 6", "M5 12l6 -6"],
  "arrow-right": ["M5 12l14 0", "M13 18l6 -6", "M13 6l6 6"],
  check: ["M5 12l5 5l10 -10"],
  "calendar-bolt": [
    "M11.795 21h-6.795a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v4",
    "M16 3v4",
    "M8 3v4",
    "M4 11h16",
    "M19 16l-2 3h4l-2 3",
  ],
  mail: [
    "M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10z",
    "M3 7l9 6l9 -6",
  ],
  "mail-check": [
    "M11 19h-6a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v5",
    "M3 7l9 6l9 -6",
    "M15 19l2 2l4 -4",
  ],
  "lock-open": [
    "M5 11m0 2a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2z",
    "M11 16m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
    "M8 11v-5a4 4 0 0 1 8 0",
  ],
  plus: ["M12 5l0 14", "M5 12l14 0"],
  x: ["M18 6l-12 12", "M6 6l12 12"],
  "alert-triangle": [
    "M12 9v4",
    "M10.24 3.957l-8.422 14.06a1.989 1.989 0 0 0 1.7 2.983h16.845a1.989 1.989 0 0 0 1.7 -2.983l-8.423 -14.06a1.989 1.989 0 0 0 -3.4 0z",
    "M12 16h.01",
  ],
  "circle-check": ["M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0", "M9 12l2 2l4 -4"],
  clock: ["M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0", "M12 7v5l3 3"],
  send: [
    "M10 14l11 -11",
    "M21 3l-6.5 18a.55 .55 0 0 1 -1 0l-3.5 -7l-7 -3.5a.55 .55 0 0 1 0 -1l18 -6.5",
  ],
  download: ["M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2", "M7 11l5 5l5 -5", "M12 4l0 12"],
  "file-text": [
    "M14 3v4a1 1 0 0 0 1 1h4",
    "M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z",
    "M9 9l1 0",
    "M9 13l6 0",
    "M9 17l6 0",
  ],
  table: [
    "M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14z",
    "M3 10h18",
    "M10 3v18",
  ],
  photo: [
    "M15 8h.01",
    "M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12z",
    "M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5",
    "M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3",
  ],
  "chevron-right": ["M9 6l6 6l-6 6"],
  "chevron-down": ["M6 9l6 6l6 -6"],
};

type IconProps = {
  name: ManagerIconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
};

export default function ManagerIcon({ name, size = 20, strokeWidth = 1.75, className }: IconProps) {
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
