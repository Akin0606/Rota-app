"use client";

import { useEffect, useRef } from "react";

import type { Period } from "@/lib/api";
import { mondayISO, parseISODate, weekOffsetFromNow } from "@/lib/utils";

import ManagerIcon from "./icon";

// R1 — one bounded, snapping week-strip replacing the three This/Next/In-2-weeks
// pills. Two signals that must stay distinct (founder's call):
//   · the week you're VIEWING carries the accent fill,
//   · the real current week carries a persistent "now" marker that never moves,
// so scrubbing forward to plan, or back to settle an argument about last month,
// never loses where today is. That's why there's no "This week" reset button —
// the now-marker is the anchor back.
//
// Bounded at both ends on purpose: no invented history before the venue existed,
// and no dead future stops.
//
// The right edge matches the backend EXACTLY rather than inventing a stricter
// frontend rule that would drift: `create_period`
// (backend/routers/periods.py:42) accepts `this_monday .. this_monday + 4w` and
// refuses anything earlier with a 400. So a past week is view-only by
// construction, not merely by styling — and capping the strip at the +2 the
// build plan originally asked for would have silently removed two weeks of
// planning the product already supports. (That +2 came from a belief that the
// backend only allowed +2; it was the old three pills people were reading.)
//
// The left edge is the venue's own first period. No soft history cap:
// `listPeriods` returns every period in one small unpaginated call and pilot
// venues are weeks old. Revisit if a venue ever passes ~50 periods.
export const WEEKS_AHEAD = 4;

export type WeekState = "published" | "draft" | "empty";

export type WeekStop = {
  weekStart: string;
  /** Weeks from the local current week. Negative = past, 0 = now. */
  offset: number;
  state: WeekState;
  isNow: boolean;
  isPast: boolean;
  /** True when a period can still be created/generated for this week. */
  buildable: boolean;
};

function stateFor(status: string | undefined): WeekState {
  if (status === "published" || status === "confirmed") return "published";
  if (status === "generated") return "draft";
  // `collecting` / `closed` mean the window exists but nothing is built yet —
  // honestly "empty" as far as a rota is concerned.
  return "empty";
}

/** The strip's stops, left (oldest) to right (+WEEKS_AHEAD). */
export function buildWeekStops(
  periods: Pick<Period, "week_start" | "status">[],
  venueCreatedAt: string | null,
  opts?: { ahead?: number },
): WeekStop[] {
  const ahead = opts?.ahead ?? WEEKS_AHEAD;

  const statusByWeek = new Map(periods.map((p) => [p.week_start, p.status]));

  // Left edge = the venue's earliest period. `created_at` is only the fallback
  // for a venue with no periods at all: it is a timestamp, not a Monday, and a
  // venue created mid-week can have a first period either side of it — so the
  // periods are the better truth whenever there are any.
  const offsets = periods.map((p) => weekOffsetFromNow(p.week_start));
  if (!offsets.length && venueCreatedAt) {
    offsets.push(weekOffsetFromNow(venueCreatedAt.slice(0, 10)));
  }
  const earliest = offsets.length ? Math.min(...offsets) : 0;
  // Never start in the future — a brand-new venue's strip begins at this week.
  const start = Math.min(0, earliest);

  const stops: WeekStop[] = [];
  for (let offset = start; offset <= ahead; offset += 1) {
    const weekStart = mondayISO(offset);
    stops.push({
      weekStart,
      offset,
      state: stateFor(statusByWeek.get(weekStart)),
      isNow: offset === 0,
      isPast: offset < 0,
      buildable: offset >= 0,
    });
  }
  return stops;
}

function StateDot({ state, on }: { state: WeekState; on: boolean }) {
  // Coverage colours are the only meaningful colour in the app, and these dots
  // are exactly that: has this week got a rota, and is it out. On the accent-
  // filled viewing chip they'd disappear against it, so they invert to the
  // accent's own foreground and lean on fill/outline to carry the difference.
  if (state === "published") {
    return (
      <span
        className={`h-[6px] w-[6px] rounded-full ${on ? "bg-accent-on" : "bg-cp-green"}`}
        aria-hidden
      />
    );
  }
  if (state === "draft") {
    return (
      <span
        className={`h-[6px] w-[6px] rounded-full border-[1.5px] ${
          on ? "border-accent-on" : "border-cp-amber"
        }`}
        aria-hidden
      />
    );
  }
  return (
    <span
      className={`h-[6px] w-[6px] rounded-full border-[0.5px] ${
        on ? "border-accent-on/60" : "border-hairline"
      }`}
      aria-hidden
    />
  );
}

const STATE_WORD: Record<WeekState, string> = {
  published: "rota published",
  draft: "draft rota",
  empty: "nothing built yet",
};

