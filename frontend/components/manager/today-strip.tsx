"use client";

import Link from "next/link";

import type { AssignmentOut, RotaSummary, Shift, StaffManager } from "@/lib/api";
import {
  compactTimeRange,
  londonMinutesNow,
  shiftPhase,
  shortClock,
  todayIndexInWeek,
} from "@/lib/utils";

import ManagerIcon from "./icon";

// H2 — the present tense, and the single change that turns a status page into a
// home. A landlord opens this app far more often to answer "who's on tonight,
// is my cover alright?" than "what's the state of next week's availability
// window". Everything else on Home is planning; this block is now.
//
// It is the published rota's own roster, not a time clock. Rotally has no
// clock-in, so "on now" here means "rostered and inside their hours" — never
// "punched in". Saying otherwise would be a lie the data can't back.
//
// The red gap state follows the same honesty discipline as conflicts-when->0:
// it appears only on a genuine hole in TODAY, and is silent when today's
// covered. A home that shouts every visit stops being read.

type ShiftRow = {
  key: string;
  shift: Shift;
  start: string;
  end: string;
  phase: "upcoming" | "now" | "done" | null;
  /** True when this row is yesterday's shift, still running past midnight. */
  fromYesterday: boolean;
  people: { id: string; name: string; role: string; under18: boolean; end: string }[];
};

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function PersonChip({
  name,
  under18,
  endTime,
}: {
  name: string;
  under18: boolean;
  endTime: string;
}) {
  return (
    <span className="flex items-center gap-[7px] rounded-cp-slot border-[0.5px] border-hairline bg-surface-subtle py-[5px] pl-[5px] pr-2.5 text-[12.5px] font-medium text-ink">
      <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-cp-icon text-[10px] font-medium text-ink-muted">
        {initials(name)}
      </span>
      {name.split(" ")[0]}
      {under18 && (
        <>
          <span className="rounded-cp-badge bg-cp-icon px-1 py-px text-[8px] font-medium tracking-[0.03em] text-ink-muted">
            U18
          </span>
          {/* Under-18s can't work past 10pm, so their finish is the thing a
              manager actually needs off this card. */}
          <span className="text-[10px] font-normal text-ink-muted">off by {endTime}</span>
        </>
      )}
    </span>
  );
}

