"""Helpers for the availability window's three real datetimes (opens, reminder,
closes).

The datetimes are stored as naive Europe/London wall-clock values (a plain
`timestamp` column) — what the manager picks in the date-time picker is exactly
what's stored and shown back. Only the scheduler attaches the London timezone,
so DST is handled at trigger time without muddying storage or display.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from services import dates

LONDON = ZoneInfo("Europe/London")

# Storage/display format for the naive wall-clock datetimes.
FMT = "%Y-%m-%dT%H:%M:%S"

# UK Working Time / agency-worker practice: staff must get at least this much
# notice of a shift. The notice window closes a configurable buffer earlier
# still, so the rota is finalised comfortably before the deadline.
LEGAL_NOTICE_HOURS = 72

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
    return f"{dt.strftime('%A')} {dates.uk_date(dt, with_year=False)}, {dt.strftime('%H:%M')}"


def format_deadline_dt(dt: Optional[datetime]) -> Optional[str]:
    """Human deadline label for a datetime (as opposed to a stored string)."""
    if dt is None:
        return None
    return f"{dt.strftime('%A')} {dates.uk_date(dt, with_year=False)}, {dt.strftime('%H:%M')}"


# --- Automated 72-hour notice window -----------------------------------------
#
# The availability window is no longer a set of stored datetimes advanced weekly.
# Instead it recalculates from each week's shifts:
#   close(week) = that week's earliest shift start - (LEGAL_NOTICE_HOURS + buffer)
#   open        = close - open_offset_hours
#   reminder    = close - reminder_offset_hours
# Everything below works in naive Europe/London wall-clock; the scheduler
# attaches the timezone only when it builds a trigger.


def _parse_shift_hour(time_str: str) -> Optional[float]:
    """Parse a shift start_time like '7:00am' / '2:00pm' / 'close' into a 24h
    float hour. Mirrors the solver's parser but tolerates junk (returns None)."""
    if not time_str:
        return None
    t = str(time_str).strip().lower().replace(" ", "")
    if t == "close":
        return 23.0
    if len(t) < 3 or t[-2:] not in ("am", "pm"):
        # Fall back to a plain 24h "HH:MM" if that's what we were given.
        try:
            h_str, _, m_str = t.partition(":")
            return int(h_str) + (int(m_str) if m_str else 0) / 60
        except ValueError:
            return None
    period = t[-2:]
    clock = t[:-2]
    h_str, _, m_str = clock.partition(":")
    try:
        h = int(h_str)
        m = int(m_str) if m_str else 0
    except ValueError:
        return None
    if period == "am":
        if h == 12:
            h = 0
    else:
        if h != 12:
            h += 12
    return h + m / 60


def earliest_shift_minutes(shifts: list[dict]) -> Optional[int]:
    """The venue's earliest shift start, as minutes past midnight. Shifts run on
    any day of the week, so the earliest start in any given week is simply the
    earliest shift start time. Returns None if there are no parseable shifts."""
    best: Optional[int] = None
    for shift in shifts or []:
        hour = _parse_shift_hour(shift.get("start_time"))
        if hour is None:
            continue
        minutes = round(hour * 60)
        if best is None or minutes < best:
            best = minutes
    return best


def monday_of(d: date) -> date:
    """The Monday of the week containing `d`."""
    return d - timedelta(days=d.weekday())


def week_earliest_start(week_monday: date, earliest_minutes: int) -> datetime:
    """The earliest calendar moment a shift begins in the given week — Monday
    (day 0) at the venue's earliest shift start time."""
    return datetime.combine(week_monday, time(0, 0)) + timedelta(minutes=earliest_minutes)


def formula_close(week_monday: date, earliest_minutes: int, buffer_hours: int) -> datetime:
    """Formula close time for a week: earliest shift start minus the legal notice
    period and the safety buffer."""
    start = week_earliest_start(week_monday, earliest_minutes)
    return start - timedelta(hours=LEGAL_NOTICE_HOURS + buffer_hours)


def notice_hours(close_dt: datetime, week_monday: date, earliest_minutes: int) -> float:
    """Hours of notice a given close time leaves before the week's earliest
    shift. Used to guard manual overrides against the legal minimum."""
    start = week_earliest_start(week_monday, earliest_minutes)
    return (start - close_dt).total_seconds() / 3600.0


