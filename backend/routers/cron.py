"""The weekly availability cycle: open a week, remind the stragglers, close it
at its deadline (solve it, tell staff it has locked, tell the manager what came
out) and open the next one.

HOW IT RUNS. Three triggers, one function:

* timers - cron_scheduler arms a one-shot job at the active week's open,
  reminder and close moments. Punctual, but in memory: they die with the
  process, and Render's free plan sleeps the process after idle minutes.
* the hourly tick - POST /api/cron/tick, called by a scheduled GitHub Action.
  It is what wakes a sleeping service, and the backstop for every timer that
  died with the process it lived in.
* the boot catch-up - queued the moment the process starts, so a service that
  slept through a deadline acts on it as soon as it wakes.

All three run run_due_for_venue, which asks "what is due for this venue right
now?" and does only that. Every trigger can race every other one - on the free
plan the tick IS the request that wakes the service, so the tick and the boot
catch-up start together - so every step with a side effect is claimed with a
guarded update first, and only the runner that gets the row back goes on:

    close     update ... set status = 'closed'    where status = 'collecting'
    reminder  update ... set auto_reminder_sent_at where it is null
    confirm   update ... set status = 'confirmed' where status = 'published'
    open      the insert itself: unique (venue_id, week_start) makes the
              loser's insert fail, and that failure is swallowed.

WHY IT NEVER RAN BEFORE (A13). The close used to ask the notice window which
week it was collecting for. At the exact moment week W closes that answer is
already W+1, so the close looked up a week that did not exist yet, did nothing,
and never re-armed the jobs. Everything here acts on a week it names, placed
with schedule_windows.week_window.

THE KILL SWITCH. WEEKLY_CYCLE_ENABLED (config.py) gates what the cycle does on
its own initiative that a manager did not ask for: the close - and with it the
solve, the "availability closed" emails and the review email - and the
automatic reminder. It is off by default, so a deploy can never start closing
weeks on a database whose backlog nobody has looked at. Opening a week and the
provisional -> confirmed sweep are not behind it; they run as they always have.
"""

import hmac
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import JSONResponse
from postgrest.exceptions import APIError

from config import get_settings
from database import get_supabase
from routers.availability import _most_recent_submission_pattern
from routers.rota import confirm_published_periods_for_venue, run_solver_for_period
from routers.staff import _reminder_context
from services import cron_scheduler, dates, email_service, notice_window, schedule_windows
from services.entitlement import venue_is_entitled

logger = logging.getLogger("cron")

router = APIRouter(prefix="/api/cron", tags=["cron"])

# What the tick reports: counts only. The response lands in a CI log, and a
# count is all anyone reading it needs.
COUNT_KEYS = ("opened", "reminded", "closed", "confirmed", "stale", "errors")

# The unique-violation code PostgREST passes through from Postgres.
UNIQUE_VIOLATION = "23505"


def require_cron(x_cron_secret: str = Header(default="")) -> None:
    settings = get_settings()
    # Constant-time compare so a wrong secret can't be recovered by timing the
    # response. hmac.compare_digest short-circuits only on differing length.
    if not settings.cron_secret or not hmac.compare_digest(
        x_cron_secret, settings.cron_secret
    ):
        raise HTTPException(status_code=401, detail="Invalid cron secret")


def cycle_enabled() -> bool:
    return bool(get_settings().weekly_cycle_enabled)


def _all_venues() -> list[dict]:
    return get_supabase().table("venues").select("*").execute().data


def _active_staff(venue_id: str) -> list[dict]:
    return (
        get_supabase()
        .table("staff_members")
        .select("id, name, email, pin")
        .eq("venue_id", venue_id)
        .eq("is_active", True)
        .execute()
        .data
    )


def _roster(venue_id: str) -> list[dict]:
    """The team a manager sees and schedules: active and approved. A pending
    self-registrant is left out, as it is from the manual Remind and every
    assignable-roster query, so a count here never disagrees with the names
    the manager is looking at."""
    return (
        get_supabase()
        .table("staff_members")
        .select("id, name, email, pin")
        .eq("venue_id", venue_id)
        .eq("is_active", True)
        .eq("pending", False)
        .execute()
        .data
    )


def _submitted_ids(period_id: str) -> set[str]:
    rows = (
        get_supabase()
        .table("availability_submissions")
        .select("staff_id")
        .eq("period_id", period_id)
        .execute()
        .data
    )
    return {r["staff_id"] for r in rows}


