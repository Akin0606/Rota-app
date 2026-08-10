// Thin accent fill on a track. Used for availability completion (4px, with a
// count to its right) and hours-to-target (6px, with labels underneath).
type ProgressBarProps = {
  /** 0–1. Clamped, so a week over target still renders a full bar. */
  value: number;
  size?: "sm" | "md";
  label?: React.ReactNode;
  className?: string;
};

export default function ProgressBar({ value, size = "sm", label, className = "" }: ProgressBarProps) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  const track = size === "sm" ? "h-1 bg-cp-icon" : "h-1.5 bg-cp-track";

  const bar = (
    <div
      className={`flex-1 overflow-hidden rounded-full transition-colors duration-[350ms] ${track}`}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );

  if (!label) return <div className={className}>{bar}</div>;

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {bar}
      <div className="min-w-[74px] text-right text-[11px] text-ink-muted transition-colors duration-[350ms]">
        {label}
      </div>
    </div>
  );
}
