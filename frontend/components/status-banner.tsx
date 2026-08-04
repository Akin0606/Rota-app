const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  collecting: { label: "Awaiting Availability", bg: "bg-warn-bg", text: "text-warn-text", dot: "bg-warn-dot" },
  closed: { label: "Availability Closed", bg: "bg-unset-bg", text: "text-ink-muted", dot: "bg-ink-faint" },
  generated: { label: "Rota Generated", bg: "bg-accent-light", text: "text-accent", dot: "bg-accent" },
  confirmed: { label: "Confirmed", bg: "bg-avail-bg", text: "text-avail-text", dot: "bg-avail-border" },
  published: { label: "Published", bg: "bg-avail-bg", text: "text-avail-text", dot: "bg-avail-border" },
};

export default function StatusBanner({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.collecting;

  return (
    <div className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold ${config.bg} ${config.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </div>
  );
}
