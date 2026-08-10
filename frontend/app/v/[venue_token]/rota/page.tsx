"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import ShiftBadge from "@/components/shift-badge";
import StatusBanner from "@/components/status-banner";
import { ApiError, StaffRota, StaffRotaAssignment, getStaffRota } from "@/lib/api";
import { DAY_LABELS, DAY_NAMES, addDays, buildShiftsIcs, formatWeekRange, parseISODate, pinStorageKey } from "@/lib/utils";

export default function StaffRotaViewPage({ params }: { params: { venue_token: string } }) {
  const { venue_token } = params;
  const router = useRouter();

  const [data, setData] = useState<StaffRota | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  useEffect(() => {
    const pin = sessionStorage.getItem(pinStorageKey(venue_token));
    if (!pin) {
      router.replace(`/v/${venue_token}`);
      return;
    }
    getStaffRota(venue_token, pin)
      .then(setData)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          sessionStorage.removeItem(pinStorageKey(venue_token));
          router.replace(`/v/${venue_token}?expired=1`);
          return;
        }
        setError(err instanceof ApiError ? err.message : "Something went wrong");
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venue_token]);

  // Default the day strip to today, clamped into this week — so a Sunday
  // check-in during next week's rota still lands on a valid column.
  useEffect(() => {
    if (!data?.period || selectedDay !== null) return;
    const weekStart = parseISODate(data.period.week_start);
    const now = new Date();
    const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const offset = Math.round((todayUTC - weekStart.getTime()) / 86_400_000);
    setSelectedDay(Math.min(6, Math.max(0, offset)));
  }, [data, selectedDay]);

  function handleAddToCalendar() {
    if (!data?.period) return;
    const weekStart = parseISODate(data.period.week_start);
    const shiftsById = new Map(data.shifts.map((s) => [s.id, s]));

    const myShifts = data.assignments
      .filter((a) => a.staff_id === data.staff_id && a.shift_id)
      .map((a) => {
        const shift = shiftsById.get(a.shift_id!);
        if (!shift) return null;
        return {
          date: addDays(weekStart, a.day_index),
          name: shift.name,
          startTime: shift.start_time,
          endTime: shift.end_time,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    if (myShifts.length === 0) return;

    const ics = buildShiftsIcs(data.venue_name, myShifts);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${data.venue_name.replace(/\s+/g, "-").toLowerCase()}-rota-${data.period.week_start}.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  if (loading) return <CenteredMessage>Loading…</CenteredMessage>;
  if (error) return <CenteredMessage>{error}</CenteredMessage>;
  if (!data) return <CenteredMessage>Something went wrong.</CenteredMessage>;

  if (!data.period) {
    return (
      <div className="min-h-screen bg-surface-page pb-10">
        <div className="mx-auto max-w-[480px] px-5 pt-6">
          <a href={`/v/${venue_token}/hub`} className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-ink-muted">
            ← Back
          </a>
          <div className="truncate text-xs font-semibold uppercase tracking-[0.08em] text-ink-faint">
            {data.venue_name}
          </div>
          <div className="mt-0.5 font-display text-xl font-bold text-ink">Your rota</div>

          <div className="mt-5 rounded-card border border-hairline bg-surface-card p-6 text-center">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-faint">No rota yet</div>
            <div className="mt-3 font-display text-lg font-bold text-ink">Nothing published</div>
            <div className="mt-1 text-sm text-ink-muted">
              Check back once your manager publishes the rota for {data.venue_name}.
            </div>
            <Link
              href={`/v/${venue_token}/availability`}
              className="mt-5 inline-block text-[13px] font-semibold text-accent"
            >
              ← Back to availability
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const period = data.period;
  const weekStart = parseISODate(period.week_start);
  const shiftsById = new Map(data.shifts.map((s) => [s.id, s]));
  const teamById = new Map(data.team.map((t) => [t.id, t]));

  const myAssignments = data.assignments
    .filter((a) => a.staff_id === data.staff_id)
    .sort((a, b) => a.day_index - b.day_index);
  const myAssignmentsByDay = new Map(myAssignments.map((a) => [a.day_index, a]));

  const byDay = new Map<number, StaffRotaAssignment[]>();
  for (const a of data.assignments) {
    const list = byDay.get(a.day_index) ?? [];
    list.push(a);
    byDay.set(a.day_index, list);
  }

  const now = new Date();
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const todayIndex = Math.round((todayUTC - weekStart.getTime()) / 86_400_000);

  const day = selectedDay ?? 0;
  const myDayAssignment = myAssignmentsByDay.get(day);
  const myDayShift = myDayAssignment?.shift_id ? shiftsById.get(myDayAssignment.shift_id) : undefined;

  const dayTeam = (byDay.get(day) ?? [])
    .slice()
    .sort((x, y) => {
      const sx = x.shift_id ? shiftsById.get(x.shift_id)?.sort_order ?? 0 : 0;
      const sy = y.shift_id ? shiftsById.get(y.shift_id)?.sort_order ?? 0 : 0;
      return sx - sy;
    });

  return (
    <div className="min-h-screen bg-surface-page pb-10">
      <div className="mx-auto max-w-[480px]">
        <div className="px-5 pt-6">
          <a href={`/v/${venue_token}/hub`} className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-ink-muted">
            ← Back
          </a>
          <div className="truncate text-xs font-semibold uppercase tracking-[0.08em] text-ink-faint">
            {data.venue_name}
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-3">
            <div className="font-display text-xl font-bold text-ink">Your rota</div>
            <StatusBanner status={period.status} />
          </div>
          <div className="mt-1 text-[13px] font-semibold text-ink-muted">
            Week of {formatWeekRange(period.week_start)}
          </div>
        </div>

        <div className="mt-5 px-5">
          {/* Day strip — tap a day to inspect it below */}
          <div className="flex justify-between gap-1 rounded-panel border border-hairline bg-surface-card p-1.5">
            {DAY_LABELS.map((label, i) => {
              const isSelected = i === day;
              const isToday = i === todayIndex;
              const assignment = myAssignmentsByDay.get(i);
              const shift = assignment?.shift_id ? shiftsById.get(assignment.shift_id) : null;
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDay(i)}
                  className={`flex flex-1 flex-col items-center gap-1 rounded-[10px] py-2 transition ${
                    isSelected ? "bg-accent-light" : ""
                  }`}
                >
                  <span
                    className={`text-[10px] font-semibold ${
                      isSelected ? "text-accent" : isToday ? "text-ink" : "text-ink-faint"
                    }`}
                  >
                    {label}
                  </span>
                  <span className={`text-sm font-bold ${isSelected ? "text-accent" : "text-ink"}`}>
                    {addDays(weekStart, i).getUTCDate()}
                  </span>
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: shift ? shift.color : "var(--c-hairline)" }}
                  />
                </button>
              );
            })}
          </div>

          {/* Selected day's shift, hero-style */}
          <div className="mt-4">
            {myDayShift ? (
              <div className="relative overflow-hidden rounded-card border border-hairline bg-surface-card p-6">
                <div
                  className="pointer-events-none absolute inset-0 opacity-[0.10]"
                  style={{ background: `radial-gradient(circle at 100% -10%, ${myDayShift.color}, transparent 55%)` }}
                />
                <div className="relative">
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-faint">
                    {day === todayIndex ? "Today" : DAY_NAMES[day]}
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <div className="text-xl font-bold text-ink">
                      {myDayShift.start_time} – {myDayShift.end_time}
                    </div>
                    <ShiftBadge name={myDayShift.name} color={myDayShift.color} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-card border border-hairline bg-surface-card p-6 text-center">
                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-faint">
                  {day === todayIndex ? "Today" : DAY_NAMES[day]}
                </div>
                <div className="mt-2 text-sm font-semibold text-ink-muted">You&apos;re not scheduled this day.</div>
              </div>
            )}
          </div>

          <button
            onClick={handleAddToCalendar}
            disabled={myAssignments.length === 0}
            className="mt-3 w-full rounded-control border border-accent-border bg-surface-card py-3 text-center text-sm font-semibold text-accent disabled:opacity-50"
          >
            + Add all shifts to calendar
          </button>

          <div className="mb-3 mt-6 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            {DAY_NAMES[day]} · full team
          </div>
          {dayTeam.length === 0 ? (
            <div className="rounded-panel border border-hairline bg-surface-subtle p-4 text-center text-sm text-ink-muted">
              No one scheduled.
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 rounded-panel border border-hairline bg-surface-card p-3.5">
              {dayTeam.map((a) => {
                const shift = a.shift_id ? shiftsById.get(a.shift_id) : undefined;
                const member = a.staff_id ? teamById.get(a.staff_id) : undefined;
                if (!shift || !member) return null;
                const isMe = a.staff_id === data.staff_id;
                return (
                  <div key={a.id} className="flex items-center gap-2 text-[13px]">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: shift.color }} />
                    <span className={isMe ? "font-bold text-accent" : "text-ink-label"}>
                      {member.name}
                      {isMe ? " (you)" : ""}
                    </span>
                    <span className="text-ink-faint">— {shift.name}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 text-center text-sm text-ink-muted">
      {children}
    </div>
  );
}
