"use client";

import { useState } from "react";

import type { AssignmentOut, Shift, StaffManager } from "@/lib/api";
import { DAY_LABELS, compactTimeRange } from "@/lib/utils";

import ManagerIcon from "./icon";

// The reference "Rota review" groups by role → daypart. Our coverage model is
// per-shift (min_staff), and staff carry a single role string (roles-as-entities
// is a later phase), so this groups by shift/daypart — the unit gaps actually
// live on — and surfaces role + U18 as chip labels. Same reference card/chip
// visuals; honest to the data.
type ManagerRotaReviewProps = {
  weekStart: string;
  shifts: Shift[];
  staff: StaffManager[];
  assignments: AssignmentOut[];
  leave: Record<string, number[]>;
  selectedDay: number;
  onSelectDay: (day: number) => void;
  onAdd: (dayIndex: number, shiftId: string, staffId: string) => void;
  onRemove: (dayIndex: number, shiftId: string, staffId: string) => void;
  onGap?: (shiftId: string, dayIndex: number) => void;
};

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function dateForDay(weekStart: string, dayIndex: number): Date {
  const [y, m, d] = weekStart.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + dayIndex);
  return date;
}

export default function ManagerRotaReview({
  weekStart,
  shifts,
  staff,
  assignments,
  leave,
  selectedDay,
  onSelectDay,
  onAdd,
  onRemove,
  onGap,
}: ManagerRotaReviewProps) {
  const [addingShift, setAddingShift] = useState<string | null>(null);
  const staffById = new Map(staff.map((s) => [s.id, s]));

  function assignedOn(dayIndex: number, shiftId: string): AssignmentOut[] {
    return assignments.filter(
      (a) => a.day_index === dayIndex && a.shift_id === shiftId && a.staff_id,
    );
  }

  // A day has a gap if any shift is below its min_staff that day.
  function gapCount(dayIndex: number): number {
    return shifts.reduce(
      (sum, sh) => sum + Math.max(0, sh.min_staff - assignedOn(dayIndex, sh.id).length),
      0,
    );
  }

  const onLeaveToday = staff.filter((s) => leave[s.id]?.includes(selectedDay));
  const assignedToday = assignments.filter(
    (a) => a.day_index === selectedDay && a.staff_id,
  ).length;
  const gapsToday = gapCount(selectedDay);

  const dayDate = dateForDay(weekStart, selectedDay);
  const dayTitle = dayDate.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

  // Staff pickable for a shift: active, not already on that day, not on leave.
  function optionsFor(dayIndex: number): StaffManager[] {
    const taken = new Set(
      assignments.filter((a) => a.day_index === dayIndex && a.staff_id).map((a) => a.staff_id),
    );
    return staff.filter((s) => s.is_active && !taken.has(s.id) && !leave[s.id]?.includes(dayIndex));
  }

  return (
    <div>
      {/* Week strip */}
      <div className="scrollbar-none mb-4 flex gap-1.5 overflow-x-auto">
        {DAY_LABELS.map((d, i) => {
          const active = i === selectedDay;
          const gap = gapCount(i) > 0;
          return (
            <button
              key={d}
              onClick={() => onSelectDay(i)}
              className={`min-w-[46px] flex-1 rounded-[10px] border-[0.5px] px-1 py-[9px] text-center transition-colors ${
                active ? "border-accent bg-accent-light" : "border-hairline bg-surface-card"
              }`}
            >
              <div className={`text-[11px] uppercase ${active ? "text-accent" : "text-ink-muted"}`}>{d}</div>
              <div className="my-0.5 text-[15px] font-medium text-ink">{dateForDay(weekStart, i).getUTCDate()}</div>
              <div className={`mx-auto h-1.5 w-1.5 rounded-full ${gap ? "bg-cp-amber" : "bg-cp-green"}`} />
            </button>
          );
        })}
      </div>

      {/* Selected-day header */}
      <div className="mb-0.5 text-[15px] font-medium text-ink">{dayTitle}</div>
      <div className="mb-4 text-xs text-ink-muted">
        {assignedToday} assigned · {gapsToday} gap{gapsToday === 1 ? "" : "s"} · {onLeaveToday.length} on leave
      </div>

      {/* One card per shift (daypart) */}
      {shifts.map((shift) => {
        const assigned = assignedOn(selectedDay, shift.id);
        const gap = Math.max(0, shift.min_staff - assigned.length);
        const isAdding = addingShift === shift.id;
        return (
          <div key={shift.id} className="mb-2 cp-hairline rounded-[11px] bg-surface-card px-3.5 py-3">
            <div className="mb-2.5 flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: shift.color }} />
              <span className="text-[13px] font-medium text-ink-muted">{shift.name}</span>
              <span className="text-[12px] text-ink-faint">
                {compactTimeRange(shift.start_time, shift.end_time)}
              </span>
              <span className="ml-auto text-[11px] text-ink-faint">{shift.min_staff} needed</span>
            </div>

            <div className="flex flex-wrap gap-[7px]">
              {assigned.map((a) => {
                const member = a.staff_id ? staffById.get(a.staff_id) : undefined;
                if (!member) return null;
                return (
                  <div
                    key={a.id}
                    className="flex items-center gap-[7px] rounded-lg bg-cp-icon py-1.5 pl-1.5 pr-2 text-xs font-medium text-ink"
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-light text-[10px] font-medium text-accent">
                      {initials(member.name)[0]}
                    </span>
                    {member.name.split(" ")[0]}
                    {member.is_under_18 && (
                      <span className="rounded bg-accent-light px-[5px] py-0.5 text-[8px] font-semibold text-accent">
                        U18
                      </span>
                    )}
                    <button
                      onClick={() => onRemove(selectedDay, shift.id, member.id)}
                      aria-label={`Remove ${member.name}`}
                      className="text-ink-faint hover:!text-cp-red"
                    >
                      <ManagerIcon name="x" size={13} />
                    </button>
                  </div>
                );
              })}

              {gap > 0 && (
                <button
                  onClick={() => onGap?.(shift.id, selectedDay)}
                  className="flex items-center gap-[7px] rounded-lg border-[0.5px] border-dashed border-cp-amber/40 bg-cp-amber-soft px-[11px] py-[7px] text-xs font-medium text-cp-amber"
                >
                  <ManagerIcon name="plus" size={13} /> Needs {gap} more
                </button>
              )}

              {isAdding ? (
                <select
                  autoFocus
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) onAdd(selectedDay, shift.id, e.target.value);
                    setAddingShift(null);
                  }}
                  onBlur={() => setAddingShift(null)}
                  className="cp-hairline rounded-lg bg-surface-card px-2.5 py-1.5 text-xs text-ink outline-none"
                >
                  <option value="" disabled>
                    Choose staff…
                  </option>
                  {optionsFor(selectedDay).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              ) : (
                <button
                  onClick={() => setAddingShift(shift.id)}
                  className="flex items-center gap-1.5 rounded-lg border-[0.5px] border-dashed border-hairline px-[11px] py-[7px] text-xs text-ink-faint hover:!text-accent"
                >
                  <ManagerIcon name="plus" size={13} /> Add
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* On-leave today — not tied to a shift, so shown as its own row */}
      {onLeaveToday.length > 0 && (
        <div className="mt-3">
          <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-ink-faint">
            On leave today
          </div>
          <div className="flex flex-wrap gap-[7px]">
            {onLeaveToday.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-[7px] rounded-lg border-[0.5px] border-dashed border-hairline px-[11px] py-1.5 text-xs text-ink-faint"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cp-icon text-[10px] font-medium text-ink-faint">
                  {initials(s.name)[0]}
                </span>
                {s.name.split(" ")[0]} · on leave
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