export default function TodayStrip({
  period,
  rota,
  shifts,
  staff,
}: {
  /** The period whose week contains today — null when there isn't one. */
  period: { week_start: string; status: string } | null;
  /** That period's rota. Null when it hasn't been built. */
  rota: RotaSummary | null;
  shifts: Shift[];
  staff: StaffManager[];
}) {
  const isLive = period?.status === "published" || period?.status === "confirmed";
  const todayIndex = period ? todayIndexInWeek(period.week_start) : null;

  // Nothing published for the week we're in — say so plainly rather than
  // inventing a line-up. A draft rota is deliberately not shown here either:
  // it isn't what staff are working from, and showing it as "tonight" would
  // make an unpublished rota look live.
  if (!period || !isLive || !rota || todayIndex === null) {
    return (
      <div className="mb-3 rounded-panel border-[0.5px] border-dashed border-hairline bg-surface-subtle px-4 py-[14px]">
        <div className="mb-2 flex items-center gap-[7px] text-[10.5px] uppercase tracking-[0.08em] text-ink-faint">
          <ManagerIcon name="moon-stars" size={14} />
          Today
        </div>
        <div className="text-[12.5px] text-ink-muted">
          {period && !isLive
            ? "This week's rota isn't published yet — once it is, today's line-up shows up here."
            : "No rota published yet — build one and today's line-up shows up here."}
        </div>
      </div>
    );
  }

  const nowMinutes = londonMinutesNow();
  const shiftsById = new Map(shifts.map((s) => [s.id, s]));
  const staffById = new Map(staff.map((s) => [s.id, s]));

  function rowsFor(dayIndex: number, fromYesterday: boolean): ShiftRow[] {
    const byShift = new Map<string, AssignmentOut[]>();
    for (const a of rota!.assignments) {
      if (a.day_index !== dayIndex || !a.shift_id || !a.staff_id) continue;
      const list = byShift.get(a.shift_id) ?? [];
      list.push(a);
      byShift.set(a.shift_id, list);
    }
    const rows: ShiftRow[] = [];
    for (const [shiftId, list] of Array.from(byShift.entries())) {
      const shift = shiftsById.get(shiftId);
      if (!shift) continue;
      // Per-day times resolved by the backend onto each assignment; the
      // shift-level value is only the fallback for an unmigrated shift.
      const start = list[0].start_time ?? shift.start_time;
      const end = list[0].end_time ?? shift.end_time;
      rows.push({
        key: `${fromYesterday ? "y" : "t"}-${shiftId}`,
        shift,
        start,
        end,
        phase: shiftPhase(start, end, nowMinutes, fromYesterday ? 1 : 0),
        fromYesterday,
        people: list
          .map((a) => {
            const m = staffById.get(a.staff_id as string);
            return m
              ? {
                  id: m.id,
                  name: m.name,
                  role: m.role,
                  under18: m.is_under_18,
                  end: shortClock(a.end_time ?? end),
                }
              : null;
          })
          .filter((p): p is ShiftRow["people"][number] => p !== null),
      });
    }
    return rows.sort((a, b) => a.shift.sort_order - b.shift.sort_order);
  }

  const todayRows = rowsFor(todayIndex, false);
  // A shift that started yesterday and is still running is what's actually on
  // at 00:30 — today's identically-timed shift hasn't begun. Only checked when
  // yesterday is inside the same week; a Monday-small-hours view misses Sunday's
  // late shift, which lives in the previous period and isn't worth a second
  // fetch on every Home load.
  const carriedOver =
    todayIndex > 0 ? rowsFor(todayIndex - 1, true).filter((r) => r.phase === "now") : [];

  const rows = [...carriedOver, ...todayRows];

  // Today's genuine holes, from the same uncovered/under_covered the rota page
  // treats as the single source of truth for a gap.
  const gapSlots = [
    ...rota.uncovered
      .filter((u) => u.day_index === todayIndex)
      .map((u) => ({ shiftId: u.shift_id, short: 0 })),
    ...rota.under_covered
      .filter((u) => u.day_index === todayIndex)
      .map((u) => ({ shiftId: u.shift_id, short: Math.max(0, u.required - u.assigned) })),
  ];
  const hasGap = gapSlots.length > 0;
  const gapNames = gapSlots
    .map((g) => shiftsById.get(g.shiftId)?.name)
    .filter(Boolean)
    .join(", ");

  return (
    <div
      className={`mb-3 rounded-panel border-[0.5px] px-4 py-[14px] ${
        hasGap ? "border-cp-red/40 bg-cp-red-soft" : "cp-hairline bg-surface-card"
      }`}
    >
      <div
        className={`mb-3 flex items-center gap-[7px] text-[10.5px] uppercase tracking-[0.08em] ${
          hasGap ? "text-cp-red" : "text-ink-faint"
        }`}
      >
        <ManagerIcon name={hasGap ? "alert-triangle" : "moon-stars"} size={14} />
        Today
      </div>

      {hasGap && (
        <div className="mb-3 flex items-start gap-2.5 text-[13.5px] font-medium leading-[1.4] text-cp-red">
          <span className="mt-px shrink-0">
            <ManagerIcon name="users" size={16} />
          </span>
          {gapSlots.length === 1 && gapSlots[0].short === 0
            ? `Nobody on ${gapNames} today.`
            : `You're short today on ${gapNames}.`}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="text-[12.5px] text-ink-muted">
          {hasGap ? "Nobody is rostered today." : "Nobody's on today."}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map((r) => (
            <div key={r.key}>
              <div className="mb-1.5 flex items-center gap-2 text-[11px]">
                <span
                  className="h-[7px] w-[7px] shrink-0 rounded-full"
                  style={{ background: r.shift.color }}
                  aria-hidden
                />
                <span className="font-medium text-ink-muted">{r.shift.name}</span>
                <span className="text-ink-faint">{compactTimeRange(r.start, r.end)}</span>
                {r.phase === "now" && (
                  <span className="rounded-cp-badge bg-cp-green-soft px-1.5 py-px text-[9.5px] font-medium uppercase tracking-[0.05em] text-cp-green">
                    On now
                  </span>
                )}
                {r.fromYesterday && (
                  <span className="text-[10px] text-ink-faint">since yesterday</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {r.people.map((p) => (
                  <PersonChip key={p.id} name={p.name} under18={p.under18} endTime={p.end} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {hasGap && (
        <Link
          href="/rota"
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-cp-control bg-accent py-3 text-[13.5px] font-medium text-accent-on transition-[transform] active:scale-[0.98]"
        >
          <ManagerIcon name="plus" size={15} /> Cover today&apos;s gap
        </Link>
      )}
    </div>
  );
}
