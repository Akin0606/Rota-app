"""Helpers for the availability window's three real datetimes (opens, reminder,
closes).

The datetimes are stored as naive Europe/London wall-clock values (a plain
`timestamp` column) — what the manager picks in the date-time picker is exactly
what's stored and shown back. Only the scheduler attaches the London timezone,
so DST is handled at trigger time without muddying storage or display.
"""

from __future__ import annotations

from datetime import datetime, time, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

LONDON = ZoneInfo("Europe/London")

# Storage/display format for the naive wall-clock datetimes.
FMT = "%Y-%m-%dT%H:%M:%S"

# Default wall-clock times for a fresh venue's window, matching the app's
# historic day-of-week defaults (open Sat 06:00, remind Tue 10:00, close
# Wed 23:00).
_OPEN_TIME = time(6, 0)
_REMINDER_TIME = time(10, 0)
_CLOSE_TIME = time(23, 0)


def now_london() -> datetime:
    return datetime.now(LONDON).replace(tzinfo=None)


def _next_weekday(base: datetime, weekday: int, at: time) -> datetime:
    """Next occurrence of `weekday` (Mon=0..Sun=6) at `at`, on or after base."""
    candidate = datetime.combine(base.date(), at)
    delta = (weekday - candidate.weekday()) % 7
    candidate = candidate + timedelta(days=delta)
    if candidate <= base:
        candidate += timedelta(days=7)
    return candidate


def default_window(base: Optional[datetime] = None) -> dict[str, str]:
    """Sensible default opens/reminder/closes for a venue with no schedule yet.
    Returns naive London wall-clock ISO strings. Opens next Saturday 06:00, then
    closes the following Wednesday 23:00, with a reminder the Tuesday before at
    10:00."""
    base = base or now_london()
    opens = _next_weekday(base, 5, _OPEN_TIME)  # Saturday
    closes = datetime.combine((opens + timedelta(days=4)).date(), _CLOSE_TIME)  # Wednesday
    reminder = datetime.combine((closes - timedelta(days=1)).date(), _REMINDER_TIME)  # Tuesday
    return {
        "avail_opens_at": opens.strftime(FMT),
        "avail_reminder_at": reminder.strftime(FMT),
        "avail_closes_at": closes.strftime(FMT),
    }


def parse(value: Optional[str]) -> Optional[datetime]:
    """Parse a stored naive datetime string (tolerating a trailing 'Z'/offset or
    missing seconds) into a naive datetime."""
    if not value:
        return None
    raw = str(value).strip()
    # Drop any timezone marker — these are wall-clock London values.
    if raw.endswith("Z"):
        raw = raw[:-1]
    # Strip an explicit offset like +00:00 if present.
    if len(raw) >= 6 and (raw[-6] in "+-") and raw[-3] == ":":
        raw = raw[:-6]
    raw = raw.replace(" ", "T")
    for fmt in (FMT, "%Y-%m-%dT%H:%M"):
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        return None


def to_london_aware(value: Optional[str]) -> Optional[datetime]:
    """Parse a stored naive value and attach the London tz, for scheduling."""
    dt = parse(value)
    if dt is None:
        return None
    return dt.replace(tzinfo=LONDON)


def roll_to_future(value: Optional[str], *, base: Optional[datetime] = None) -> Optional[datetime]:
    """London-aware datetime for `value`, advanced in whole weeks until it's in
    the future. Keeps a weekly trigger firing even if the stored date has just
    passed (e.g. after a restart), without mutating what's stored."""
    dt = parse(value)
    if dt is None:
        return None
    base = base or now_london()
    while dt <= base:
        dt += timedelta(days=7)
    return dt.replace(tzinfo=LONDON)


def advance_week(value: Optional[str]) -> Optional[str]:
    """Naive stored value moved forward one week — used to roll the window to the
    next cycle after it closes."""
    dt = parse(value)
    if dt is None:
        return None
    return (dt + timedelta(days=7)).strftime(FMT)


def format_deadline(value: Optional[str]) -> Optional[str]:
    """Human deadline label, e.g. 'Wednesday 12 Aug, 23:00'."""
    dt = parse(value)
    if dt is None:
        return None
    return f"{dt.strftime('%A %d %b')}, {dt.strftime('%H:%M')}"
