export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatWeekRange(weekStart: string): string {
  const start = parseISODate(weekStart);
  const end = addDays(start, 6);
  const startFmt = start.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const endFmt = end.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  return `${startFmt} – ${endFmt}`;
}

// "18–24 Aug", or "28 Aug – 3 Sep" when the week straddles two months. The
// staff screens are 375px wide, so the month is only repeated when it has to
// be.
export function formatWeekRangeCompact(weekStart: string): string {
  const start = parseISODate(weekStart);
  const end = addDays(start, 6);
  const month = (d: Date) => d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  if (start.getUTCMonth() === end.getUTCMonth()) {
    return `${start.getUTCDate()}–${end.getUTCDate()} ${month(end)}`;
  }
  return `${start.getUTCDate()} ${month(start)} – ${end.getUTCDate()} ${month(end)}`;
}

// Total hours across a set of shifts. Shift ends are free text and pubs
// routinely use "close", which has no measurable duration — those are counted
// separately rather than silently folded in as zero, so callers can render an
// honest "28.5+h" instead of a confident, wrong "28.5h".
export function sumShiftHours(
  shifts: { start_time: string; end_time: string }[],
): { hours: number; unmeasured: number } {
  let hours = 0;
  let unmeasured = 0;
  for (const s of shifts) {
    const d = shiftDurationHours(s.start_time, s.end_time);
    if (d === null) unmeasured += 1;
    else hours += d;
  }
  return { hours, unmeasured };
}

export function formatHoursTotal(hours: number, unmeasured: number, unit = "h"): string {
  const value = Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  return `${value}${unmeasured > 0 ? "+" : ""}${unit}`;
}

// Mirror of services/leave.leave_days_for_range on the backend, which is the
// authority — this exists only so the request modal can show what a range will
// cost *before* it is submitted. Any change must be made in both places; the
// numbers appearing on screen after submission always come from the server.
//
// Pub staff work days spread across all seven, so a seven-day absence costs a
// five-day-a-week worker five days, not seven. Rounding is up, to the nearest
// half day, so a range can never quietly cost less than it really does.
export function leaveDaysForRange(
  startIso: string,
  endIso: string,
  workingDaysPerWeek: number,
): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const calendarDays =
    Math.round((parseISODate(endIso).getTime() - parseISODate(startIso).getTime()) / msPerDay) + 1;
  if (calendarDays < 1) return 0;
  const w = workingDaysPerWeek > 0 ? workingDaysPerWeek : 5;
  return Math.ceil(Number(((calendarDays * w) / 7).toFixed(6)) * 2) / 2;
}

