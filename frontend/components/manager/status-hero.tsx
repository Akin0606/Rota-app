"use client";

import Link from "next/link";

import type { Period, RotaSummary, Shift } from "@/lib/api";
import { DAY_LABELS, formatWeekOf, weekOffsetFromNow } from "@/lib/utils";

import ManagerIcon, { type ManagerIconName } from "./icon";
import Waiting from "@/components/waiting";

// H1 — one live sentence answering the only planning question that matters:
// "is this week's rota sorted, and if not, what's the one thing blocking it?"
//
// It replaces the old "Good morning / Dashboard" header, the status banner and
// half the four-stat vanity row in a single component. The stats it absorbs are
// the two that were ever actionable (availability count, days to deadline);
// "Total Hours 214" and "Conflicts 0" are gone because they are numbers a
// small-pub owner does nothing with, and a "0 conflicts / All clear" tile
// rewards nothing.
//
// The hero owns the screen's ONE loud button — except when today has a real
// hole, in which case covering that wins and this demotes to quiet. Present
// beats planning.

type Tone = "neutral" | "amber" | "green" | "red";

const TONE_SHELL: Record<Tone, string> = {
  neutral: "cp-hairline bg-surface-card",
  amber: "border-[0.5px] border-cp-amber/40 bg-cp-amber-soft",
  green: "border-[0.5px] border-avail-border bg-avail-bg",
  red: "border-[0.5px] border-cp-red/40 bg-cp-red-soft",
};

const TONE_BADGE: Record<Tone, string> = {
  neutral: "cp-hairline bg-surface-subtle text-ink-faint",
  amber: "bg-cp-amber-soft text-cp-amber",
  green: "bg-avail-bg text-cp-green",
  red: "bg-cp-red/15 text-cp-red",
};

export type HeroPlan = {
  tone: Tone;
  badge: string;
  badgeIcon: ManagerIconName;
  weekLabel: string;
  line: string;
  sub: string;
  /** 0..1 — renders the availability micro-bar. Omitted when not collecting. */
  progress?: number;
  primary: { label: string; icon: ManagerIconName; href?: string; onClick?: () => void };
  secondary?: { label: string; href: string };
};

/**
 * Everything the hero says, derived in one place so the sentence, the badge and
 * the button can't disagree about what state the week is in.
 *
 * `period` is the week being *planned* — not necessarily the week we're in.
 */
export function buildHeroPlan(args: {
  period: Period | null;
  rota: RotaSummary | null;
  shifts: Shift[];
  submittedCount: number;
  totalCount: number;
  daysLeft: number | null;
  hasAnyPeriod: boolean;
}): HeroPlan {
  const { period, rota, shifts, submittedCount, totalCount, daysLeft, hasAnyPeriod } = args;

  // Nothing to plan. A brand-new venue and a dormant one read differently: one
  // has never built a rota, the other just hasn't opened next week yet.
  if (!period) {
    return {
      tone: "neutral",
      badge: "Not started",
      badgeIcon: "circle-plus",
      weekLabel: "",
      line: hasAnyPeriod ? "Nothing planned yet" : "Let's build your first rota",
      sub: hasAnyPeriod
        ? "Open a week and Rotally fills it from everyone's availability."
        : "Collect availability, then Rotally fills the week — fair hours, rest gaps and under-18 rules handled.",
      primary: { label: "Set up a week", icon: "sparkles", href: "/rota" },
      secondary: hasAnyPeriod ? undefined : { label: "Invite the team first", href: "/team" },
    };
  }

  const offset = weekOffsetFromNow(period.week_start);
  const weekLabel = `w/c ${formatWeekOf(period.week_start)}`;
  const whichWeek = offset === 0 ? "This week" : offset === 1 ? "Next week" : weekLabel;

  // The week's real holes, from the same uncovered/under_covered the rota page
  // treats as the single source of truth for a gap.
  const shiftsById = new Map(shifts.map((s) => [s.id, s]));
  const slots = [
    ...(rota?.uncovered ?? []).map((u) => ({ day: u.day_index, shiftId: u.shift_id })),
    ...(rota?.under_covered ?? []).map((u) => ({ day: u.day_index, shiftId: u.shift_id })),
  ].sort((a, b) => a.day - b.day);
  const nameSlots = (n: number) =>
    slots
      .slice(0, n)
      .map((x) => `${DAY_LABELS[x.day]} ${shiftsById.get(x.shiftId)?.name ?? "shift"}`)
      .join(", ") + (slots.length > n ? ` +${slots.length - n} more` : "");

  const isLive = period.status === "published" || period.status === "confirmed";
  if (isLive) {
    // Publishing with gaps is allowed and sometimes right, so a live week is not
    // automatically a sorted one. Saying "sorted" over a hole would contradict
    // the Today strip on the very same screen.
    if (slots.length > 0) {
      return {
        tone: "red",
        badge: period.status === "confirmed" ? "Confirmed" : "Provisional",
        badgeIcon: "alert-triangle",
        weekLabel,
        line: `${whichWeek}'s out, with ${slots.length} gap${slots.length === 1 ? "" : "s"}`,
        sub: `${nameSlots(2)} · staff can see it's short`,
        primary: { label: "Fill the gaps", icon: "plus", href: "/rota" },
      };
    }
    return {
      tone: "green",
      badge: period.status === "confirmed" ? "Confirmed" : "Provisional",
      badgeIcon: "check",
      weekLabel,
      line: `${whichWeek}'s sorted`,
      sub:
        period.status === "confirmed"
          ? "Published and settled — staff have their shifts."
          : "Published — the availability window is still open, so it can still change.",
      primary: { label: "View / share rota", icon: "send", href: "/rota" },
    };
  }

  // Built but not out. Gaps are the blocker, and they're named.
  if (period.status === "generated" || (rota && rota.assignments.some((a) => a.staff_id))) {
    if (slots.length === 0) {
      return {
        tone: "green",
        badge: "Draft",
        badgeIcon: "pencil",
        weekLabel,
        line: `${whichWeek}'s rota is ready`,
        sub: "Every shift is covered — publish it and staff get their week.",
        primary: { label: "Review and publish", icon: "send", href: "/rota" },
      };
    }
    return {
      tone: "red",
      badge: "Draft",
      badgeIcon: "pencil",
      weekLabel,
      line: `Draft rota — ${slots.length} gap${slots.length === 1 ? "" : "s"} left to fill`,
      sub: `${nameSlots(2)} · then publish`,
      primary: { label: "Finish the rota", icon: "pencil", href: "/rota" },
    };
  }

  // The window has shut but nothing was built — the quiet week where nobody
  // answered. Reopening is the honest action; chasing a closed window isn't.
  if (period.status === "closed") {
    return {
      tone: "amber",
      badge: "Closed",
      badgeIcon: "lock",
      weekLabel,
      line: `${whichWeek}'s availability window has closed`,
      sub:
        submittedCount === 0
          ? "Nobody sent anything, so there was nothing to build. Reopen it and chase."
          : `${submittedCount} of ${totalCount} answered — build the week with who you've got.`,
      primary: { label: "Open the rota", icon: "table", href: "/rota" },
    };
  }

  // Collecting.
  const outstanding = Math.max(0, totalCount - submittedCount);
  const deadline =
    daysLeft === null
      ? ""
      : daysLeft <= 0
        ? "Closes today"
        : daysLeft === 1
          ? "Closes tomorrow"
          : `Closes in ${daysLeft} days`;

  if (outstanding === 0 && totalCount > 0) {
    return {
      tone: "green",
      badge: "Collecting",
      badgeIcon: "check",
      weekLabel,
      line: "Everyone's sent availability",
      sub: `All ${totalCount} in for ${weekLabel} — ready to build.`,
      progress: 1,
      primary: { label: "Build the rota", icon: "sparkles", href: "/rota" },
    };
  }

  return {
    tone: "amber",
    badge: "Collecting",
    badgeIcon: "clock",
    weekLabel,
    line: `${submittedCount} of ${totalCount} have sent availability`,
    sub: deadline ? `${deadline} · then you can build the rota` : "Then you can build the rota",
    progress: totalCount ? submittedCount / totalCount : 0,
    primary: { label: `Chase the ${outstanding} missing`, icon: "mail" },
    secondary: { label: "Open the rota", href: "/rota" },
  };
}