def _log(venue_id: str, action: str, detail: str) -> None:
    get_supabase().table("activity_log").insert(
        {"venue_id": venue_id, "action": action, "detail": detail}
    ).execute()


def _attempt(failed: list[str], label: str, fn, *args, **kwargs):
    """Run one step; if it raises, log it, note it and carry on.

    The steps of a close are independent of one another: a solver crash must not
    stop staff hearing that the week has locked, and nothing may stop the next
    week opening, since that is what every later week depends on."""
    try:
        return fn(*args, **kwargs)
    except Exception:
        logger.exception("Weekly cycle step failed: %s", label)
        failed.append(label)
        return None


def _utc_iso(now: datetime) -> str:
    """A naive London wall-clock moment as the UTC string a timestamptz takes."""
    return now.replace(tzinfo=schedule_windows.LONDON).astimezone(timezone.utc).isoformat()


def _as_london(value) -> Optional[datetime]:
    """A timestamptz read back from PostgREST, as the naive London wall-clock
    every window here is computed in."""
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        return dt
    return dt.astimezone(schedule_windows.LONDON).replace(tzinfo=None)


def setup_is_complete(venue: dict) -> bool:
    """False while the onboarding wizard is still running on this venue.

    `venues.setup_state` holds the wizard blob and is cleared to null (or
    `{"completed": true}`) by the final step, so it is the one honest signal for
    "the manager has finished setting this place up". A legacy venue that
    predates save-and-resume has null too, which is correct: it is finished.

    An empty dict is deliberately read as *unfinished*: it means a blob is
    present, and nothing in the wizard ever writes one without a step. Checked
    against the real data before choosing — every venue on prod is a plain
    null — so this cannot strand an existing venue in a state where its
    availability never opens.
    """
    state = venue.get("setup_state")
    if state is None:
        return True
    return bool(isinstance(state, dict) and state.get("completed"))


def _cycle_may_act(venue: dict) -> bool:
    """Whether the cycle may close this venue's weeks and chase its staff on
    its own: the kill switch is on, the venue is finished being set up, it is
    entitled to the paid product, and the admin console has not switched it off
    (a disabled venue locks its manager and staff out of the app, so emailing
    them a rota they cannot open helps nobody)."""
    return (
        cycle_enabled()
        and bool(venue.get("is_active", True))
        and setup_is_complete(venue)
        and venue_is_entitled(venue)
    )


def _window_for(period: dict, schedule: Optional[dict]) -> Optional[dict]:
    if not schedule:
        return None
    return schedule_windows.week_window(date.fromisoformat(str(period["week_start"])), **schedule)


def classify_close(period: dict, window: Optional[dict], now: datetime) -> str:
    """Where one collecting week stands against its own deadline.

    "open"      the deadline has not come yet.
    "due"       the deadline has passed, recently enough that closing it now is
                still the week the manager and staff expect: the cycle closes it.
    "stale"     it is too late for the cycle (schedule_windows.past_catch_up):
                the deadline passed more than CATCH_UP_GRACE (48h) ago, or the week's
                first shift has already begun. A rota solved and emailed now
                would give staff days less notice than they were promised, or
                land on people already at work, so the week is left for a
                person - scripts/close_stale_periods.py for a backlog.
    "reopened"  it only started collecting after its deadline: a manager reopened
                it, or created a week whose deadline had already gone. Either
                way it is theirs to close; closing it behind their back would
                undo what they just asked for.
    "unknown"   there is no window (the venue has no shifts) or no record of
                when the week started collecting. A week the cycle cannot place
                is a week it leaves alone.
    """
    if window is None:
        return "unknown"
    if now < window["closes_at"]:
        return "open"
    since = _as_london(period.get("collecting_since"))
    if since is None:
        return "unknown"
    if since >= window["closes_at"]:
        return "reopened"
    if schedule_windows.past_catch_up(window, now):
        return "stale"
    return "due"


def _collecting_periods(venue_id: str) -> list[dict]:
    return (
        get_supabase()
        .table("availability_periods")
        .select("*")
        .eq("venue_id", venue_id)
        .eq("status", "collecting")
        .order("week_start")
        .execute()
        .data
    )


# Open availability -----------------------------------------------------------

