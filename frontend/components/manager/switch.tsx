"use client";

// Generic on/off control for the manager surface, same track/knob geometry as
// the theme toggle (components/manager/mode-toggle.tsx) so every switch in
// the app moves and sizes identically.
type SwitchProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
};

export default function Switch({ checked, onChange, disabled, label }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-[25px] w-[46px] shrink-0 rounded-[13px] transition-colors duration-200 disabled:opacity-50 ${
        checked ? "bg-accent" : "bg-cp-icon"
      }`}
    >
      {/* Hairline ring so the white knob keeps a legible edge against the
          neutral (near-white) accent track when ON in dark mode — the accent
          is neutral by brand, so knob-on-track would otherwise be white-on-
          near-white. A ring, not a drop shadow (flat brand). */}
      <span
        className={`absolute left-[2.5px] top-[2.5px] h-[19px] w-[19px] rounded-full bg-white ring-1 ring-black/10 transition-transform duration-200 ${
          checked ? "translate-x-[21px]" : "translate-x-0"
        }`}
      />
    </button>
  );
}