export default function StatusHero({
  plan,
  busy = false,
  /** True when today has a real hole — the Today strip takes the loud button. */
  demoted = false,
}: {
  plan: HeroPlan;
  busy?: boolean;
  demoted?: boolean;
}) {
  const primaryClass = demoted
    ? "cp-hairline w-full rounded-cp-control bg-surface-card py-3 text-[13.5px] font-medium text-ink-muted"
    : "w-full rounded-cp-control bg-accent py-[13px] text-[14px] font-medium text-accent-on";

  const inner = (
    <span className="flex items-center justify-center gap-2">
      {busy ? (
        <Waiting label={plan.primary.label} />
      ) : (
        <>
          <ManagerIcon name={plan.primary.icon} size={16} />
          {plan.primary.label}
        </>
      )}
    </span>
  );

  return (
    <div className={`mb-3.5 rounded-panel px-4 py-[18px] ${TONE_SHELL[plan.tone]}`}>
      <div className="mb-[11px] flex items-center gap-2.5">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-medium uppercase tracking-[0.05em] ${TONE_BADGE[plan.tone]}`}
        >
          <ManagerIcon name={plan.badgeIcon} size={11} />
          {plan.badge}
        </span>
        {plan.weekLabel && (
          <span className="ml-auto text-[11px] text-ink-muted">{plan.weekLabel}</span>
        )}
      </div>

      <div className="mb-1 text-[20px] font-medium leading-[1.32] tracking-[-0.4px] text-ink">
        {plan.line}
      </div>
      <div className="mb-[15px] text-[12.5px] text-ink-muted">{plan.sub}</div>

      {plan.progress !== undefined && (
        <div className="mb-[15px] h-[5px] overflow-hidden rounded-full bg-cp-track">
          <div
            className="h-full rounded-full bg-cp-amber transition-[width] duration-300"
            style={{ width: `${Math.round(plan.progress * 100)}%` }}
          />
        </div>
      )}

      {plan.primary.href ? (
        <Link
          href={plan.primary.href}
          className={`${primaryClass} block text-center transition-[transform] active:scale-[0.98]`}
        >
          {inner}
        </Link>
      ) : (
        <button
          onClick={plan.primary.onClick}
          disabled={busy}
          className={`${primaryClass} transition-[transform] active:scale-[0.98] disabled:opacity-60`}
        >
          {inner}
        </button>
      )}

      {plan.secondary && (
        <Link
          href={plan.secondary.href}
          className="cp-hairline mt-2 block w-full rounded-cp-control py-[11px] text-center text-[12.5px] font-medium text-ink-muted transition-[transform] active:scale-[0.98]"
        >
          {plan.secondary.label}
        </Link>
      )}
    </div>
  );
}