def _target_open_week(venue_id: str, now: Optional[datetime] = None) -> date:
    """The Monday of the week availability should currently be collecting for —
    the active notice window's week, falling back to next Monday for a venue with
    no shifts to derive a window from."""
    now = now or schedule_windows.now_london()
    window = notice_window.compute_for_venue(venue_id, now)
    if window:
        return window["week_monday"]
    return schedule_windows.monday_of(now.date()) + timedelta(days=7)


def open_availability_for_venue(
    venue: dict, *, week_monday: Optional[date] = None, now: Optional[datetime] = None
) -> Optional[dict]:
    """Creates the current notice window's availability period for a venue, if it
    doesn't already exist, runs auto-submit for it and tells staff it is open.
    Safe to call repeatedly, and safe to call from two runners at once: a
    concurrent runner's insert fails on unique (venue_id, week_start), and only
    the runner whose insert landed sends anything.

    E9 — a half-set-up venue is skipped entirely. Almost every write the wizard
    makes (create shift, set hours, set coverage, set rules) ends in
    `cron_scheduler.refresh_jobs()`, which queues the catch-up that calls
    straight back into here when the clock is already inside a notice window.
    The wizard creates shifts before it creates staff, so this was silent —
    until a resumed wizard, or a window that opens partway through setup, put
    staff-with-emails on the other side of it. Then a manager still choosing
    their coverage levels has already emailed the whole team asking for
    availability against hours they are one screen away from changing. The
    guard lives here, next to the send, rather than on any one caller.
    """
    if not setup_is_complete(venue):
        return None

    # Billing gate: a venue that isn't entitled (cancelled/expired and not
    # comped) stops getting the paid machinery — no new availability weeks open
    # and no staff email goes out. Checked next to the send, mirroring the
    # setup_is_complete guard above, because every caller reaches here.
    if not venue_is_entitled(venue):
        return None

    supabase = get_supabase()
    target_monday = week_monday or _target_open_week(venue["id"], now)

    existing = (
        supabase.table("availability_periods")
        .select("id")
        .eq("venue_id", venue["id"])
        .eq("week_start", target_monday.isoformat())
        .limit(1)
        .execute()
    )
    if existing.data:
        return None

    try:
        period = (
            supabase.table("availability_periods")
            .insert({"venue_id": venue["id"], "week_start": target_monday.isoformat(), "status": "collecting"})
            .execute()
            .data[0]
        )
    except APIError as exc:
        # Another runner created this week between our read and our insert. It
        # is sending the emails; we must not send them twice.
        if exc.code == UNIQUE_VIOLATION:
            return None
        raise

    _log(venue["id"], "availability_opened", f"Availability opened for week of {target_monday.isoformat()}")

    _auto_submit_for_new_period(venue, period)
    _send_open_emails(venue, target_monday)

    return period


def _auto_submit_for_new_period(venue: dict, period: dict) -> None:
    """Copies forward the most recent prior submission for every active staff
    member who has opted into auto-submit, the moment their new week opens —
    so it's already done before they'd ever think to log in. They can still
    open the app and change it any time before the window closes."""
    supabase = get_supabase()
    week_monday = date.fromisoformat(str(period["week_start"]))

    opted_in = (
        supabase.table("staff_members")
        .select("id, name, email, pin")
        .eq("venue_id", venue["id"])
        .eq("is_active", True)
        .eq("pending", False)
        .eq("auto_submit_availability", True)
        .execute()
        .data
    )
    week_label = f"w/c {dates.uk_date(week_monday)}"
    # A5 — "change it before the deadline" has to open the week we submitted for.
    venue_link_url = email_service.availability_url(
        get_settings().frontend_url, venue["link_token"], week_monday
    )
    for member in opted_in:
        rows = _most_recent_submission_pattern(venue["id"], member["id"], week_monday)
        if not rows:
            continue

        insert_rows = [
            {
                "period_id": period["id"],
                "staff_id": member["id"],
                "day_index": r["day_index"],
                "shift_id": r["shift_id"],
                "status": r["status"],
                "note": r["note"],
                # Marks the row as machine-copied so the app can show a heads-up
                # banner (§6b) until the staffer next edits + re-submits.
                "auto_submitted": True,
            }
            for r in rows
        ]
        supabase.table("availability_submissions").insert(insert_rows).execute()

        supabase.table("activity_log").insert(
            {
                "venue_id": venue["id"],
                "staff_id": member["id"],
                "action": "availability_auto_submitted",
                "detail": f"{member['name']}'s availability was auto-submitted for week of {period['week_start']} (no changes)",
            }
        ).execute()

        # Never silent: email a heads-up now so they can change it before close.
        # (Push notification is future work — see CLAUDE.md. Auto-submit is
        # opt-in, so this email is the courtesy backstop, not a hard guard.)
        email_service.send_auto_submit_email(
            to_email=member.get("email"),
            name=member["name"],
            venue_name=venue["name"],
            week_label=week_label,
            venue_link_url=venue_link_url,
            pin=member.get("pin"),
        )


