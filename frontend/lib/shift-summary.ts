/**
 * One description of a shift's week, shared by every screen that shows one.
 *
 * Settings owned this privately, and the Scheduler — which had no per-day data
 * at all — printed one representative time and one min_staff beside a pair of
 * steppers that flattened the per-day schedule on save. Two screens describing
 * the same shift have to describe it the same way, so the summary moved here
 * and the Scheduler now reads it instead of offering a second, lossier editor.
 */

import type { ShiftDay } from "@/lib/api";

import { compactTimeRange } from "./utils";

export const DAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAY_INITIAL = ["M", "T", "W", "T", "F", "S", "S"];

// Compress a set of day indices into a readable range: all 7 -> "Every day";
// contiguous runs joined ("Mon–Fri", "Mon–Thu, Sun"); singletons ("Sun").
export function dayRangeLabel(indices: number[]): string {
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
export function shortTime(t: string | null): string {
  const m = (t ?? "").trim().toLowerCase().match(/^(\d{1,2}):(\d{2})(am|pm)$/);
  if (!m) return t ?? "";
  return m[2] === "00" ? `${m[1]}${m[3]}` : `${m[1]}:${m[2]}${m[3]}`;
}

export type ShiftSummary = {
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
export function summariseShift(days: ShiftDay[]): ShiftSummary {
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

export type CoverageSummary = {
  /** "Every day 2–3" / "Mon–Sat 2–3" — the pattern most days follow. */
  base: string;
  /** "Sun 1–2" — the days that don't, never hidden behind a "varies". */
  exception?: string;
  closed: boolean;
};

/**
 * The same grouping applied to staffing rather than hours.
 *
 * It exists because a single pair of steppers cannot say "two on weekdays,
 * three on Saturday", and the Scheduler's pair used to answer that question by
 * overwriting it. Read-only, so the number a manager sees here is the number
 * the solver uses, per day, with the divergence stated rather than averaged.
 */
export function summariseCoverage(days: ShiftDay[]): CoverageSummary {
  const open = days.filter((d) => d.open);
  if (open.length === 0) return { base: "Not running", closed: true };

  const groups = new Map<string, { min: number; max: number; days: number[] }>();
  for (const d of [...open].sort((a, b) => a.day_index - b.day_index)) {
    const key = `${d.min_staff}|${d.max_staff}`;
    const g = groups.get(key) ?? { min: d.min_staff, max: d.max_staff, days: [] };
    g.days.push(d.day_index);
    groups.set(key, g);
  }
  const arr = Array.from(groups.values()).sort(
    (a, b) => b.days.length - a.days.length || a.days[0] - b.days[0],
  );
  const [base, ...rest] = arr;
  const label = (g: { min: number; max: number }) => `${g.min}–${g.max}`;
  return {
    base: `${dayRangeLabel(base.days)} ${label(base)}`,
    exception:
      rest.length === 1
        ? `${dayRangeLabel(rest[0].days)} ${label(rest[0])}`
        : rest.length > 1
          ? `${rest.reduce((n, g) => n + g.days.length, 0)} days differ`
          : undefined,
    closed: false,
  };
}

/** Every day the shift actually runs, across the week. */
export function openDayCount(days: ShiftDay[]): number {
  return days.filter((d) => d.open).length;
}
