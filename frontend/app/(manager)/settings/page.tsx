"use client";

import { useEffect, useState } from "react";

import LoadingScreen from "@/components/loading-screen";
import ThemeToggle from "@/components/theme-toggle";
import Toast from "@/components/toast";
import {
  ApiError,
  SchedulingRules,
  Shift,
  Venue,
  createShift,
  deleteShift,
  getRules,
  getVenue,
  listShifts,
  updateRules,
  updateShift,
  updateVenue,
} from "@/lib/api";
import { END_TIMES, SHIFT_COLORS, START_TIMES } from "@/lib/constants";
import { DAY_NAMES } from "@/lib/utils";

export default function SettingsPage() {
  const [venue, setVenue] = useState<Venue | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [rules, setRules] = useState<SchedulingRules | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [venueName, setVenueName] = useState("");
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(false);
      try {
        const [venueRes, shiftsRes, rulesRes] = await Promise.all([getVenue(), listShifts(), getRules()]);
        if (cancelled) return;
        setVenue(venueRes);
        setVenueName(venueRes.name);
        setShifts(shiftsRes);
        setRules(rulesRes);
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

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  function patchShiftLocal(id: string, patch: Partial<Shift>) {
    setShifts((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  async function handleShiftDone(shift: Shift) {
    if (shift.max_staff < shift.min_staff) {
      showToast("Max staff can't be below min staff");
      return;
    }
    try {
      await updateShift(shift.id, {
        name: shift.name,
        start_time: shift.start_time,
        end_time: shift.end_time,
        min_staff: shift.min_staff,
        max_staff: shift.max_staff,
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
        updateRules(rules),
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
        <div className="rounded-panel border border-hairline bg-surface-card p-6">
          <div className="mb-4 text-base font-bold text-ink">Venue Details</div>
          <div className="flex flex-col gap-3.5">
            <div>
              <div className="mb-1 text-xs text-ink-faint">Venue name</div>
              <input
                value={venueName}
                onChange={(e) => setVenueName(e.target.value)}
                className="w-full rounded-[10px] border-[1.5px] border-unset-border px-3.5 py-2.5 text-sm outline-none"
              />
            </div>
            <div>
              <div className="mb-1 text-xs text-ink-faint">Manager email</div>
              <div className="rounded-[10px] border-[1.5px] border-unset-border px-3.5 py-2.5 text-sm text-ink-label">
                {venue?.manager_email}
              </div>
            </div>
          </div>
        </div>

        {/* Rules */}
        <div className="rounded-panel border border-hairline bg-surface-card p-6">
          <div className="mb-4 text-base font-bold text-ink">Scheduling Rules</div>
          <div className="flex flex-col gap-3.5">
            <RuleRow label="Max hours / week">
              <input
                type="number"
                value={rules.max_hours_per_week}
                onChange={(e) => setRules((r) => (r ? { ...r, max_hours_per_week: Number(e.target.value) } : r))}
                className="w-[70px] rounded-lg border-[1.5px] border-unset-border px-3 py-2 text-center text-sm font-semibold text-ink outline-none"
              />
            </RuleRow>
            <RuleRow label="Min rest between shifts (hrs)">
              <input
                type="number"
                value={rules.min_rest_hours}
                onChange={(e) => setRules((r) => (r ? { ...r, min_rest_hours: Number(e.target.value) } : r))}
                className="w-[70px] rounded-lg border-[1.5px] border-unset-border px-3 py-2 text-center text-sm font-semibold text-ink outline-none"
              />
            </RuleRow>
          </div>
        </div>

        {/* Shifts */}
        <div className="rounded-panel border border-hairline bg-surface-card p-6">
          <div className="mb-4 text-base font-bold text-ink">Shift Types</div>
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
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] text-ink-label">Staff needed</span>
                      <label className="flex items-center gap-1 text-[12px] text-ink-faint">
                        min
                        <input
                          type="number"
                          min={0}
                          value={sh.min_staff}
                          onChange={(e) =>
                            patchShiftLocal(sh.id, { min_staff: Math.max(0, Number(e.target.value)) })
                          }
                          className="w-[52px] rounded-lg border-[1.5px] border-accent-border bg-surface-subtle px-2 py-1.5 text-center text-[13px] font-semibold outline-none"
                        />
                      </label>
                      <label className="flex items-center gap-1 text-[12px] text-ink-faint">
                        max
                        <input
                          type="number"
                          min={1}
                          value={sh.max_staff}
                          onChange={(e) =>
                            patchShiftLocal(sh.id, { max_staff: Math.max(1, Number(e.target.value)) })
                          }
                          className="w-[52px] rounded-lg border-[1.5px] border-accent-border bg-surface-subtle px-2 py-1.5 text-center text-[13px] font-semibold outline-none"
                        />
                      </label>
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

        {/* Availability window */}
        <div className="rounded-panel border border-hairline bg-surface-card p-6">
          <div className="mb-1 text-base font-bold text-ink">Availability Window</div>
          <div className="mb-4 text-[13px] text-ink-faint">
            Set the exact date &amp; time for each step. Staff are emailed automatically at each
            point, and the window rolls forward a week after it closes.
          </div>
          <div className="flex flex-col gap-3.5">
            <RuleRow label="Opens">
              <input
                type="datetime-local"
                value={dtLocal(rules.avail_opens_at)}
                onChange={(e) => setRules((r) => (r ? { ...r, avail_opens_at: e.target.value } : r))}
                className="rounded-lg border-[1.5px] border-unset-border px-3 py-2 text-sm font-semibold text-ink outline-none"
              />
            </RuleRow>
            <RuleRow label="Reminder">
              <input
                type="datetime-local"
                value={dtLocal(rules.avail_reminder_at)}
                onChange={(e) => setRules((r) => (r ? { ...r, avail_reminder_at: e.target.value } : r))}
                className="rounded-lg border-[1.5px] border-unset-border px-3 py-2 text-sm font-semibold text-ink outline-none"
              />
            </RuleRow>
            <RuleRow label="Closes">
              <input
                type="datetime-local"
                value={dtLocal(rules.avail_closes_at)}
                onChange={(e) => setRules((r) => (r ? { ...r, avail_closes_at: e.target.value } : r))}
                className="rounded-lg border-[1.5px] border-unset-border px-3 py-2 text-sm font-semibold text-ink outline-none"
              />
            </RuleRow>
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
      </div>

      <button
        onClick={handleSaveAll}
        disabled={saving}
        className="mt-6 rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save Changes"}
      </button>

      <Toast message={toast} />
    </div>
  );
}

// A stored datetime ("YYYY-MM-DDTHH:MM:SS" or null) trimmed to what a
// datetime-local input expects ("YYYY-MM-DDTHH:MM").
function dtLocal(value: string | null): string {
  return (value ?? "").slice(0, 16);
}

function RuleRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-surface-page pb-3.5 last:border-0 last:pb-0">
      <div className="text-[13px] text-ink-label">{label}</div>
      {children}
    </div>
  );
}
