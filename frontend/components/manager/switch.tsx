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
      <span
        className={`absolute left-[2.5px] top-[2.5px] h-[19px] w-[19px] rounded-full bg-white transition-transform duration-200 ${
          checked ? "translate-x-[21px]" : "translate-x-0"
        }`}
      />
    </button>
  );
}
