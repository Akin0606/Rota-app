import { DAY_LABELS } from "@/lib/utils";

// The day-of-week + date-number stack. Two variants because the design uses
// the same pairing two ways: as a bordered 40px node on the My shifts
// timeline, and as bare stacked text on the Drop/give/swap and Hours rows.
type CalendarBlockProps = {
  dayIndex: number;
  dateNumber: number;
  variant?: "node" | "plain";
  /** Node variant only — accent-tints the block for a day that's worked. */
  active?: boolean;
  className?: string;
};

export default function CalendarBlock({
  dayIndex,
  dateNumber,
  variant = "plain",
  active = false,
  className = "",
}: CalendarBlockProps) {
  const dow = DAY_LABELS[dayIndex] ?? "";

  if (variant === "node") {
    return (
      <div
        className={`flex h-10 w-10 flex-col items-center justify-center rounded-cp-control transition-all duration-[350ms] ${
          active ? "border-[0.5px] border-[rgba(255,77,0,0.3)] bg-accent-light" : "cp-hairline bg-surface-card"
        } ${className}`}
      >
        <span className="text-[9px] uppercase leading-none tracking-[0.05em] text-ink-muted">{dow}</span>
        <span
          className={`text-[15px] font-medium leading-[1.3] tracking-[-0.3px] ${
            active ? "text-accent" : "text-ink"
          }`}
        >
          {dateNumber}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex min-w-[42px] flex-col items-center ${className}`}>
      <span className="text-[11px] uppercase tracking-[0.05em] text-ink-muted transition-colors duration-[350ms]">
        {dow}
      </span>
      <span className="text-[20px] font-medium tracking-[-0.5px] text-ink">{dateNumber}</span>
    </div>
  );
}
