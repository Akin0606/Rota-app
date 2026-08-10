"use client";

import { useState } from "react";

import type { AssignmentOut, Shift, StaffManager } from "@/lib/api";
import { DAY_LABELS, compactTimeRange } from "@/lib/utils";

export type RotaOrientation = "staff-rows" | "day-rows";

type RotaGridProps = {
  weekStart: string;
  shifts: Shift[];
  staff: StaffManager[];
  assignments: AssignmentOut[];
  orientation: RotaOrientation;
  // Approved leave overlapping this week: { staff_id: [day_index, ...] }.
  leave: Record<string, number[]>;
  onAdd: (dayIndex: number, shiftId: string, staffId: string) => void;
  onRemove: (dayIndex: number, shiftId: string, staffId: string) => void;
};

function dateForDay(weekStart: string, dayIndex: number): number {
  const [y, m, d] = weekStart.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + dayIndex);
  return date.getUTCDate();
}

export default function RotaGrid({
  weekStart,
  shifts,
  staff,
  assignments,
  orientation,
  leave,
  onAdd,
  onRemove,
}: RotaGridProps) {
  // Cell being edited, keyed by the staff + day it represents (orientation-agnostic).
  const [adding, setAdding] = useState<{ staff: string; day: number } | null>(null);
  const shiftsById = new Map(shifts.map((s) => [s.id, s]));
  const activeStaff = staff.filter((s) => s.is_active);

  function assignmentFor(staffId: string, dayIndex: number): AssignmentOut | undefined {
    return assignments.find((a) => a.staff_id === staffId && a.day_index === dayIndex);
  }

  function Cell({ staffId, dayIndex }: { staffId: string; dayIndex: number }) {
    const a = assignmentFor(staffId, dayIndex);
    const shift = a?.shift_id ? shiftsById.get(a.shift_id) : undefined;
    const isAdding = adding?.staff === staffId && adding?.day === dayIndex;

    if (shift && a) {
      return (
        <div
          className="flex items-start justify-between gap-1 rounded-md px-2 py-1.5 text-[11px] font-semibold leading-tight"
          style={{ background: `${shift.color}22`, color: shift.color }}
        >
          <span className="truncate">
            {shift.name} {compactTimeRange(shift.start_time, shift.end_time)}
          </span>
          <button
            onClick={() => onRemove(dayIndex, shift.id, staffId)}
            className="shrink-0 opacity-60 hover:opacity-100"
            aria-label="Remove shift"
          >
            ✕
          </button>
        </div>
      );
    }

    if (isAdding) {
      return (
        <select
          autoFocus
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) onAdd(dayIndex, e.target.value, staffId);
            setAdding(null);
          }}
          onBlur={() => setAdding(null)}
          className="w-full rounded-md border border-unset-border bg-surface-card px-1.5 py-1 text-[11px] outline-none"
        >
          <option value="" disabled>
            Choose shift…
          </option>
          {shifts.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} {compactTimeRange(s.start_time, s.end_time)}
            </option>
          ))}
        </select>
      );
    }

    if (leave[staffId]?.includes(dayIndex)) {
      return (
        <div className="w-full rounded-md bg-unset-bg py-1 text-center text-[11px] font-medium text-ink-faint">
          On leave
        </div>
      );
    }

    return (
      <button
        onClick={() => setAdding({ staff: staffId, day: dayIndex })}
        disabled={shifts.length === 0}
        className="w-full rounded-md border border-dashed border-unset-border py-1 text-center text-[11px] text-ink-faint hover:border-accent hover:text-accent disabled:opacity-40"
      >
        + Add
      </button>
    );
  }

  return (
    <div className="overflow-x-auto rounded-panel border border-hairline bg-surface-card">
      {orientation === "staff-rows" ? (
        <div className="min-w-[820px]">
          {/* Header: days across the top */}
          <div className="grid grid-cols-[110px_repeat(7,minmax(120px,1fr))] border-b border-surface-page">
            <div />
            {DAY_LABELS.map((d, i) => (
              <div key={d} className="border-l border-surface-page px-2 py-3.5 text-center">
                <div className="text-[11px] font-semibold uppercase text-ink-faint">{d}</div>
                <div className="text-base font-bold text-ink">{dateForDay(weekStart, i)}</div>
              </div>
            ))}
          </div>
          {activeStaff.map((member, ri) => (
            <div
              key={member.id}
              className={`grid grid-cols-[110px_repeat(7,minmax(120px,1fr))] ${ri < activeStaff.length - 1 ? "border-b border-surface-page" : ""}`}
            >
              <div className="flex flex-col justify-center p-3">
                <div className="truncate text-xs font-semibold text-ink-label">{member.name}</div>
                <div className="truncate text-[10px] text-ink-faint">{member.role}</div>
              </div>
              {DAY_LABELS.map((_, di) => (
                <div key={di} className="flex min-h-[52px] flex-col justify-center border-l border-surface-page p-1.5">
                  <Cell staffId={member.id} dayIndex={di} />
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ minWidth: `${140 + activeStaff.length * 130}px` }}>
          {/* Header: staff across the top */}
          <div
            className="grid border-b border-surface-page"
            style={{ gridTemplateColumns: `110px repeat(${activeStaff.length}, minmax(120px, 1fr))` }}
          >
            <div />
            {activeStaff.map((member) => (
              <div key={member.id} className="border-l border-surface-page px-2 py-3.5 text-center">
                <div className="truncate text-xs font-semibold text-ink-label">{member.name}</div>
                <div className="truncate text-[10px] text-ink-faint">{member.role}</div>
              </div>
            ))}
          </div>
          {DAY_LABELS.map((d, di) => (
            <div
              key={d}
              className={`grid ${di < DAY_LABELS.length - 1 ? "border-b border-surface-page" : ""}`}
              style={{ gridTemplateColumns: `110px repeat(${activeStaff.length}, minmax(120px, 1fr))` }}
            >
              <div className="flex items-center gap-1.5 p-3">
                <div className="text-[11px] font-semibold uppercase text-ink-faint">{d}</div>
                <div className="text-base font-bold text-ink">{dateForDay(weekStart, di)}</div>
              </div>
              {activeStaff.map((member) => (
                <div key={member.id} className="flex min-h-[52px] flex-col justify-center border-l border-surface-page p-1.5">
                  <Cell staffId={member.id} dayIndex={di} />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