def _send_open_emails(venue: dict, week_monday: date) -> None:
    """Tells every active staff member availability has opened for the week."""
    settings = get_settings()
    week_label = f"w/c {dates.uk_date(week_monday)}"
    deadline_label = (
        schedule_windows.format_deadline_dt(notice_window.close_for_week(venue["id"], week_monday))
        or "soon"
    )
    # A5 — the week travels with the link, same as the chase email.
    venue_link_url = email_service.availability_url(
        settings.frontend_url, venue["link_token"], week_monday
    )

    for member in _active_staff(venue["id"]):
        if not member.get("email"):
            continue
        email_service.send_availability_open_email(
            to_email=member["email"],
            name=member["name"],
            venue_name=venue["name"],
            week_label=week_label,
            venue_link_url=venue_link_url,
            deadline_label=deadline_label,
            pin=member["pin"],
        )


# Close availability + auto-generate ------------------------------------------

def close_week(venue: dict, period: dict, window: Optional[dict], *, now: datetime) -> dict:
    """Closes one named week at its deadline: claims it, solves it, tells staff
    it has locked, tells the manager what came out, and opens the next week.

    Checks everything again itself rather than trusting its caller, because this
    is the one function here that rewrites a rota and emails a whole team: the
    kill switch and the venue (_cycle_may_act) and the week's own window
    (classify_close) must all say yes, and then the guarded update must hand
    this runner the row. A runner that loses the update does nothing at all;
    the winner is already doing it.

    Returns what happened, never raises for a failed step: {"closed", "opened",
    "failed"}, where "failed" names the steps that raised.
    """
    result = {"closed": False, "opened": False, "failed": []}
    if not _cycle_may_act(venue) or classify_close(period, window, now) != "due":
        return result

    supabase = get_supabase()
    won = (
        supabase.table("availability_periods")
        .update({"status": "closed"})
        .eq("id", period["id"])
        .eq("venue_id", venue["id"])
        .eq("status", "collecting")
        .execute()
        .data
    )
    if not won:
        return result
    result["closed"] = True

    failed = result["failed"]
    week = str(period["week_start"])
    tag = f"venue {venue['id']} w/c {week}"
    closed_period = {**period, "status": "closed"}

    _attempt(failed, f"close log, {tag}", _log, venue["id"], "availability_closed", f"Availability closed for week of {week}")
    summary = _attempt(
        failed,
        f"solve, {tag}",
        run_solver_for_period,
        venue,
        closed_period,
        note=" (auto-generated after availability closed)",
    )
    _attempt(failed, f"closed emails, {tag}", _send_closed_emails, venue, week)
    _attempt(failed, f"review email, {tag}", send_review_email, venue, closed_period, summary=summary)
    # Continuity: the moment a week closes, the next one opens, so staff always
    # have a week to fill. At the deadline the notice window already points at
    # the next week, which is exactly the week to open.
    result["opened"] = bool(_attempt(failed, f"open next, {tag}", open_availability_for_venue, venue, now=now))
    return result


def _send_closed_emails(venue: dict, week_start) -> None:
    """Tells every active staff member the week's availability has locked."""
    settings = get_settings()
    week_label = f"w/c {dates.uk_date(date.fromisoformat(str(week_start)))}"
    rota_link_url = f"{settings.frontend_url}/v/{venue['link_token']}/rota"
    for member in _active_staff(venue["id"]):
        if not member.get("email"):
            continue
        email_service.send_availability_closed_email(
            to_email=member["email"],
            name=member["name"],
            venue_name=venue["name"],
            week_label=week_label,
            rota_link_url=rota_link_url,
        )


# Manager review email ---------------------------------------------------------

