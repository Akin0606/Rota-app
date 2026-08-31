"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import Icon from "@/components/staff/icon";
import StaffLoading from "@/components/staff/staff-loading";
import Modal from "@/components/modal";
import ModeToggle from "@/components/staff/mode-toggle";
import ProgressBar from "@/components/staff/progress-bar";
import StaffScreen, { ScreenTitle, SectionLabel, StaffTopBar } from "@/components/staff/screen";
import Toast from "@/components/toast";
import {
  ApiError,
  AvailabilityEntry,
  PinAuthData,
  WeekShift,
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
import Waiting from "@/components/waiting";

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

// Four states, not three. The trust fix (§2): an *untouched* slot must be
// distinguishable from a deliberate "can't work". Before, `toState` collapsed
// status 0 (never answered) and 2 (explicitly can't) both to "no", so a staffer
// who half-filled the week was silently marked unavailable for the rest while
// the progress bar read "done". Now "unset" is its own state — dashed and
// hollow, "no answer yet" — and the submit guard names the blank days.
type SlotState = "yes" | "maybe" | "no" | "unset";

function toState(status: number | undefined): SlotState {
  if (status === AVAILABLE) return "yes";
  if (status === IF_NEEDED) return "maybe";
  if (status === CANT_WORK) return "no";
  // undefined / 0 — never answered. Kept distinct from an explicit "can't work".
  return "unset";
}

// Tap order. The first tap moves a slot off "unset" into a real answer; further
// taps cycle the three real states. Tapping never returns a slot to "unset" —
// you can't accidentally un-answer (agency/forgiveness). To wipe a week back to
// a clean negative, the "can't work all week" bulk action sets explicit red.
const CYCLE: Record<SlotState, number> = {
  unset: AVAILABLE,
  yes: IF_NEEDED,
  maybe: CANT_WORK,
  no: AVAILABLE,
};

// Each real state has a solid fill (this week's committed answer) and an "echo"
// — a lighter fill of the same colour (§6a): unmistakably the real state, but
// visibly *last week's, carried over*, not yet re-affirmed for this week. The
// echo is a provenance cue, not a confirm gate — one touch commits the whole
// grid to solid. Echo stays distinct from §2's untouched (dashed hollow, no
// fill), so a shift added mid-week shows untouched beside carried-over cells.
const SLOT_STYLE: Record<SlotState, { box: string; echo: string; label: string }> = {
  yes: {
    box: "border-[0.5px] border-[rgba(46,204,113,0.4)] bg-cp-green-soft",
    echo: "border-[0.5px] border-[rgba(46,204,113,0.2)] bg-[rgba(46,204,113,0.05)]",
    label: "text-cp-green",
  },
  maybe: {
    box: "border-[0.5px] border-[rgba(255,193,7,0.4)] bg-cp-amber-soft",
    echo: "border-[0.5px] border-[rgba(255,193,7,0.2)] bg-[rgba(255,193,7,0.05)]",
    label: "text-cp-amber",
  },
  no: {
    box: "border-[0.5px] border-[rgba(229,72,77,0.4)] bg-cp-red-soft",
    echo: "border-[0.5px] border-[rgba(229,72,77,0.2)] bg-[rgba(229,72,77,0.05)]",
    label: "text-cp-red",
  },
  unset: {
    box: "border-[0.5px] border-dashed border-[var(--c-hairline)] bg-transparent",
    echo: "border-[0.5px] border-dashed border-[var(--c-hairline)] bg-transparent",
    label: "text-ink-muted",
  },
};

// A non-colour differentiator for the three answered states (WCAG "colour is
// not the only signal"): a check / dash / cross glyph inside the selected cell,
// so "available", "if needed" and "can't work" stay distinguishable without
// relying on green/amber/red. `unset` stays the dashed-hollow box with no glyph.
const STATE_GLYPH: Record<SlotState, "check" | "minus" | "x" | null> = {
  yes: "check",
  maybe: "minus",
  no: "x",
  unset: null,
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
  // Per-day shift definitions for the selected week (which shifts run on which
  // days, at what real time). Authoritative once /week has resolved; until then
  // the render falls back to the shift-level list from /auth (see effectiveShifts).
  const [weekShifts, setWeekShifts] = useState<WeekShift[]>([]);
  const [prefilled, setPrefilled] = useState(false);
  // Prefilled cells render as a lighter echo until the first touch commits the
  // whole grid to solid (§6a). A non-prefilled week is committed from the start.
  const [committed, setCommitted] = useState(true);
  // The cron auto-submitted this week's pattern (§6b) — surfaces a heads-up banner.
  const [autoSubmitted, setAutoSubmitted] = useState(false);
  const [autoSubmit, setAutoSubmitState] = useState(false);

  const [grid, setGrid] = useState<Grid>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [noteDay, setNoteDay] = useState<number | null>(null);
  const [noteText, setNoteText] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [guardOpen, setGuardOpen] = useState(false);

  useEffect(() => {
    const storedPin = sessionStorage.getItem(pinStorageKey(venue_token));
    if (!storedPin) {
      router.replace(`/v/${venue_token}`);
      return;
    }
    setPin(storedPin);

    // Deliberately no `onRevalidate` here, unlike the read-only screens: this
    // one is an editing surface, and a background refresh landing mid-edit
    // could overwrite the auto-submit toggle the user just flipped. It still
    // gets the cache's instant paint and request de-duplication.
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
        setWeekShifts(res.shifts ?? []);
        setEditable(res.editable);
        setPrefilled(res.prefilled);
        // A prefilled week starts uncommitted (echo cells); a real saved week
        // is solid from the off.
        setCommitted(!res.prefilled);
        setAutoSubmitted(res.auto_submitted ?? false);
      })
      .catch(() => {
        if (!cancelled) {
          setGrid({});
          setNotes({});
          setWeekShifts([]);
          setEditable(true);
          setPrefilled(false);
          setCommitted(true);
          setAutoSubmitted(false);
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

  // Per-day slot list: for each weekday 0-6, the shifts that actually run that
  // day with their real per-day time. Sourced from /week's per-day definitions
  // once loaded; until then (or if /week ever returns none) it falls back to the
  // shift-level list from /auth treated as running every day, so the grid never
  // flashes empty and pre-per-day venues render exactly as before.
  const shiftsByDay = useMemo(() => {
    const map: Record<number, { id: string; name: string; start_time: string; end_time: string }[]> = {
      0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [],
    };
    if (weekShifts.length > 0) {
      for (const s of weekShifts) {
        for (const d of s.days) {
          if (d.day_index >= 0 && d.day_index <= 6) {
            map[d.day_index].push({
              id: s.id,
              name: s.name,
              start_time: d.start_time,
              end_time: d.end_time,
            });
          }
        }
      }
    } else if (data) {
      for (const s of data.shifts) {
        for (let d = 0; d < 7; d += 1) {
          map[d].push({ id: s.id, name: s.name, start_time: s.start_time, end_time: s.end_time });
        }
      }
    }
    return map;
  }, [weekShifts, data]);

  // Days the venue actually opens this week — the denominator for progress and
  // the submit guard, so a Monday-closed venue isn't stuck at "6 of 7" forever.
  const openDayCount = DAY_LABELS.filter((_, d) => shiftsByDay[d].length > 0).length;

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
    setCommitted(true); // first touch commits the whole grid to solid (§6a)
    setGrid((prev) => {
      const current = prev[dayIndex]?.[shiftId];
      return {
        ...prev,
        [dayIndex]: { ...(prev[dayIndex] || {}), [shiftId]: CYCLE[toState(current)] },
      };
    });
  }

  function setAllDay(dayIndex: number) {
    if (!editable) return;
    setCommitted(true);
    setGrid((prev) => {
      const row: Record<string, number> = { ...(prev[dayIndex] || {}) };
      for (const shift of shiftsByDay[dayIndex]) row[shift.id] = AVAILABLE;
      return { ...prev, [dayIndex]: row };
    });
  }

  // Bulk "can't work at all this week" — sets every slot to explicit red. This
  // is the deliberate way to say "I'm off the whole week", distinct from leaving
  // the grid blank (which trips the guard). One answered, negative week.
  function setCantWorkWeek() {
    if (!editable) return;
    setCommitted(true);
    setGrid(() => {
      const g: Grid = {};
      for (let di = 0; di < DAY_LABELS.length; di += 1) {
        const row: Record<string, number> = {};
        for (const shift of shiftsByDay[di]) row[shift.id] = CANT_WORK;
        g[di] = row;
      }
      return g;
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

  // A day is blank when it opens and every one of its slots is still unanswered.
  // A closed day has nothing to answer, so it's never "blank" (and never counts
  // toward progress) — otherwise the guard would fire on every submit.
  function dayIsBlank(dayIndex: number): boolean {
    const slots = shiftsByDay[dayIndex];
    if (slots.length === 0) return false;
    return slots.every((s) => toState(grid[dayIndex]?.[s.id]) === "unset");
  }

  function handleSubmit() {
    if (!data) return;
    // Guard: any fully-blank day gets an explicit confirm before submit. Blank
    // is stored as can't-work, and a half-filled week almost never means "I'm
    // unavailable for the rest" — the staffer just stopped. Name the days, make
    // the consequence a deliberate choice (manager-side warn-and-confirm pattern).
    const hasBlank = DAY_LABELS.some((_, di) => dayIsBlank(di));
    if (hasBlank) {
      setGuardOpen(true);
      return;
    }
    void doSubmit();
  }

  async function doSubmit() {
    if (!data || !pin) return;
    setGuardOpen(false);

    // Every slot is sent explicitly. "unset" and "no" both submit as can't-work
    // (blank counts as can't-work); "yes"/"maybe" carry the two positive tiers.
    const submissions: AvailabilityEntry[] = [];
    for (let di = 0; di < DAY_LABELS.length; di += 1) {
      // Only the (day, shift) pairs that actually run — a closed day emits no
      // rows, so a carried-over answer for a since-closed slot is dropped here.
      for (const shift of shiftsByDay[di]) {
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

  if (loading) return <StaffLoading />;
  if (error || !data) return <CenteredMessage>{error || "Something went wrong."}</CenteredMessage>;

  const weekStart = parseISODate(selectedWeek);
  // A day counts as answered once it has *any* non-unset slot — including an
  // explicit can't-work. Progress and the submit guard key off the same thing,
  // so they never disagree (a fully-blank open day is neither "done" nor
  // guard-free). Closed days are excluded from both — see dayIsBlank.
  const blankDayLabels = DAY_LABELS.filter((_, di) => dayIsBlank(di));
  const answeredDays = openDayCount - blankDayLabels.length;

  return (
    <StaffScreen>
      <StaffTopBar
        left={null}
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
              className={`inline-flex min-h-[44px] shrink-0 items-center rounded-cp-slot px-3.5 py-2 text-[12px] font-medium transition-[background-color,color,transform] duration-150 active:scale-[0.96] ${
                active ? "bg-accent text-accent-on" : "cp-hairline bg-surface-card text-ink-muted"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <div className="cp-hairline mb-3.5 flex flex-wrap gap-x-4 gap-y-2 rounded-cp-control bg-surface-card px-3.5 py-3 transition-[background-color,color] duration-[350ms]">
        <LegendItem swatch="bg-cp-green" label="Available" />
        <LegendItem swatch="bg-cp-amber" label="If needed" />
        <LegendItem swatch="bg-cp-red" label="Can't work" />
        <LegendItem swatch="border-[0.5px] border-dashed border-[var(--c-hairline)]" label="No answer yet" />
      </div>

      {prefilled && editable && !committed && (
        <div className="mb-3.5 rounded-cp-control bg-accent-light px-3.5 py-2.5 text-center text-[12px] text-accent">
          This is what you sent last time — still right? Just hit submit.
        </div>
      )}

      {/* §6b — the cron auto-submitted this week's usual pattern. A courtesy
          backstop so it's never silent; tapping any slot edits it as normal. */}
      {autoSubmitted && editable && (
        <div className="mb-3.5 flex items-start gap-2 rounded-cp-control bg-accent-light px-3.5 py-2.5 text-[12px] text-accent">
          <Icon name="info-circle" size={14} />
          <span className="text-left leading-[1.45]">
            We auto-submitted your usual availability for this week — still right? Tap any slot to change it.
          </span>
        </div>
      )}

      <div className={!editable || weekLoading ? "pointer-events-none opacity-50" : ""}>
        {DAY_LABELS.map((_, dayIndex) => {
          const date = addDays(weekStart, dayIndex);
          const slots = shiftsByDay[dayIndex];
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
                {slots.length > 0 && (
                  <button
                    onClick={() => setAllDay(dayIndex)}
                    className="-my-2 -mr-2 inline-flex min-h-[44px] shrink-0 items-center px-2 text-[11px] text-ink-muted transition-colors hover:text-accent"
                  >
                    All day
                  </button>
                )}
              </div>
              {slots.length === 0 ? (
                <div className="rounded-cp-slot border-[0.5px] border-dashed border-[var(--c-hairline)] px-2 py-3 text-center text-[12px] text-ink-muted">
                  Closed
                </div>
              ) : (
                <div className="flex gap-2">
                  {slots.map((shift) => {
                    const state = toState(grid[dayIndex]?.[shift.id]);
                    const style = SLOT_STYLE[state];
                    // Carried-over cells echo (lighter) until first touch commits.
                    const boxClass = prefilled && !committed ? style.echo : style.box;
                    return (
                      <button
                        key={shift.id}
                        onClick={() => cycleSlot(dayIndex, shift.id)}
                        aria-label={`${shift.name} on ${DAY_NAMES[dayIndex]}: ${
                          state === "yes"
                            ? "available"
                            : state === "maybe"
                              ? "if needed"
                              : state === "no"
                                ? "can't work"
                                : "no answer yet"
                        }`}
                        // ~180ms colour settle (kept from before) + a light press-
                        // scale (apple-design: respond on press). transform/opacity
                        // only; no transition-all. Reduced-motion is handled globally
                        // by the .cp-staff * rule in globals.css.
                        className={`min-w-0 flex-1 rounded-cp-slot px-2 py-2.5 text-center transition-[background-color,border-color,color,transform] duration-[180ms] active:scale-[0.97] ${boxClass}`}
                      >
                        <div className={`flex items-center justify-center gap-1 transition-colors ${style.label}`}>
                          {STATE_GLYPH[state] && (
                            <Icon name={STATE_GLYPH[state]!} size={11} strokeWidth={2.5} />
                          )}
                          <span className="truncate text-[12px] font-medium">{shift.name}</span>
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-ink-muted transition-colors duration-[350ms]">
                          {compactTimeRange(shift.start_time, shift.end_time)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {editable && (
        <button
          onClick={setCantWorkWeek}
          className="cp-hairline mb-3.5 flex w-full items-center justify-center gap-1.5 rounded-cp-control bg-surface-card py-2.5 text-[12px] font-medium text-ink-muted transition-[color,transform] duration-150 active:scale-[0.98] hover:text-cp-red"
        >
          <Icon name="circle-x" size={13} />
          Can&apos;t work at all this week
        </button>
      )}

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
                  className="-my-2 -mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center text-ink-muted transition-colors hover:text-accent"
                >
                  <Icon name="circle-x" size={16} />
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
                    className={`inline-flex min-h-[44px] items-center rounded-cp-badge px-3 py-1 text-[11px] font-medium transition-colors ${
                      noteDay === di ? "bg-accent text-accent-on" : "bg-cp-icon text-ink-muted"
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
                  className="flex-1 rounded-cp-slot bg-accent py-2 text-[12px] font-medium text-accent-on"
                >
                  Save
                </button>
              </div>
            </div>
          ))}
      </div>

      <div className="my-[18px] flex items-center justify-center gap-1.5 text-center text-[12px] text-ink-faint transition-colors duration-[350ms]">
        <Icon name="info-circle" size={13} />
        Tap to cycle: available → if needed → can&apos;t work · dashed = no answer yet
      </div>

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

      {/* Submit guard — a fully-blank day would otherwise submit silently as
          can't-work. Rendered inside StaffScreen so Modal (not a portal) picks
          up the .cp-staff palette; its fade/scale + reduced-motion come from the
          shared .cp-overlay classes. */}
      <Modal
        open={guardOpen}
        onClose={() => setGuardOpen(false)}
        title={
          blankDayLabels.length >= openDayCount
            ? "You haven't marked any days"
            : "Some days are still blank"
        }
      >
        <p className="mb-1.5 text-[14px] leading-[1.5] text-ink-muted">
          {blankDayLabels.length >= openDayCount ? (
            <>You haven&apos;t answered any day yet. </>
          ) : (
            <>
              You haven&apos;t answered{" "}
              <span className="text-ink">{joinLabels(blankDayLabels)}</span>.{" "}
            </>
          )}
          <span className="text-ink">Blank counts as can&apos;t-work</span> — you won&apos;t be offered
          shifts on {blankDayLabels.length === 1 ? "that day" : "those days"}.
        </p>
        <p className="mb-5 text-[14px] leading-[1.5] text-ink-muted">
          Mark them, or confirm you&apos;re only telling us about part of the week.
        </p>
        <div className="flex gap-2.5">
          <button
            onClick={() => setGuardOpen(false)}
            className="flex-1 rounded-cp-slot bg-cp-icon py-3 text-[13px] font-medium text-ink-muted transition-transform duration-150 active:scale-[0.98]"
          >
            Go back &amp; mark them
          </button>
          <button
            onClick={() => void doSubmit()}
            disabled={submitting}
            className="flex-1 rounded-cp-slot bg-accent py-3 text-[13px] font-medium text-accent-on transition-transform duration-150 active:scale-[0.98] disabled:opacity-60"
          >
            {submitting ? <Waiting label="Submitting…" /> : "Submit anyway"}
          </button>
        </div>
      </Modal>

      {/* Clears the sticky submit bar + tab bar so the auto-submit toggle above
          is never trapped underneath them. */}
      <div aria-hidden className="h-[92px]" />

      {/* Sticky submit — the primary action is always thumb-reachable on a long
          grid, pinned directly above the bottom tab bar (z-30 < nav's z-40).
          Progress + submit only; the toggle and notes stay in the scroll. */}
      <div
        className="fixed inset-x-0 z-30 bg-surface-page"
        style={{
          bottom: "calc(56px + env(safe-area-inset-bottom))",
          borderTop: "0.5px solid var(--c-hairline)",
        }}
      >
        <div className="mx-auto w-full max-w-[440px] px-[22px] pb-3 pt-3">
          <ProgressBar
            value={openDayCount ? answeredDays / openDayCount : 1}
            label={`${answeredDays} of ${openDayCount} ${openDayCount === 1 ? "day" : "days"}`}
            ariaLabel="Days answered this week"
            className="mb-2.5"
          />
          {editable ? (
            <button
              onClick={handleSubmit}
              disabled={submitting || weekLoading}
              className="w-full rounded-cp-panel bg-accent py-[13px] text-[15px] font-medium tracking-[-0.1px] text-accent-on transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.99] disabled:opacity-60"
            >
              {submitting ? <Waiting label="Submitting…" /> : "Submit availability"}
            </button>
          ) : (
            <div className="rounded-cp-panel bg-cp-icon py-[13px] text-center text-[13px] text-ink-muted">
              Submissions for this week have closed
            </div>
          )}
        </div>
      </div>

      <Toast message={toast} />
    </StaffScreen>
  );
}

// "Mon" · "Mon & Tue" · "Mon, Tue & Wed" — Oxford-free, matches the app's copy.
function joinLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  if (labels.length === 2) return `${labels[0]} & ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} & ${labels[labels.length - 1]}`;
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
