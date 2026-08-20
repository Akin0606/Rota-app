"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import BackButton from "@/components/staff/back-button";
import CalendarBlock from "@/components/staff/calendar-block";
import Icon from "@/components/staff/icon";
import ModeToggle from "@/components/staff/mode-toggle";
import StaffScreen, { FootNote, ScreenTitle, StaffTopBar } from "@/components/staff/screen";
import StatusBadge, { StatusTone } from "@/components/staff/status-badge";
import { STATUS_CONFIG } from "@/components/status-banner";
import { ApiError, StaffRota, getStaffRota } from "@/lib/api";
import {
  DAY_LABELS,
  addDays,
  buildShiftsIcs,
  formatHoursTotal,
  formatWeekRangeCompact,
  parseISODate,
  pinStorageKey,
  shiftDurationHours,
  sumShiftHours,
} from "@/lib/utils";

// The rota's own status wording is shared with the manager app so the two
// never drift; only the colour tone is re-mapped onto the staff palette.
const STATUS_TONES: Record<string, StatusTone> = {
  confirmed: "green",
  published: "amber",
  generated: "accent",
  closed: "neutral",
  collecting: "amber",
};

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
    getStaffRota(venue_token, pin, { onRevalidate: setData })
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
          startTime: a.start_time ?? shift.start_time,
          endTime: a.end_time ?? shift.end_time,
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
  if (error || !data) return <CenteredMessage>{error || "Something went wrong."}</CenteredMessage>;

  if (!data.period) {
    return (
      <StaffScreen>
        <StaffTopBar
          left={<BackButton href={`/v/${venue_token}/hub`} />}
          right={<ModeToggle venueToken={venue_token} />}
        />
        <div className="mb-5 mt-4">
          <ScreenTitle title="My shifts" sub={data.venue_name} />
        </div>
        <div className="cp-hairline rounded-cp-card bg-surface-card p-6 text-center">
          <div className="text-[15px] font-medium text-ink">Nothing published yet</div>
          <div className="mt-1.5 text-[13px] leading-[1.45] text-ink-muted">
            Your shifts appear here once your manager publishes the rota.
          </div>
          <Link
            href={`/v/${venue_token}/availability`}
            className="mt-4 inline-block text-[13px] font-medium !text-accent"
          >
            Submit your availability
          </Link>
        </div>
      </StaffScreen>
    );
  }

  const period = data.period;
  const weekStart = parseISODate(period.week_start);
  const shiftsById = new Map(data.shifts.map((s) => [s.id, s]));
  const teamById = new Map(data.team.map((t) => [t.id, t]));

  const myAssignments = data.assignments.filter((a) => a.staff_id === data.staff_id && a.shift_id);
  const myAssignmentsByDay = new Map(myAssignments.map((a) => [a.day_index, a]));

  const myShifts = myAssignments
    .map((a) => shiftsById.get(a.shift_id!))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));
  const { hours, unmeasured } = sumShiftHours(myShifts);

  const now = new Date();
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const todayIndex = Math.round((todayUTC - weekStart.getTime()) / 86_400_000);

  const statusLabel = (STATUS_CONFIG[period.status] ?? STATUS_CONFIG.collecting).label;
  const statusTone = STATUS_TONES[period.status] ?? "neutral";
  // The API doesn't expose when the rota was published, so this frames the
  // week rather than claiming a notice period we can't actually measure.
  const timing =
    todayIndex < 0
      ? todayIndex === -1
        ? "starts tomorrow"
        : `starts in ${-todayIndex} days`
      : todayIndex > 6
        ? "last week"
        : "this week";

  return (
    <StaffScreen>
      <StaffTopBar
        left={<BackButton href={`/v/${venue_token}/hub`} />}
        right={<ModeToggle venueToken={venue_token} />}
      />

      <div className="mb-[18px] mt-4 flex items-end justify-between gap-3">
        <ScreenTitle
          title="My shifts"
          sub={`Week of ${formatWeekRangeCompact(period.week_start)} · ${data.venue_name}`}
        />
        <div className="shrink-0 text-right">
          <div className="text-[22px] font-medium tracking-[-0.5px] text-ink">
            {formatHoursTotal(hours, unmeasured)}
          </div>
          <div className="text-[11px] text-ink-faint transition-colors duration-[350ms]">
            {myAssignmentsByDay.size} shift{myAssignmentsByDay.size === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      <StatusBadge
        tone={statusTone}
        // A tick on an amber "Provisional" pill would read as settled when it
        // explicitly isn't — only a confirmed rota earns the check.
        icon={statusTone === "green" ? "circle-check" : "clock"}
        className="mb-5"
      >
        {statusLabel} · {timing}
      </StatusBadge>

      {/* Vertical timeline. The rule is positioned to run through the centre
          of the 40px day nodes, and inset top/bottom so it doesn't overhang
          the first and last one. */}
      <div className="relative">
        <span
          aria-hidden="true"
          className="absolute bottom-2 left-[19px] top-2 w-[1.5px] bg-cp-track transition-colors duration-[350ms]"
        />
        {DAY_LABELS.map((_, dayIndex) => {
          const assignment = myAssignmentsByDay.get(dayIndex);
          const shift = assignment?.shift_id ? shiftsById.get(assignment.shift_id) : undefined;
          const date = addDays(weekStart, dayIndex);
          const isPast = date.getTime() < todayUTC;

          const colleagues = shift
            ? data.assignments
                .filter(
                  (a) =>
                    a.day_index === dayIndex &&
                    a.shift_id === shift.id &&
                    a.staff_id &&
                    a.staff_id !== data.staff_id,
                )
                .map((a) => teamById.get(a.staff_id!))
                .filter((m): m is NonNullable<typeof m> => Boolean(m))
            : [];

          // Prefer the assignment's per-day hours over the shift-level time.
          const startTime = assignment?.start_time ?? shift?.start_time;
          const endTime = assignment?.end_time ?? shift?.end_time;
          const duration = shift && startTime && endTime ? shiftDurationHours(startTime, endTime) : null;
          // A shift that's already been dropped, given or claimed can't be
          // acted on again — it shows its state instead of a tap affordance.
          const inFlight = Boolean(assignment?.drop_status);

          return (
            <div key={dayIndex} className="relative mb-2.5 flex gap-[14px]">
              <div className="z-[1] w-10 shrink-0">
                <CalendarBlock
                  variant="node"
                  dayIndex={dayIndex}
                  dateNumber={date.getUTCDate()}
                  active={Boolean(shift)}
                />
              </div>

              {!shift ? (
                <div className="flex flex-1 items-center px-[15px] py-[13px] text-[13px] text-ink-faint transition-colors duration-[350ms]">
                  Day off
                </div>
              ) : (
                <ShiftRow
                  href={
                    isPast || inFlight ? null : `/v/${venue_token}/drop?assignment=${assignment!.id}`
                  }
                  time={`${startTime} – ${endTime}`}
                  name={shift.name}
                  colleagues={colleagues}
                  duration={duration}
                  inFlight={inFlight}
                  dimmed={isPast}
                />
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={handleAddToCalendar}
        disabled={myAssignmentsByDay.size === 0}
        className="cp-hairline mt-4 flex w-full items-center justify-center gap-2 rounded-cp-panel bg-surface-card py-3.5 text-[14px] font-medium text-accent transition-colors hover:bg-surface-subtle disabled:opacity-40"
      >
        <Icon name="calendar-plus" size={16} />
        Add all shifts to calendar
      </button>

      <FootNote>Tap a shift to drop, give or swap it</FootNote>
    </StaffScreen>
  );
}

function ShiftRow({
  href,
  time,
  name,
  colleagues,
  duration,
  inFlight,
  dimmed,
}: {
  href: string | null;
  time: string;
  name: string;
  colleagues: { id: string; name: string }[];
  duration: number | null;
  inFlight: boolean;
  dimmed: boolean;
}) {
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium text-ink">{time}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-muted transition-colors duration-[350ms]">
          <span className="shrink-0">{name}</span>
          {colleagues.length > 0 && (
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="shrink-0">· with</span>
              <span className="flex shrink-0 -space-x-1">
                {colleagues.slice(0, 3).map((c) => (
                  <span
                    key={c.id}
                    className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-cp-icon text-[9px] font-medium text-ink-muted ring-1 ring-[var(--c-surface-card)] transition-colors duration-[350ms]"
                  >
                    {c.name.charAt(0).toUpperCase()}
                  </span>
                ))}
              </span>
              <span className="truncate">
                {colleagues
                  .slice(0, 2)
                  .map((c) => c.name.split(" ")[0])
                  .join(", ")}
                {colleagues.length > 2 ? ` +${colleagues.length - 2}` : ""}
              </span>
            </span>
          )}
        </div>
      </div>

      {inFlight ? (
        <StatusBadge tone="amber" className="shrink-0">
          Pending
        </StatusBadge>
      ) : (
        duration !== null && (
          <span className="shrink-0 rounded-cp-badge bg-cp-icon px-2.5 py-1 text-[12px] font-medium text-ink-muted transition-colors duration-[350ms]">
            {duration}h
          </span>
        )
      )}

      {href && (
        <span className="shrink-0 text-ink-faint transition-[color,transform] duration-200 group-hover:translate-x-0.5 group-hover:text-accent">
          <Icon name="chevron-right" size={15} />
        </span>
      )}
    </>
  );

  const shell = `group flex flex-1 items-center gap-3 cp-hairline rounded-cp-panel bg-surface-card px-[15px] py-[13px] transition-all duration-200 ${
    dimmed ? "opacity-50" : ""
  }`;

  if (!href) return <div className={shell}>{body}</div>;

  return (
    <Link href={href} className={`${shell} hover:!border-accent hover:bg-surface-subtle`}>
      {body}
    </Link>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="cp-staff flex min-h-screen items-center justify-center bg-surface-page px-6 text-center text-sm text-ink-muted">
      {children}
    </div>
  );
}
