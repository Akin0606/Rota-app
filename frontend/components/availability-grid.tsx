"use client";

import type { Shift } from "@/lib/api";
import { DAY_LABELS } from "@/lib/utils";

const STATUS_STYLE: Record<number, { bg: string; border: string; text: string; icon: string }> = {
  0: { bg: "bg-unset-bg", border: "border-unset-border", text: "text-unset-text", icon: "—" },
  1: { bg: "bg-avail-bg", border: "border-avail-border", text: "text-avail-text", icon: "✓" },
  2: { bg: "bg-unavail-bg", border: "border-unavail-border", text: "text-unavail-text", icon: "✕" },
  3: { bg: "bg-preferred-bg", border: "border-preferred-border", text: "text-preferred-text", icon: "★" },
};

const LEGEND: Array<{ status: number; label: string }> = [
  { status: 1, label: "Available" },
  { status: 2, label: "Unavailable" },
  { status: 3, label: "Preferred" },
  { status: 0, label: "Tap to set" },
];

type AvailabilityGridProps = {
  shifts: Shift[];
  value: Record<number, Record<string, number>>;
  onToggle: (dayIndex: number, shiftId: string) => void;
};

export default function AvailabilityGrid({ shifts, value, onToggle }: AvailabilityGridProps) {
  const gridCols = `52px repeat(${shifts.length}, 1fr)`;

  return (
    <div>
      <div className="grid gap-1 pb-1.5" style={{ gridTemplateColumns: gridCols }}>
        <div />
        {shifts.map((shift) => (
          <div
            key={shift.id}
            className="truncate text-center text-[10px] font-medium uppercase tracking-wide text-ink-faint"
          >
            {shift.name}
          </div>
        ))}
      </div>

      {DAY_LABELS.map((day, dayIndex) => (
        <div
          key={day}
          className="mb-1 grid items-center gap-1"
          style={{ gridTemplateColumns: gridCols }}
        >
          <div className="text-[13px] font-medium text-ink-label">{day}</div>
          {shifts.map((shift) => {
            const status = value[dayIndex]?.[shift.id] ?? 0;
            const style = STATUS_STYLE[status];
            return (
              <button
                key={shift.id}
                type="button"
                onClick={() => onToggle(dayIndex, shift.id)}
                className={`flex h-11 select-none items-center justify-center rounded-[10px] border-2 font-medium transition-colors ${style.bg} ${style.border} ${style.text} ${status === 0 ? "text-xs" : "text-base"}`}
              >
                {style.icon}
              </button>
            );
          })}
        </div>
      ))}

      <div className="mt-4 flex flex-wrap justify-center gap-3">
        {LEGEND.map(({ status, label }) => {
          const style = STATUS_STYLE[status];
          return (
            <div key={label} className="flex items-center gap-1 text-[11px] text-ink-muted">
              <span className={`h-2.5 w-2.5 rounded-[3px] border-[1.5px] ${style.bg} ${style.border}`} />
              {label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