def send_review_email(venue: dict, period: dict, *, summary: Optional[dict] = None) -> Optional[dict]:
    """Tells the manager the week they were collecting for has closed, and what
    the solve made of it: "ready to review" when it built a rota, "no rota yet"
    when it could not (nobody available, or the solve failed).

    Sent once, from inside the close, about the week that just closed. It used
    to run on its own weekly timer and report on whichever week the notice
    window pointed at by then — always the NEXT week, which nobody had been
    asked about yet."""
    if not venue.get("manager_email") or not _cycle_may_act(venue):
        return None

    roster_ids = {m["id"] for m in _roster(venue["id"])}
    submitted = len(_submitted_ids(period["id"]) & roster_ids)
    total = len(roster_ids)
    has_rota = bool(summary) and summary.get("status") == "generated"
    week_start = date.fromisoformat(str(period["week_start"]))

    email = email_service.send_manager_review_email(
        to_email=venue["manager_email"],
        manager_name="there",
        venue_name=venue["name"],
        week_label=f"w/c {dates.uk_date(week_start)}",
        submitted_count=submitted,
        total_count=total,
        review_link_url=f"{get_settings().frontend_url}/rota",
        conflicts=summary.get("conflicts", 0) if has_rota else 0,
        has_rota=has_rota,
    )

    # Logged with what actually happened, like the manual Remind: an audit row
    # that says "sent" about an email that was blocked or failed is how a
    # manager ends up waiting for something that is never coming.
    if email.get("status") == "sent":
        _log(
            venue["id"],
            "review_email_sent",
            f"Review email sent to manager for week of {week_start.isoformat()} ({submitted}/{total} submitted)",
        )
    else:
        _log(
            venue["id"],
            "review_email_failed",
            f"Couldn't email the manager the review for week of {week_start.isoformat()} — the email didn't send",
        )
    return {"period_id": period["id"], "submitted_count": submitted, "total_count": total, "email": email}


# Reminders ---------------------------------------------------------------------

def send_due_reminder(venue: dict, period: dict, window: Optional[dict], *, now: datetime) -> Optional[dict]:
    """The automatic "you haven't sent your availability yet" chase, once per
    week, between the reminder moment and the deadline.

    Two things keep it to once: `auto_reminder_sent_at` is claimed with a
    guarded update before a single email goes out, and only the runner whose
    update comes back with the row sends. A manager's manual Remind does not
    set it, so a mid-week chase doesn't cancel this one.

    A week that only started collecting after its reminder moment gets no
    automatic reminder at all: that is a week opened late (a service asleep
    through its open time) or reopened by a manager, and in both cases staff
    have just been asked, so "you haven't replied" would arrive minutes after
    the question.
    """
    if not _cycle_may_act(venue) or window is None:
        return None
    if not (window["reminder_at"] <= now < window["closes_at"]):
        return None
    since = _as_london(period.get("collecting_since"))
    if since is None or since >= window["reminder_at"]:
        return None
    if period.get("auto_reminder_sent_at"):
        return None

    claimed = (
        get_supabase()
        .table("availability_periods")
        .update({"auto_reminder_sent_at": _utc_iso(now)})
        .eq("id", period["id"])
        .eq("venue_id", venue["id"])
        .eq("status", "collecting")
        .is_("auto_reminder_sent_at", "null")
        .execute()
        .data
    )
    if not claimed:
        return None
    return _send_reminders(venue, period)


def _send_reminders(venue: dict, period: dict) -> dict:
    submitted = _submitted_ids(period["id"])
    targets = [m for m in _roster(venue["id"]) if m["id"] not in submitted]
    if not targets:
        return {"reminded": 0, "email_sent": 0}

    week_label, deadline_label, week_start = _reminder_context(venue, period["id"])
    venue_link_url = email_service.availability_url(
        get_settings().frontend_url, venue["link_token"], week_start
    )

    sent_count = 0
    for member in targets:
        if not member.get("email"):
            continue
        result = email_service.send_availability_reminder_email(
            to_email=member["email"],
            name=member["name"],
            venue_name=venue["name"],
            week_label=week_label,
            venue_link_url=venue_link_url,
            deadline_label=deadline_label,
            pin=member["pin"],
        )
        if result.get("status") == "sent":
            sent_count += 1

    # The number that actually went out, as the manual Remind logs it.
    _log(
        venue["id"],
        "reminder_sent",
        f"Reminded {sent_count} of {len(targets)} staff who haven't submitted (automatic)",
    )
    return {"reminded": len(targets), "email_sent": sent_count}


# The cycle ---------------------------------------------------------------------

