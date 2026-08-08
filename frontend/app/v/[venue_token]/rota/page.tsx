"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import ShiftBadge from "@/components/shift-badge";
import StatusBanner from "@/components/status-banner";
import { ApiError, StaffRota, StaffRotaAssignment, getStaffRota } from "@/lib/api";
import { DAY_NAMES, addDays, buildShiftsIcs, formatWeekRange, parseISODate, pinStorageKey } from "@/lib/utils";

export default function StaffRotaViewPage({ params }: { params: { venue_token: string } }) {
  const { venue_token } = params;
  const router = useRouter();

  const [data, setData] = useState<StaffRota | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      <div className="mx-auto max-w-[420px] py-4">
        <div className="mx-4 animate-fadeIn overflow-hidden rounded-card bg-surface shadow-card">
          <div className="flex min-h-[420px] flex-col items-center justify-center px-6 py-10 text-center">
            <div className="mb-2 text-xl font-bold text-ink">No rota published yet</div>
            <div className="text-sm leading-relaxed text-ink-muted">
              Check back once your manager publishes the rota for {data.venue_name}.
            </div>
            <Link href={`/v/${venue_token}/availability`} className="mt-6 text-[13px] font-semibold text-accent">
              ← Back to availability
            </Link>
            <Link href={`/v/${venue_token}/hub`} className="mt-2 text-[13px] font-semibold text-ink-faint">
              ← Hub
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

  const byDay = new Map<number, StaffRotaAssignment[]>();
  for (const a of data.assignments) {
    const list = byDay.get(a.day_index) ?? [];
    list.push(a);
    byDay.set(a.day_index, list);
  }

  return (
    <div className="mx-auto max-w-[420px] py-4">
      <div className="mx-4 animate-fadeIn overflow-hidden rounded-card bg-surface shadow-card">
        <div className="px-6 pb-7 pt-5">
          <Link href={`/v/${venue_token}/hub`} className="text-[13px] font-semibold text-accent">
            ← Hub
          </Link>
          <div className="py-2 pb-4 text-center">
            <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">{data.venue_name}</div>
            <div className="mt-1 text-[22px] font-bold text-ink">Your Rota</div>
            <div className="mt-1 text-[13px] font-semibold text-ink-muted">
              Week of {formatWeekRange(period.week_start)}
            </div>
            <div className="mt-2.5 flex justify-center">
              <StatusBanner status={period.status} />
            </div>
          </div>

          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">Your shifts</div>
          {myAssignments.length === 0 ? (
            <div className="mb-6 rounded-panel border border-hairline bg-surface-subtle p-4 text-center text-sm text-ink-muted">
              You&apos;re not working this week.
            </div>
          ) : (
            <div className="mb-2 flex flex-col gap-2">
              {myAssignments.map((a) => {
                const shift = a.shift_id ? shiftsById.get(a.shift_id) : undefined;
                if (!shift) return null;
                const dayDate = addDays(weekStart, a.day_index);
                return (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-xl border-2 p-3.5"
                    style={{ borderColor: shift.color, background: `${shift.color}14` }}
                  >
                    <div>
                      <div className="text-sm font-bold text-ink">
                        {DAY_NAMES[a.day_index]} {dayDate.getUTCDate()}
                      </div>
                      <div className="text-xs text-ink-faint">
                        {shift.start_time} – {shift.end_time}
                      </div>
                    </div>
                    <ShiftBadge name={shift.name} color={shift.color} />
                  </div>
                );
              })}
            </div>
          )}

          <button
            onClick={handleAddToCalendar}
            disabled={myAssignments.length === 0}
            className="mb-7 mt-2 w-full rounded-control border border-accent-border bg-surface-card py-3 text-center text-sm font-semibold text-accent disabled:opacity-50"
          >
            + Add to Calendar
          </button>

          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">Full team</div>
          <div className="flex flex-col gap-3">
            {DAY_NAMES.map((dayName, di) => {
              const dayAssignments = (byDay.get(di) ?? []).slice().sort((x, y) => {
                const sx = x.shift_id ? shiftsById.get(x.shift_id)?.sort_order ?? 0 : 0;
                const sy = y.shift_id ? shiftsById.get(y.shift_id)?.sort_order ?? 0 : 0;
                return sx - sy;
              });
              const dayDate = addDays(weekStart, di);
              return (
                <div key={di} className="rounded-panel border border-hairline bg-surface-card p-3.5">
                  <div className="mb-2 text-xs font-semibold text-ink-label">
                    {dayName} {dayDate.getUTCDate()}
                  </div>
                  {dayAssignments.length === 0 ? (
                    <div className="text-[13px] text-ink-faint">No one scheduled</div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {dayAssignments.map((a) => {
                        const shift = a.shift_id ? shiftsById.get(a.shift_id) : undefined;
                        const member = teamById.get(a.staff_id);
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
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-[420px] items-center justify-center px-6 py-24 text-center text-sm text-ink-muted">
      {children}
    </div>
  );
}
