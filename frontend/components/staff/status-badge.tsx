import Icon, { IconName } from "./icon";

// The green approved / amber pending pill, plus the neutral and accent tones
// the hub tiles use for their counts.
export type StatusTone = "green" | "amber" | "neutral" | "accent";

const TONES: Record<StatusTone, string> = {
  green: "bg-cp-green-soft text-cp-green",
  amber: "bg-cp-amber-soft text-cp-amber",
  neutral: "bg-cp-icon text-ink-muted",
  accent: "bg-accent-light text-accent",
};

type StatusBadgeProps = {
  children: React.ReactNode;
  tone?: StatusTone;
  icon?: IconName;
  className?: string;
};

export default function StatusBadge({ children, tone = "neutral", icon, className = "" }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-cp-chip px-2.5 py-1 text-[11px] font-medium transition-colors duration-[350ms] ${TONES[tone]} ${className}`}
    >
      {icon && <Icon name={icon} size={13} />}
      {children}
    </span>
  );
}
