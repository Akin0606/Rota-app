"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import BackButton from "@/components/staff/back-button";
import Icon from "@/components/staff/icon";
import ModeToggle from "@/components/staff/mode-toggle";
import ProgressBar from "@/components/staff/progress-bar";
import StaffScreen, { ScreenTitle, SectionLabel, StaffTopBar } from "@/components/staff/screen";
import Toast from "@/components/toast";
import {
  ApiError,
  AvailabilityEntry,
  PinAuthData,
  authenticatePin,
  getWeekAvailability,
  setAutoSubmit,
  submitAvailability,
} from "@/lib/api";
import {
  DAY_LABELS,
  DAY_NAMES,
  addDays,
  compactTimeRange,
  formatDeadlineDay,
  formatWeekOf,
  formatWeekRangeCompact,
  parseISODate,
  pinStorageKey,
} from "@/lib/utils";

// The three states the reference exposes, mapped onto the statuses the solver
// already understands. It has exactly three tiers — unassignable, weight 1,
// weight 3 — so this is the only mapping that keeps "if needed" a genuinely
// softer signal than "available" rather than collapsing the two:
//
//   available   -> 3 (PREFERRED,   weight 3 — the solver reaches for these first)
//   if needed   -> 1 (AVAILABLE,   weight 1 — the fallback tier)
//   can't work  -> 2 (UNAVAILABLE, never assignable)
//
// Note this re-labels status 3 from "preferred" to plain "available" on the
// staff side; the manager grid still calls it preferred.
const AVAILABLE = 3;
const IF_NEEDED = 1;
const CANT_WORK = 2;

type SlotState = "yes" | "maybe" | "no";

function toState(status: number | undefined): SlotState {
  if (status === AVAILABLE) return "yes";
  if (status === IF_NEEDED) return "maybe";
  // 0 (never set) and 2 both read as "can't work" — the new UI has no unset
  // state, and the solver treats the two identically anyway.
  return "no";
}

const CYCLE: Record<SlotState, number> = {
  no: AVAILABLE,
  yes: IF_NEEDED,
  maybe: CANT_WORK,
};

const SLOT_STYLE: Record<SlotState, { box: string; label: string }> = {
  yes: { box: "border-[0.5px] border-[rgba(46,204,113,0.4)] bg-cp-green-soft", label: "text-cp-green" },
  maybe: { box: "border-[0.5px] border-[rgba(255,193,7,0.4)] bg-cp-amber-soft", label: "text-cp-amber" },
  no: { box: "cp-hairline bg-transparent", label: "text-ink" },
};

type Grid = Record<number, Record<string, number>>;

