"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import LoadingScreen from "@/components/loading-screen";
import ManagerIcon from "@/components/manager/icon";
import StatusHero, { buildHeroPlan } from "@/components/manager/status-hero";
import TodayStrip from "@/components/manager/today-strip";
import Modal from "@/components/modal";
import Toast from "@/components/toast";
import Waiting from "@/components/waiting";
import {
  Activity,
  ApiError,
  Period,
  RotaSummary,
  SchedulerConfig,
  Shift,
  StaffManager,
  Venue,
  getRota,
  getScheduler,
  getVenue,
  listActivity,
  listPeriods,
  listShifts,
  listStaff,
  remindStaff,
  resetStaffPin,
} from "@/lib/api";
import {
  DAY_NAMES,
  daysUntilClose,
  describeAction,
  formatRelativeTime,
  formatWeekRange,
  londonToday,
  parseISODate,
  periodForToday,
  planningPeriod,
  shiftDurationHours,
  startsWithName,
  todayIndexInWeek,
} from "@/lib/utils";

// Versioned. The stale-while-revalidate blob's shape changed with the Home
// rebuild (one `period`/`rota` became `planning`/`today` and their two rotas),
// and while every read below defaults safely, an old blob would paint an
// established venue as "let's build your first rota" for the second before the
// refetch lands. Bumping the key makes a stale blob simply not match, so that
// first paint is the honest loading state instead.
const CACHE_KEY = "rotally_home_snapshot_v2";

// Home — reframed present-first (H1/H2/H3).
//
// The old screen was a generic SaaS org-chart: "Good morning / Dashboard", a
// four-stat vanity row, then Team Status and Recent Activity. Two of those four
// numbers ("Total Hours 214", "Conflicts 0") are things a small-pub owner does
// nothing with, and everything above the fold was about a week that hasn't
// happened yet — a status page, not a home.
//
// The order now reads: where am I right now (Today) → what's my next job (the
// status hero) → what needs me (joins, conflicts-if-any) → my people (Team) →
// reassurance (Recent, demoted). Present tense first, planning second, both
// above the fold on a phone, and no "Today | This week" tabs — a toggle would
// be a tap tax on the thing they opened the app to see.
//
// The route stays /dashboard deliberately: renaming it means touching
// middleware.ts's matcher (miss it and manager sessions stop refreshing here)
// and the pre-paint theme regex in app/layout.tsx (miss it and a light-mode
// manager gets a dark Home). Both fail silently, for no user-visible gain.

