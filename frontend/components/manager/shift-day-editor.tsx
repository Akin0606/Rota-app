"use client";

import { useEffect, useState } from "react";

import { ApiError, getShiftSchedule, setShiftSchedule, updateShift, type Shift } from "@/lib/api";

import BottomSheet from "./bottom-sheet";
import Switch from "./switch";
import TimeField from "./time-field";

// Per-day shift-hours editor (Batch 4 of the per-day shift model). Writes the
// venue's real per-day schedule to shift_days via PUT /shifts/{id}/days: a
// "closed" day sends no row (the solver then creates no variable for it), and a
// day can run different hours from the rest. Two modes: "same hours every day"
// (the common case — one set of controls + per-day open/closed chips) and full
// per-day. The legacy free-text "close" is gone here; ends are real times,
// including post-midnight (2:30am) via ALL_TIMES.

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type DayState = {
  day_index: number;
  open: boolean;
  start_time: string;
  end_time: string;
  min_staff: number;
  max_staff: number;
};

const DEFAULT = { start_time: "5:00pm", end_time: "11:00pm", min_staff: 1, max_staff: 2 };

function sameHours(a: DayState, b: DayState) {
  return (
    a.start_time === b.start_time &&
    a.end_time === b.end_time &&
    a.min_staff === b.min_staff &&
    a.max_staff === b.max_staff
  );
}

type Props = {
  shift: Shift | null;
  onClose: () => void;
  onSaved: () => void;
  onDelete: () => void;
  showToast: (msg: string) => void;
};

