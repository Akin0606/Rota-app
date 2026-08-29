"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import ManagerIcon, { type ManagerIconName } from "@/components/manager/icon";
import RoleSheet from "@/components/manager/role-sheet";
import ShiftDayEditor from "@/components/manager/shift-day-editor";
import LoadingScreen from "@/components/loading-screen";
import Modal from "@/components/modal";
import StatusBanner from "@/components/status-banner";
import ThemeToggle from "@/components/theme-toggle";
import Toast from "@/components/toast";
import {
  ApiError,
  Period,
  Role,
  SchedulingRules,
  Shift,
  ShiftDay,
  StaffManager,
  Venue,
  VenueLeaveSettings,
  createShift,
  deleteShift,
  getRules,
  getShiftSchedule,
  getVenue,
  getVenueLeaveSettings,
  listPeriods,
  listRoles,
  listShifts,
  listStaff,
  reopenAvailability,
  unpublishRota,
  updateRules,
  updateVenue,
  updateVenueLeaveSettings,
} from "@/lib/api";
import { SHIFT_COLORS } from "@/lib/constants";
import { compactTimeRange, DAY_NAMES, formatWeekRange } from "@/lib/utils";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Legacy free-text 'close' -> the concrete 11:00pm the per-day backfill uses, so
// it renders in the ALL_TIMES dropdown (which no longer offers 'close').
function normTime(t: string): string {
  return t.trim().toLowerCase() === "close" ? "11:00pm" : t;
}

const DAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_INITIAL = ["M", "T", "W", "T", "F", "S", "S"];

// Compress a set of day indices into a readable range: all 7 -> "Every day";
// contiguous runs joined ("Mon–Fri", "Mon–Thu, Sun"); singletons ("Sun").
function dayRangeLabel(indices: number[]): string {
  const s = [...indices].sort((a, b) => a - b);
  if (s.length === 7) return "Every day";
  if (s.length === 0) return "No days";
  const runs: [number, number][] = [];
  for (const d of s) {
    const last = runs[runs.length - 1];
    if (last && d === last[1] + 1) last[1] = d;
    else runs.push([d, d]);
  }
  return runs.map(([a, b]) => (a === b ? DAY_ABBR[a] : `${DAY_ABBR[a]}–${DAY_ABBR[b]}`)).join(", ");
}

// "1:00am" -> "1am", "5:30pm" -> "5:30pm" (for the "till {end}" exception form).
function shortTime(t: string | null): string {
  const m = (t ?? "").trim().toLowerCase().match(/^(\d{1,2}):(\d{2})(am|pm)$/);
  if (!m) return t ?? "";
  return m[2] === "00" ? `${m[1]}${m[3]}` : `${m[1]}:${m[2]}${m[3]}`;
}

type ShiftSummary = {
  strip: { open: boolean; late: boolean }[];
  baseDays: string; // "Every day" / "Mon–Fri" / "Mon–Thu, Sun"
  baseHours: string; // "11am–5pm"
  exception?: string; // "Fri–Sat till 1am" / "Sat 5pm–2am"
  closed: boolean; // no open days at all
};

// Reduce a shift's 7-day schedule to the row's trust signals: which days it runs
// (the strip), the common hours, and — never hidden — the divergent hours inline.
// Open days are grouped by (start,end); the largest group is the base, the rest
// are exceptions shown after it.
function summariseShift(days: ShiftDay[]): ShiftSummary {
  const open = days.filter((d) => d.open);
  const strip = Array.from({ length: 7 }, (_, i) => ({
    open: !!days.find((x) => x.day_index === i)?.open,
    late: false,
  }));
  if (open.length === 0) return { strip, baseDays: "No days set", baseHours: "", closed: true };

  const groups = new Map<string, { start: string | null; end: string | null; days: number[] }>();
  for (const d of [...open].sort((a, b) => a.day_index - b.day_index)) {
    const key = `${d.start_time}|${d.end_time}`;
    const g = groups.get(key) ?? { start: d.start_time, end: d.end_time, days: [] };
    g.days.push(d.day_index);
    groups.set(key, g);
  }
  const arr = Array.from(groups.values()).sort((a, b) => b.days.length - a.days.length || a.days[0] - b.days[0]);
  const [base, ...exceptions] = arr;
  for (const g of exceptions) for (const di of g.days) strip[di].late = true;

  let exception: string | undefined;
  if (exceptions.length === 1) {
    const e = exceptions[0];
    const range = dayRangeLabel(e.days);
    exception =
      e.start === base.start
        ? `${range} till ${shortTime(e.end)}`
        : `${range} ${compactTimeRange(e.start ?? "", e.end ?? "")}`;
  } else if (exceptions.length > 1) {
    exception = `${exceptions.reduce((n, g) => n + g.days.length, 0)} days differ`;
  }
  return { strip, baseDays: dayRangeLabel(base.days), baseHours: compactTimeRange(base.start ?? "", base.end ?? ""), exception, closed: false };
}

