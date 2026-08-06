"""Database-backed wrapper around schedule_windows' notice-window formula.

schedule_windows holds the pure date maths; this module fetches a venue's rules,
shifts and per-week overrides and feeds them in, so callers (the scheduler, the
cron handlers, the staff-facing deadline copy, the Scheduler API) all compute the
same window from one place.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from database import get_supabase
from services import schedule_windows

# Defaults mirror migration 009 so a rules row that predates the columns (or is
# missing entirely) still yields a sensible window.
DEFAULT_BUFFER_HOURS = 6
DEFAULT_OPEN_OFFSET_HOURS = 144  # 6 days
DEFAULT_REMINDER_OFFSET_HOURS = 24


def offsets_from_rules(rules: dict) -> dict:
    return {
        "buffer_hours": int(rules.get("notice_buffer_hours") or DEFAULT_BUFFER_HOURS),
        "open_offset_hours": int(rules.get("open_offset_hours") or DEFAULT_OPEN_OFFSET_HOURS),
        "reminder_offset_hours": int(rules.get("reminder_offset_hours") or DEFAULT_REMINDER_OFFSET_HOURS),
    }


def overrides_map(rows: list[dict]) -> dict[date, datetime]:
    """Turn schedule_week_overrides rows into {Monday date -> naive close dt}."""
    out: dict[date, datetime] = {}
    for row in rows or []:
        try:
            wk = date.fromisoformat(str(row["week_start"]))
        except (ValueError, KeyError, TypeError):
            continue
        dt = schedule_windows.parse(row.get("close_at"))
        if dt:
            out[wk] = dt
    return out


def _venue_inputs(venue_id: str) -> tuple[dict, list[dict], dict[date, datetime]]:
    supabase = get_supabase()
    rules_res = (
        supabase.table("scheduling_rules").select("*").eq("venue_id", venue_id).limit(1).execute()
    )
    rules = rules_res.data[0] if rules_res.data else {}
    shifts = supabase.table("shifts").select("start_time").eq("venue_id", venue_id).execute().data
    override_rows = (
        supabase.table("schedule_week_overrides")
        .select("week_start, close_at")
        .eq("venue_id", venue_id)
        .execute()
        .data
    )
    return rules, shifts, overrides_map(override_rows)


def compute_for_venue(venue_id: str, now: Optional[datetime] = None) -> Optional[dict]:
    """The active collection window for a venue, or None if it has no shifts."""
    now = now or schedule_windows.now_london()
    rules, shifts, overrides = _venue_inputs(venue_id)
    off = offsets_from_rules(rules)
    return schedule_windows.compute_window(
        now=now,
        earliest_minutes=schedule_windows.earliest_shift_minutes(shifts),
        override_close_by_week=overrides,
        **off,
    )


def earliest_minutes_for_venue(venue_id: str) -> Optional[int]:
    """The venue's earliest shift start as minutes past midnight, or None."""
    _, shifts, _ = _venue_inputs(venue_id)
    return schedule_windows.earliest_shift_minutes(shifts)


def close_for_week(venue_id: str, week_monday: date) -> Optional[datetime]:
    """The close datetime for a specific week (override if set, else formula)."""
    rules, shifts, overrides = _venue_inputs(venue_id)
    if week_monday in overrides:
        return overrides[week_monday]
    earliest = schedule_windows.earliest_shift_minutes(shifts)
    if earliest is None:
        return None
    off = offsets_from_rules(rules)
    return schedule_windows.formula_close(week_monday, earliest, off["buffer_hours"])


def upcoming_for_venue(venue_id: str, now: Optional[datetime] = None, count: int = 6) -> dict:
    """Config + preview payload for the Scheduler page."""
    now = now or schedule_windows.now_london()
    rules, shifts, overrides = _venue_inputs(venue_id)
    off = offsets_from_rules(rules)
    earliest = schedule_windows.earliest_shift_minutes(shifts)
    weeks = schedule_windows.upcoming_weeks(
        now=now,
        earliest_minutes=earliest,
        override_close_by_week=overrides,
        count=count,
        **off,
    )
    earliest_label = None
    if earliest is not None:
        h, m = divmod(earliest, 60)
        earliest_label = f"{h:02d}:{m:02d}"
    return {
        "offsets": off,
        "earliest_minutes": earliest,
        "earliest_shift_label": earliest_label,
        "weeks": weeks,
    }