export default function HomePage() {
  const [venue, setVenue] = useState<Venue | null>(null);
  // Two periods, deliberately named apart. `planning` is the week the manager is
  // being asked to build (the hero); `today` is the week we're standing in (the
  // Today strip). They're usually different, and the old page only ever held the
  // planning one — which is why a Today strip built on it would have shown next
  // week's Monday.
  const [planning, setPlanning] = useState<Period | null>(null);
  const [today, setToday] = useState<Period | null>(null);
  // The authoritative close time comes from the scheduler window, not the
  // legacy `avail_closes_day` name on the rules row. That field is the Nth day
  // OF the week being collected for, so a Wednesday close on w/c 7 Sept reads as
  // 9 Sept — two days after the week has already started. The backend derives
  // the real close from the legal notice period before the week's earliest
  // shift, and the hero states a deadline out loud, so it has to be the real one.
  const [scheduler, setScheduler] = useState<SchedulerConfig | null>(null);
  const [staff, setStaff] = useState<StaffManager[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [planningRota, setPlanningRota] = useState<RotaSummary | null>(null);
  const [todayRota, setTodayRota] = useState<RotaSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [reminding, setReminding] = useState(false);
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [staffBusy, setStaffBusy] = useState(false);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function handleRemindPending() {
    if (!planning) return;
    setReminding(true);
    try {
      const result = await remindStaff({ periodId: planning.id });
      showToast(
        result.reminded === 0
          ? "Everyone's already submitted"
          : result.email_sent
            ? `Reminded ${result.reminded} by email`
            : `Reminded ${result.reminded} — but no emails were delivered`,
      );
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not send reminders");
    } finally {
      setReminding(false);
    }
  }

  async function handleRemindOne(member: StaffManager) {
    setRemindingId(member.id);
    try {
      const result = await remindStaff({ staffId: member.id, periodId: planning?.id });
      showToast(
        result.email_sent
          ? `Reminder emailed to ${member.name.split(" ")[0]}`
          : member.email
            ? `Could not email ${member.name.split(" ")[0]} — check their email address`
            : `${member.name.split(" ")[0]} has no email on file — nothing sent`,
      );
    } catch {
      showToast("Could not send reminder");
    } finally {
      setRemindingId(null);
    }
  }

  async function handleModalResetPin(member: StaffManager) {
    setStaffBusy(true);
    try {
      const updated = await resetStaffPin(member.id);
      setStaff((prev) => prev.map((m) => (m.id === member.id ? { ...m, pin: updated.pin } : m)));
      showToast(`New PIN for ${member.name.split(" ")[0]}: ${updated.pin}`);
    } catch {
      showToast("Could not reset PIN");
    } finally {
      setStaffBusy(false);
    }
  }

  // Render last-visit's data instantly (stale-while-revalidate) so a return
  // trip isn't a blank wait, then refresh behind it.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        setVenue(s.venue);
        setPlanning(s.planning ?? null);
        setToday(s.today ?? null);
        setScheduler(s.scheduler ?? null);
        setStaff(s.staff ?? []);
        setShifts(s.shifts ?? []);
        setActivity(s.activity ?? []);
        setPlanningRota(s.planningRota ?? null);
        setTodayRota(s.todayRota ?? null);
        setLoading(false);
      }
    } catch {
      /* ignore corrupt cache */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Don't blank existing (cached) content while revalidating.
      setError(false);
      try {
        const [venueRes, periodsRes, schedulerRes, activityRes] = await Promise.all([
          getVenue(),
          listPeriods(),
          getScheduler(),
          listActivity(8),
        ]);
        if (cancelled) return;

        const plan = planningPeriod(periodsRes, venueRes.current_week_start);
        const now = periodForToday(periodsRes);

        // At most two rota fetches, usually one or none: a week still collecting
        // has nothing built, and planning/today are frequently the same week.
        const wanted: string[] = [];
        if (plan && plan.status !== "collecting") wanted.push(plan.id);
        if (now && now.status !== "collecting" && now.id !== plan?.id) wanted.push(now.id);
        const [staffRes, shiftsRes, rotaEntries] = await Promise.all([
          listStaff(plan?.id),
          listShifts(),
          Promise.all(wanted.map((id) => getRota(id).then((r) => [id, r] as const))),
        ]);
        if (cancelled) return;

        const rotaById = new Map<string, RotaSummary>(rotaEntries);
        const planRota = plan ? (rotaById.get(plan.id) ?? null) : null;
        const nowRota = now ? (rotaById.get(now.id) ?? null) : null;

        setVenue(venueRes);
        setPlanning(plan);
        setToday(now);
        setScheduler(schedulerRes);
        setStaff(staffRes);
        setShifts(shiftsRes);
        setActivity(activityRes);
        setPlanningRota(planRota);
        setTodayRota(nowRota);
        try {
          sessionStorage.setItem(
            CACHE_KEY,
            JSON.stringify({
              venue: venueRes,
              planning: plan,
              today: now,
              scheduler: schedulerRes,
              staff: staffRes,
              shifts: shiftsRes,
              activity: activityRes,
              planningRota: planRota,
              todayRota: nowRota,
            }),
          );
        } catch {
          /* quota/serialization — non-fatal */
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  if (loading) {
    return <LoadingScreen base="Loading your week…" />;
  }

  if (error || !venue) {
    return (
      <div className="flex flex-col items-center gap-3 p-10 text-center text-sm text-ink-muted">
        Something went wrong loading your week.
        <button
          onClick={() => setReloadToken((n) => n + 1)}
          className="rounded-[10px] bg-accent px-4 py-2 text-[13px] font-medium text-accent-on"
        >
          Try again
        </button>
      </div>
    );
  }

  // Self-registered members awaiting approval aren't part of the team yet —
  // keep them out of the availability/team counts and surface them separately.
  const pendingApprovals = staff.filter((s) => s.pending);
  const activeStaff = staff.filter((s) => s.is_active && !s.pending);
  const submittedCount = activeStaff.filter((s) => s.submitted).length;
  const totalCount = activeStaff.length;
  const closesAt =
    scheduler?.weeks.find((w) => w.week_start === planning?.week_start)?.closes_at ?? null;
  const daysLeft = closesAt ? daysUntilClose(closesAt) : null;

  const heroPlan = buildHeroPlan({
    period: planning,
    rota: planningRota,
    shifts,
    submittedCount,
    totalCount,
    daysLeft,
    hasAnyPeriod: Boolean(planning || today),
  });
  // The collecting hero's primary is a remind, which has no route — wire it here
  // rather than letting the builder reach into page state.
  if (!heroPlan.primary.href) heroPlan.primary.onClick = handleRemindPending;

  // Conflicts surface only when there are some. A "0 / All clear" tile rewards
  // nothing; a red one-liner that appears exactly when something needs checking
  // is worth reading.
  const conflicts = planningRota?.conflicts ?? 0;

  // Mirrors TodayStrip's own gap test so the strip's red state and the hero's
  // demotion can never disagree about whether today has a hole.
  const todayIsGappy = (() => {
    if (!todayRota || !today) return false;
    if (today.status !== "published" && today.status !== "confirmed") return false;
    const idx = todayIndexInWeek(today.week_start);
    if (idx === null) return false;
    return (
      todayRota.uncovered.some((u) => u.day_index === idx) ||
      todayRota.under_covered.some((u) => u.day_index === idx)
    );
  })();

  // The shifts and the heading above them must come from ONE week. Two
  // independent ?? chains looked equivalent and weren't: planningRota is only
  // fetched when the planning week has been built, so in the normal steady state
  // (this week published, next week collecting) the rota fell through to today's
  // while the label stayed on next week's — the modal read "Upcoming shifts ·
  // 7 Sep" over this week's actual shifts, and attributed the hours total to the
  // wrong week. A manager checking someone's hours before approving a swap got a
  // wrong answer with nothing to signal it.
  const modalWeek = planningRota
    ? { rota: planningRota, weekStart: planning?.week_start ?? null }
    : { rota: todayRota, weekStart: today?.week_start ?? null };

  const dateLabel = parseISODate(londonToday()).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

  return (
    <div className="animate-fadeIn px-5 py-6 pb-24 md:px-10 md:py-8 md:pb-8">
      <div className="mx-auto max-w-[560px] md:max-w-none">
        {/* A home shouldn't announce that it's the home. Lead with where you
            are: the venue, and the day it is there. */}
        <div className="mb-3">
          <div className="text-[11px] uppercase tracking-[0.09em] text-ink-faint">{venue.name}</div>
          <div className="mt-0.5 text-[17px] font-medium tracking-[-0.3px] text-ink">
            {dateLabel}
          </div>
        </div>

        {/* Desktop is the minimal widen only — no new information, no extra
            tiles. Today and the hero stay full-bleed across the top (present
            tense wins the widest screen too); below them, the things waiting on
            you sit beside the team. */}
        <div className="md:grid md:grid-cols-[1fr_340px] md:items-start md:gap-5">
          <div className="md:col-span-2">
            <TodayStrip
              period={today}
              rota={todayRota}
              shifts={shifts}
              staff={staff}
            />

            <StatusHero plan={heroPlan} busy={reminding} demoted={todayIsGappy} />
          </div>

          <div className="min-w-0">
            {conflicts > 0 && (
              <Link
                href="/rota"
                className="mb-3.5 flex items-center gap-2.5 rounded-cp-panel border-[0.5px] border-cp-red/40 bg-cp-red-soft px-3.5 py-[11px]"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-cp-slot bg-cp-red/15 text-cp-red">
                  <ManagerIcon name="alert-triangle" size={15} />
                </span>
                <span className="flex-1 text-[12.5px] font-medium text-cp-red">
                  {conflicts} scheduling conflict{conflicts === 1 ? "" : "s"} to check
                </span>
                <ManagerIcon name="chevron-right" size={15} className="text-cp-red" />
              </Link>
            )}

            {pendingApprovals.length > 0 && (
              <Link
                href="/team"
                className="mb-3.5 flex items-center gap-2.5 rounded-cp-panel border-[0.5px] border-cp-amber/40 bg-cp-amber-soft px-3.5 py-3"
              >
                <span className="flex h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-full bg-cp-amber px-1.5 text-[12px] font-medium text-accent-on">
                  {pendingApprovals.length}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-ink">
                    {pendingApprovals.length === 1 ? "1 person wants" : `${pendingApprovals.length} people want`}{" "}
                    to join
                  </span>
                  <span className="mt-px block truncate text-[11px] text-ink-muted">
                    {pendingApprovals.map((s) => s.name.split(" ")[0]).join(", ")} · tap to review
                  </span>
                </span>
                <ManagerIcon name="chevron-right" size={15} className="text-ink-muted" />
              </Link>
            )}

            {/* Reassurance, not action — nobody opens the app to read the log. */}
            {activity.length > 0 && (
              <>
                <div className="mb-2 mt-1 px-0.5 text-[10px] uppercase tracking-[0.11em] text-ink-faint">
                  Recent
                </div>
                <div className="flex flex-col">
                  {activity.slice(0, 5).map((a) => {
                    const text = describeAction(a.action, a.detail, a.staff_name);
                    const showNamePrefix = a.staff_name && !startsWithName(text, a.staff_name);
                    return (
                      <div key={a.id} className="flex items-start gap-2.5 py-[7px] text-[12px]">
                        <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-hairline" />
                        <div className="min-w-0 flex-1 text-ink-muted">
                          {showNamePrefix && (
                            <span className="font-medium text-ink">{a.staff_name} </span>
                          )}
                          {text}
                        </div>
                        <span className="shrink-0 whitespace-nowrap pl-2 text-[10.5px] text-ink-faint">
                          {formatRelativeTime(a.created_at)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div className="min-w-0">
            <div className="mb-3.5 rounded-cp-card border-[0.5px] border-hairline bg-surface-card px-3.5 pb-2 pt-3.5">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[14px] font-medium text-ink">Team</span>
                <span className="text-[11px] text-ink-muted">
                  {totalCount === 0
                    ? "nobody yet"
                    : submittedCount === totalCount
                      ? `all ${totalCount} in`
                      : `${submittedCount} of ${totalCount} sent availability`}
                </span>
              </div>
              {activeStaff.length === 0 ? (
                <div className="py-5 text-center text-[13px] text-ink-faint">
                  No team members yet.
                </div>
              ) : (
                activeStaff.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-2.5 border-b border-hairline py-2.5 last:border-0"
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedStaffId(m.id)}
                      aria-label={`Open ${m.name}`}
                      className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-cp-icon text-[12px] font-medium text-ink-muted transition-[transform] active:scale-[0.95]"
                    >
                      {m.name
                        .split(" ")
                        .map((w) => w[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 truncate text-[13px] font-medium text-ink">
                        {m.name}
                        {m.is_under_18 && (
                          <span className="rounded-cp-badge bg-cp-icon px-1 py-px text-[8px] font-medium text-ink-muted">
                            U18
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-ink-faint">{m.role}</div>
                    </div>
                    {m.submitted ? (
                      <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-cp-green">
                        <ManagerIcon name="check" size={13} /> Sent
                      </span>
                    ) : (
                      <button
                        onClick={() => handleRemindOne(m)}
                        disabled={remindingId === m.id}
                        className="cp-hairline shrink-0 rounded-cp-chip px-2.5 py-[5px] text-[11px] font-medium text-ink-muted transition-[transform] active:scale-[0.96] disabled:opacity-60"
                      >
                        {remindingId === m.id ? <Waiting label="…" /> : "Remind"}
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

          </div>
        </div>
      </div>

      <StaffModal
        member={staff.find((m) => m.id === selectedStaffId) ?? null}
        shifts={shifts}
        assignments={modalWeek.rota?.assignments ?? []}
        weekStart={modalWeek.weekStart}
        busy={staffBusy || remindingId !== null}
        onClose={() => setSelectedStaffId(null)}
        onRemind={handleRemindOne}
        onResetPin={handleModalResetPin}
      />

      <Toast message={toast} />
    </div>
  );
}

function StaffModal({
  member,
  shifts,
  assignments,
  weekStart,
  busy,
  onClose,
  onRemind,
  onResetPin,
}: {
  member: StaffManager | null;
  shifts: Shift[];
  assignments: RotaSummary["assignments"];
  weekStart: string | null;
  busy: boolean;
  onClose: () => void;
  onRemind: (m: StaffManager) => void;
  onResetPin: (m: StaffManager) => void;
}) {
  if (!member) return null;

  const shiftsById = new Map(shifts.map((s) => [s.id, s]));
  const mine = assignments
    .filter((a) => a.staff_id === member.id && a.shift_id)
    // Resolve each assignment's real per-day hours so the times + total are
    // right for a per-day shift.
    .map((a) => {
      const base = shiftsById.get(a.shift_id as string);
      return {
        day: a.day_index,
        shift: base
          ? { ...base, start_time: a.start_time ?? base.start_time, end_time: a.end_time ?? base.end_time }
          : undefined,
      };
    })
    .filter((x): x is { day: number; shift: Shift } => Boolean(x.shift))
    .sort((a, b) => a.day - b.day);

  const totalHours = mine.reduce(
    (sum, x) => sum + (shiftDurationHours(x.shift.start_time, x.shift.end_time) ?? 0),
    0,
  );

  return (
    <Modal open onClose={onClose} title={member.name}>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-faint">
        Upcoming shifts{weekStart ? ` · ${formatWeekRange(weekStart)}` : ""}
      </div>
      {mine.length === 0 ? (
        <div className="mb-5 rounded-input border border-hairline bg-surface-subtle px-3.5 py-3 text-[13px] text-ink-muted">
          Not scheduled this week.
        </div>
      ) : (
        <div className="mb-2 flex flex-col gap-1.5">
          {mine.map((x, i) => (
            <div key={i} className="flex items-center gap-2 text-[13px] text-ink-label">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: x.shift.color }} />
              <span className="font-medium text-ink">{DAY_NAMES[x.day]}</span>
              <span className="text-ink-muted">
                {x.shift.name} · {x.shift.start_time}–{x.shift.end_time}
              </span>
            </div>
          ))}
        </div>
      )}
      {mine.length > 0 && (
        <div className="mb-5 text-[13px] font-medium text-ink">
          {Math.round(totalHours * 10) / 10}h across {mine.length} shift{mine.length === 1 ? "" : "s"}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between rounded-input border border-hairline bg-surface-subtle px-3.5 py-2.5">
        <span className="text-[13px] text-ink-muted">PIN</span>
        <span className="text-sm font-medium tracking-wide text-ink-label">{member.pin}</span>
      </div>

      <div className="flex gap-2.5">
        <button
          onClick={() => onRemind(member)}
          disabled={busy}
          className="flex-1 rounded-xl bg-surface-subtle py-3 text-center text-sm font-medium text-ink-muted disabled:opacity-60"
        >
          Remind
        </button>
        <button
          onClick={() => onResetPin(member)}
          disabled={busy}
          className="flex-1 rounded-xl bg-accent py-3 text-center text-sm font-medium text-accent-on disabled:opacity-60"
        >
          Reset PIN
        </button>
      </div>
    </Modal>
  );
}
