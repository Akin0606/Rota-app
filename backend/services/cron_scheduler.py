"""Wires the /api/cron/* job functions to run automatically at each venue's
computed notice window (see services.notice_window / services.schedule_windows).

For every venue we work out the active collection week and its open / reminder /
close datetimes from that week's earliest shift, then schedule a one-shot
DateTrigger for each point still in the future. When a venue's availability
closes, the close handler calls refresh_jobs() again, which recomputes the next
week's window — so the cadence repeats automatically with nothing stored per
week. Jobs are rebuilt from the database at startup and after any relevant change.
"""

import logging
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger

from database import get_supabase
from services import notice_window, schedule_windows

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


def refresh_jobs() -> None:
    """Clears and rebuilds every venue's scheduled jobs from its current shifts,
    rules and week overrides. Call this at startup and after any change that
    could move the window (rules, shifts, overrides, availability close)."""
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
    from routers.rota import confirm_published_periods_for_venue

    for job in _scheduler.get_jobs():
        job.remove()

    supabase = get_supabase()
    venues = supabase.table("venues").select("*").execute().data
    rules_rows = supabase.table("scheduling_rules").select("*").execute().data
    shift_rows = supabase.table("shifts").select("venue_id, start_time").execute().data
    override_rows = (
        supabase.table("schedule_week_overrides").select("venue_id, week_start, close_at").execute().data
    )

    rules_by_venue = {r["venue_id"]: r for r in rules_rows}
    shifts_by_venue: dict[str, list[dict]] = {}
    for row in shift_rows:
        shifts_by_venue.setdefault(row["venue_id"], []).append(row)
    overrides_by_venue: dict[str, list[dict]] = {}
    for row in override_rows:
        overrides_by_venue.setdefault(row["venue_id"], []).append(row)

    now = schedule_windows.now_london()
    scheduled = 0

    for venue in venues:
        # Opportunistic sweep: promote any provisional (published) period whose
        # window has closed since we last checked. Runs here rather than as its
        # own precise timer so it self-heals on every startup/settings change,
        # not just at the one active window's close moment.
        _run_safely(confirm_published_periods_for_venue, venue)

        rules = rules_by_venue.get(venue["id"], {})
        shifts = shifts_by_venue.get(venue["id"], [])
        overrides = notice_window.overrides_map(overrides_by_venue.get(venue["id"], []))
        off = notice_window.offsets_from_rules(rules)

        window = schedule_windows.compute_window(
            now=now,
            earliest_minutes=schedule_windows.earliest_shift_minutes(shifts),
            override_close_by_week=overrides,
            **off,
        )

        if window:
            # If we're already inside the window (e.g. the server started after
            # the open point passed), make sure the collecting period exists.
            if window["opens_at"] <= now < window["closes_at"]:
                _run_safely(open_availability_for_venue, venue)

            window_jobs = (
                ("open", window["opens_at"], open_availability_for_venue),
                ("remind", window["reminder_at"], send_reminders_for_venue),
                ("close", window["closes_at"], close_availability_for_venue),
            )
            for prefix, run_at_naive, fn in window_jobs:
                if run_at_naive <= now:
                    continue
                run_at = run_at_naive.replace(tzinfo=schedule_windows.LONDON)
                _scheduler.add_job(
                    _run_safely,
                    args=[fn, venue],
                    trigger=DateTrigger(run_date=run_at),
                    id=f"{prefix}_{venue['id']}",
                    replace_existing=True,
                )
                scheduled += 1

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

    logger.info("Scheduled window jobs refreshed for %d venue(s), %d timed jobs", len(venues), scheduled)


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
