// Local inline-SVG icon set for the onboarding wizard — ported from the
// reference's Tabler glyphs so the PWA makes no third-party request (same
// approach as components/staff/icon.tsx). A few venue-type marks are clean
// equivalents rather than pixel-exact Tabler; the shape reads the same.

export type OIconName =
  | "arrow-left"
  | "arrow-right"
  | "check"
  | "plus"
  | "x"
  | "point"
  | "dots"
  | "info-circle"
  | "bulb"
  | "link"
  | "share"
  | "sparkles"
  | "loader"
  | "shield-check"
  | "users"
  | "beer"
  | "disco"
  | "kitchen"
  | "coffee"
  | "building"
  | "chef-hat"
  | "glass"
  | "adjustments"
  | "calendar";

// Stroke-based glyphs (Tabler style: 24×24, round caps/joins).
const STROKE: Record<string, string[]> = {
  "arrow-left": ["M5 12l14 0", "M5 12l6 6", "M5 12l6 -6"],
  "arrow-right": ["M5 12l14 0", "M13 18l6 -6", "M13 6l6 6"],
  check: ["M5 12l5 5l10 -10"],
  plus: ["M12 5l0 14", "M5 12l14 0"],
  x: ["M18 6l-12 12", "M6 6l12 12"],
  "info-circle": ["M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0", "M12 8h.01", "M11 12h1v4h1"],
  bulb: [
    "M12 3a6 6 0 0 1 3 11c-.5 .3 -1 .8 -1 1.5v.5h-4v-.5c0 -.7 -.5 -1.2 -1 -1.5a6 6 0 0 1 3 -11z",
    "M9.7 17h4.6",
    "M10 21h4",
  ],
  link: [
    "M9 15l6 -6",
    "M11 6l.5 -.5a5 5 0 0 1 7 7l-.5 .5",
    "M13 18l-.5 .5a5 5 0 0 1 -7 -7l.5 -.5",
  ],
  share: [
    "M6 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
    "M18 6m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
    "M18 18m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
    "M8.7 10.7l6.6 -3.4",
    "M8.7 13.3l6.6 3.4",
  ],
  sparkles: [
    "M12 3l1.5 4.5l4.5 1.5l-4.5 1.5l-1.5 4.5l-1.5 -4.5l-4.5 -1.5l4.5 -1.5z",
    "M18 15l.7 2l2 .7l-2 .7l-.7 2l-.7 -2l-2 -.7l2 -.7z",
  ],
  loader: ["M12 3a9 9 0 1 0 9 9"],
  "shield-check": [
    "M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3",
    "M9 12l2 2l4 -4",
  ],
  users: [
    "M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0",
    "M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2",
    "M16 3.1a4 4 0 0 1 0 7.7",
    "M21 21v-2a4 4 0 0 0 -3 -3.85",
  ],
  beer: [
    "M9 3h7v15a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1z",
    "M9 6h-2a1 1 0 0 0 -1 1v6a1 1 0 0 0 1 1h2",
    "M11 7v9",
    "M14 7v9",
  ],
  disco: [
    "M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0",
    "M3 12h18",
    "M12 3v18",
    "M5.6 5.6l12.8 12.8",
    "M18.4 5.6l-12.8 12.8",
  ],
  kitchen: ["M8 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0 -10 0", "M13 12h8"],
  coffee: [
    "M3 8h14v5a4 4 0 0 1 -4 4h-6a4 4 0 0 1 -4 -4z",
    "M17 9h2a2 2 0 0 1 0 4h-1",
    "M7 2v2",
    "M11 2v2",
  ],
  building: [
    "M3 21h18",
    "M5 21v-16a1 1 0 0 1 1 -1h8a1 1 0 0 1 1 1v16",
    "M9 8h2",
    "M9 12h2",
    "M9 16h2",
  ],
  "chef-hat": [
    "M12 3a4 4 0 0 1 3.4 1.9a4 4 0 0 1 3.6 6.1a4 4 0 0 1 -1 7h-12a4 4 0 0 1 -1 -7a4 4 0 0 1 3.6 -6.1a4 4 0 0 1 3.4 -1.9z",
    "M6.5 18h11",
  ],
  glass: ["M8 21h8", "M12 15v6", "M6 3h12l-1 6a5 5 0 0 1 -10 0z", "M6.5 6h11"],
  adjustments: [
    "M14 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
    "M4 6h8",
    "M16 6h4",
    "M8 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
    "M4 12h2",
    "M10 12h10",
    "M17 18m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
    "M4 18h11",
    "M19 18h1",
  ],
  calendar: [
    "M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z",
    "M16 3v4",
    "M8 3v4",
    "M4 11h16",
  ],
};

export default function OIcon({
  name,
  size = 18,
  className,
}: {
  name: OIconName;
  size?: number;
  className?: string;
}) {
  // Filled marks (a stroke path reads wrong for these tiny dots).
  if (name === "point") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
        <circle cx="12" cy="12" r="4" />
      </svg>
    );
  }
  if (name === "dots") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
        <circle cx="5" cy="12" r="2" />
        <circle cx="12" cy="12" r="2" />
        <circle cx="19" cy="12" r="2" />
      </svg>
    );
  }

  const paths = STROKE[name] ?? STROKE.point ?? [];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
