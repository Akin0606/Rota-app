"""Arms the weekly cycle's timers. The cycle itself lives in routers/cron.py.

For every venue we place the active collection week (the soonest week whose
deadline is still ahead) and arm a one-shot job at its open, reminder and close
moments, whichever are still in the future. A job carries the venue id, what it
is for and the week it was armed for. When it fires it reads the venue fresh,
runs everything due for it (cron.run_due_for_venue_id) and then re-arms,
whatever happened - so a close that turns out to be a no-op still leaves the
next week's timers in place. The old close re-armed only on its success path,
and it never succeeded (A13), so one missed close stopped the cycle for good.

Timers live in memory and die with the process. That is survivable because
they are not the only trigger: starting the process queues a catch-up, and an
hourly tick (POST /api/cron/tick) runs the same function from outside.

The misfire grace is an hour rather than APScheduler's default of one second:
a timer that fires a little late (a busy worker, a long solve ahead of it)
should still run, not be dropped with a log line nobody reads.
"""

import logging
import threading
from datetime import datetime
from typing import Optional

from apscheduler.jobstores.base import JobLookupError
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.date import DateTrigger

from database import get_supabase
from services import notice_window, schedule_windows

logger = logging.getLogger("cron_scheduler")

JOB_DEFAULTS = {"misfire_grace_time": 3600, "coalesce": True, "max_instances": 1}
TIMER_KINDS = ("open", "remind", "close")
CATCH_UP_JOB_ID = "catch_up"

_scheduler: Optional[BackgroundScheduler] = None

# refresh_jobs runs on request threads (a manager's settings save) and on the
# scheduler's own workers (every timer re-arms when it finishes). Two rebuilds
# interleaving could each undo the other's, so they take turns.
_lock = threading.RLock()

# Set whenever a catch-up is asked for and cleared as one starts. A request
# that lands while a catch-up is already running cannot start a second job
# under the same id, so the running one loops and does another pass instead.
_catch_up_requested = threading.Event()


def new_scheduler() -> BackgroundScheduler:
    return BackgroundScheduler(timezone=schedule_windows.LONDON, job_defaults=JOB_DEFAULTS)


def _is_timer(job_id: str) -> bool:
    return job_id.split("_", 1)[0] in TIMER_KINDS


def _active_windows(now: datetime) -> list[tuple[str, dict]]:
    """[(venue_id, active window)] for every venue that has shifts to place a
    window with, from four reads however many venues there are."""
    supabase = get_supabase()
    venues = supabase.table("venues").select("id").execute().data
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

    out = []
    for venue in venues:
        vid = venue["id"]
        schedule = notice_window.schedule_from(
            rules_by_venue.get(vid, {}),
            shifts_by_venue.get(vid, []),
            notice_window.overrides_map(overrides_by_venue.get(vid, [])),
        )
        window = schedule_windows.compute_window(now=now, **schedule) if schedule else None
        if window:
            out.append((vid, window))
    return out


def refresh_jobs(*, arm_only: bool = False) -> None:
    """Re-arm every venue's timers from its current shifts, rules and week
    overrides. Call it after any change that could move a window.

    Unless arm_only, it also queues a catch-up that runs whatever is due right
    now for every venue. That is how a change that puts a moment in the past - a
    manager's override, a finished onboarding - takes effect straight away
    rather than at the next tick. The catch-up re-arms with arm_only=True when
    it finishes, so this never loops."""
    if _scheduler is None:
        return

    with _lock:
        now = schedule_windows.now_london()
        # Read everything before touching a job, so a failed read leaves the
        # timers already armed where they were.
        wanted: dict[str, tuple[datetime, list]] = {}
        for venue_id, window in _active_windows(now):
            week_iso = window["week_monday"].isoformat()
            for kind, at in (
                ("open", window["opens_at"]),
                ("remind", window["reminder_at"]),
                ("close", window["closes_at"]),
            ):
                if at > now:
                    wanted[f"{kind}_{venue_id}"] = (at, [venue_id, kind, week_iso])

        due_by = now.replace(tzinfo=schedule_windows.LONDON)
        for job in _scheduler.get_jobs():
            if not _is_timer(job.id) or job.id in wanted:
                continue
            # A timer whose moment has come is left to fire. It re-checks
            # everything itself, and removing it in the instant between falling
            # due and running would lose it.
            next_run = getattr(job, "next_run_time", None)
            if next_run is not None and next_run <= due_by:
                continue
            try:
                job.remove()
            except JobLookupError:
                pass  # it fired and removed itself since we listed it

        for job_id, (at, args) in wanted.items():
            _scheduler.add_job(
                _run_timer,
                trigger=DateTrigger(run_date=at.replace(tzinfo=schedule_windows.LONDON)),
                args=args,
                id=job_id,
                replace_existing=True,
            )

    logger.info("Weekly cycle timers armed: %d", len(wanted))
    if not arm_only:
        queue_catch_up()


def _run_timer(venue_id: str, kind: str, week_iso: str) -> None:
    """What every timer runs: everything due for its venue, then re-arm - in a
    finally, so a no-op or a failure re-arms exactly like a success."""
    from routers.cron import run_due_for_venue_id  # routers.cron imports this module

    try:
        run_due_for_venue_id(venue_id)
    except Exception:
        logger.exception("Scheduled %s for venue %s (w/c %s) failed", kind, venue_id, week_iso)
    finally:
        try:
            refresh_jobs(arm_only=True)
        except Exception:
            logger.exception("Re-arming after the scheduled %s for venue %s failed", kind, venue_id)


def queue_catch_up() -> None:
    """Run everything due for every venue, on the scheduler's thread, now."""
    if _scheduler is None:
        return
    _catch_up_requested.set()
    # Two instances at most: one finishing its last pass while the next starts.
    # Everything it does is claimed with a guarded update, so overlap is safe.
    _scheduler.add_job(_catch_up, id=CATCH_UP_JOB_ID, replace_existing=True, max_instances=2)


def _catch_up() -> None:
    from routers.cron import run_due_all  # routers.cron imports this module

    while _catch_up_requested.is_set():
        _catch_up_requested.clear()
        try:
            run_due_all()  # re-arms the timers itself when it finishes
        except Exception:
            logger.exception("Weekly cycle catch-up failed")


def start_scheduler() -> None:
    """Starts the scheduler and queues the boot catch-up. Nothing here reads the
    database: startup must not depend on a connection pool that is often cold
    at boot, and the catch-up runs off the startup path on the scheduler's own
    thread."""
    global _scheduler
    if _scheduler is not None:
        return
    _scheduler = new_scheduler()
    _scheduler.start()
    queue_catch_up()


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
