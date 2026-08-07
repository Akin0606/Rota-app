"use client";

import { useEffect, useMemo, useState } from "react";

import LoadingScreen from "@/components/loading-screen";
import Toast from "@/components/toast";
import {
  ApiError,
  SchedulerConfig,
  SchedulerWeek,
  clearScheduleOverride,
  getScheduler,
  setScheduleOverride,
  updateScheduler,
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

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(false);
      try {
        const res = await getScheduler();
        if (cancelled) return;
        applyConfig(res);
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
    // Default the override picker to the first upcoming week if unset.
    if (res.weeks.length && !overrideWeek) {
      setOverrideWeek(res.weeks[0].week_start);
      setOverrideClose(dtLocal(res.weeks[0].closes_at));
    }
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }

  const selectedWeek: SchedulerWeek | undefined = useMemo(
    () => config?.weeks.find((w) => w.week_start === overrideWeek),
    [config, overrideWeek],
  );

  // When the manager switches which week they're overriding, prefill the picker
  // with that week's current close time.
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
    const next = !dayOffRequired;
    // Turning it on is always safe; turning it off goes through the backend's
    // needs_confirm gate, which opens the risk popup below.
    submitDayOff(next, false);
  }

  if (loading) return <LoadingScreen base="Loading scheduler…" />;

  if (error || !config) {
    return (
      <div className="flex flex-col items-center gap-3 p-10 text-center text-sm text-ink-muted">
        Something went wrong loading the scheduler.
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
      <div className="mb-1 text-[26px] font-bold text-ink md:text-[28px]">Scheduler</div>
      <div className="mb-7 max-w-[640px] text-sm text-ink-muted">
        Availability closes automatically <span className="font-semibold text-ink">{legalMin}h + a safety
        buffer</span> before each week&apos;s earliest shift — so staff always get the legal minimum notice.
        Set the timing once here and it recalculates every week on its own.
      </div>

      {!config.has_shifts && (
        <div className="mb-6 rounded-panel border border-warn-dot bg-warn-bg p-4 text-sm text-warn-text">
          Add at least one shift in <span className="font-semibold">Settings</span> so the scheduler can work
          out each week&apos;s close time.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:max-w-[900px]">
        {/* Timing offsets */}
        <div className="rounded-panel border border-hairline bg-surface-card p-6">
          <div className="mb-1 text-base font-bold text-ink">Window timing</div>
          <div className="mb-4 text-[13px] text-ink-faint">
            Everything is measured back from the automatic close time.
          </div>
          <div className="flex flex-col gap-3.5">
            <OffsetRow
              label="Availability opens"
              suffix="days before close"
              value={openDays}
              min={0}
              onChange={setOpenDays}
            />
            <OffsetRow
              label="Reminder sent"
              suffix="hours before close"
              value={reminderHours}
              min={0}
              onChange={setReminderHours}
            />
            <OffsetRow
              label="Safety buffer"
              suffix={`hours (on top of ${legalMin}h)`}
              value={bufferHours}
              min={0}
              onChange={setBufferHours}
            />
          </div>
          <button
            onClick={handleSaveOffsets}
            disabled={savingOffsets}
            className="mt-5 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {savingOffsets ? "Saving…" : "Save timing"}
          </button>
          {config.earliest_shift_label && (
            <div className="mt-3 text-[12px] text-ink-faint">
              Earliest shift across your week: <span className="font-semibold">{config.earliest_shift_label}</span>.
              Close = that time minus {legalMin + bufferHours}h.
            </div>
          )}
        </div>

        {/* Week override */}
        <div className="rounded-panel border border-hairline bg-surface-card p-6">
          <div className="mb-1 text-base font-bold text-ink">Override one week</div>
          <div className="mb-4 text-[13px] text-ink-faint">
            Manually set the close time for a single week. It reverts to automatic the following week.
          </div>
          <div className="flex flex-col gap-3.5">
            <div>
              <div className="mb-1 text-xs text-ink-faint">Rota week</div>
              <select
                value={overrideWeek}
                onChange={(e) => handleWeekChange(e.target.value)}
                className="w-full rounded-lg border-[1.5px] border-unset-border bg-surface-subtle px-3 py-2.5 text-sm font-semibold text-ink outline-none"
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
              <div className="mb-1 text-xs text-ink-faint">Close availability at</div>
              <input
                type="datetime-local"
                value={overrideClose}
                onChange={(e) => setOverrideClose(e.target.value)}
                className="w-full rounded-lg border-[1.5px] border-unset-border px-3 py-2.5 text-sm font-semibold text-ink outline-none"
              />
            </div>
            {!Number.isNaN(liveNotice) && (
              <div
                className={`text-[12px] ${
                  liveNotice < legalMin ? "font-semibold text-unavail-text" : "text-ink-faint"
                }`}
              >
                {liveNotice < legalMin
                  ? `⚠ Only ${Math.round(liveNotice)}h notice — below the ${legalMin}h legal minimum.`
                  : `${Math.round(liveNotice)}h notice before the earliest shift.`}
              </div>
            )}
          </div>
          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={() => submitOverride(false)}
              disabled={savingOverride || !overrideWeek}
              className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {savingOverride ? "Saving…" : "Save close time"}
            </button>
            {selectedWeek?.is_override && (
              <button
                onClick={() => handleReset(overrideWeek)}
                className="rounded-xl px-3 py-2.5 text-sm font-semibold text-accent"
              >
                Reset to automatic
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 1-day-off-in-7 rule */}
      <div className="mt-6 rounded-panel border border-hairline bg-surface-card p-6 md:max-w-[900px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-base font-bold text-ink">Require one day off in seven</div>
            <div className="max-w-[520px] text-[13px] text-ink-faint">
              The solver will never schedule a staff member on all 7 days of a rota week. Switching this off
              may risk a breach of UK Working Time Regulations.
            </div>
          </div>
          <button
            role="switch"
            aria-checked={dayOffRequired}
            onClick={handleToggleDayOff}
            disabled={savingDayOff}
            className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-60 ${
              dayOffRequired ? "bg-accent" : "bg-surface-subtle border border-unset-border"
            }`}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                dayOffRequired ? "translate-x-[22px]" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Upcoming weeks preview */}
      <div className="mt-6 rounded-panel border border-hairline bg-surface-card p-6 md:max-w-[900px]">
        <div className="mb-4 text-base font-bold text-ink">Upcoming weeks</div>
        <div className="flex flex-col divide-y divide-surface-page">
          {config.weeks.map((w) => (
            <div key={w.week_start} className="flex flex-wrap items-center gap-x-6 gap-y-1 py-3">
              <div className="min-w-[130px] text-sm font-semibold text-ink">
                {w.week_label}
                {w.is_override && (
                  <span className="ml-2 rounded-full bg-accent-light px-2 py-0.5 text-[10px] font-bold text-accent">
                    Manual
                  </span>
                )}
              </div>
              <WindowCell label="Opens" value={fmtDateTime(w.opens_at)} />
              <WindowCell label="Reminder" value={fmtDateTime(w.reminder_at)} />
              <WindowCell label="Closes" value={fmtDateTime(w.closes_at)} />
              <div className="text-[12px] text-ink-faint">
                {Math.round(w.notice_hours)}h notice
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Risk popup */}
      {riskOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
          <div className="w-full max-w-[440px] rounded-card border border-warn-dot bg-surface-card p-6">
            <div className="mb-2 text-lg font-bold text-ink">Below the legal minimum notice</div>
            <div className="mb-4 text-sm text-ink-muted">
              This close time gives staff only{" "}
              <span className="font-semibold text-unavail-text">
                {riskHours != null ? Math.round(riskHours) : "under " + legalMin}h
              </span>{" "}
              of notice before the earliest shift. UK staff are generally entitled to at least{" "}
              <span className="font-semibold">{legalMin} hours&apos;</span> notice of a shift. Save anyway only
              if you&apos;re sure.
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setRiskOpen(false)}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-muted"
              >
                Cancel
              </button>
              <button
                onClick={() => submitOverride(true)}
                disabled={savingOverride}
                className="rounded-xl bg-unavail-text px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {savingOverride ? "Saving…" : "Save anyway"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Risk popup: turning off the day-off-in-7 rule */}
      {dayOffRiskOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
          <div className="w-full max-w-[440px] rounded-card border border-warn-dot bg-surface-card p-6">
            <div className="mb-2 text-lg font-bold text-ink">Turning off the day-off rule</div>
            <div className="mb-4 text-sm text-ink-muted">
              With this off, the solver may schedule staff on all 7 days of a rota week. This may breach{" "}
              <span className="font-semibold">UK Working Time Regulations</span>, which generally entitle
              workers to a rest day each week. Turn off anyway only if you&apos;re sure.
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDayOffRiskOpen(false)}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-muted"
              >
                Cancel
              </button>
              <button
                onClick={() => submitDayOff(false, true)}
                disabled={savingDayOff}
                className="rounded-xl bg-unavail-text px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {savingDayOff ? "Saving…" : "Turn off anyway"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast message={toast} />
    </div>
  );
}

function OffsetRow({
  label,
  suffix,
  value,
  min,
  onChange,
}: {
  label: string;
  suffix: string;
  value: number;
  min: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-surface-page pb-3.5 last:border-0 last:pb-0">
      <div className="text-[13px] text-ink-label">{label}</div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          value={value}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
          className="w-[70px] rounded-lg border-[1.5px] border-unset-border px-3 py-2 text-center text-sm font-semibold text-ink outline-none"
        />
        <span className="text-[12px] text-ink-faint">{suffix}</span>
      </div>
    </div>
  );
}

function WindowCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-ink-faint">{label}</div>
      <div className="text-[13px] font-medium text-ink">{value}</div>
    </div>
  );
}