function mondayISO(offsetWeeks: number): string {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow + offsetWeeks * 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const WEEK_OPTIONS = [0, 1, 2, 3].map((offset) => ({
  weekStart: mondayISO(offset),
  // formatWeekOf, not a split of the compact range — "24–30 Aug" would slice
  // down to a bare "24" while "31 Aug – 6 Sep" keeps its month, so the pills
  // came out inconsistent.
  label: offset === 0 ? "This week" : offset === 1 ? "Next week" : `w/c ${formatWeekOf(mondayISO(offset))}`,
}));

export default function StaffAvailabilityPage({ params }: { params: { venue_token: string } }) {
  const { venue_token } = params;
  const router = useRouter();

  const [pin, setPin] = useState<string | null>(null);
  const [data, setData] = useState<PinAuthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedWeek, setSelectedWeek] = useState<string>(WEEK_OPTIONS[0].weekStart);
  const [editable, setEditable] = useState(true);
  const [weekLoading, setWeekLoading] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  const [autoSubmit, setAutoSubmitState] = useState(false);

  const [grid, setGrid] = useState<Grid>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [noteDay, setNoteDay] = useState<number | null>(null);
  const [noteText, setNoteText] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const storedPin = sessionStorage.getItem(pinStorageKey(venue_token));
    if (!storedPin) {
      router.replace(`/v/${venue_token}`);
      return;
    }
    setPin(storedPin);

    authenticatePin(venue_token, storedPin)
      .then((res) => {
        setData(res);
        setAutoSubmitState(res.staff.auto_submit_availability);
        if (res.period && WEEK_OPTIONS.some((w) => w.weekStart === res.period!.week_start)) {
          setSelectedWeek(res.period.week_start);
        }
      })
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

  useEffect(() => {
    if (!pin || !data) return;
    let cancelled = false;
    setWeekLoading(true);
    getWeekAvailability(venue_token, pin, selectedWeek)
      .then((res) => {
        if (cancelled) return;
        const g: Grid = {};
        const n: Record<number, string> = {};
        for (const sub of res.submissions) {
          if (sub.shift_id) {
            g[sub.day_index] = { ...(g[sub.day_index] || {}), [sub.shift_id]: sub.status };
          } else if (sub.note) {
            n[sub.day_index] = sub.note;
          }
        }
        setGrid(g);
        setNotes(n);
        setEditable(res.editable);
        setPrefilled(res.prefilled);
      })
      .catch(() => {
        if (!cancelled) {
          setGrid({});
          setNotes({});
          setEditable(true);
          setPrefilled(false);
        }
      })
      .finally(() => {
        if (!cancelled) setWeekLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedWeek, pin, data, venue_token]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function handleToggleAutoSubmit() {
    if (!pin) return;
    const next = !autoSubmit;
    setAutoSubmitState(next);
    try {
      await setAutoSubmit(venue_token, pin, next);
      showToast(next ? "Auto-submit turned on" : "Auto-submit turned off");
    } catch (err) {
      setAutoSubmitState(!next);
      showToast(err instanceof ApiError ? err.message : "Could not update auto-submit");
    }
  }

  function cycleSlot(dayIndex: number, shiftId: string) {
    if (!editable) return;
    setGrid((prev) => {
      const current = prev[dayIndex]?.[shiftId];
      return {
        ...prev,
        [dayIndex]: { ...(prev[dayIndex] || {}), [shiftId]: CYCLE[toState(current)] },
      };
    });
  }

  function setAllDay(dayIndex: number) {
    if (!editable || !data) return;
    setGrid((prev) => {
      const row: Record<string, number> = { ...(prev[dayIndex] || {}) };
      for (const shift of data.shifts) row[shift.id] = AVAILABLE;
      return { ...prev, [dayIndex]: row };
    });
  }

  function saveNote() {
    if (noteDay === null || !noteText.trim()) return;
    setNotes((prev) => ({ ...prev, [noteDay]: noteText.trim() }));
    setNoteDay(null);
    setNoteText("");
  }

  function removeNote(day: number) {
    setNotes((prev) => {
      const next = { ...prev };
      delete next[day];
      return next;
    });
  }

  async function handleSubmit() {
    if (!data || !pin) return;

    const anyMarked = DAY_LABELS.some((_, di) =>
      data.shifts.some((s) => toState(grid[di]?.[s.id]) !== "no"),
    );
    if (!anyMarked) {
      showToast("Mark at least one slot before submitting");
      return;
    }

    // Every slot is sent explicitly, including "can't work" — the three-state
    // signal only means anything to the solver if it isn't collapsed back into
    // "present or absent".
    const submissions: AvailabilityEntry[] = [];
    for (let di = 0; di < DAY_LABELS.length; di += 1) {
      for (const shift of data.shifts) {
        const state = toState(grid[di]?.[shift.id]);
        const status = state === "yes" ? AVAILABLE : state === "maybe" ? IF_NEEDED : CANT_WORK;
        submissions.push({ day_index: di, shift_id: shift.id, status: status as 1 | 2 | 3, note: null });
      }
    }
    for (const [dayIndex, note] of Object.entries(notes)) {
      submissions.push({ day_index: Number(dayIndex), shift_id: null, status: 0, note });
    }

    setSubmitting(true);
    try {
      await submitAvailability(venue_token, pin, submissions, selectedWeek);
      router.push(`/v/${venue_token}/submitted`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not submit, please try again");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <CenteredMessage>Loading…</CenteredMessage>;
  if (error || !data) return <CenteredMessage>{error || "Something went wrong."}</CenteredMessage>;

  const weekStart = parseISODate(selectedWeek);
  const daysTouched = DAY_LABELS.filter((_, di) =>
    data.shifts.some((s) => toState(grid[di]?.[s.id]) !== "no"),
  ).length;

  return (
    <StaffScreen>
      <StaffTopBar
        left={<BackButton href={`/v/${venue_token}/hub`} />}
        right={<ModeToggle venueToken={venue_token} />}
      />

      <div className="mb-5 mt-4">
        <ScreenTitle
          title="Your availability"
          sub={
            <>
              Week of {formatWeekRangeCompact(selectedWeek)} ·{" "}
              {editable ? (
                <>
                  closes{" "}
                  <strong className="font-medium text-accent">
                    {formatDeadlineDay(data.rules.avail_closes_day, data.rules.avail_closes_time)}
                  </strong>
                </>
              ) : (
                <strong className="font-medium text-ink-muted">closed</strong>
              )}
            </>
          }
        />
      </div>

      {/* Week switcher — staff can plan up to a month ahead. */}
      <div className="-mx-[22px] mb-4 flex gap-2 overflow-x-auto px-[22px] pb-1">
        {WEEK_OPTIONS.map((opt) => {
          const active = opt.weekStart === selectedWeek;
          return (
            <button
              key={opt.weekStart}
              onClick={() => setSelectedWeek(opt.weekStart)}
              className={`shrink-0 rounded-cp-slot px-3 py-2 text-[12px] font-medium transition-colors ${
                active ? "bg-accent text-white" : "cp-hairline bg-surface-card text-ink-muted"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <div className="cp-hairline mb-3.5 flex gap-4 rounded-cp-control bg-surface-card px-3.5 py-3 transition-all duration-[350ms]">
        <LegendItem swatch="bg-cp-green" label="Available" />
        <LegendItem swatch="bg-cp-amber" label="If needed" />
        <LegendItem swatch="cp-hairline bg-cp-icon" label="Can't work" />
      </div>

      {prefilled && editable && (
        <div className="mb-3.5 rounded-cp-control bg-accent-light px-3.5 py-2.5 text-center text-[12px] text-accent">
          This is what you sent last time — still right? Just hit submit.
        </div>
      )}

      <div className={!editable || weekLoading ? "pointer-events-none opacity-50" : ""}>
        {DAY_LABELS.map((_, dayIndex) => {
          const date = addDays(weekStart, dayIndex);
          return (
            <div
              key={dayIndex}
              className="cp-hairline mb-2.5 rounded-cp-tile bg-surface-card px-4 py-3.5 transition-all duration-[350ms]"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[14px] font-medium text-ink">{DAY_NAMES[dayIndex]}</span>
                  <span className="ml-2 text-[12px] text-ink-faint transition-colors duration-[350ms]">
                    {date.getUTCDate()}{" "}
                    {date.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}
                  </span>
                </div>
                <button
                  onClick={() => setAllDay(dayIndex)}
                  className="shrink-0 text-[11px] text-ink-muted transition-colors hover:text-accent"
                >
                  All day
                </button>
              </div>
              <div className="flex gap-2">
                {data.shifts.map((shift) => {
                  const state = toState(grid[dayIndex]?.[shift.id]);
                  const style = SLOT_STYLE[state];
                  return (
                    <button
                      key={shift.id}
                      onClick={() => cycleSlot(dayIndex, shift.id)}
                      aria-label={`${shift.name} on ${DAY_NAMES[dayIndex]}: ${
                        state === "yes" ? "available" : state === "maybe" ? "if needed" : "can't work"
                      }`}
                      className={`min-w-0 flex-1 rounded-cp-slot px-2 py-2.5 text-center transition-all duration-[180ms] ${style.box}`}
                    >
                      <div className={`truncate text-[12px] font-medium transition-colors ${style.label}`}>
                        {shift.name}
                      </div>
                      <div className="mt-0.5 truncate text-[10px] text-ink-faint transition-colors duration-[350ms]">
                        {compactTimeRange(shift.start_time, shift.end_time)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Notes aren't in the reference, but they're a real feature staff use to
          qualify a week ("can stay late if needed"). */}
      <div className="cp-hairline mb-3.5 rounded-cp-tile bg-surface-card px-4 py-3.5 transition-all duration-[350ms]">
        <SectionLabel className="!mb-2.5">Notes (optional)</SectionLabel>
        {DAY_LABELS.map((day, di) =>
          notes[di] ? (
            <div
              key={di}
              className="cp-hairline mb-1.5 flex items-center justify-between gap-2 rounded-cp-slot bg-surface-subtle px-3 py-2"
            >
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.05em] text-ink-faint">{day}</div>
                <div className="truncate text-[13px] text-ink">{notes[di]}</div>
              </div>
              {editable && (
                <button
                  onClick={() => removeNote(di)}
                  aria-label={`Remove ${day} note`}
                  className="shrink-0 text-[13px] text-ink-faint transition-colors hover:text-accent"
                >
                  ✕
                </button>
              )}
            </div>
          ) : null,
        )}
        {editable &&
          (noteDay === null ? (
            <button
              onClick={() => {
                setNoteDay(0);
                setNoteText("");
              }}
              className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-cp-slot border-[0.5px] border-dashed border-[var(--c-hairline)] py-2.5 text-[12px] font-medium text-accent"
            >
              <Icon name="plus" size={13} />
              Add a note
            </button>
          ) : (
            <div className="cp-hairline mt-1 rounded-cp-slot bg-surface-subtle p-3">
              <div className="mb-2 flex flex-wrap gap-1.5">
                {DAY_LABELS.map((day, di) => (
                  <button
                    key={di}
                    onClick={() => setNoteDay(di)}
                    className={`rounded-cp-badge px-2 py-1 text-[11px] font-medium transition-colors ${
                      noteDay === di ? "bg-accent text-white" : "bg-cp-icon text-ink-muted"
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
              <input
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="e.g. Can stay late if needed"
                className="cp-hairline w-full rounded-cp-slot bg-surface-card px-3 py-2.5 text-[13px] text-ink outline-none"
              />
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => setNoteDay(null)}
                  className="flex-1 rounded-cp-slot bg-cp-icon py-2 text-[12px] font-medium text-ink-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={saveNote}
                  className="flex-1 rounded-cp-slot bg-accent py-2 text-[12px] font-medium text-white"
                >
                  Save
                </button>
              </div>
            </div>
          ))}
      </div>

      <div className="my-[18px] flex items-center justify-center gap-1.5 text-center text-[12px] text-ink-faint transition-colors duration-[350ms]">
        <Icon name="info-circle" size={13} />
        Tap a slot to cycle: available → if needed → can&apos;t work
      </div>

      <ProgressBar value={daysTouched / 7} label={`${daysTouched} of 7 days`} className="mb-1" />

      {editable ? (
        <button
          onClick={handleSubmit}
          disabled={submitting || weekLoading}
          className="mt-3 w-full rounded-cp-panel bg-accent py-[15px] text-[15px] font-medium tracking-[-0.1px] text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {submitting ? "Submitting…" : "Submit availability"}
        </button>
      ) : (
        <div className="mt-3 rounded-cp-panel bg-cp-icon py-[15px] text-center text-[13px] text-ink-muted">
          Submissions for this week have closed
        </div>
      )}

      <div className="cp-hairline mt-3.5 flex items-center justify-between gap-3 rounded-cp-tile bg-surface-card px-4 py-3.5 transition-all duration-[350ms]">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-ink">Auto-submit</div>
          <div className="mt-0.5 text-[11px] leading-[1.45] text-ink-muted transition-colors duration-[350ms]">
            If nothing&apos;s changed, send this same pattern for me each week
          </div>
        </div>
        <button
          onClick={handleToggleAutoSubmit}
          role="switch"
          aria-checked={autoSubmit}
          aria-label="Auto-submit availability each week"
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            autoSubmit ? "bg-accent" : "cp-hairline bg-cp-icon"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
              autoSubmit ? "translate-x-[22px]" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      <Toast message={toast} />
    </StaffScreen>
  );
}

function LegendItem({ swatch, label }: { swatch: string; label: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-[12px] text-ink-muted transition-colors duration-[350ms]">
      <span className={`h-3 w-3 shrink-0 rounded-[4px] ${swatch}`} />
      <span className="truncate">{label}</span>
    </div>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="cp-staff flex min-h-screen items-center justify-center bg-surface-page px-6 text-center text-sm text-ink-muted">
      {children}
    </div>
  );
}
