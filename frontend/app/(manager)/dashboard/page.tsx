"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import LoadingScreen from "@/components/loading-screen";
import Modal from "@/components/modal";
import StatusBanner from "@/components/status-banner";
import TeamStatusCard from "@/components/team-status-card";
import Toast from "@/components/toast";
import {
  Activity,
  ApiError,
  Period,
  RotaSummary,
  SchedulingRules,
  Shift,
  StaffManager,
  Venue,
  getRota,
  getRules,
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
  daysUntilDeadline,
  formatRelativeTime,
  formatWeekRange,
  shiftDurationHours,
} from "@/lib/utils";

const CACHE_KEY = "crewplan_dashboard_snapshot";

export default function DashboardPage() {
  const [venue, setVenue] = useState<Venue | null>(null);
  const [period, setPeriod] = useState<Period | null>(null);
  const [rules, setRules] = useState<SchedulingRules | null>(null);
  const [staff, setStaff] = useState<StaffManager[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [rota, setRota] = useState<RotaSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [reminding, setReminding] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [staffBusy, setStaffBusy] = useState(false);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function handleRemindPending() {
    if (!period) return;
    setReminding(true);
    try {
      const result = await remindStaff({ periodId: period.id });
      showToast(
        result.reminded === 0
          ? "Everyone's already submitted"
          : result.email_sent
            ? `Reminded ${result.reminded} staff by email`
            : `Reminded ${result.reminded} staff — but no emails were delivered`,
      );
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not send reminders");
    } finally {
      setReminding(false);
    }
  }

  async function handleModalRemind(member: StaffManager) {
    setStaffBusy(true);
    try {
      const result = await remindStaff({ staffId: member.id, periodId: period?.id });
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
      setStaffBusy(false);
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
        setPeriod(s.period);
        setRules(s.rules);
        setStaff(s.staff);
        setShifts(s.shifts ?? []);
        setActivity(s.activity);
        setRota(s.rota);
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
        const [venueRes, periodsRes, rulesRes, activityRes] = await Promise.all([
          getVenue(),
          listPeriods(),
          getRules(),
          listActivity(10),
        ]);
        if (cancelled) return;

        const current = periodsRes.find((p) => p.status === "collecting") ?? periodsRes[0] ?? null;
        const [staffRes, shiftsRes, rotaRes] = await Promise.all([
          listStaff(current?.id),
          listShifts(),
          current && current.status !== "collecting" ? getRota(current.id) : Promise.resolve(null),
        ]);
        if (cancelled) return;

        setVenue(venueRes);
        setPeriod(current);
        setRules(rulesRes);
        setStaff(staffRes);
        setShifts(shiftsRes);
        setActivity(activityRes);
        setRota(rotaRes);
        try {
          sessionStorage.setItem(
            CACHE_KEY,
            JSON.stringify({
              venue: venueRes,
              period: current,
              rules: rulesRes,
              staff: staffRes,
              shifts: shiftsRes,
              activity: activityRes,
              rota: rotaRes,
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
    return <LoadingScreen base="Loading your dashboard…" />;
  }

  if (error || !venue) {
    return (
      <div className="flex flex-col items-center gap-3 p-10 text-center text-sm text-ink-muted">
        Something went wrong loading your dashboard.
        <button
          onClick={() => setReloadToken((n) => n + 1)}
          className="rounded-[10px] bg-accent px-4 py-2 text-[13px] font-semibold text-white"
        >
          Try again
        </button>
      </div>
    );
  }

  const activeStaff = staff.filter((s) => s.is_active);
  const submittedCount = activeStaff.filter((s) => s.submitted).length;
  const totalCount = activeStaff.length;
  const pendingCount = totalCount - submittedCount;
  const daysLeft = period && rules ? daysUntilDeadline(period.week_start, rules.avail_closes_day) : null;

  return (
    <div className="animate-fadeIn px-5 py-6 pb-24 md:px-10 md:py-8 md:pb-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[13px] font-medium text-ink-faint">Good morning</div>
          <div className="text-[26px] font-bold text-ink md:text-[28px]">Dashboard</div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {period && (
            <div className="rounded-[10px] border border-hairline bg-surface-card px-4 py-2.5 text-[13px] font-medium text-ink-muted">
              {formatWeekRange(period.week_start)}
            </div>
          )}
          <Link
            href="/rota"
            className="rounded-[10px] bg-accent px-4 py-2.5 text-[13px] font-semibold text-white"
          >
            Open Rota Builder
          </Link>
        </div>
      </div>

      {period && (
        <div className="mb-6">
          <StatusBanner status={period.status} />
        </div>
      )}

      {!period ? (
        <div className="rounded-panel border border-hairline bg-surface-card p-8 text-center text-sm text-ink-muted">
          No availability window is open yet.
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard
              label="Availability"
              value={`${submittedCount}`}
              sub={`/ ${totalCount}`}
              href={pendingCount > 0 ? "/team?filter=pending" : "/team"}
            >
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-page">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{ width: totalCount ? `${(submittedCount / totalCount) * 100}%` : "0%" }}
                />
              </div>
            </StatCard>
            <StatCard
              label="Days Until Deadline"
              value={daysLeft !== null ? String(Math.max(daysLeft, 0)) : "—"}
              valueClassName="text-warn-dot"
              href="/settings"
            />
            <StatCard
              label="Conflicts"
              value={rota ? String(rota.conflicts) : "—"}
              valueClassName={rota && rota.conflicts > 0 ? "text-unavail-text" : "text-avail-text"}
              extraText={rota ? (rota.conflicts > 0 ? "Needs attention" : "All clear") : "No rota generated yet"}
              href="/rota"
            />
            <StatCard
              label="Total Hours"
              value={rota ? String(rota.total_hours) : "0"}
              extraText={rota ? `Across ${totalCount} staff` : "No rota generated yet"}
              href="/rota"
            />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_380px]">
            <div className="rounded-panel border border-hairline bg-surface-card p-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-base font-bold text-ink">Team Status</div>
                {pendingCount > 0 && (
                  <button
                    onClick={handleRemindPending}
                    disabled={reminding}
                    className="rounded-lg bg-accent-light px-3.5 py-2 text-[13px] font-semibold text-accent disabled:opacity-60"
                  >
                    {reminding ? "Reminding…" : `Remind ${pendingCount} pending`}
                  </button>
                )}
              </div>
              {activeStaff.length === 0 ? (
                <div className="py-6 text-center text-[13px] text-ink-faint">No team members yet.</div>
              ) : (
                activeStaff.map((m) => (
                  <TeamStatusCard
                    key={m.id}
                    name={m.name}
                    role={m.role}
                    submitted={m.submitted}
                    onClick={() => setSelectedStaffId(m.id)}
                  />
                ))
              )}
            </div>

            <div className="rounded-panel border border-hairline bg-surface-card p-6">
              <div className="mb-4 text-base font-bold text-ink">Recent Activity</div>
              {activity.length === 0 ? (
                <div className="py-6 text-center text-[13px] text-ink-faint">
                  Nothing yet — activity will show up here.
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {activity.map((a) => (
                    <div key={a.id} className="flex items-start gap-2.5">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
                      <div>
                        <div className="text-[13px] text-ink-label">
                          {a.staff_name && <span className="font-semibold">{a.staff_name} </span>}
                          {describeAction(a.action, a.detail, a.staff_name)}
                        </div>
                        <div className="text-[11px] text-ink-faint">{formatRelativeTime(a.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <StaffModal
        member={staff.find((m) => m.id === selectedStaffId) ?? null}
        shifts={shifts}
        assignments={rota?.assignments ?? []}
        weekStart={period?.week_start ?? null}
        busy={staffBusy}
        onClose={() => setSelectedStaffId(null)}
        onRemind={handleModalRemind}
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
    .map((a) => ({ day: a.day_index, shift: shiftsById.get(a.shift_id as string) }))
    .filter((x): x is { day: number; shift: Shift } => Boolean(x.shift))
    .sort((a, b) => a.day - b.day);

  const totalHours = mine.reduce((sum, x) => sum + (shiftDurationHours(x.shift.start_time, x.shift.end_time) ?? 0), 0);

  return (
    <Modal open onClose={onClose} title={member.name}>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">
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
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: x.shift.color }}
              />
              <span className="font-semibold text-ink">{DAY_NAMES[x.day]}</span>
              <span className="text-ink-muted">
                {x.shift.name} · {x.shift.start_time}–{x.shift.end_time}
              </span>
            </div>
          ))}
        </div>
      )}
      {mine.length > 0 && (
        <div className="mb-5 text-[13px] font-semibold text-ink">
          {Math.round(totalHours * 10) / 10}h across {mine.length} shift{mine.length === 1 ? "" : "s"}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between rounded-input border border-hairline bg-surface-subtle px-3.5 py-2.5">
        <span className="text-[13px] text-ink-muted">PIN</span>
        <span className="text-sm font-bold tracking-wide text-ink-label">{member.pin}</span>
      </div>

      <div className="flex gap-2.5">
        <button
          onClick={() => onRemind(member)}
          disabled={busy}
          className="flex-1 rounded-xl bg-surface-subtle py-3 text-center text-sm font-semibold text-ink-muted disabled:opacity-60"
        >
          Remind
        </button>
        <button
          onClick={() => onResetPin(member)}
          disabled={busy}
          className="flex-1 rounded-xl bg-accent py-3 text-center text-sm font-semibold text-white disabled:opacity-60"
        >
          Reset PIN
        </button>
      </div>
    </Modal>
  );
}

function describeAction(action: string, detail: string | null, staffName: string | null): string {
  switch (action) {
    case "submitted_availability":
      return "submitted availability";
    case "staff_added":
      return "joined the team";
    case "venue_created":
      return "Venue was set up";
    case "reminder_sent":
      return staffName ? "was reminded to submit availability" : (detail ?? action);
    default:
      return detail ?? action;
  }
}

function StatCard({
  label,
  value,
  sub,
  extraText,
  valueClassName,
  href,
  children,
}: {
  label: string;
  value: string;
  sub?: string;
  extraText?: string;
  valueClassName?: string;
  href?: string;
  children?: React.ReactNode;
}) {
  const inner = (
    <>
      <div className="mb-2 text-xs font-medium text-ink-faint">{label}</div>
      <div className={`text-[28px] font-bold md:text-[32px] ${valueClassName ?? "text-ink"}`}>
        {value}
        {sub && <span className="ml-1 text-base font-medium text-ink-faint">{sub}</span>}
      </div>
      {extraText && <div className="mt-2 text-xs text-ink-faint">{extraText}</div>}
      {children}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block rounded-panel border border-hairline bg-surface-card p-5 transition hover:border-accent-border"
      >
        {inner}
      </Link>
    );
  }

  return <div className="rounded-panel border border-hairline bg-surface-card p-5">{inner}</div>;
}
