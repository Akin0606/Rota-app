"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import GenerateOverlay from "@/components/manager/generate-overlay";
import ManagerIcon, { ManagerIconName } from "@/components/manager/icon";
import LoadingScreen from "@/components/loading-screen";
import Toast from "@/components/toast";
import {
  ApiError,
  RotaSummary,
  SchedulerConfig,
  SchedulerWeek,
  SchedulingRules,
  Shift,
  clearScheduleOverride,
  createPeriod,
  generateRota,
  getRules,
  getScheduler,
  listPeriods,
  listShifts,
  setScheduleOverride,
  updateRules,
  updateScheduler,
  updateShift,
} from "@/lib/api";

// The API returns naive wall-clock strings ("YYYY-MM-DDTHH:MM:SS"). Format for
// display without letting the browser apply a timezone shift.
function fmtDateTime(value: string): string {
  const [datePart, timePart = "00:00:00"] = value.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":");
  const date = new Date(y, (m || 1) - 1, d || 1);
  const label = date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  return `${label}, ${hh}:${mm}`;
}

function dtLocal(value: string): string {
  return (value ?? "").slice(0, 16);
}

// Hours between a wall-clock earliest-shift datetime and a chosen close time.
function noticeHoursBetween(earliestShiftAt: string, closeLocal: string): number {
  const a = new Date(earliestShiftAt.slice(0, 16)).getTime();
  const b = new Date(closeLocal).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  return (a - b) / 3_600_000;
}

