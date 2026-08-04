function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

type TeamStatusCardProps = {
  name: string;
  role: string;
  submitted: boolean | null;
};

export default function TeamStatusCard({ name, role, submitted }: TeamStatusCardProps) {
  return (
    <div className="flex items-center gap-2.5 border-b border-surface-page py-2.5 last:border-0">
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-[8px] text-[10px] font-bold ${
          submitted ? "bg-accent-border text-accent" : "bg-surface-page text-ink-faint"
        }`}
      >
        {initials(name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-ink">{name}</div>
        <div className="text-[11px] text-ink-faint">{role}</div>
      </div>
      <div
        className={`shrink-0 rounded-md px-2.5 py-1 text-[11px] font-semibold ${
          submitted ? "bg-avail-bg text-avail-text" : "bg-warn-bg text-warn-text"
        }`}
      >
        {submitted ? "Submitted" : "Pending"}
      </div>
    </div>
  );
}
