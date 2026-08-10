// Small label above a large number, with an optional dimmer suffix ("17 of
// 28", "28.5 hrs"). Used by the hours hero and the time-off allowance strip.
type MetricCardProps = {
  label: string;
  value: React.ReactNode;
  suffix?: React.ReactNode;
  accent?: boolean;
  className?: string;
};

export default function MetricCard({ label, value, suffix, accent = false, className = "" }: MetricCardProps) {
  return (
    <div
      className={`cp-hairline flex-1 rounded-cp-panel bg-surface-card px-4 py-3.5 transition-all duration-[350ms] ${className}`}
    >
      <div className="mb-1.5 text-[11px] text-ink-muted transition-colors duration-[350ms]">{label}</div>
      <div
        className={`text-[22px] font-medium tracking-[-0.5px] ${accent ? "text-accent" : "text-ink"}`}
      >
        {value}
        {suffix && (
          <span className="ml-[3px] text-[12px] font-normal text-ink-faint transition-colors duration-[350ms]">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