export default function WeekScrubber({
  stops,
  selected,
  onSelect,
}: {
  stops: WeekStop[];
  selected: string;
  onSelect: (weekStart: string) => void;
}) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  // Centre the viewing chip when it changes — otherwise a venue with a few
  // months of history opens showing some other part of the strip entirely.
  //
  // This scrolls the rail directly rather than calling scrollIntoView on the
  // chip. scrollIntoView walks every scrollable ancestor, so it also moves the
  // PAGE — landing on the rota page would yank the view down past the header
  // before the manager has read it. Setting scrollLeft can only ever move the
  // strip.
  useEffect(() => {
    const el = activeRef.current;
    const rail = railRef.current;
    if (!el || !rail) return;
    if (rail.scrollWidth <= rail.clientWidth) return; // fits — nothing to scroll
    const target = el.offsetLeft - (rail.clientWidth - el.offsetWidth) / 2;
    const left = Math.max(0, Math.min(target, rail.scrollWidth - rail.clientWidth));
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Smooth is inert in a non-compositing preview pane (same family as the
    // frozen-transition limit) — the scroll maths is verified with "auto", the
    // easing itself needs a real browser.
    rail.scrollTo({ left, behavior: reduce ? "auto" : "smooth" });
  }, [selected, stops.length]);

  // Short history fills the row instead of scrolling — a two-week-old venue
  // shouldn't get four chips huddled on the left with dead space beside them.
  const fills = stops.length <= 5;

  return (
    <div className="mb-4">
      <div
        ref={railRef}
        // `relative` makes the rail the chips' offsetParent, so their offsetLeft
        // is measured from the same origin as scrollLeft. Without it offsetLeft
        // is page-relative and includes the page padding, and the centring maths
        // below quietly scrolls to the wrong place.
        className="scrollbar-none relative flex snap-x snap-mandatory gap-1.5 overflow-x-auto pb-1.5"
        role="tablist"
        aria-label="Pick a week"
      >
        {stops.map((s) => {
          const on = s.weekStart === selected;
          const date = parseISODate(s.weekStart);
          const day = date.getUTCDate();
          const month = date.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
          const top = s.isNow ? "Now" : s.offset > 0 ? "Plan" : month;
          return (
            <button
              key={s.weekStart}
              ref={on ? activeRef : undefined}
              role="tab"
              aria-selected={on}
              onClick={() => onSelect(s.weekStart)}
              // `relative` is load-bearing, not decoration: the sr-only label
              // below is absolutely positioned, and without a positioned chip to
              // contain it, it resolves against the page instead — escaping the
              // rail's overflow clipping and pushing the whole document 28px
              // wider than a 375px phone.
              className={`relative snap-center ${
                fills ? "flex-1" : "flex-none"
              } min-w-[54px] rounded-[11px] border-[0.5px] px-1.5 pb-[7px] pt-2 text-center transition-[background-color,border-color,transform] active:scale-[0.97] ${
                on
                  ? "border-accent bg-accent"
                  : `cp-hairline bg-surface-card ${s.isPast ? "opacity-70" : ""}`
              }`}
            >
              <span
                className={`flex items-center justify-center gap-1 text-[9px] uppercase tracking-[0.06em] ${
                  on ? "text-accent-on" : s.isNow ? "text-ink" : "text-ink-faint"
                }`}
              >
                {s.isNow && (
                  <span
                    className={`h-[5px] w-[5px] shrink-0 rounded-full ${
                      on ? "bg-accent-on" : "bg-ink"
                    }`}
                    aria-hidden
                  />
                )}
                {top}
              </span>
              <span
                className={`mb-1 mt-0.5 block text-[13px] font-medium ${
                  on ? "text-accent-on" : s.isPast ? "text-ink-muted" : "text-ink"
                }`}
              >
                {day}
              </span>
              <span className="flex justify-center">
                <StateDot state={s.state} on={on} />
              </span>
              <span className="sr-only">
                Week of {day} {month} — {STATE_WORD[s.state]}
                {s.isNow ? ", this week" : ""}
                {s.isPast ? ", past week, view only" : ""}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-1 flex items-center gap-3 text-[10px] text-ink-faint">
        <span className="flex items-center gap-1">
          <span className="h-[6px] w-[6px] rounded-full bg-cp-green" aria-hidden /> published
        </span>
        <span className="flex items-center gap-1">
          <span className="h-[6px] w-[6px] rounded-full border-[1.5px] border-cp-amber" aria-hidden /> draft
        </span>
        <span className="flex items-center gap-1">
          <span className="h-[6px] w-[6px] rounded-full border-[0.5px] border-hairline" aria-hidden /> empty
        </span>
      </div>
    </div>
  );
}

/**
 * The one-line note under the strip. Only says something when it has something
 * honest to say: you've scrubbed to a week you can't build, or you're at the
 * far end of the planning horizon.
 */
export function ScrubberEdgeHint({ stop }: { stop: WeekStop | null }) {
  if (!stop) return null;
  if (stop.isPast) {
    return (
      <div className="-mt-2 mb-3 flex items-center gap-1.5 text-[10.5px] text-ink-faint">
        <ManagerIcon name="info-circle" size={12} />
        A week that&apos;s been and gone — you can look, but not change it.
      </div>
    );
  }
  if (stop.offset === WEEKS_AHEAD) {
    return (
      <div className="-mt-2 mb-3 flex items-center gap-1.5 text-[10.5px] text-ink-faint">
        <ManagerIcon name="info-circle" size={12} />
        As far ahead as you can plan — {WEEKS_AHEAD} weeks.
      </div>
    );
  }
  return null;
}
