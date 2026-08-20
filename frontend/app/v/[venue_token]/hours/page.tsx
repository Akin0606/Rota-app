"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import Modal from "@/components/modal";
import BackButton from "@/components/staff/back-button";
import CalendarBlock from "@/components/staff/calendar-block";
import ModeToggle from "@/components/staff/mode-toggle";
import ProgressBar from "@/components/staff/progress-bar";
import StaffScreen, { FootNote, ScreenTitle, SectionLabel, StaffTopBar } from "@/components/staff/screen";
import { ApiError, StaffRota, getStaffRota } from "@/lib/api";
import {
  addDays,
  formatHoursTotal,
  formatWeekRangeCompact,
  parseISODate,
  pinStorageKey,
  shiftDurationHours,
  sumShiftHours,
} from "@/lib/utils";

// Neither an hourly rate nor a weekly target exists anywhere in the schema —
// both are staff-set and live client-side only, keyed per venue like the
// theme. No migration, and nothing here is ever sent to the backend.
const rateKey = (token: string) => `crewplan-rate:${token}`;
const targetKey = (token: string) => `crewplan-target:${token}`;

function readNumber(key: string): number | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export default function StaffHoursPage({ params }: { params: { venue_token: string } }) {
  const { venue_token } = params;
  const router = useRouter();

  const [data, setData] = useState<StaffRota | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rate, setRate] = useState<number | null>(null);
  const [target, setTarget] = useState<number | null>(null);

  const [editing, setEditing] = useState(false);
  const [rateDraft, setRateDraft] = useState("");
  const [targetDraft, setTargetDraft] = useState("");

  useEffect(() => {
    const pin = sessionStorage.getItem(pinStorageKey(venue_token));
    if (!pin) {
      router.replace(`/v/${venue_token}`);
      return;
    }
    setRate(readNumber(rateKey(venue_token)));
    setTarget(readNumber(targetKey(venue_token)));

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

  function openEditor() {
    setRateDraft(rate === null ? "" : String(rate));
    setTargetDraft(target === null ? "" : String(target));
    setEditing(true);
  }

  function saveEditor() {
    const r = Number(rateDraft);
    const t = Number(targetDraft);
    const nextRate = rateDraft.trim() && Number.isFinite(r) && r > 0 ? r : null;
    const nextTarget = targetDraft.trim() && Number.isFinite(t) && t > 0 ? t : null;

    try {
      if (nextRate === null) localStorage.removeItem(rateKey(venue_token));
      else localStorage.setItem(rateKey(venue_token), String(nextRate));
      if (nextTarget === null) localStorage.removeItem(targetKey(venue_token));
      else localStorage.setItem(targetKey(venue_token), String(nextTarget));
    } catch {
      // Private-mode storage failures shouldn't lose the in-session value.
    }

    setRate(nextRate);
    setTarget(nextTarget);
    setEditing(false);
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
          <ScreenTitle title="Your hours" sub={data.venue_name} />
        </div>
        <div className="cp-hairline rounded-cp-card bg-surface-card p-6 text-center">
          <div className="text-[15px] font-medium text-ink">No hours yet</div>
          <div className="mt-1.5 text-[13px] leading-[1.45] text-ink-muted">
            Your hours appear here once your manager publishes the rota.
          </div>
        </div>
      </StaffScreen>
    );
  }

  const period = data.period;
  const weekStart = parseISODate(period.week_start);
  const shiftsById = new Map(data.shifts.map((s) => [s.id, s]));
  const myRole = data.team.find((t) => t.id === data.staff_id)?.role ?? null;

  const myShifts = data.assignments
    .filter((a) => a.staff_id === data.staff_id && a.shift_id)
    // Resolve each assignment's real per-day hours into the shift object once,
    // so the hours total, pay, and every row below use the right time for a
    // per-day shift (a later weekend close, etc.).
    .map((a) => {
      const base = shiftsById.get(a.shift_id!);
      return {
        assignment: a,
        shift: base
          ? { ...base, start_time: a.start_time ?? base.start_time, end_time: a.end_time ?? base.end_time }
          : undefined,
      };
    })
    .filter((x): x is { assignment: (typeof x)["assignment"]; shift: NonNullable<(typeof x)["shift"]> } =>
      Boolean(x.shift),
    )
    .sort((a, b) => a.assignment.day_index - b.assignment.day_index);

  // The one number everything else derives from. `unmeasured` counts shifts
  // whose end time is free text the clock parser can't read — this venue's
  // Evening shift ends at "close" — so both the hours total and the pay
  // figure below are a floor, never a precise value.
  const { hours, unmeasured } = sumShiftHours(myShifts.map((x) => x.shift));
  const hoursLabel = formatHoursTotal(hours, unmeasured, "");

  // Pay is derived from the same total, so it inherits the same "+" caveat.
  // Computing it off a naive sum would quietly under-report by every
  // unmeasurable shift with no sign that anything was missing.
  const payLabel = rate === null ? null : `£${Math.round(hours * rate)}${unmeasured > 0 ? "+" : ""}`;

  return (
    <StaffScreen>
      <StaffTopBar
        left={<BackButton href={`/v/${venue_token}/hub`} />}
        right={<ModeToggle venueToken={venue_token} />}
      />

      <div className="mb-5 mt-4">
        <ScreenTitle
          title="Your hours"
          sub={`Week of ${formatWeekRangeCompact(period.week_start)} · ${data.venue_name}`}
        />
      </div>

      <div className="cp-hairline mb-3 rounded-cp-card bg-surface-card p-[22px] transition-all duration-[350ms]">
        <div className="mb-[18px] flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1.5 text-[12px] text-ink-muted transition-colors duration-[350ms]">
              Total this week
            </div>
            <div className="text-[38px] font-medium leading-none tracking-[-1.5px] text-ink">
              {hoursLabel}
              <span className="ml-[3px] text-[16px] font-normal tracking-normal text-ink-muted">hrs</span>
            </div>
          </div>
          <div className="shrink-0 text-right">
            {payLabel === null ? (
              <button
                onClick={openEditor}
                className="text-[13px] font-medium !text-accent underline-offset-2 hover:underline"
              >
                Add your rate
              </button>
            ) : (
              <button onClick={openEditor} className="text-right">
                <div className="text-[26px] font-medium tracking-[-0.8px] text-accent">{payLabel}</div>
                <div className="mt-[3px] text-[11px] text-ink-faint transition-colors duration-[350ms]">
                  est. at £{rate}/hr
                </div>
              </button>
            )}
          </div>
        </div>

        <ProgressBar size="md" value={target === null ? 0 : hours / target} />
        <div className="mt-2 flex items-center justify-between text-[11px] text-ink-faint transition-colors duration-[350ms]">
          <span>
            <strong className="font-medium text-ink-muted">{hoursLabel}h</strong> booked
          </span>
          {target === null ? (
            <button onClick={openEditor} className="!text-accent underline-offset-2 hover:underline">
              Set a weekly target
            </button>
          ) : (
            <button onClick={openEditor}>
              Target <strong className="font-medium text-ink-muted">{target}h</strong>
            </button>
          )}
        </div>
      </div>

      <SectionLabel className="mt-[22px]">Shift breakdown</SectionLabel>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 7 }, (_, dayIndex) => {
          const dayShifts = myShifts.filter((x) => x.assignment.day_index === dayIndex);
          const dateNumber = addDays(weekStart, dayIndex).getUTCDate();

          if (dayShifts.length === 0) {
            return (
              <div
                key={dayIndex}
                className="cp-hairline flex items-center gap-3.5 rounded-cp-panel bg-surface-card px-4 py-[13px] opacity-50 transition-all duration-[350ms]"
              >
                <CalendarBlock dayIndex={dayIndex} dateNumber={dateNumber} className="min-w-[38px]" />
                <div className="flex-1 text-[13px] text-ink-faint">Day off</div>
                <div className="text-[15px] font-medium text-ink-faint">—</div>
              </div>
            );
          }

          return dayShifts.map(({ assignment, shift }) => {
            const duration = shiftDurationHours(shift.start_time, shift.end_time);
            return (
              <div
                key={assignment.id}
                className="cp-hairline flex items-center gap-3.5 rounded-cp-panel bg-surface-card px-4 py-[13px] transition-all duration-[350ms]"
              >
                <CalendarBlock dayIndex={dayIndex} dateNumber={dateNumber} className="min-w-[38px]" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-ink">
                    {shift.start_time} – {shift.end_time}
                  </div>
                  <div className="truncate text-[11px] text-ink-muted transition-colors duration-[350ms]">
                    {myRole ? `${myRole} · ${shift.name.toLowerCase()}` : shift.name}
                  </div>
                </div>
                <div className="shrink-0 text-[15px] font-medium text-ink">
                  {duration === null ? (
                    <span className="text-ink-faint">—</span>
                  ) : (
                    <>
                      {duration}
                      <span className="ml-[2px] text-[11px] font-normal text-ink-faint">h</span>
                    </>
                  )}
                </div>
              </div>
            );
          });
        })}
      </div>

      {unmeasured > 0 && (
        <FootNote>
          {unmeasured === 1 ? "One shift ends" : `${unmeasured} shifts end`} at a time we can&apos;t measure,
          so totals show as a minimum
        </FootNote>
      )}
      <FootNote>Pay is an estimate — final figures come from your payslip</FootNote>

      <Modal open={editing} onClose={() => setEditing(false)} title="Your rate and target">
        <div className="mb-4 text-[13px] leading-[1.55] text-ink-muted">
          Both are just for this estimate — they&apos;re saved on this device only, and never sent to your
          manager.
        </div>
        <label className="mb-3 block">
          <span className="mb-1.5 block text-[12px] text-ink-muted">Hourly rate (£)</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={rateDraft}
            onChange={(e) => setRateDraft(e.target.value)}
            placeholder="11.44"
            className="w-full rounded-cp-control border-[0.5px] border-hairline bg-surface-subtle px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-accent"
          />
        </label>
        <label className="mb-5 block">
          <span className="mb-1.5 block text-[12px] text-ink-muted">Weekly target (hours)</span>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            value={targetDraft}
            onChange={(e) => setTargetDraft(e.target.value)}
            placeholder="40"
            className="w-full rounded-cp-control border-[0.5px] border-hairline bg-surface-subtle px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-accent"
          />
        </label>
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={() => setEditing(false)}
            className="rounded-cp-control px-4 py-2.5 text-[13px] font-medium text-ink-muted"
          >
            Cancel
          </button>
          <button
            onClick={saveEditor}
            className="rounded-cp-control bg-accent px-5 py-2.5 text-[13px] font-medium text-white"
          >
            Save
          </button>
        </div>
      </Modal>
    </StaffScreen>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="cp-staff min-h-screen bg-surface-page">
      <div className="mx-auto flex max-w-[440px] items-center justify-center px-6 py-24 text-center text-[13px] text-ink-muted">
        {children}
      </div>
    </div>
  );
}
