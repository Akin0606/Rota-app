"use client";

import { useState } from "react";

import { DAY_LABELS } from "@/lib/utils";

import ManagerIcon from "./icon";

// One honest coverage line at the very top of the rota — Dan's principle 1.
// Replaces the old three stacked cards (uncovered / under-staffed / fill-state
// banner). Loud red when there's a gap, quiet green when every slot is covered;
// tap to expand the per-slot breakdown (red = uncovered, amber = short).
export type CoverageSlot = {
  key: string;
  shiftName: string;
  dayIndex: number;
  assigned: number;
  required: number;
  severity: "uncovered" | "short";
};

export default function CoverageSummary({ slots }: { slots: CoverageSlot[] }) {
  const [open, setOpen] = useState(false);

  if (slots.length === 0) {
    return (
      <div className="mb-3 rounded-[12px] border-[0.5px] border-avail-border bg-avail-bg px-3.5 py-[13px]">
        <div className="flex items-center gap-2.5">
          <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-avail-bg text-cp-green">
            <ManagerIcon name="circle-check" size={16} />
          </span>
          <div className="min-w-0">
            <div className="text-[13.5px] font-medium text-cp-green">All covered</div>
            <div className="mt-px text-[11.5px] text-ink-muted">Every shift this week is fully staffed</div>
          </div>
        </div>
      </div>
    );
  }

  const uncovered = slots.filter((s) => s.severity === "uncovered").length;
  const short = slots.length - uncovered;
  const subtitle =
    uncovered > 0 && short > 0
      ? `${uncovered} uncovered, ${short} short`
      : slots
          .slice(0, 3)
          .map((s) => `${DAY_LABELS[s.dayIndex]} ${s.shiftName}`)
          .join(", ") + (slots.length > 3 ? ` +${slots.length - 3}` : "");

  return (
    <div className="mb-3 rounded-[12px] border-[0.5px] border-cp-red/40 bg-cp-red-soft px-3.5 py-[13px]">
      <div className="flex items-center gap-2.5">
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-cp-red/15 text-cp-red">
          <ManagerIcon name="alert-triangle" size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-medium text-cp-red">
            {slots.length} gap{slots.length === 1 ? "" : "s"} to fill
          </div>
          <div className="mt-px truncate text-[11.5px] text-ink-muted">{subtitle}</div>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex shrink-0 items-center gap-1 text-[11px] text-ink-muted transition-[transform] active:scale-[0.97]"
        >
          {open ? "Hide" : "Details"}
          <ManagerIcon name={open ? "chevron-down" : "chevron-down"} size={12} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
        </button>
      </div>

      {open && (
        <div className="mt-[11px] flex flex-col gap-[7px] border-t border-cp-red/20 pt-[11px]">
          {slots.map((s) => (
            <div key={s.key} className="flex items-center gap-2 text-[12px]">
              <span
                className={`h-[7px] w-[7px] shrink-0 rounded-full ${
                  s.severity === "uncovered" ? "bg-cp-red" : "bg-cp-amber"
                }`}
              />
              <span className="text-ink">
                {s.shiftName} — {DAY_LABELS[s.dayIndex]}
                {s.severity === "uncovered" && (
                  <span className="ml-1.5 font-medium text-cp-red">uncovered</span>
                )}
              </span>
              <span className="ml-auto text-[11px] text-ink-muted">
                {s.assigned} of {s.required}
                {s.severity === "uncovered" && s.assigned === 0 ? " · nobody available" : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