export default function SchedulerPage() {
  const router = useRouter();
  const [config, setConfig] = useState<SchedulerConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [savingOffsets, setSavingOffsets] = useState(false);

  // Offset form state (open shown in days, others in hours).
  const [openDays, setOpenDays] = useState(6);
  const [reminderHours, setReminderHours] = useState(24);
  const [bufferHours, setBufferHours] = useState(6);

  // Override form state.
  const [overrideWeek, setOverrideWeek] = useState<string>("");
  const [overrideClose, setOverrideClose] = useState<string>("");
  const [savingOverride, setSavingOverride] = useState(false);
  const [riskOpen, setRiskOpen] = useState(false);
  const [riskHours, setRiskHours] = useState<number | null>(null);

  // 1-day-off-in-7 toggle state.
  const [dayOffRequired, setDayOffRequired] = useState(true);
  const [savingDayOff, setSavingDayOff] = useState(false);
  const [dayOffRiskOpen, setDayOffRiskOpen] = useState(false);

  // Scheduling rules (venue preferences) form state.
  const [maxHoursPerWeek, setMaxHoursPerWeek] = useState(48);
  const [minRestHours, setMinRestHours] = useState(11);
  const [savingRules, setSavingRules] = useState(false);

  // Shift staffing form state, keyed by shift id.
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [staffingForm, setStaffingForm] = useState<Record<string, { min_staff: number; max_staff: number }>>({});
  const [savingStaffing, setSavingStaffing] = useState(false);

  // Generate flow (shared animated overlay).
  const [genWeek, setGenWeek] = useState<string>("");
  const [genOverlayOpen, setGenOverlayOpen] = useState(false);
  const [genResult, setGenResult] = useState<RotaSummary | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(false);
      try {
        const [schedulerRes, rulesRes, shiftsRes] = await Promise.all([getScheduler(), getRules(), listShifts()]);
        if (cancelled) return;
        applyConfig(schedulerRes);
        applyRules(rulesRes);
        applyShifts(shiftsRes);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken]);

  function applyConfig(res: SchedulerConfig) {
    setConfig(res);
    setOpenDays(Math.round(res.open_offset_hours / 24));
    setReminderHours(res.reminder_offset_hours);
    setBufferHours(res.notice_buffer_hours);
    setDayOffRequired(res.require_day_off);
    // Default the override + generate pickers to the first upcoming week if unset.
    if (res.weeks.length && !overrideWeek) {
      setOverrideWeek(res.weeks[0].week_start);
      setOverrideClose(dtLocal(res.weeks[0].closes_at));
    }
    if (res.weeks.length && !genWeek) setGenWeek(res.weeks[0].week_start);
  }

  function applyRules(res: SchedulingRules) {
    setMaxHoursPerWeek(res.max_hours_per_week);
    setMinRestHours(res.min_rest_hours);
  }

  function applyShifts(res: Shift[]) {
    setShifts(res);
    setStaffingForm(Object.fromEntries(res.map((sh) => [sh.id, { min_staff: sh.min_staff, max_staff: sh.max_staff }])));
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }

  const selectedWeek: SchedulerWeek | undefined = useMemo(
    () => config?.weeks.find((w) => w.week_start === overrideWeek),
    [config, overrideWeek],
  );

  function handleWeekChange(weekStart: string) {
    setOverrideWeek(weekStart);
    const wk = config?.weeks.find((w) => w.week_start === weekStart);
    if (wk) setOverrideClose(dtLocal(wk.closes_at));
  }

  const liveNotice = useMemo(() => {
    if (!selectedWeek || !overrideClose) return NaN;
    return noticeHoursBetween(selectedWeek.earliest_shift_at, overrideClose);
  }, [selectedWeek, overrideClose]);

  const legalMin = config?.legal_notice_hours ?? 72;

  // Reference's live "N shifts / week": coverage is per-shift min_staff, applied
  // to all 7 days (no per-day override in our model), so it's 7 × Σ min_staff.
  const shiftsPerWeek = useMemo(
    () => shifts.reduce((sum, sh) => sum + (staffingForm[sh.id]?.min_staff ?? sh.min_staff), 0) * 7,
    [shifts, staffingForm],
  );

  async function handleSaveOffsets() {
    setSavingOffsets(true);
    try {
      const res = await updateScheduler({
        open_offset_hours: Math.max(0, Math.round(openDays)) * 24,
        reminder_offset_hours: Math.max(0, Math.round(reminderHours)),
        notice_buffer_hours: Math.max(0, Math.round(bufferHours)),
      });
      applyConfig(res);
      showToast("Timing saved");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not save timing");
    } finally {
      setSavingOffsets(false);
    }
  }

  async function handleSaveRules() {
    setSavingRules(true);
    try {
      const res = await updateRules({
        max_hours_per_week: Math.max(1, Math.round(maxHoursPerWeek)),
        min_rest_hours: Math.max(0, Math.round(minRestHours)),
      });
      applyRules(res);
      showToast("Scheduling rules saved");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not save rules");
    } finally {
      setSavingRules(false);
    }
  }

  function patchStaffingLocal(shiftId: string, patch: Partial<{ min_staff: number; max_staff: number }>) {
    setStaffingForm((prev) => ({ ...prev, [shiftId]: { ...prev[shiftId], ...patch } }));
  }

  async function handleSaveStaffing() {
    const changed = shifts.filter((sh) => {
      const f = staffingForm[sh.id];
      return f && (f.min_staff !== sh.min_staff || f.max_staff !== sh.max_staff);
    });
    if (!changed.length) {
      showToast("No staffing changes to save");
      return;
    }
    for (const sh of changed) {
      const f = staffingForm[sh.id];
      if (f.max_staff < f.min_staff) {
        showToast(`${sh.name}: max staff can't be below min staff`);
        return;
      }
    }
    setSavingStaffing(true);
    try {
      const updated = await Promise.all(changed.map((sh) => updateShift(sh.id, staffingForm[sh.id])));
      setShifts((prev) => prev.map((sh) => updated.find((u) => u.id === sh.id) ?? sh));
      showToast("Coverage saved");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not save coverage");
    } finally {
      setSavingStaffing(false);
    }
  }

  async function submitOverride(confirm: boolean) {
    if (!overrideWeek || !overrideClose) return;
    setSavingOverride(true);
    try {
      const res = await setScheduleOverride(overrideWeek, overrideClose, confirm);
      if (res.status === "needs_confirm") {
        setRiskHours(res.notice_hours);
        setRiskOpen(true);
        return;
      }
      if (res.config) applyConfig(res.config);
      setRiskOpen(false);
      showToast("Close time overridden");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not save override");
    } finally {
      setSavingOverride(false);
    }
  }

  async function handleReset(weekStart: string) {
    try {
      const res = await clearScheduleOverride(weekStart);
      applyConfig(res);
      showToast("Reverted to automatic");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not reset");
    }
  }

  async function submitDayOff(next: boolean, confirm: boolean) {
    setSavingDayOff(true);
    try {
      const res = await updateScheduler({ require_day_off: next, confirm });
      if (res.status === "needs_confirm") {
        setDayOffRiskOpen(true);
        return;
      }
      applyConfig(res);
      setDayOffRiskOpen(false);
      showToast(next ? "Day-off rule enabled" : "Day-off rule disabled");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not update setting");
    } finally {
      setSavingDayOff(false);
    }
  }

  function handleToggleDayOff() {
    submitDayOff(!dayOffRequired, false);
  }

  // Generate for the week chosen on the sticky bar: reuse or open its period,
  // then run the solver behind the shared animated overlay.
  async function handleGenerate() {
    if (!genWeek) return;
    setGenResult(null);
    setGenError(null);
    setGenOverlayOpen(true);
    try {
      const periods = await listPeriods();
      let period = periods.find((p) => p.week_start === genWeek);
      if (!period) period = await createPeriod(genWeek);
      const result = await generateRota(period.id);
      setGenResult(result);
    } catch (err) {
      setGenError(err instanceof ApiError ? err.message : "Could not generate rota. Try again.");
    }
  }

  if (loading) return <LoadingScreen base="Loading scheduler…" />;

  if (error || !config) {
    return (
      <div className="cp-manager flex flex-col items-center gap-3 p-10 text-center text-sm text-ink-muted">
        Something went wrong loading the scheduler.
        <button
          onClick={() => setReloadToken((n) => n + 1)}
          className="rounded-cp-control bg-accent px-4 py-2 text-[13px] font-medium text-accent-on"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 pb-[calc(150px+env(safe-area-inset-bottom))] pt-2 md:pb-28">
      {!config.has_shifts && (
        <div className="mb-4 mt-2 rounded-cp-control border-[0.5px] border-cp-amber/30 bg-cp-amber-soft px-3.5 py-3 text-[12px] text-ink">
          Add at least one shift in <span className="font-medium">Settings</span> so the scheduler can work out
          coverage and each week&apos;s close time.
        </div>
      )}

      {/* ---------- Coverage ---------- */}
      <SectionLabel title="Coverage — how many you need" hint="Min aimed for · max never exceeded" />
      {shifts.length === 0 ? (
        <EmptyNote>No shifts yet. Add shifts in Settings to set coverage.</EmptyNote>
      ) : (
        shifts.map((sh) => {
          const f = staffingForm[sh.id] ?? { min_staff: sh.min_staff, max_staff: sh.max_staff };
          return (
            <div key={sh.id} className="mb-2.5 rounded-cp-card border-[0.5px] border-hairline bg-surface-card px-4 py-3.5">
              <div className="mb-3 flex items-center gap-2.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: sh.color }} />
                <span className="text-sm font-medium text-ink">{sh.name}</span>
                <span className="ml-auto text-[11px] text-ink-muted">
                  {sh.start_time} – {sh.end_time}
                </span>
              </div>
              <CoverageRow
                label="Minimum"
                sub="target per day"
                value={f.min_staff}
                min={0}
                onChange={(n) => patchStaffingLocal(sh.id, { min_staff: n })}
              />
              <CoverageRow
                label="Maximum"
                sub="cap per day"
                value={f.max_staff}
                min={1}
                onChange={(n) => patchStaffingLocal(sh.id, { max_staff: n })}
              />
            </div>
          );
        })
      )}
      {shifts.length > 0 && (
        <SaveButton onClick={handleSaveStaffing} busy={savingStaffing} label="Save coverage" />
      )}

      {/* ---------- Shift rules ---------- */}
      <SectionLabel title="Shift rules" />
      <div className="grid grid-cols-2 gap-2.5">
        <RuleCell icon="moon" label="Rest gap">
          <Stepper value={minRestHours} min={0} suffix="hrs" onChange={setMinRestHours} />
        </RuleCell>
        <RuleCell icon="clock" label="Max / week">
          <Stepper value={maxHoursPerWeek} min={1} suffix="hrs" onChange={setMaxHoursPerWeek} />
        </RuleCell>
        <div className="col-span-2 flex items-center justify-between rounded-cp-panel border-[0.5px] border-hairline bg-surface-card px-3.5 py-3">
          <div className="flex items-center gap-2 text-[12px] text-ink-muted">
            <ManagerIcon name="calendar-off" size={14} /> One day off in 7
          </div>
          <button
            role="switch"
            aria-checked={dayOffRequired}
            onClick={handleToggleDayOff}
            disabled={savingDayOff}
            className={`relative h-[26px] w-[46px] shrink-0 rounded-full transition-colors disabled:opacity-60 ${
              dayOffRequired ? "bg-accent" : "cp-hairline bg-cp-icon"
            }`}
          >
            <span
              className={`absolute top-[3px] h-5 w-5 rounded-full bg-white transition-transform ${
                dayOffRequired ? "translate-x-[23px]" : "translate-x-[3px]"
              }`}
            />
          </button>
        </div>
        <div className="col-span-2 flex items-center justify-between rounded-cp-panel border-[0.5px] border-accent/15 bg-accent-light/60 px-3.5 py-3">
          <div className="flex items-center gap-2 text-[12px] text-ink-muted">
            <ManagerIcon name="shield" size={14} className="text-accent" /> Under-18 rules · 5 hard constraints
          </div>
          <span className="rounded-cp-badge bg-accent-light px-2 py-1 text-[9px] font-semibold tracking-[0.05em] text-accent">
            ALWAYS ON
          </span>
        </div>
      </div>
      <SaveButton onClick={handleSaveRules} busy={savingRules} label="Save rules" />

      {/* ---------- Availability window ---------- */}
      <SectionLabel
        title="Availability window"
        hint={`Closes ${legalMin}h + buffer before the earliest shift`}
      />
      <div className="rounded-cp-card border-[0.5px] border-hairline bg-surface-card px-4 py-3.5">
        <WindowRow label="Availability opens" sub="days before close">
          <Stepper value={openDays} min={0} suffix="days" onChange={setOpenDays} />
        </WindowRow>
        <WindowRow label="Reminder sent" sub="hours before close">
          <Stepper value={reminderHours} min={0} suffix="hrs" onChange={setReminderHours} />
        </WindowRow>
        <WindowRow label="Safety buffer" sub={`on top of ${legalMin}h legal`} last>
          <Stepper value={bufferHours} min={0} suffix="hrs" onChange={setBufferHours} />
        </WindowRow>
      </div>
      {config.earliest_shift_label && (
        <div className="mt-2 px-1 text-[11px] text-ink-faint">
          Earliest shift across your week:{" "}
          <span className="font-medium text-ink-muted">{config.earliest_shift_label}</span>. Close = that time
          minus {legalMin + bufferHours}h.
        </div>
      )}
      <SaveButton onClick={handleSaveOffsets} busy={savingOffsets} label="Save timing" />

      {/* ---------- Override one week ---------- */}
      <SectionLabel title="Override one week" hint="Reverts to automatic the next week" />
      <div className="rounded-cp-card border-[0.5px] border-hairline bg-surface-card px-4 py-3.5">
        <div className="mb-3">
          <div className="mb-1.5 text-[11px] text-ink-muted">Rota week</div>
          <select
            value={overrideWeek}
            onChange={(e) => handleWeekChange(e.target.value)}
            className="w-full rounded-cp-control border-[0.5px] border-hairline bg-surface-card px-3 py-2.5 text-[13px] font-medium text-ink outline-none"
          >
            {config.weeks.map((w) => (
              <option key={w.week_start} value={w.week_start}>
                {w.week_label}
                {w.is_override ? " (manual)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="mb-1.5 text-[11px] text-ink-muted">Close availability at</div>
          <input
            type="datetime-local"
            value={overrideClose}
            onChange={(e) => setOverrideClose(e.target.value)}
            className="w-full rounded-cp-control border-[0.5px] border-hairline bg-surface-card px-3 py-2.5 text-[13px] font-medium text-ink outline-none"
          />
        </div>
        {!Number.isNaN(liveNotice) && (
          <div className={`mt-2.5 text-[11px] ${liveNotice < legalMin ? "font-medium text-cp-red" : "text-ink-faint"}`}>
            {liveNotice < legalMin
              ? `Only ${Math.round(liveNotice)}h notice — below the ${legalMin}h legal minimum.`
              : `${Math.round(liveNotice)}h notice before the earliest shift.`}
          </div>
        )}
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={() => submitOverride(false)}
            disabled={savingOverride || !overrideWeek}
            className="rounded-cp-control bg-accent px-4 py-2.5 text-[13px] font-medium text-accent-on disabled:opacity-60"
          >
            {savingOverride ? "Saving…" : "Save close time"}
          </button>
          {selectedWeek?.is_override && (
            <button onClick={() => handleReset(overrideWeek)} className="text-[13px] font-medium text-accent">
              Reset to automatic
            </button>
          )}
        </div>
      </div>

      {/* ---------- Upcoming weeks ---------- */}
      <SectionLabel title="Upcoming weeks" />
      <div className="rounded-cp-card border-[0.5px] border-hairline bg-surface-card px-4 py-1">
        {config.weeks.map((w, i) => (
          <div
            key={w.week_start}
            className={`flex flex-wrap items-center gap-x-5 gap-y-1 py-3 ${
              i < config.weeks.length - 1 ? "border-b border-hairline" : ""
            }`}
          >
            <div className="min-w-[120px] text-[13px] font-medium text-ink">
              {w.week_label}
              {w.is_override && (
                <span className="ml-2 rounded-cp-badge bg-accent-light px-2 py-0.5 text-[9px] font-semibold text-accent">
                  Manual
                </span>
              )}
            </div>
            <WindowCell label="Opens" value={fmtDateTime(w.opens_at)} />
            <WindowCell label="Closes" value={fmtDateTime(w.closes_at)} />
            <div className="text-[11px] text-ink-faint">{Math.round(w.notice_hours)}h notice</div>
          </div>
        ))}
      </div>

      {/* ---------- Sticky generate bar ---------- */}
      {/* Sits ABOVE the mobile bottom tab bar (its ~56px height) so it never
          covers the nav; drops to the screen edge on md+ where the tab bar is
          hidden. */}
      <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-40 border-t-[0.5px] border-hairline bg-surface-card md:bottom-0">
        <div className="mx-auto flex w-full max-w-[460px] items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <select
              value={genWeek}
              onChange={(e) => setGenWeek(e.target.value)}
              className="max-w-full truncate bg-transparent text-[15px] font-medium text-ink outline-none"
            >
              {config.weeks.map((w) => (
                <option key={w.week_start} value={w.week_start}>
                  {w.week_label}
                </option>
              ))}
            </select>
            <button
              onClick={() => router.push("/settings")}
              className="block text-[11px] text-accent"
            >
              {shiftsPerWeek} shifts / week · + add pay rates →
            </button>
          </div>
          <button
            onClick={handleGenerate}
            disabled={!config.has_shifts || !genWeek}
            className="flex shrink-0 items-center gap-1.5 rounded-cp-control bg-accent px-4 py-2.5 text-[13px] font-medium text-accent-on disabled:opacity-50"
          >
            <ManagerIcon name="sparkles" size={15} /> Generate
          </button>
        </div>
      </div>

      {/* ---------- Risk popup: below legal notice ---------- */}
      {riskOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-6">
          <div className="w-full max-w-[400px] rounded-cp-card border-[0.5px] border-cp-amber/40 bg-surface-card p-6">
            <div className="mb-2 text-[17px] font-medium text-ink">Below the legal minimum notice</div>
            <div className="mb-5 text-[13px] leading-[1.5] text-ink-muted">
              This close time gives staff only{" "}
              <span className="font-medium text-cp-red">
                {riskHours != null ? Math.round(riskHours) : "under " + legalMin}h
              </span>{" "}
              of notice before the earliest shift. UK staff are generally entitled to at least{" "}
              <span className="font-medium text-ink">{legalMin} hours&apos;</span> notice. Save anyway only if
              you&apos;re sure.
            </div>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setRiskOpen(false)} className="text-[13px] font-medium text-ink-muted">
                Cancel
              </button>
              <button
                onClick={() => submitOverride(true)}
                disabled={savingOverride}
                className="rounded-cp-control bg-cp-red px-4 py-2.5 text-[13px] font-medium text-white disabled:opacity-60"
              >
                {savingOverride ? "Saving…" : "Save anyway"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Risk popup: turning off day-off ---------- */}
      {dayOffRiskOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-6">
          <div className="w-full max-w-[400px] rounded-cp-card border-[0.5px] border-cp-amber/40 bg-surface-card p-6">
            <div className="mb-2 text-[17px] font-medium text-ink">Turning off the day-off rule</div>
            <div className="mb-5 text-[13px] leading-[1.5] text-ink-muted">
              With this off, the solver may schedule staff on all 7 days of a rota week. This may breach{" "}
              <span className="font-medium text-ink">UK Working Time Regulations</span>, which generally entitle
              workers to a rest day each week. Turn off anyway only if you&apos;re sure.
            </div>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setDayOffRiskOpen(false)} className="text-[13px] font-medium text-ink-muted">
                Cancel
              </button>
              <button
                onClick={() => submitDayOff(false, true)}
                disabled={savingDayOff}
                className="rounded-cp-control bg-cp-red px-4 py-2.5 text-[13px] font-medium text-white disabled:opacity-60"
              >
                {savingDayOff ? "Saving…" : "Turn off anyway"}
              </button>
            </div>
          </div>
        </div>
      )}

      <GenerateOverlay
        open={genOverlayOpen}
        result={genResult}
        error={genError}
        shifts={shifts}
        onAdjustRules={() => setGenOverlayOpen(false)}
        onReviewRota={() => router.push("/rota")}
        onClose={() => setGenOverlayOpen(false)}
      />

      <Toast message={toast} />
    </div>
  );
}

// ---------- small presentational pieces ----------

function SectionLabel({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3 mt-6 flex items-center justify-between px-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">{title}</span>
      {hint && <span className="text-[11px] text-ink-faint">{hint}</span>}
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-cp-card border-[0.5px] border-hairline bg-surface-card px-4 py-5 text-center text-[13px] text-ink-muted">
      {children}
    </div>
  );
}

function MiniBtn({ icon, onClick }: { icon: ManagerIconName; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-lg border-[0.5px] border-hairline bg-surface-card text-ink-muted transition-colors hover:!text-accent"
    >
      <ManagerIcon name={icon} size={15} />
    </button>
  );
}

function Stepper({
  value,
  min = 0,
  suffix,
  onChange,
}: {
  value: number;
  min?: number;
  suffix?: string;
  onChange: (n: number) => void;
}) {
  const set = (n: number) => onChange(Math.max(min, n));
  return (
    <div className="flex items-center gap-2">
      <MiniBtn icon="minus" onClick={() => set(value - 1)} />
      <span className="min-w-[44px] text-center text-sm font-medium text-ink">
        {value}
        {suffix && <span className="ml-0.5 text-[11px] font-normal text-ink-faint">{suffix}</span>}
      </span>
      <MiniBtn icon="plus" onClick={() => set(value + 1)} />
    </div>
  );
}

function CoverageRow({
  label,
  sub,
  value,
  min,
  onChange,
}: {
  label: string;
  sub: string;
  value: number;
  min: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center justify-between border-t border-hairline py-2.5 first:border-t-0 first:pt-0">
      <div>
        <div className="text-[13px] font-medium text-ink">{label}</div>
        <div className="text-[11px] text-ink-faint">{sub}</div>
      </div>
      <Stepper value={value} min={min} onChange={onChange} />
    </div>
  );
}

function RuleCell({
  icon,
  label,
  children,
}: {
  icon: ManagerIconName;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-cp-panel border-[0.5px] border-hairline bg-surface-card px-3.5 py-3">
      <div className="mb-2.5 flex items-center gap-1.5 text-[12px] text-ink-muted">
        <ManagerIcon name={icon} size={13} /> {label}
      </div>
      {children}
    </div>
  );
}

function WindowRow({
  label,
  sub,
  last,
  children,
}: {
  label: string;
  sub: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex items-center justify-between py-2.5 ${last ? "" : "border-b border-hairline"}`}>
      <div>
        <div className="text-[13px] text-ink">{label}</div>
        <div className="text-[11px] text-ink-faint">{sub}</div>
      </div>
      {children}
    </div>
  );
}

function WindowCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wide text-ink-faint">{label}</div>
      <div className="text-[12px] font-medium text-ink">{value}</div>
    </div>
  );
}

function SaveButton({ onClick, busy, label }: { onClick: () => void; busy: boolean; label: string }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="mt-3.5 rounded-cp-control bg-accent px-5 py-2.5 text-[13px] font-medium text-accent-on disabled:opacity-60"
    >
      {busy ? "Saving…" : label}
    </button>
  );
}
