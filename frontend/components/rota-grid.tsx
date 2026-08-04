"use client";

import { useState } from "react";

import type { AssignmentOut, Shift, StaffManager } from "@/lib/api";
import { DAY_LABELS } from "@/lib/utils";

type RotaGridProps = {
  weekStart: string;
  shifts: Shift[];
  staff: StaffManager[];
  assignments: AssignmentOut[];
  onAdd: (dayIndex: number, shiftId: string, staffId: string) => void;
  onRemove: (dayIndex: number, shiftId: string, staffId: string) => void;
};

function dateForDay(weekStart: string, dayIndex: number): number {
  const [y, m, d] = weekStart.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + dayIndex);
  return date.getUTCDate();
}

export default function RotaGrid({ weekStart, shifts, staff, assignments, onAdd, onRemove }: RotaGridProps) {
  const [addingCell, setAddingCell] = useState<{ day: number; shift: string } | null>(null);
  const staffById = new Map(staff.map((s) => [s.id, s]));

  function assignedFor(day: number, shiftId: string) {
    return assignments.filter((a) => a.day_index === day && a.shift_id === shiftId);
  }

  function availableFor(day: number) {
    const takenIds = new Set(assignments.filter((a) => a.day_index === day).map((a) => a.staff_id));
    return staff.filter((s) => s.is_active && !takenIds.has(s.id));
  }

  return (
    <div className="overflow-x-auto rounded-panel border border-hairline bg-surface-card">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-[110px_repeat(7,1fr)] border-b border-surface-page">
          <div />
          {DAY_LABELS.map((d, i) => (
            <div key={d} className="border-l border-surface-page px-2 py-3.5 text-center">
              <div className="text-[11px] font-semibold uppercase text-ink-faint">{d}</div>
              <div className="text-base font-bold text-ink">{dateForDay(weekStart, i)}</div>
            </div>
          ))}
        </div>

        {shifts.map((shift, si) => (
          <div
            key={shift.id}
            className={`grid grid-cols-[110px_repeat(7,1fr)] ${si < shifts.length - 1 ? "border-b border-surface-page" : ""}`}
          >
            <div className="flex items-start gap-1.5 p-3">
              <span className="mt-1 h-3.5 w-1 shrink-0 rounded-sm" style={{ background: shift.color }} />
              <div>
                <div className="text-xs font-semibold text-ink-label">{shift.name}</div>
                <div className="text-[10px] text-ink-faint">
                  {shift.start_time} – {shift.end_time}
                </div>
              </div>
            </div>
            {DAY_LABELS.map((_, di) => {
              const cellAssignments = assignedFor(di, shift.id);
              const isAdding = addingCell?.day === di && addingCell?.shift === shift.id;
              const options = availableFor(di);
              return (
                <div
                  key={di}
                  className="flex min-h-[64px] flex-col gap-1.5 border-l border-surface-page p-1.5"
                >
                  {cellAssignments.map((a) => {
                    const member = staffById.get(a.staff_id);
                    if (!member) return null;
                    const [first, last] = member.name.split(" ");
                    return (
                      <div
                        key={a.id}
                        className="flex items-center justify-between gap-1 rounded-md px-2 py-1.5 text-[11px] font-semibold"
                        style={{ background: `${shift.color}22`, color: shift.color }}
                      >
                        <span className="truncate">
                          {first} {last?.[0]}.
                        </span>
                        <button
                          onClick={() => onRemove(di, shift.id, a.staff_id)}
                          className="shrink-0 opacity-60 hover:opacity-100"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                  {isAdding ? (
                    <select
                      autoFocus
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) onAdd(di, shift.id, e.target.value);
                        setAddingCell(null);
                      }}
                      onBlur={() => setAddingCell(null)}
                      className="rounded-md border border-unset-border px-1.5 py-1 text-[11px] outline-none"
                    >
                      <option value="" disabled>
                        Choose…
                      </option>
                      {options.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <button
                      onClick={() => setAddingCell({ day: di, shift: shift.id })}
                      disabled={options.length === 0}
                      className="rounded-md border border-dashed border-unset-border py-1 text-center text-[11px] text-ink-faint disabled:opacity-40"
                    >
                      + Add
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