def run_due_for_venue(venue: dict, *, now: Optional[datetime] = None) -> dict:
    """Everything that is due for one venue right now, in order:

    1. the provisional -> confirmed sweep;
    2. close every collecting week whose deadline has just passed;
    3. open the active week if its open moment has come (as it always has);
    4. the automatic reminder, if it is due and has not gone yet.

    Idempotent: a second run at the same moment finds nothing due and writes
    nothing. Returns counts only."""
    now = now or schedule_windows.now_london()
    counts = {k: 0 for k in COUNT_KEYS}
    failed: list[str] = []
    tag = f"venue {venue['id']}"

    confirmed = _attempt(failed, f"confirm sweep, {tag}", confirm_published_periods_for_venue, venue, now=now)
    counts["confirmed"] = len(confirmed or [])

    schedule = _attempt(failed, f"schedule, {tag}", notice_window.schedule_for_venue, venue["id"])
    acting = bool(schedule) and _cycle_may_act(venue)

    collecting: list[dict] = []
    if acting:
        collecting = _attempt(failed, f"collecting weeks, {tag}", _collecting_periods, venue["id"]) or []
        for period in collecting:
            window = _window_for(period, schedule)
            verdict = classify_close(period, window, now)
            if verdict == "stale":
                counts["stale"] += 1
            if verdict != "due":
                continue
            closed = _attempt(failed, f"close, {tag}", close_week, venue, period, window, now=now)
            if closed:
                counts["closed"] += int(closed["closed"])
                counts["opened"] += int(closed["opened"])
                failed.extend(closed["failed"])

    if schedule:
        active = schedule_windows.compute_window(now=now, **schedule)
        if active and active["opens_at"] <= now:
            opened = _attempt(
                failed, f"open, {tag}", open_availability_for_venue, venue,
                week_monday=active["week_monday"], now=now,
            )
            counts["opened"] += int(bool(opened))

    if acting:
        for period in collecting:
            window = _window_for(period, schedule)
            if classify_close(period, window, now) != "open":
                continue
            if _attempt(failed, f"reminder, {tag}", send_due_reminder, venue, period, window, now=now):
                counts["reminded"] += 1

    counts["errors"] = len(failed)
    return counts


def run_due_for_venue_id(venue_id: str, *, now: Optional[datetime] = None) -> Optional[dict]:
    """run_due_for_venue on a fresh read of the venue. A timer armed hours ago
    must not act on the venue as it was then — its billing, its setup state or
    its manager's email may all have changed since. None if it has been
    deleted."""
    rows = get_supabase().table("venues").select("*").eq("id", venue_id).limit(1).execute().data
    if not rows:
        return None
    return run_due_for_venue(rows[0], now=now)


def run_due_all(*, now: Optional[datetime] = None) -> dict:
    """run_due_for_venue for every venue, each isolated from the others, then
    re-arm the timers. One venue's failure is counted, logged and stepped over;
    it never stops the rest. Returns summed counts plus how many venues were
    seen and whether the kill switch is on."""
    now = now or schedule_windows.now_london()
    totals = {k: 0 for k in COUNT_KEYS}
    venues = _all_venues()
    for venue in venues:
        try:
            counts = run_due_for_venue(venue, now=now)
        except Exception:
            logger.exception("Weekly cycle failed for venue %s", venue.get("id"))
            totals["errors"] += 1
            continue
        for key in COUNT_KEYS:
            totals[key] += counts.get(key, 0)

    try:
        cron_scheduler.refresh_jobs(arm_only=True)
    except Exception:
        logger.exception("Re-arming the weekly cycle's timers failed")
        totals["errors"] += 1

    return {**totals, "venues": len(venues), "enabled": cycle_enabled()}


# Endpoint -----------------------------------------------------------------------

@router.post("/tick", dependencies=[Depends(require_cron)])
def tick():
    """The hourly heartbeat (.github/workflows/cron-tick.yml). Runs whatever is
    due for every venue and re-arms the timers.

    Answers with counts only — no venue names, ids or emails — because the
    caller is a CI job whose logs are public. 500 when anything failed, so the
    workflow run goes red, but only after every other venue has had its turn."""
    try:
        result = run_due_all()
    except Exception:
        logger.exception("Cron tick failed before it could run any venue")
        return JSONResponse(status_code=500, content={"errors": 1, "enabled": cycle_enabled()})
    return JSONResponse(status_code=500 if result["errors"] else 200, content=result)
