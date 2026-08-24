"use client";

import { useState, type ReactNode } from "react";

import type { AssignmentOut, Shift, StaffManager } from "@/lib/api";
import {
  DAY_LABELS,
  compactTimeRange,
  formatHoursTotal,
  sumShiftHours,
} from "@/lib/utils";

import BottomSheet from "./bottom-sheet";
import ManagerIcon from "./icon";

// The reference "Rota review" groups by role → daypart. Our coverage model is
// per-shift (min_staff), and staff carry a single role string (roles-as-entities
// is a later phase), so this groups by shift/daypart — the unit gaps actually
// live on — and surfaces role + U18 as chip labels. Same reference card/chip
// visuals; honest to the data.
//
// B6: each assignment chip shows the *real per-day* time (assignment.start_time
// ?? shift.start_time) on its face; colleagues, exact hours, weekly total and
// the remove action live on tap (a detail sheet). B4: a shift with nobody at all
// shows a loud red "uncovered" chip; a shift merely short shows a quiet amber
// "needs N more".
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
  // The page's "post as open" control for a gap slot — rendered under a short
  // shift so posting is reachable from the day view (B4 mockup d).
  renderGapActions?: (shiftId: string, dayIndex: number) => ReactNode;
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
  renderGapActions,
}: ManagerRotaReviewProps) {
  const [addingShift, setAddingShift] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ staffId: string; shiftId: string } | null>(null);
  const staffById = new Map(staff.map((s) => [s.id, s]));
  const shiftsById = new Map(shifts.map((s) => [s.id, s]));

  function assignedOn(dayIndex: number, shiftId: string): AssignmentOut[] {
    return assignments.filter(
      (a) => a.day_index === dayIndex && a.shift_id === shiftId && a.staff_id,
    );
  }

  // Real per-day times for an assignment, falling back to the shift-level time.
  function timesFor(a: AssignmentOut, shift: Shift): { start: string; end: string } {
    return { start: a.start_time ?? shift.start_time, end: a.end_time ?? shift.end_time };
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

  // --- Tap-detail sheet -----------------------------------------------------
  const detailMember = detail ? staffById.get(detail.staffId) : null;
  const detailShift = detail ? shiftsById.get(detail.shiftId) : null;
  const detailAssignment =
    detail && detailShift
      ? assignedOn(selectedDay, detail.shiftId).find((a) => a.staff_id === detail.staffId)
      : null;
  const detailColleagues =
    detail && detailShift
      ? assignedOn(selectedDay, detail.shiftId)
          .filter((a) => a.staff_id !== detail.staffId)
          .map((a) => (a.staff_id ? staffById.get(a.staff_id) : undefined))
          .filter((m): m is StaffManager => Boolean(m))
      : [];
  // Weekly running total for this member (real per-day times).
  const detailWeek =
    detail && detailMember
      ? sumShiftHours(
          assignments
            .filter((a) => a.staff_id === detail.staffId && a.shift_id)
            .flatMap((a) => {
              const sh = shiftsById.get(a.shift_id as string);
              if (!sh) return [];
              const t = timesFor(a, sh);
              return [{ start_time: t.start, end_time: t.end }];
            }),
        )
      : { hours: 0, unmeasured: 0 };

  return (
    <div>
      {/* Week strip */}
      <div className="scrollbar-none mb-4 flex gap-1.5 overflow-x-auto">
        {DAY_LABELS.map((d, i) => {
          const active = i === selectedDay;
          const dayAssigned = assignments.filter((a) => a.day_index === i && a.staff_id).length;
          const uncoveredDot = shifts.some((sh) => assignedOn(i, sh.id).length === 0 && sh.min_staff > 0);
          const gap = gapCount(i) > 0;
          const dot = uncoveredDot ? "bg-cp-red" : gap ? "bg-cp-amber" : "bg-cp-green";
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
              <div className={`mx-auto h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
              <span className="sr-only">{dayAssigned} assigned</span>
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
        const uncovered = gap > 0 && assigned.length === 0;
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
                const t = timesFor(a, shift);
                return (
                  <button
                    key={a.id}
                    onClick={() => setDetail({ staffId: member.id, shiftId: shift.id })}
                    className="flex items-center gap-[7px] rounded-lg bg-cp-icon py-1.5 pl-1.5 pr-2.5 text-xs font-medium text-ink transition-[transform] active:scale-[0.97]"
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
                    <span className="font-normal text-ink-muted">{compactTimeRange(t.start, t.end)}</span>
                  </button>
                );
              })}

              {uncovered ? (
                <span className="flex items-center gap-[7px] rounded-lg border-[0.5px] border-cp-red/40 bg-cp-red-soft px-[11px] py-[7px] text-xs font-medium text-cp-red">
                  <ManagerIcon name="alert-triangle" size={13} /> Uncovered · nobody available
                </span>
              ) : gap > 0 ? (
                <span className="flex items-center gap-[7px] rounded-lg border-[0.5px] border-dashed border-cp-amber/40 bg-cp-amber-soft px-[11px] py-[7px] text-xs font-medium text-cp-amber">
                  <ManagerIcon name="plus" size={13} /> Needs {gap} more
                </span>
              ) : null}

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
                  className="flex items-center gap-1.5 rounded-lg border-[0.5px] border-dashed border-hairline px-[11px] py-[7px] text-xs text-ink-faint transition-[transform] hover:!text-accent active:scale-[0.97]"
                >
                  <ManagerIcon name="plus" size={13} /> Add
                </button>
              )}
            </div>

            {/* Post-as-open control from the page, only when this slot is short */}
            {gap > 0 && renderGapActions && (
              <div className="mt-2">{renderGapActions(shift.id, selectedDay)}</div>
            )}
          </div>
        );
      })}

      {/* On-leave today — quiet, at the bottom, dashed and dimmed (B4) */}
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

      {/* Per-assignment detail — colleagues, exact hours, weekly total, remove */}
      <BottomSheet
        open={Boolean(detail && detailMember && detailShift)}
        onClose={() => setDetail(null)}
        title={detailMember ? detailMember.name.split(" ")[0] : ""}
        subtitle={detailMember?.role}
        avatarLabel={detailMember ? initials(detailMember.name)[0] : undefined}
        footer={
          <>
            <button
              onClick={() => setDetail(null)}
              className="flex-1 rounded-[11px] border-[0.5px] border-hairline py-3 text-[13px] font-medium text-ink-muted"
            >
              Close
            </button>
            <button
              onClick={() => {
                if (detail && detailShift) onRemove(selectedDay, detailShift.id, detail.staffId);
                setDetail(null);
              }}
              className="flex-1 rounded-[11px] bg-cp-red-soft py-3 text-[13px] font-medium text-cp-red"
            >
              Remove from shift
            </button>
          </>
        }
      >
        {detailShift && detailAssignment && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: detailShift.color }} />
              <span className="text-[14px] font-medium text-ink">{detailShift.name}</span>
              <span className="text-[13px] text-ink-muted">
                {compactTimeRange(
                  detailAssignment.start_time ?? detailShift.start_time,
                  detailAssignment.end_time ?? detailShift.end_time,
                )}
              </span>
              {detailMember?.is_under_18 && (
                <span className="rounded bg-accent-light px-[5px] py-0.5 text-[8px] font-semibold text-accent">
                  U18
                </span>
              )}
            </div>

            <div className="flex items-center justify-between rounded-[11px] bg-surface-subtle px-3.5 py-3">
              <span className="text-[12px] text-ink-muted">This week so far</span>
              <span className="text-[14px] font-medium text-ink">
                {formatHoursTotal(detailWeek.hours, detailWeek.unmeasured)}
              </span>
            </div>

            <div>
              <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">
                Also on this shift
              </div>
              {detailColleagues.length === 0 ? (
                <div className="text-[12.5px] text-ink-muted">No one else on this shift today.</div>
              ) : (
                <div className="flex flex-wrap gap-[7px]">
                  {detailColleagues.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center gap-[7px] rounded-lg bg-cp-icon py-1.5 pl-1.5 pr-2.5 text-xs font-medium text-ink"
                    >
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-light text-[10px] font-medium text-accent">
                        {initials(m.name)[0]}
                      </span>
                      {m.name.split(" ")[0]}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
