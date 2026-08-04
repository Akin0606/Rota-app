"""Wires the /api/cron/* job functions to run automatically at the day/time
each venue configured in its scheduling_rules, using an in-process APScheduler
instance. Jobs are rebuilt from the database whenever a venue is created or
its rules change, so schedule edits take effect without a restart."""

import logging
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from database import get_supabase

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
_DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

# Fixed local time-of-day for jobs that scheduling_rules doesn't give an
# explicit time for.
OPEN_HOUR = 6
REMINDER_HOUR = 10

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


def refresh_jobs() -> None:
    """Clears and rebuilds every venue's 4 scheduled jobs from its current
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

    for venue in venues:
        rules = rules_by_venue.get(venue["id"])
        if not rules:
            continue

        opens_day = _DAY_TO_APS.get(rules["avail_opens_day"], "sat")
        _scheduler.add_job(
            _run_safely,
            args=[open_availability_for_venue, venue],
            trigger=CronTrigger(day_of_week=opens_day, hour=OPEN_HOUR, minute=0),
            id=f"open_{venue['id']}",
            replace_existing=True,
        )

        closes_day = _DAY_TO_APS.get(rules["avail_closes_day"], "wed")
        closes_hour, closes_minute = _parse_time(rules["avail_closes_time"])
        _scheduler.add_job(
            _run_safely,
            args=[close_availability_for_venue, venue],
            trigger=CronTrigger(day_of_week=closes_day, hour=closes_hour, minute=closes_minute),
            id=f"close_{venue['id']}",
            replace_existing=True,
        )

        review_day = _DAY_TO_APS.get(rules["review_email_day"], "sat")
        review_hour, review_minute = _parse_time(rules["review_email_time"])
        _scheduler.add_job(
            _run_safely,
            args=[send_review_email_for_venue, venue],
            trigger=CronTrigger(day_of_week=review_day, hour=review_hour, minute=review_minute),
            id=f"review_{venue['id']}",
            replace_existing=True,
        )

        closes_day_index = (
            _DAY_ORDER.index(rules["avail_closes_day"]) if rules["avail_closes_day"] in _DAY_ORDER else 2
        )
        reminder_day = _DAY_ORDER[(closes_day_index - 1) % 7]
        _scheduler.add_job(
            _run_safely,
            args=[send_reminders_for_venue, venue],
            trigger=CronTrigger(day_of_week=_DAY_TO_APS[reminder_day], hour=REMINDER_HOUR, minute=0),
            id=f"remind_{venue['id']}",
            replace_existing=True,
        )

    logger.info("Scheduled jobs refreshed for %d venue(s)", len(venues))


def start_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        return
    _scheduler = BackgroundScheduler()
    _scheduler.start()
    refresh_jobs()


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
