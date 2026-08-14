"use client";

import { Fragment, useState } from "react";

import type { AssignmentOut, Shift, StaffManager } from "@/lib/api";
import type { RotaOrientation } from "@/components/rota-grid";
import { DAY_LABELS, compactTimeRange } from "@/lib/utils";

// The reference matrix: staff × 7 days, grouped by role, sticky name column so
// days scroll horizontally while names stay pinned, weekend headers accented,
// `·` for a day off and a dashed "Leave" span. Times only — no totals, per the
// spec. Cells stay editable (click to add/remove) so the whole-week grid keeps
// the builder's inline editing.
type ManagerRotaMatrixProps = {
  weekStart: string;
  shifts: Shift[];
  staff: StaffManager[];
  assignments: AssignmentOut[];
  leave: Record<string, number[]>;
  orientation: RotaOrientation;
  onAdd: (dayIndex: number, shiftId: string, staffId: string) => void;
  onRemove: (dayIndex: number, shiftId: string, staffId: string) => void;
};

function initial(name: string): string {
  return (name.trim()[0] ?? "?").toUpperCase();
}

function dateForDay(weekStart: string, dayIndex: number): number {
  const [y, m, d] = weekStart.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + dayIndex);
  return date.getUTCDate();
}

// Fri / Sat / Sun get the accent treatment in the header, matching the
// reference's weekend styling.
const WEEKEND = new Set([4, 5, 6]);

export default function ManagerRotaMatrix({
  weekStart,
  shifts,
  staff,
  assignments,
  leave,
  orientation,
  onAdd,
  onRemove,
}: ManagerRotaMatrixProps) {
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
        <button
          onClick={() => onRemove(dayIndex, shift.id, staffId)}
          title={`${shift.name} — tap to remove`}
          className="w-full truncate rounded-md bg-accent-light px-1 py-1.5 text-[11px] font-medium text-accent"
        >
          {compactTimeRange(shift.start_time, shift.end_time)}
        </button>
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
          className="cp-hairline w-full rounded-md bg-surface-card px-1 py-1 text-[11px] text-ink outline-none"
        >
          <option value="" disabled>
            Shift…
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
        <div className="cp-hairline w-full rounded-md border-dashed px-1 py-1.5 text-center text-[10px] text-ink-faint">
          Leave
        </div>
      );
    }
    return (
      <button
        onClick={() => setAdding({ staff: staffId, day: dayIndex })}
        disabled={shifts.length === 0}
        className="w-full py-1.5 text-center text-[13px] text-ink-faint hover:text-accent disabled:opacity-40"
      >
        ·
      </button>
    );
  }

  // Group active staff by their role (display-only grouping for the matrix).
  const roleGroups = new Map<string, StaffManager[]>();
  for (const s of activeStaff) {
    const list = roleGroups.get(s.role) ?? [];
    list.push(s);
    roleGroups.set(s.role, list);
  }

  const NameCell = ({ member }: { member: StaffManager }) => (
    <div className="flex items-center gap-2.5">
      <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-accent-light text-[11px] font-medium text-accent">
        {initial(member.name)}
      </span>
      <span className="flex items-center gap-1.5 whitespace-nowrap text-[13px] font-medium text-ink">
        {member.name.split(" ")[0]}
        {member.is_under_18 && (
          <span className="rounded bg-accent-light px-[5px] py-0.5 text-[8px] font-semibold text-accent">
            U18
          </span>
        )}
      </span>
    </div>
  );

  const DayHeader = ({ i }: { i: number }) => (
    <div className={WEEKEND.has(i) ? "text-accent" : ""}>
      <div className={`text-[11px] uppercase ${WEEKEND.has(i) ? "text-accent" : "text-ink-muted"}`}>
        {DAY_LABELS[i]}
      </div>
      <div className={`text-sm font-medium ${WEEKEND.has(i) ? "text-accent" : "text-ink"}`}>
        {dateForDay(weekStart, i)}
      </div>
    </div>
  );

  // Sticky first column: names pinned while days scroll horizontally.
  const stickyCol = "sticky left-0 z-[2] bg-surface-page";

  if (orientation === "staff-rows") {
    return (
      <div className="scrollbar-none overflow-x-auto">
        <table className="w-full min-w-[560px] border-separate border-spacing-0">
          <thead>
            <tr>
              <th
                className={`${stickyCol} z-[3] px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-faint`}
              >
                Staff
              </th>
              {DAY_LABELS.map((_, i) => (
                <th key={i} className="px-2 py-2.5 text-center">
                  <DayHeader i={i} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from(roleGroups.entries()).map(([role, members]) => (
              <Fragment key={`role-${role}`}>
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 pb-1.5 pt-3 text-left text-[12px] font-semibold text-ink-muted"
                  >
                    {role}
                  </td>
                </tr>
                {members.map((member) => (
                  <tr key={member.id}>
                    <td className={`${stickyCol} cp-hairline border-b border-l-0 border-r-0 border-t-0 px-3 py-2`}>
                      <NameCell member={member} />
                    </td>
                    {DAY_LABELS.map((_, di) => (
                      <td
                        key={di}
                        className="cp-hairline border-b border-l-0 border-r-0 border-t-0 px-1.5 py-1.5"
                      >
                        <Cell staffId={member.id} dayIndex={di} />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Transposed: days down the side, staff across the top.
  return (
    <div className="scrollbar-none overflow-x-auto">
      <table
        className="border-separate border-spacing-0"
        style={{ minWidth: `${120 + activeStaff.length * 96}px`, width: "100%" }}
      >
        <thead>
          <tr>
            <th
              className={`${stickyCol} z-[3] px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-faint`}
            >
              Day
            </th>
            {activeStaff.map((member) => (
              <th key={member.id} className="px-2 py-2.5 text-center">
                <div className="flex flex-col items-center gap-1">
                  <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-accent-light text-[11px] font-medium text-accent">
                    {initial(member.name)}
                  </span>
                  <span className="whitespace-nowrap text-[11px] font-medium text-ink">
                    {member.name.split(" ")[0]}
                  </span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAY_LABELS.map((_, di) => (
            <tr key={di}>
              <td className={`${stickyCol} cp-hairline border-b border-l-0 border-r-0 border-t-0 px-3 py-2`}>
                <DayHeader i={di} />
              </td>
              {activeStaff.map((member) => (
                <td
                  key={member.id}
                  className="cp-hairline border-b border-l-0 border-r-0 border-t-0 px-1.5 py-1.5"
                >
                  <Cell staffId={member.id} dayIndex={di} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
