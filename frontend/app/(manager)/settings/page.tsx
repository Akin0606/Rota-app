"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import ManagerIcon, { type ManagerIconName } from "@/components/manager/icon";
import RoleSheet from "@/components/manager/role-sheet";
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
  StaffManager,
  Venue,
  VenueLeaveSettings,
  createShift,
  deleteShift,
  getRules,
  getVenue,
  getVenueLeaveSettings,
  listPeriods,
  listRoles,
  listShifts,
  listStaff,
  reopenAvailability,
  unpublishRota,
  updateRules,
  updateShift,
  updateVenue,
  updateVenueLeaveSettings,
} from "@/lib/api";
import { END_TIMES, SHIFT_COLORS, START_TIMES } from "@/lib/constants";
import { DAY_NAMES, formatWeekRange } from "@/lib/utils";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function SettingsPage() {
  const [venue, setVenue] = useState<Venue | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
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
  const [error, setError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [venueName, setVenueName] = useState("");
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [unpublishTarget, setUnpublishTarget] = useState<Period | null>(null);
  const [unpublishing, setUnpublishing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
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
        setShifts(shiftsRes);
        setRules(rulesRes);
        setPeriods(periodsRes);
        setStaff(staffRes.filter((m) => m.is_active));
        setStaffCount(staffRes.filter((m) => m.is_active).length);
        setRoles(rolesRes);
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

  function patchShiftLocal(id: string, patch: Partial<Shift>) {
    setShifts((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  async function handleShiftDone(shift: Shift) {
    try {
      await updateShift(shift.id, {
        name: shift.name,
        start_time: shift.start_time,
        end_time: shift.end_time,
      });
      setEditingShiftId(null);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not save shift");
    }
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
      setEditingShiftId(created.id);
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
          className="rounded-[10px] bg-accent px-4 py-2 text-[13px] font-semibold text-white"
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
              <div className="text-[13px] text-ink-faint">Choose how Crewplan looks on this device.</div>
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
                Not available yet — Crewplan doesn&apos;t track pay rates today, so there&apos;s no live
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
              <div className="text-xs text-ink-faint">Crewplan Pro</div>
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
          <div className="mb-4 text-[13px] text-ink-faint">
            Name and timing live here. Adjust min/max staff per shift, max hours/week and min rest in{" "}
            <a href="/scheduler" className="font-semibold text-accent">
              Scheduler
            </a>
            .
          </div>
          <div className="flex flex-col gap-2">
            {shifts.map((sh) =>
              editingShiftId === sh.id ? (
                <div key={sh.id} className="flex items-center gap-2.5 rounded-[10px] border-2 border-accent bg-accent-light p-3.5">
                  <div className="h-[60px] w-1 shrink-0 rounded-sm" style={{ background: sh.color }} />
                  <div className="flex flex-1 flex-col gap-2">
                    <input
                      value={sh.name}
                      onChange={(e) => patchShiftLocal(sh.id, { name: e.target.value })}
                      className="w-full rounded-lg border-[1.5px] border-accent-border px-2.5 py-2 text-sm font-semibold outline-none"
                    />
                    <div className="flex items-center gap-1.5">
                      <select
                        value={sh.start_time}
                        onChange={(e) => patchShiftLocal(sh.id, { start_time: e.target.value })}
                        className="flex-1 rounded-lg border-[1.5px] border-accent-border bg-surface-subtle px-2 py-2 text-[13px] outline-none"
                      >
                        {START_TIMES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <span className="text-[13px] text-ink-muted">→</span>
                      <select
                        value={sh.end_time}
                        onChange={(e) => patchShiftLocal(sh.id, { end_time: e.target.value })}
                        className="flex-1 rounded-lg border-[1.5px] border-accent-border bg-surface-subtle px-2 py-2 text-[13px] outline-none"
                      >
                        {END_TIMES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <button
                    onClick={() => handleShiftDone(sh)}
                    className="shrink-0 rounded-lg px-3 py-2 text-[13px] font-semibold text-accent"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <div key={sh.id} className="flex items-center gap-2.5 rounded-[10px] bg-surface-subtle px-3.5 py-3">
                  <div className="h-6 w-1 shrink-0 rounded-sm" style={{ background: sh.color }} />
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-ink">{sh.name}</div>
                    <div className="text-xs text-ink-faint">
                      {sh.start_time} – {sh.end_time} · {sh.min_staff}
                      {sh.max_staff !== sh.min_staff ? `–${sh.max_staff}` : ""} staff
                    </div>
                  </div>
                  <button
                    onClick={() => setEditingShiftId(sh.id)}
                    className="rounded-lg px-3 py-2 text-[13px] font-medium text-accent"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteShift(sh)}
                    className="rounded-lg px-3 py-2 text-[13px] font-medium text-unavail-text"
                  >
                    Delete
                  </button>
                </div>
              ),
            )}
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
        className="mt-6 rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
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