# How late the automatic cycle will still close a week on its own. A service that
# slept through a deadline catches up when it wakes, but only for so long: after
# this the week is left for a person, because a rota solved and emailed days
# late gives staff far less notice than the window exists to guarantee.
# scripts/close_stale_periods.py is how a backlog of such weeks is tidied up.
CATCH_UP_GRACE = timedelta(hours=48)


def past_catch_up(window: dict, now: datetime) -> bool:
    """Whether it is too late for the cycle to close this week itself: the grace
    after its deadline has run out, or its first shift has already begun - which
    a manager's override closing within 72 hours of that shift reaches well
    inside the grace. One definition, shared by the cycle (cron.classify_close)
    and the backlog script, so the two can never disagree about a week."""
    return now >= window["closes_at"] + CATCH_UP_GRACE or now >= window["earliest_shift_at"]


def week_window(
    week_monday: date,
    *,
    earliest_minutes: Optional[int],
    buffer_hours: int,
    open_offset_hours: int,
    reminder_offset_hours: int,
    override_close_by_week: Optional[dict[date, datetime]] = None,
) -> Optional[dict]:
    """One named week's window, wherever `now` happens to be.

    compute_window answers "which week are we collecting for?", and at the
    exact moment a week closes that answer is already the NEXT week — which is
    how the automatic close spent its whole life closing a week that did not
    exist yet (A13). Anything that acts on a week it already knows about must
    ask about that week by name, through here."""
    if earliest_minutes is None:
        return None
    overrides = override_close_by_week or {}
    close = overrides.get(week_monday) or formula_close(week_monday, earliest_minutes, buffer_hours)
    return {
        "week_monday": week_monday,
        "opens_at": close - timedelta(hours=open_offset_hours),
        "reminder_at": close - timedelta(hours=reminder_offset_hours),
        "closes_at": close,
        "earliest_shift_at": week_earliest_start(week_monday, earliest_minutes),
        "is_override": week_monday in overrides,
    }


def compute_window(
    *,
    now: datetime,
    earliest_minutes: Optional[int],
    buffer_hours: int,
    open_offset_hours: int,
    reminder_offset_hours: int,
    override_close_by_week: Optional[dict[date, datetime]] = None,
) -> Optional[dict]:
    """The active collection window: the soonest upcoming week whose close time
    hasn't passed yet. Returns naive datetimes plus the week's Monday, or None if
    the venue has no shifts to derive a time from."""
    if earliest_minutes is None:
        return None
    start_monday = monday_of(now.date())
    for i in range(0, 8):
        window = week_window(
            start_monday + timedelta(weeks=i),
            earliest_minutes=earliest_minutes,
            buffer_hours=buffer_hours,
            open_offset_hours=open_offset_hours,
            reminder_offset_hours=reminder_offset_hours,
            override_close_by_week=override_close_by_week,
        )
        if window["closes_at"] > now:
            return window
    return None


def upcoming_weeks(
    *,
    now: datetime,
    earliest_minutes: Optional[int],
    buffer_hours: int,
    open_offset_hours: int,
    reminder_offset_hours: int,
    override_close_by_week: Optional[dict[date, datetime]] = None,
    count: int = 6,
) -> list[dict]:
    """The next `count` rota weeks with their computed window, for the Scheduler
    preview + week-override dropdown. Starts from the active collection week."""
    if earliest_minutes is None:
        return []
    overrides = override_close_by_week or {}
    active = compute_window(
        now=now,
        earliest_minutes=earliest_minutes,
        buffer_hours=buffer_hours,
        open_offset_hours=open_offset_hours,
        reminder_offset_hours=reminder_offset_hours,
        override_close_by_week=overrides,
    )
    first_monday = active["week_monday"] if active else monday_of(now.date()) + timedelta(weeks=1)
    weeks = []
    for i in range(count):
        wk = first_monday + timedelta(weeks=i)
        window = week_window(
            wk,
            earliest_minutes=earliest_minutes,
            buffer_hours=buffer_hours,
            open_offset_hours=open_offset_hours,
            reminder_offset_hours=reminder_offset_hours,
            override_close_by_week=overrides,
        )
        window["notice_hours"] = notice_hours(window["closes_at"], wk, earliest_minutes)
        weeks.append(window)
    return weeks