export default function SettingsPage() {
  const [venue, setVenue] = useState<Venue | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  // Per-shift 7-day schedule, so each row can show which days it runs + the real
  // (possibly divergent) hours without opening the editor. Fetched in a
  // background pass after the shifts paint (see the effect below).
  const [shiftSchedules, setShiftSchedules] = useState<Record<string, ShiftDay[]>>({});
  const [rules, setRules] = useState<SchedulingRules | null>(null);
  const [leaveSettings, setLeaveSettings] = useState<VenueLeaveSettings | null>(null);

  useEffect(() => {
    getVenueLeaveSettings().then(setLeaveSettings).catch(() => {});
  }, []);

  async function saveLeaveSettings(patch: Partial<VenueLeaveSettings>) {
    try {
      setLeaveSettings(await updateVenueLeaveSettings(patch));
      showToast("Holiday settings saved");
    } catch {
      showToast("Could not save holiday settings");
    }
  }
  const [periods, setPeriods] = useState<Period[]>([]);
  const [staff, setStaff] = useState<StaffManager[]>([]);
  const [staffCount, setStaffCount] = useState<number | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [roleSheet, setRoleSheet] = useState<{ open: boolean; role: Role | null }>({
    open: false,
    role: null,
  });
  const [loading, setLoading] = useState(true);
  const firstLoad = useRef(true);
  const [error, setError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [venueName, setVenueName] = useState("");
  const [menuShiftId, setMenuShiftId] = useState<string | null>(null);
  const [scheduleShift, setScheduleShift] = useState<Shift | null>(null);
  const [unpublishTarget, setUnpublishTarget] = useState<Period | null>(null);
  const [unpublishing, setUnpublishing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      // Only the first load blanks the page. A reloadToken bump (e.g. after
      // saving per-day hours) is a *background* refresh — keep the current UI
      // on screen so a flaky-pool hiccup can't strand the manager on a blank
      // "Something went wrong" screen and make them think the save was lost.
      const isFirst = firstLoad.current;
      firstLoad.current = false;
      if (isFirst) setLoading(true);
      setError(false);
      try {
        const [venueRes, shiftsRes, rulesRes, periodsRes, staffRes, rolesRes] = await Promise.all([
          getVenue(),
          listShifts(),
          getRules(),
          listPeriods(),
          listStaff().catch(() => []),
          listRoles().catch(() => []),
        ]);
        if (cancelled) return;
        setVenue(venueRes);
        setVenueName(venueRes.name);
        // The per-day model replaced free-text 'close' with a real '11:00pm'
        // (Batch 1 backfill resolved it in shift_days). Normalise any legacy
        // 'close' still on the shift row so the simple editor shows the real
        // time — the ALL_TIMES dropdown has no 'close', so saving here also
        // migrates the representative off it.
        setShifts(shiftsRes.map((s) => ({ ...s, start_time: normTime(s.start_time), end_time: normTime(s.end_time) })));
        setRules(rulesRes);
        setPeriods(periodsRes);
        setStaff(staffRes.filter((m) => m.is_active));
        setStaffCount(staffRes.filter((m) => m.is_active).length);
        setRoles(rolesRes);
      } catch {
        if (cancelled) return;
        // A failed first load has nothing to show → the error screen. A failed
        // background refresh keeps the last good data on screen.
        if (isFirst) setError(true);
        else showToast("Couldn't refresh — your saved changes are safe. Pull to reload if needed.");
      } finally {
        if (!cancelled && isFirst) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  // Fetch each shift's per-day schedule (a background pass after the shifts
  // themselves paint) to tell whether its open days share one set of hours. New
  // `shifts` identity on every load — including a post-save reload — re-runs it,
  // so "Varies by day" refreshes right after the editor saves. Per-shift
  // failures fall back to "not varying" (show the representative time).
  useEffect(() => {
    if (shifts.length === 0) return;
    let cancelled = false;
    Promise.all(
      shifts.map((s) =>
        getShiftSchedule(s.id)
          .then((sc) => [s.id, sc.days] as const)
          .catch(() => [s.id, [] as ShiftDay[]] as const),
      ),
    ).then((entries) => {
      if (!cancelled) setShiftSchedules(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [shifts]);

  const livePeriods = periods.filter((p) => p.status === "published" || p.status === "confirmed");
  const generatedPeriods = periods.filter((p) => p.status === "generated");
  const [reopeningId, setReopeningId] = useState<string | null>(null);

  async function handleReopen(p: Period) {
    setReopeningId(p.id);
    try {
      await reopenAvailability(p.id);
      setPeriods((prev) => prev.map((x) => (x.id === p.id ? { ...x, status: "collecting" } : x)));
      showToast(`Availability reopened for week of ${formatWeekRange(p.week_start)}`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not reopen this week");
    } finally {
      setReopeningId(null);
    }
  }

  async function handleUnpublish() {
    if (!unpublishTarget) return;
    setUnpublishing(true);
    try {
      await unpublishRota(unpublishTarget.id);
      setPeriods((prev) =>
        prev.map((p) => (p.id === unpublishTarget.id ? { ...p, status: "generated" } : p)),
      );
      showToast(`Week of ${formatWeekRange(unpublishTarget.week_start)} unpublished`);
      setUnpublishTarget(null);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not unpublish this rota");
    } finally {
      setUnpublishing(false);
    }
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function handleAddShift() {
    const color = SHIFT_COLORS[shifts.length % SHIFT_COLORS.length];
    try {
      const created = await createShift({
        name: "New Shift",
        start_time: "9:00am",
        end_time: "5:00pm",
        color,
        sort_order: shifts.length,
        min_staff: 1,
        max_staff: 2,
      });
      setShifts((prev) => [...prev, created]);
      setScheduleShift(created);
    } catch {
      showToast("Could not add shift");
    }
  }

  async function handleDeleteShift(shift: Shift) {
    if (shifts.length <= 1) {
      showToast("Need at least one shift");
      return;
    }
    try {
      await deleteShift(shift.id);
      setShifts((prev) => prev.filter((s) => s.id !== shift.id));
      showToast(`${shift.name} shift removed`);
    } catch {
      showToast("Could not remove shift");
    }
  }

  async function handleSaveAll() {
    if (!rules) return;
    setSaving(true);
    try {
      await Promise.all([
        venue && venueName.trim() && venueName !== venue.name ? updateVenue(venueName.trim()) : null,
        // The availability-window datetimes and scheduling rules (max hours,
        // min rest, shift staffing) are owned by Scheduler now; Settings only
        // saves this remaining venue-level field.
        updateRules({ review_email_day: rules.review_email_day }),
      ]);
      showToast("Settings saved!");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <LoadingScreen base="Loading settings…" />;
  }

  if (error || !rules) {
    return (
      <div className="flex flex-col items-center gap-3 p-10 text-center text-sm text-ink-muted">
        Something went wrong loading settings.
        <button
          onClick={() => setReloadToken((n) => n + 1)}
          className="rounded-[10px] bg-accent px-4 py-2 text-[13px] font-semibold text-accent-on"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn px-5 py-6 pb-24 md:px-10 md:py-8 md:pb-8">
      <div className="mb-7 text-[26px] font-bold text-ink md:text-[28px]">Settings</div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:max-w-[840px]">
        {/* Appearance */}
        <div className="rounded-panel border border-hairline bg-surface-card p-6 md:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-base font-bold text-ink">Appearance</div>
              <div className="text-[13px] text-ink-faint">Choose how Rotally looks on this device.</div>
            </div>
            <ThemeToggle />
          </div>
        </div>

        {/* Venue */}
        <div className="overflow-hidden rounded-panel border border-hairline bg-surface-card">
          <div className="px-6 pt-5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Venue
          </div>
          <div className="flex items-center gap-3 px-6 py-3.5">
            <SettingsIconBox name="building" />
            <div className="min-w-0 flex-1">
              <div className="mb-1 text-xs text-ink-faint">Venue name</div>
              <input
                value={venueName}
                onChange={(e) => setVenueName(e.target.value)}
                className="w-full rounded-[10px] border-[1.5px] border-unset-border px-3.5 py-2.5 text-sm outline-none"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 border-t border-hairline px-6 py-3.5">
            <SettingsIconBox name="mail" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-ink">Manager email</div>
              <div className="truncate text-xs text-ink-faint">{venue?.manager_email}</div>
            </div>
          </div>
        </div>

        {/* Roles */}
        <div className="rounded-panel border border-hairline bg-surface-card p-6">
          <div className="mb-1 text-base font-bold text-ink">Roles &amp; stations</div>
          <div className="mb-4 text-[13px] text-ink-faint">
            What staff can be assigned to. Tap a role to edit who works it, or add a new one.
          </div>
          <div className="flex flex-wrap gap-2">
            {roles.map((r) => (
              <button
                key={r.id}
                onClick={() => setRoleSheet({ open: true, role: r })}
                className="flex items-center gap-2 rounded-cp-control border-[0.5px] border-hairline bg-surface-subtle py-2 pl-2.5 pr-3.5 text-[13px] font-medium text-ink-muted transition-colors hover:border-accent/40 hover:text-ink"
              >
                <ManagerIcon name={r.icon as ManagerIconName} size={15} className="text-accent" />
                {r.name}
                {r.staff_ids.length > 0 && (
                  <span className="text-[11px] text-ink-faint">· {r.staff_ids.length}</span>
                )}
              </button>
            ))}
            <button
              onClick={() => setRoleSheet({ open: true, role: null })}
              className="flex items-center gap-1.5 rounded-cp-control border-[0.5px] border-dashed border-hairline bg-transparent px-3.5 py-2 text-[13px] font-medium text-accent"
            >
              <ManagerIcon name="plus" size={14} />
              Add role
            </button>
          </div>
        </div>

        {/* Team */}
        <Link
          href="/team"
          className="flex items-center gap-3 rounded-panel border border-hairline bg-surface-card p-6"
        >
          <SettingsIconBox name="users" />
          <div className="min-w-0 flex-1">
            <div className="text-base font-bold text-ink">Team</div>
            <div className="text-[13px] text-ink-faint">
              {staffCount === null ? "Manage your staff" : `${staffCount} active staff member${staffCount === 1 ? "" : "s"}`}
            </div>
          </div>
          <ManagerIcon name="chevron-right" size={18} className="shrink-0 text-ink-faint" />
        </Link>

        {/* Pay & labour cost — no backend field for a rate yet, honest placeholder */}
        <div className="rounded-panel border border-hairline bg-surface-card p-6">
          <div className="flex items-start gap-3">
            <SettingsIconBox name="coins" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-ink">
                Pay &amp; labour cost <span className="font-normal text-ink-faint">· optional</span>
              </div>
              <div className="mt-1 text-[12px] leading-[1.5] text-ink-faint">
                Not available yet — Rotally doesn&apos;t track pay rates today, so there&apos;s no live
                labour cost to show. Coming in a future update.
              </div>
            </div>
          </div>
        </div>

        {/* Account */}
        <div className="overflow-hidden rounded-panel border border-hairline bg-surface-card">
          <div className="flex items-center gap-3 px-6 py-3.5">
            <SettingsIconBox name="star" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-ink">Plan</div>
              <div className="text-xs text-ink-faint">Rotally Pro</div>
            </div>
            <span className="rounded-full bg-surface-subtle px-2.5 py-1 text-[11px] font-medium text-ink-faint">
              Coming soon
            </span>
          </div>
          <div className="flex items-center gap-3 border-t border-hairline px-6 py-3.5">
            <SettingsIconBox name="plug" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-ink">Integrations</div>
              <div className="text-xs text-ink-faint">Square, Xero</div>
            </div>
            <span className="rounded-full bg-surface-subtle px-2.5 py-1 text-[11px] font-medium text-ink-faint">
              Coming soon
            </span>
          </div>
        </div>

        {/* Shifts */}
        <div className="rounded-panel border border-hairline bg-surface-card p-6 md:col-span-2">
          <div className="mb-1 text-base font-bold text-ink">Shift Types</div>
          {venue?.needs_shift_recapture && (
            <div className="mb-4 flex items-start gap-2.5 rounded-input border border-accent-border bg-accent-light px-3.5 py-3 text-[13px] text-accent">
              <ManagerIcon name="info-circle" size={16} />
              <span>
                We set your evening shifts to a placeholder <span className="font-semibold">11pm</span> close.
                <span className="font-semibold"> Tap a shift</span> to enter the real closing time
                (a 1am or 2:30am close is fine) — this clears once you save.
              </span>
            </div>
          )}
          <div className="mb-4 text-[13px] text-ink-faint">
            We started you with a Day and an Evening shift — rename them or add more (e.g. a lunch
            service) here. <span className="font-semibold text-ink">Tap a shift</span> to set which days
            it runs and different hours per day (e.g. a later close on weekends). Max hours/week and min
            rest live in{" "}
            <a href="/scheduler" className="font-semibold text-accent">
              Scheduler
            </a>
            .
          </div>
          {/* Each row taps into one editor (name + days + hours + staff). The row
              itself carries the trust signals — which days it runs (the 7-dot
              strip) and the real hours, divergent hours shown inline, never
              hidden behind "varies". Delete lives in the ⋯ overflow. */}
          <div className="flex flex-col gap-2">
            {shifts.map((sh) => {
              const sched = shiftSchedules[sh.id];
              const sum = sched ? summariseShift(sched) : null;
              const staffLabel = `${sh.min_staff}${sh.max_staff !== sh.min_staff ? `–${sh.max_staff}` : ""} staff`;
              return (
                <div key={sh.id} className="relative">
                  <button
                    type="button"
                    onClick={() => setScheduleShift(sh)}
                    className="flex w-full items-stretch gap-3 rounded-[11px] border-[0.5px] border-hairline bg-surface-subtle px-3 py-3 pr-9 text-left transition-colors hover:border-accent-border"
                  >
                    <div className="w-1 shrink-0 self-stretch rounded-sm" style={{ background: sh.color }} />
                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-ink">{sh.name}</span>
                        <span className="shrink-0 rounded-full border-[0.5px] border-hairline px-2 py-px text-[10.5px] text-ink-muted">
                          {staffLabel}
                        </span>
                      </div>
                      {sum && (
                        <div className="mb-1.5 flex gap-[5px]">
                          {sum.strip.map((d, i) => (
                            <div key={i} className="flex w-[22px] flex-col items-center gap-1">
                              <span className="text-[9px] uppercase tracking-wide text-ink-faint">{DAY_INITIAL[i]}</span>
                              <span
                                className={`relative h-4 w-4 rounded-[5px] ${d.open ? "bg-accent" : "bg-cp-icon"}`}
                              >
                                {d.late && (
                                  <span
                                    className="absolute -bottom-0.5 -right-0.5 h-[7px] w-[7px] rounded-full border border-surface-subtle"
                                    style={{ background: "var(--cp-amber)" }}
                                  />
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="truncate text-xs text-ink-muted">
                        {sum ? (
                          sum.closed ? (
                            "No days set — tap to set hours"
                          ) : (
                            <>
                              {sum.baseDays} · {sum.baseHours}
                              {sum.exception && (
                                <>
                                  {" · "}
                                  <span className="font-medium text-accent">{sum.exception}</span>
                                </>
                              )}
                            </>
                          )
                        ) : (
                          `${sh.start_time} – ${sh.end_time}`
                        )}
                      </div>
                    </div>
                    <svg
                      className="shrink-0 self-center text-ink-faint"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    aria-label={`More options for ${sh.name}`}
                    onClick={() => setMenuShiftId((id) => (id === sh.id ? null : sh.id))}
                    className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-md text-ink-faint hover:bg-accent-light hover:text-ink"
                  >
                    <span className="text-lg leading-none">⋯</span>
                  </button>
                  {menuShiftId === sh.id && (
                    <div className="absolute right-1.5 top-9 z-20 min-w-[150px] rounded-lg border border-hairline bg-surface-card p-1 shadow-[0_10px_30px_var(--c-shadow)]">
                      <button
                        type="button"
                        onClick={() => {
                          setMenuShiftId(null);
                          handleDeleteShift(sh);
                        }}
                        className="w-full rounded-md px-3 py-2 text-left text-[13px] font-medium text-unavail-text hover:bg-surface-subtle"
                      >
                        Delete shift
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {menuShiftId && (
            <button
              type="button"
              aria-hidden="true"
              tabIndex={-1}
              onClick={() => setMenuShiftId(null)}
              className="fixed inset-0 z-10 cursor-default"
            />
          )}
          <div className="mt-2 flex flex-col gap-2">
            <button
              onClick={handleAddShift}
              className="mt-1 rounded-[10px] border-2 border-dashed border-accent-border py-3 text-center text-[13px] font-semibold text-accent"
            >
              + Add shift
            </button>
          </div>
        </div>

        {/* Availability window + notifications */}
        <div className="rounded-panel border border-hairline bg-surface-card p-6">
          <div className="mb-1 text-base font-bold text-ink">Availability &amp; Notifications</div>
          <div className="mb-4 text-[13px] text-ink-faint">
            The availability window is now automatic — it opens, reminds and closes itself around each
            week&apos;s shifts. Adjust the timing in{" "}
            <a href="/scheduler" className="font-semibold text-accent">
              Scheduler
            </a>
            .
          </div>
          <div className="flex flex-col gap-3.5">
            <RuleRow label="Manager review email">
              <select
                value={rules.review_email_day}
                onChange={(e) => setRules((r) => (r ? { ...r, review_email_day: e.target.value } : r))}
                className="rounded-lg border-[1.5px] border-unset-border bg-surface-subtle px-3 py-2 text-sm font-semibold text-ink outline-none"
              >
                {DAY_NAMES.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </RuleRow>
          </div>
        </div>

        {/* Holiday */}
        <div className="rounded-panel border border-hairline bg-surface-card p-6">
          <div className="mb-1 text-base font-bold text-ink">Holiday</div>
          <div className="mb-4 text-[13px] text-ink-faint">
            Sets what every staff member sees on their Time off screen. Each person&apos;s own
            entitlement is worked out pro-rata from the days a week they work — set that per person in{" "}
            <a href="/team" className="font-semibold text-accent">
              Team
            </a>
            .
          </div>
          <div className="flex flex-col gap-3.5">
            <RuleRow label="Leave year starts">
              <select
                value={leaveSettings?.leave_year_start_month ?? 1}
                onChange={(e) => saveLeaveSettings({ leave_year_start_month: Number(e.target.value) })}
                className="rounded-lg border-[1.5px] border-unset-border bg-surface-subtle px-3 py-2 text-sm font-semibold text-ink outline-none"
              >
                {MONTH_NAMES.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
            </RuleRow>
            <RuleRow label="Full-time allowance (days)">
              <input
                type="number"
                min="0"
                max="366"
                step="0.5"
                defaultValue={leaveSettings?.full_time_leave_days ?? 28}
                onBlur={(e) => saveLeaveSettings({ full_time_leave_days: Number(e.target.value) })}
                className="w-24 rounded-lg border-[1.5px] border-unset-border bg-surface-subtle px-3 py-2 text-sm font-semibold text-ink outline-none"
              />
            </RuleRow>
          </div>
          <div className="mt-3 text-[11px] leading-[1.45] text-ink-faint">
            28 days is the UK statutory minimum for someone working five days a week. Anyone working
            fewer gets that figure pro-rata.
          </div>
        </div>

        {/* Unpublish */}
        {livePeriods.length > 0 && (
          <div className="rounded-panel border border-hairline bg-surface-card p-6 md:col-span-2">
            <div className="mb-1 text-base font-bold text-ink">Live Rotas</div>
            <div className="mb-4 text-[13px] text-ink-faint">
              Unpublish a rota to pull it off the staff-facing view and make changes before
              re-publishing. Assignments stay intact — this doesn&apos;t recall emails already sent.
            </div>
            <div className="flex flex-col gap-2">
              {livePeriods.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-surface-subtle px-3.5 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-semibold text-ink">{formatWeekRange(p.week_start)}</div>
                    <StatusBanner status={p.status} />
                  </div>
                  <button
                    onClick={() => setUnpublishTarget(p)}
                    className="rounded-lg px-3 py-2 text-[13px] font-medium text-unavail-text"
                  >
                    Unpublish
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {generatedPeriods.length > 0 && (
          <div className="rounded-panel border border-hairline bg-surface-card p-6 md:col-span-2">
            <div className="mb-1 text-base font-bold text-ink">Generated (not published)</div>
            <div className="mb-4 text-[13px] text-ink-faint">
              These rotas have been solved but not published. Reopen a week to unlock the availability
              grid so staff can submit or amend again before you re-generate — assignments are kept.
            </div>
            <div className="flex flex-col gap-2">
              {generatedPeriods.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-surface-subtle px-3.5 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-semibold text-ink">{formatWeekRange(p.week_start)}</div>
                    <StatusBanner status={p.status} />
                  </div>
                  <button
                    onClick={() => handleReopen(p)}
                    disabled={reopeningId === p.id}
                    className="rounded-lg px-3 py-2 text-[13px] font-medium text-accent disabled:opacity-60"
                  >
                    {reopeningId === p.id ? "Reopening…" : "Reopen availability"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <button
        onClick={handleSaveAll}
        disabled={saving}
        className="mt-6 rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-accent-on disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save Changes"}
      </button>

      <Modal
        open={!!unpublishTarget}
        onClose={() => setUnpublishTarget(null)}
        title="Unpublish this rota?"
      >
        <div className="mb-5 text-[13px] text-ink-muted">
          Staff won&apos;t be able to see the rota for{" "}
          <span className="font-semibold text-ink">
            {unpublishTarget ? formatWeekRange(unpublishTarget.week_start) : ""}
          </span>{" "}
          until you re-publish it. Assignments aren&apos;t touched, and any drop, claim or swap
          actions already made stay in place.
        </div>
        <div className="flex gap-2.5">
          <button
            onClick={() => setUnpublishTarget(null)}
            className="flex-1 rounded-xl bg-unset-bg py-3.5 text-center text-sm font-semibold text-ink-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleUnpublish}
            disabled={unpublishing}
            className="flex-1 rounded-xl bg-unavail-text py-3.5 text-center text-sm font-semibold text-white disabled:opacity-60"
          >
            {unpublishing ? "Unpublishing…" : "Unpublish"}
          </button>
        </div>
      </Modal>

      <RoleSheet
        open={roleSheet.open}
        role={roleSheet.role}
        staff={staff}
        onClose={() => setRoleSheet({ open: false, role: null })}
        onSaved={(saved) => {
          setRoles((prev) => {
            const exists = prev.some((r) => r.id === saved.id);
            return exists
              ? prev.map((r) => (r.id === saved.id ? saved : r))
              : [...prev, saved];
          });
          showToast(roleSheet.role ? "Role updated" : `“${saved.name}” added`);
        }}
        onDeleted={(id) => {
          setRoles((prev) => prev.filter((r) => r.id !== id));
          showToast("Role deleted");
        }}
        onError={showToast}
      />

      <ShiftDayEditor
        shift={scheduleShift}
        onClose={() => setScheduleShift(null)}
        onSaved={() => setReloadToken((n) => n + 1)}
        onDelete={() => {
          const target = scheduleShift;
          setScheduleShift(null);
          if (target) handleDeleteShift(target);
        }}
        showToast={showToast}
      />

      <Toast message={toast} />
    </div>
  );
}

function SettingsIconBox({ name }: { name: ManagerIconName }) {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cp-icon text-accent">
      <ManagerIcon name={name} size={16} />
    </div>
  );
}

function RuleRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-surface-page pb-3.5 last:border-0 last:pb-0">
      <div className="text-[13px] text-ink-label">{label}</div>
      {children}
    </div>
  );
}