// Half days are real, whole days shouldn't render as "5.0".
export function formatDays(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

// "Leave year: Jan–Dec 2026", or "Apr 2026 – Mar 2027" when it straddles.
export function formatLeaveYear(startIso: string, endIso: string): string {
  const start = parseISODate(startIso);
  const end = parseISODate(endIso);
  const month = (d: Date) => d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  if (start.getUTCFullYear() === end.getUTCFullYear()) {
    return `Leave year ${month(start)}–${month(end)} ${start.getUTCFullYear()}`;
  }
  return `Leave year ${month(start)} ${start.getUTCFullYear()} – ${month(end)} ${end.getUTCFullYear()}`;
}

// "Thu 2 Oct" for one day, "Fri 5 – Sat 6 Sep" within a month, "Sat 28 Feb –
// Tue 3 Mar" across two. The year is only ever shown when the range falls
// outside the current one, which keeps the common case short enough for 375px.
export function formatLeaveDates(startIso: string, endIso: string): string {
  const start = parseISODate(startIso);
  const end = parseISODate(endIso);
  const thisYear = new Date().getFullYear();
  const weekday = (d: Date) => DAY_LABELS[(d.getUTCDay() + 6) % 7];
  const month = (d: Date) => d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  const year =
    start.getUTCFullYear() === thisYear && end.getUTCFullYear() === thisYear
      ? ""
      : ` ${end.getUTCFullYear()}`;

  if (startIso === endIso) {
    return `${weekday(start)} ${start.getUTCDate()} ${month(start)}${year}`;
  }
  const tail = `${weekday(end)} ${end.getUTCDate()} ${month(end)}${year}`;
  if (start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear()) {
    return `${weekday(start)} ${start.getUTCDate()} – ${tail}`;
  }
  return `${weekday(start)} ${start.getUTCDate()} ${month(start)} – ${tail}`;
}

function deadlineDate(weekStart: string, closesDay: string): Date {
  const dayIndex = DAY_NAMES.indexOf(closesDay);
  return addDays(parseISODate(weekStart), dayIndex < 0 ? 0 : dayIndex);
}

export function formatDeadline(
  weekStart: string,
  closesDay: string,
  closesTime: string,
): string {
  const date = deadlineDate(weekStart, closesDay);
  const dateFmt = date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const timeFmt = formatTime(closesTime);
  return `${dateFmt}, ${timeFmt}`;
}

// "Thursday, 6pm" — the weekday name on its own, without a date. The staff
// hub frames the availability deadline as a recurring habit ("closes
// Thursday") rather than a calendar date, so it deliberately drops the day
// number that formatDeadline includes.
export function formatDeadlineDay(closesDay: string, closesTime: string): string {
  const dayIndex = DAY_NAMES.indexOf(closesDay);
  const dayName = dayIndex < 0 ? closesDay : DAY_NAMES[dayIndex];
  return `${dayName}, ${formatTime(closesTime)}`;
}

// "11 Aug" — the week-start date alone, for the hub's venue strip.
export function formatWeekOf(weekStart: string): string {
  return parseISODate(weekStart).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

// --- "Today", in the venue's timezone ------------------------------------
// Every "what day is it" in the manager app resolves against **Europe/London**,
// not the device clock and not UTC. Two reasons, and both bite in practice:
//
//   · UTC is wrong for an hour a day. The UK is UTC+1 from late March to late
//     October, so between midnight and 1am London time `getUTCDate()` still
//     reports yesterday — which is exactly when a late-close pub manager is
//     looking at their phone. Today's line-up would show last night's.
//   · The device clock is wrong for anyone away from the venue. The rota belongs
//     to the pub, not to wherever the manager happens to be standing.
//
// This matches the backend, which already resolves its own windows through
// `services/schedule_windows.now_london()`.
const LONDON_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today at the venue, as YYYY-MM-DD. en-CA formats ISO-style by definition. */
export function londonToday(): string {
  return LONDON_DATE.format(new Date());
}

/**
 * The Monday of the venue's current week (offset 0), or N weeks either side, as
 * YYYY-MM-DD. Negative offsets look back. The week-start strings the backend
 * stores are plain calendar dates, so this does its arithmetic in the same
 * timezone-free space rather than on a Date with an hour in it.
 */
export function mondayISO(offsetWeeks = 0): string {
  const today = parseISODate(londonToday());
  const dow = (today.getUTCDay() + 6) % 7; // 0 = Monday
  const monday = new Date(today.getTime() + (offsetWeeks * 7 - dow) * 86_400_000);
  return monday.toISOString().slice(0, 10);
}

/**
 * Where today sits inside a given week: 0 (Mon) .. 6 (Sun), or null when today
 * isn't in that week at all. Callers read null as "this week isn't the current
 * one", which is how the Today strip knows to stay quiet.
 */
export function todayIndexInWeek(weekStart: string): number | null {
  const diff = Math.round(
    (parseISODate(londonToday()).getTime() - parseISODate(weekStart).getTime()) / 86_400_000,
  );
  return diff >= 0 && diff <= 6 ? diff : null;
}

/** Whole weeks from the venue's current week. Negative = past, 0 = this week. */
export function weekOffsetFromNow(weekStart: string): number {
  return Math.round(
    (parseISODate(weekStart).getTime() - parseISODate(mondayISO(0)).getTime()) /
      (7 * 86_400_000),
  );
}

// --- Which period is which -----------------------------------------------
// Home and Rota each used to answer "what period am I looking at?" their own
// way, and the Today strip needs a third answer. One definition each, here, so
// the two screens can't disagree about what "this week" means.

/** The period whose week contains today, whatever its status. Null if none. */
export function periodForToday<T extends { week_start: string }>(periods: T[]): T | null {
  return periods.find((p) => todayIndexInWeek(p.week_start) !== null) ?? null;
}

/**
 * The week the manager is being asked to *build* — the soonest current-or-future
 * one that still needs work.
 *
 * "Needs work" is any status that isn't out to staff yet: collecting (chase),
 * closed (reopen or build), generated (finish and publish). Only when every
 * upcoming week is already live does this fall back to the earliest of those,
 * so the hero can say "this week's sorted" — and the hero then checks that
 * week's actual coverage, because a published week can still have holes.
 *
 * The ordering matters: picking the plain earliest week would hide next week's
 * unfinished draft behind a this-week rota that's already out and fine, which is
 * exactly backwards from what the manager's next job is.
 *
 * A venue whose only periods are in the past has nothing to plan — null, and the
 * caller shows the front door rather than narrating a week that's been and gone.
 */
export function planningPeriod<T extends { week_start: string; status: string }>(
  periods: T[],
): T | null {
  const upcoming = periods
    .filter((p) => weekOffsetFromNow(p.week_start) >= 0)
    .sort((a, b) => a.week_start.localeCompare(b.week_start));
  if (!upcoming.length) return null;
  const needsWork = upcoming.find(
    (p) => p.status !== "published" && p.status !== "confirmed",
  );
  return needsWork ?? upcoming[0];
}

// How many whole weeks ahead a week-start is relative to the current week's
// Monday. 0 = this week, 1 = next week.
export function weeksFromThisWeek(weekStart: string): number {
  const now = new Date();
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dow = (new Date(todayUTC).getUTCDay() + 6) % 7;
  const thisMonday = todayUTC - dow * 86_400_000;
  return Math.round((parseISODate(weekStart).getTime() - thisMonday) / (7 * 86_400_000));
}

// Whole days from the venue's today to a real close timestamp (the scheduler's
// `closes_at`, derived from the legal notice period). 0 = closes today, negative
// = already shut. Distinct from daysUntilDeadline below, which counts to the Nth
// day OF the collected week off the legacy `avail_closes_day` name and can land
// after that week has already started.
export function daysUntilClose(closesAt: string): number {
  const close = closesAt.slice(0, 10);
  return Math.round(
    (parseISODate(close).getTime() - parseISODate(londonToday()).getTime()) / 86_400_000,
  );
}

export function daysUntilDeadline(weekStart: string, closesDay: string): number {
  const date = deadlineDate(weekStart, closesDay);
  const now = new Date();
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((date.getTime() - todayUTC) / msPerDay);
}

export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - then;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) return "Just now";
  if (diffMs < hour) {
    const m = Math.floor(diffMs / minute);
    return `${m} minute${m === 1 ? "" : "s"} ago`;
  }
  if (diffMs < day) {
    const h = Math.floor(diffMs / hour);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  if (diffMs < 2 * day) return "Yesterday";
  const d = Math.floor(diffMs / day);
  return `${d} days ago`;
}

// Activity `detail` strings embed the staff name for most actions (e.g. "Sam
// dropped their Monday shift"), but not all (e.g. "Manager rejected a shift
// claim..." has no name in it at all even though it's staff-scoped). Feeds
// that also render a separate name label need this check first, or names
// referenced in the front of the text end up doubled.
export function startsWithName(text: string, name: string | null): boolean {
  if (!name) return false;
  return text.toLowerCase().startsWith(name.toLowerCase());
}

export function describeAction(action: string, detail: string | null, staffName: string | null): string {
  switch (action) {
    case "submitted_availability":
      return "submitted availability";
    case "staff_added":
      return "joined the team";
    case "venue_created":
      return "Venue was set up";
    case "reminder_sent":
      return staffName ? "was reminded to submit availability" : (detail ?? action);
    default:
      return detail ?? action;
  }
}

function formatTime(time24: string): string {
  const [hStr, mStr] = time24.split(":");
  let h = Number(hStr);
  const m = Number(mStr || 0);
  const suffix = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return m === 0 ? `${h}${suffix}` : `${h}:${String(m).padStart(2, "0")}${suffix}`;
}

export function pinStorageKey(venueToken: string): string {
  return `rota_pin_${venueToken}`;
}

// Per-device "remember me" token (§3). We persist the staff PIN itself, scoped
// to the venue, so a returning staffer on the same phone skips PIN entry and
// the PIN becomes recovery-only. localStorage (survives app closes), unlike the
// sessionStorage key above which dies with the tab. A new device has no entry
// and falls back to PIN; a 401 anywhere clears it (see the entry page).
export function deviceKey(venueToken: string): string {
  return `rota_device_${venueToken}`;
}

function parseClock(text: string): { h: number; m: number; suffix: string } | null {
  const match = text.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = match[2] ? parseInt(match[2], 10) : 0;
  if (match[3] === "pm" && h < 12) h += 12;
  if (match[3] === "am" && h === 12) h = 0;
  if (h > 23 || m > 59) return null;
  const suffix = match[3] || (h >= 12 ? "pm" : "am");
  return { h, m, suffix };
}

// Duration of a shift in hours from free-text start/end times (e.g. "7:00am"
// to "2:00pm"). Returns null when the end time isn't a parseable clock time
// (e.g. "close"). Overnight shifts wrap past midnight.
export function shiftDurationHours(start: string, end: string): number | null {
  const s = parseClock(start);
  const e = parseClock(end);
  if (!s || !e) return null;
  let mins = e.h * 60 + e.m - (s.h * 60 + s.m);
  if (mins <= 0) mins += 24 * 60;
  return Math.round((mins / 60) * 10) / 10;
}

// "10:00pm" -> "10pm", "10:30pm" -> "10:30pm", "close" -> "close". The single
// time on its own, for the places a range would be noise (an under-18's finish).
export function shortClock(time: string): string {
  const c = parseClock(time);
  if (!c) return time.trim();
  const disp = c.h % 12 || 12;
  return c.m ? `${disp}:${String(c.m).padStart(2, "0")}${c.suffix}` : `${disp}${c.suffix}`;
}

// Minutes since midnight at the venue right now. Paired with shiftPhase below
// so "who's on" is answered against the pub's clock, not the viewer's.
export function londonMinutesNow(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return (h % 24) * 60 + m;
}

/**
 * Where a shift sits relative to right now: not started, running, or done.
 * Null when either time is unparseable free text (a legacy "close"), so callers
 * can say nothing rather than guess.
 *
 * `startedDaysAgo` is which day the shift is rostered ON, and it is the whole
 * point of the signature. A 5pm–1am shift is eight hours of one evening, but it
 * spans two calendar dates — so at 00:30 the shift that is actually running is
 * *yesterday's*, and today's identically-timed one has not begun. Measuring
 * both against a bare clock would report today's as live sixteen hours early,
 * at exactly the hour a late-close manager opens the app to see who's still on.
 * Pass 0 for a shift rostered today, 1 for one rostered yesterday.
 */
export function shiftPhase(
  start: string,
  end: string,
  nowMinutes: number,
  startedDaysAgo = 0,
): "upcoming" | "now" | "done" | null {
  const s = parseClock(start);
  const e = parseClock(end);
  if (!s || !e) return null;
  let from = s.h * 60 + s.m;
  let to = e.h * 60 + e.m;
  if (to <= from) to += 24 * 60; // crosses midnight
  from -= startedDaysAgo * 24 * 60;
  to -= startedDaysAgo * 24 * 60;
  if (nowMinutes < from) return "upcoming";
  if (nowMinutes < to) return "now";
  return "done";
}

// "2:00pm"/"6:00pm" -> "2–6pm"; "9am"/"5pm" -> "9am–5pm". Falls back to the raw
// values joined with an en dash when either side isn't a parseable clock time
// (e.g. "close"). Mirrors the backend's compact_time_range for PDF/Excel export.
export function compactTimeRange(start: string, end: string): string {
  const s = parseClock(start);
  const e = parseClock(end);
  if (!s || !e) {
    return [start?.trim(), end?.trim()].filter(Boolean).join("–");
  }
  // parseClock returns 24-hour hours, so always fold back to a 12-hour display
  // digit (13→1, 16→4, 0→12). A previous version skipped this fold on the
  // cross-meridian branch, rendering "10:00am"/"4:00pm" as "10am–16pm".
  const label = (h: number, m: number) => {
    const disp = h % 12 || 12;
    return m ? `${disp}:${String(m).padStart(2, "0")}` : `${disp}`;
  };
  if (s.suffix && e.suffix && s.suffix === e.suffix) {
    return `${label(s.h, s.m)}–${label(e.h, e.m)}${e.suffix}`;
  }
  return `${label(s.h, s.m)}${s.suffix}–${label(e.h, e.m)}${e.suffix}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function icsDateStamp(date: Date): string {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

function icsDateTimeAtMinutes(date: Date, minutesFromMidnight: number): string {
  const d = new Date(date);
  d.setUTCHours(0, minutesFromMidnight, 0, 0);
  return `${icsDateStamp(d)}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00`;
}

// Best-effort parser for the free-text shift times stored by the app (e.g.
// "7:00am", "9pm"). Shift end times can also be arbitrary text like "close",
// which this intentionally fails to match so callers can fall back gracefully.
function parseShiftClockTime(text: string): { hour: number; minute: number } | null {
  const match = text.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;
  let hour = parseInt(match[1], 10);
  const minute = match[2] ? parseInt(match[2], 10) : 0;
  const suffix = match[3];
  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

export function buildShiftsIcs(
  venueName: string,
  shifts: { date: Date; name: string; startTime: string; endTime: string }[],
): string {
  const now = new Date();
  const stamp = `${icsDateTimeAtMinutes(now, now.getUTCHours() * 60 + now.getUTCMinutes())}Z`;

  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Rota//EN", "CALSCALE:GREGORIAN"];

  shifts.forEach((s, i) => {
    const start = parseShiftClockTime(s.startTime);
    const end = parseShiftClockTime(s.endTime);

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${icsDateStamp(s.date)}-${i}@rota-app`);
    lines.push(`DTSTAMP:${stamp}`);

    if (start) {
      const startMinutes = start.hour * 60 + start.minute;
      // Falls back to a 4-hour shift when the end time isn't a parseable
      // clock time (e.g. "close"), and rolls into the next day for
      // overnight shifts, so the .ics stays valid either way.
      let endMinutes = end ? end.hour * 60 + end.minute : startMinutes + 240;
      if (endMinutes <= startMinutes) endMinutes += 24 * 60;
      lines.push(`DTSTART:${icsDateTimeAtMinutes(s.date, startMinutes)}`);
      lines.push(`DTEND:${icsDateTimeAtMinutes(s.date, endMinutes)}`);
    } else {
      const nextDay = addDays(s.date, 1);
      lines.push(`DTSTART;VALUE=DATE:${icsDateStamp(s.date)}`);
      lines.push(`DTEND;VALUE=DATE:${icsDateStamp(nextDay)}`);
    }

    lines.push(`SUMMARY:${s.name} shift at ${venueName}`);
    lines.push(`LOCATION:${venueName}`);
    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