export default function ShiftDayEditor({ shift, onClose, onSaved, onDelete, showToast }: Props) {
  const [name, setName] = useState("");
  const [days, setDays] = useState<DayState[]>([]);
  const [uniform, setUniform] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!shift) return;
    setName(shift.name);
    let cancelled = false;
    setLoading(true);
    getShiftSchedule(shift.id)
      .then((sched) => {
        if (cancelled) return;
        const mapped: DayState[] = sched.days.map((d) => ({
          day_index: d.day_index,
          open: d.open,
          start_time: d.start_time ?? DEFAULT.start_time,
          end_time: d.end_time ?? DEFAULT.end_time,
          min_staff: d.min_staff,
          max_staff: d.max_staff,
        }));
        setDays(mapped);
        // Start in uniform mode when every open day already shares one set of hours.
        const openDays = mapped.filter((d) => d.open);
        setUniform(openDays.length === 0 || openDays.every((d) => sameHours(d, openDays[0])));
      })
      .catch(() => showToast("Could not load the shift's hours"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [shift, showToast]);

  const template = days.find((d) => d.open) ?? { ...DEFAULT, day_index: 0, open: true };
  const openCount = days.filter((d) => d.open).length;

  function patchDay(dayIndex: number, patch: Partial<DayState>) {
    setDays((prev) => prev.map((d) => (d.day_index === dayIndex ? { ...d, ...patch } : d)));
  }

  // In uniform mode, editing one control edits every open day's hours at once.
  function patchTemplate(patch: Partial<DayState>) {
    setDays((prev) => prev.map((d) => (d.open ? { ...d, ...patch } : d)));
  }

  function toggleOpen(dayIndex: number, open: boolean) {
    setDays((prev) =>
      prev.map((d) => {
        if (d.day_index !== dayIndex) return d;
        // Newly-opened day inherits the current template hours so it's never blank.
        if (open && !d.open) return { ...d, open, start_time: template.start_time, end_time: template.end_time, min_staff: template.min_staff, max_staff: template.max_staff };
        return { ...d, open };
      }),
    );
  }

  function clampStaff(min: number, max: number) {
    const m = Math.max(0, min);
    return { min_staff: m, max_staff: Math.max(1, Math.max(m, max)) };
  }

  async function handleSave() {
    if (!shift) return;
    const openDays = days.filter((d) => d.open);
    if (openDays.length === 0) {
      showToast("A shift must run on at least one day");
      return;
    }
    setSaving(true);
    try {
      const trimmed = name.trim();
      if (trimmed && trimmed !== shift.name) {
        await updateShift(shift.id, { name: trimmed });
      }
      await setShiftSchedule(
        shift.id,
        openDays.map((d) => ({
          day_index: d.day_index,
          start_time: d.start_time,
          end_time: d.end_time,
          min_staff: d.min_staff,
          max_staff: d.max_staff,
        })),
      );
      showToast(`${trimmed || shift.name} saved`);
      onSaved();
      onClose();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not save shift");
    } finally {
      setSaving(false);
    }
  }

  const timeSelect = (value: string, onChange: (v: string) => void, label: string) => (
    <TimeField value={value} onChange={onChange} ariaLabel={label} />
  );

  const staffStepper = (min: number, max: number, onChange: (s: { min_staff: number; max_staff: number }) => void) => (
    <div className="flex items-center gap-3 text-[13px] text-ink-muted">
      <div className="flex items-center gap-1.5">
        <span>Min</span>
        <button type="button" aria-label="Decrease min staff" onClick={() => onChange(clampStaff(min - 1, max))} className="flex h-7 w-7 items-center justify-center rounded-md bg-cp-icon text-ink">−</button>
        <span className="w-4 text-center font-semibold text-ink">{min}</span>
        <button type="button" aria-label="Increase min staff" onClick={() => onChange(clampStaff(min + 1, max))} className="flex h-7 w-7 items-center justify-center rounded-md bg-cp-icon text-ink">+</button>
      </div>
      <div className="flex items-center gap-1.5">
        <span>Max</span>
        <button type="button" aria-label="Decrease max staff" onClick={() => onChange(clampStaff(min, max - 1))} className="flex h-7 w-7 items-center justify-center rounded-md bg-cp-icon text-ink">−</button>
        <span className="w-4 text-center font-semibold text-ink">{max}</span>
        <button type="button" aria-label="Increase max staff" onClick={() => onChange(clampStaff(min, max + 1))} className="flex h-7 w-7 items-center justify-center rounded-md bg-cp-icon text-ink">+</button>
      </div>
    </div>
  );

  return (
    <BottomSheet
      open={shift !== null}
      onClose={onClose}
      title="Edit shift"
      subtitle="Name, the days it runs, hours and staffing"
      footer={
        <>
          <button
            type="button"
            onClick={onDelete}
            className="shrink-0 rounded-xl border border-hairline px-3.5 py-3 text-sm font-medium text-unavail-text"
          >
            Delete
          </button>
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-hairline py-3 text-sm font-medium text-ink-muted">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading || openCount === 0}
            className="flex-1 rounded-xl bg-accent py-3 text-sm font-medium text-accent-on disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save shift"}
          </button>
        </>
      }
    >
      {loading ? (
        <div className="py-8 text-center text-sm text-ink-muted">Loading…</div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="shift-name" className="text-xs font-medium uppercase tracking-wide text-ink-faint">
              Shift name
            </label>
            <input
              id="shift-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Evening, Lunch service"
              className="rounded-lg border-[1.5px] border-hairline bg-surface-subtle px-3 py-2.5 text-sm font-medium text-ink outline-none focus:border-accent"
            />
          </div>

          <label className="flex items-center justify-between gap-3 rounded-xl bg-surface-subtle px-3.5 py-3">
            <span className="text-sm font-medium text-ink">Same hours every day</span>
            <Switch checked={uniform} onChange={setUniform} label="Same hours every day" />
          </label>

          {uniform ? (
            <>
              <div className="flex flex-col gap-2.5 rounded-xl border border-hairline p-3.5">
                <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">Hours (all open days)</div>
                <div className="flex items-center gap-1.5">
                  {timeSelect(template.start_time, (v) => patchTemplate({ start_time: v }), "Start time")}
                  <span className="text-[13px] text-ink-muted">→</span>
                  {timeSelect(template.end_time, (v) => patchTemplate({ end_time: v }), "End time")}
                </div>
                {staffStepper(template.min_staff, template.max_staff, (s) => patchTemplate(s))}
              </div>
              <div>
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">Open on</div>
                <div className="flex flex-wrap gap-1.5">
                  {days.map((d) => (
                    <button
                      key={d.day_index}
                      type="button"
                      onClick={() => toggleOpen(d.day_index, !d.open)}
                      aria-pressed={d.open}
                      className={`rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                        d.open ? "bg-accent text-white" : "bg-surface-subtle text-ink-muted"
                      }`}
                    >
                      {DAY_LABELS[d.day_index]}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-2">
              {days.map((d) => (
                <div key={d.day_index} className="rounded-xl border border-hairline p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-ink">{DAY_LABELS[d.day_index]}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-ink-faint">{d.open ? "Open" : "Closed"}</span>
                      <Switch checked={d.open} onChange={(v) => toggleOpen(d.day_index, v)} label={`${DAY_LABELS[d.day_index]} open`} />
                    </div>
                  </div>
                  {d.open && (
                    <div className="mt-2.5 flex flex-col gap-2.5">
                      <div className="flex items-center gap-1.5">
                        {timeSelect(d.start_time, (v) => patchDay(d.day_index, { start_time: v }), `${DAY_LABELS[d.day_index]} start`)}
                        <span className="text-[13px] text-ink-muted">→</span>
                        {timeSelect(d.end_time, (v) => patchDay(d.day_index, { end_time: v }), `${DAY_LABELS[d.day_index]} end`)}
                      </div>
                      {staffStepper(d.min_staff, d.max_staff, (s) => patchDay(d.day_index, s))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {openCount === 0 && (
            <div className="text-center text-[13px] text-unavail-text">Pick at least one day the shift runs.</div>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
