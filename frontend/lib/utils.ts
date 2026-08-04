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
