"use client";

import { useState } from "react";

import type { AssignmentOut, Shift, StaffManager } from "@/lib/api";
import { DAY_LABELS } from "@/lib/utils";

type RotaDayViewProps = {
  shifts: Shift[];
  staff: StaffManager[];
  assignments: AssignmentOut[];
  onAdd: (dayIndex: number, shiftId: string, staffId: string) => void;
  onRemove: (dayIndex: number, shiftId: string, staffId: string) => void;
};

export default function RotaDayView({ shifts, staff, assignments, onAdd, onRemove }: RotaDayViewProps) {
  const [day, setDay] = useState(0);
  const [addingShift, setAddingShift] = useState<string | null>(null);
  const staffById = new Map(staff.map((s) => [s.id, s]));

  function assignedFor(shiftId: string) {
    return assignments.filter((a) => a.day_index === day && a.shift_id === shiftId);
  }

  function availableFor() {
    const takenIds = new Set(assignments.filter((a) => a.day_index === day).map((a) => a.staff_id));
    return staff.filter((s) => s.is_active && !takenIds.has(s.id));
  }

  return (
    <div>
      <div className="mb-4 flex gap-1.5 overflow-x-auto">
        {DAY_LABELS.map((d, i) => (
          <button
            key={d}
            onClick={() => setDay(i)}
            className={`shrink-0 rounded-[10px] px-3.5 py-2 text-[13px] font-semibold ${
              day === i ? "bg-accent text-white" : "bg-surface-page text-ink-muted"
            }`}
          >
            {d}
          </button>
        ))}
      </div>

      {shifts.map((shift) => {
        const assigned = assignedFor(shift.id);
        const isAdding = addingShift === shift.id;
        const options = availableFor();
        return (
          <div key={shift.id} className="mb-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="h-3.5 w-1 rounded-sm" style={{ background: shift.color }} />
              <span className="text-[13px] font-semibold text-ink-label">{shift.name}</span>
              <span className="text-[11px] text-ink-faint">
                {shift.start_time} – {shift.end_time}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              {assigned.map((a) => {
                const member = a.staff_id ? staffById.get(a.staff_id) : undefined;
                if (!member) return null;
                return (
                  <div
                    key={a.id}
                    className="flex items-center gap-2.5 rounded-xl border border-hairline bg-surface-card p-3"
                  >
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-[10px] text-[11px] font-bold"
                      style={{ background: `${shift.color}22`, color: shift.color }}
                    >
                      {member.name
                        .split(" ")
                        .map((w) => w[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-ink">{member.name}</div>
                      <div className="text-[11px] text-ink-faint">{member.role}</div>
                    </div>
                    <button onClick={() => onRemove(day, shift.id, a.staff_id!)} className="p-1 text-xs text-ink-faint">
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
                    if (e.target.value) onAdd(day, shift.id, e.target.value);
                    setAddingShift(null);
                  }}
                  onBlur={() => setAddingShift(null)}
                  className="rounded-[10px] border border-unset-border px-3 py-2.5 text-sm outline-none"
                >
                  <option value="" disabled>
                    Choose staff…
                  </option>
                  {options.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              ) : (
                <button
                  onClick={() => setAddingShift(shift.id)}
                  disabled={options.length === 0}
                  className="rounded-[10px] border border-dashed border-unset-border py-2.5 text-center text-[13px] text-ink-faint disabled:opacity-40"
                >
                  + Add staff
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
