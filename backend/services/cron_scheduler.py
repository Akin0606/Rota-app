"""Wires the /api/cron/* job functions to run automatically at the real
datetimes each venue configured in its scheduling_rules (avail_opens_at,
avail_reminder_at, avail_closes_at), using an in-process APScheduler instance.

Each window trigger is a one-shot DateTrigger; when a venue's availability
closes, the close handler advances all three datetimes by a week and calls
refresh_jobs(), so the window recurs weekly on concrete, displayable dates.
Jobs are rebuilt from the database at startup and after any rules/venue change.
"""

import logging
import math
from datetime import timedelta
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger

from database import get_supabase
from services import schedule_windows

logger = logging.getLogger("cron_scheduler")

_DAY_TO_APS = {
    "Monday": "mon",
    "Tuesday": "tue",
    "Wednesday": "wed",
    "Thursday": "thu",
    "Friday": "fri",
    "Saturday": "sat",
    "Sunday": "sun",
}

_scheduler: Optional[BackgroundScheduler] = None


def _parse_time(value: str) -> tuple[int, int]:
    try:
        h, m = value.split(":")
        return int(h), int(m)
    except (ValueError, AttributeError):
        return 9, 0


def _run_safely(fn, venue: dict) -> None:
    try:
        fn(venue)
    except Exception:
        logger.exception("Scheduled job %s failed for venue %s", fn.__name__, venue.get("id"))


def _heal_past_window(rules: dict) -> dict:
    """If a venue's close datetime is in the past (e.g. the server was down
    through a whole cycle), roll the whole window forward in lockstep by whole
    weeks until it's in the future, and persist. Keeps opens/reminder/closes in
    sync and stops a missed cycle from freezing the schedule forever."""
    closes = schedule_windows.parse(rules.get("avail_closes_at"))
    if not closes:
        return rules
    now = schedule_windows.now_london()
    if closes > now:
        return rules

    weeks = math.ceil((now - closes).total_seconds() / (7 * 86400)) or 1
    shift = timedelta(days=7 * weeks)
    patch = {}
    for key in ("avail_opens_at", "avail_reminder_at", "avail_closes_at"):
        dt = schedule_windows.parse(rules.get(key))
        if dt:
            new_val = (dt + shift).strftime(schedule_windows.FMT)
            patch[key] = new_val
            rules[key] = new_val
    if patch:
        get_supabase().table("scheduling_rules").update(patch).eq(
            "venue_id", rules["venue_id"]
        ).execute()
    return rules


def refresh_jobs() -> None:
    """Clears and rebuilds every venue's scheduled jobs from its current
    scheduling_rules row. Call this at startup and after any rules/venue
    change."""
    if _scheduler is None:
        return

    # Imported here (not at module load) to avoid a circular import with
    # routers.cron, which itself imports from routers.rota / routers.staff.
    from routers.cron import (
        close_availability_for_venue,
        open_availability_for_venue,
        send_reminders_for_venue,
        send_review_email_for_venue,
    )

    for job in _scheduler.get_jobs():
        job.remove()

    supabase = get_supabase()
    venues = supabase.table("venues").select("*").execute().data
    rules_rows = supabase.table("scheduling_rules").select("*").execute().data
    rules_by_venue = {r["venue_id"]: r for r in rules_rows}

    now = schedule_windows.now_london()

    for venue in venues:
        rules = rules_by_venue.get(venue["id"])
        if not rules:
            continue

        rules = _heal_past_window(rules)

        window_jobs = (
            ("open", "avail_opens_at", open_availability_for_venue),
            ("remind", "avail_reminder_at", send_reminders_for_venue),
            ("close", "avail_closes_at", close_availability_for_venue),
        )
        for prefix, key, fn in window_jobs:
            run_at = schedule_windows.to_london_aware(rules.get(key))
            # Only schedule points still in the future for this cycle; ones that
            # already passed fired earlier (the close handler rolls the window).
            if not run_at or run_at.replace(tzinfo=None) <= now:
                continue
            _scheduler.add_job(
                _run_safely,
                args=[fn, venue],
                trigger=DateTrigger(run_date=run_at),
                id=f"{prefix}_{venue['id']}",
                replace_existing=True,
            )

        # Manager review email stays on its legacy weekly day/time.
        review_day = _DAY_TO_APS.get(rules.get("review_email_day", "Saturday"), "sat")
        review_hour, review_minute = _parse_time(rules.get("review_email_time", "09:00"))
        _scheduler.add_job(
            _run_safely,
            args=[send_review_email_for_venue, venue],
            trigger=CronTrigger(day_of_week=review_day, hour=review_hour, minute=review_minute),
            id=f"review_{venue['id']}",
            replace_existing=True,
        )

    logger.info("Scheduled jobs refreshed for %d venue(s)", len(venues))


def start_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        return
    _scheduler = BackgroundScheduler(timezone=schedule_windows.LONDON)
    _scheduler.start()
    refresh_jobs()


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
