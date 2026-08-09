from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException

from config import get_settings
from database import get_supabase
from routers.availability import _most_recent_submission_pattern
from routers.rota import _build_summary, run_solver_for_period
from routers.staff import _reminder_context
from services import cron_scheduler, email_service, notice_window, schedule_windows

router = APIRouter(prefix="/api/cron", tags=["cron"])


def require_cron(x_cron_secret: str = Header(default="")) -> None:
    settings = get_settings()
    if not settings.cron_secret or x_cron_secret != settings.cron_secret:
        raise HTTPException(status_code=401, detail="Invalid cron secret")


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


# Open availability -----------------------------------------------------------

def _target_open_week(venue_id: str) -> date:
    """The Monday of the week availability should currently be collecting for —
    the active notice window's week, falling back to next Monday for a venue with
    no shifts to derive a window from."""
    window = notice_window.compute_for_venue(venue_id)
    if window:
        return window["week_monday"]
    today = date.today()
    this_monday = today - timedelta(days=today.weekday())
    return this_monday + timedelta(days=7)


def open_availability_for_venue(venue: dict) -> Optional[dict]:
    """Creates the current notice window's availability period for a venue, if it
    doesn't already exist. Safe to call repeatedly (idempotent) so both the raw
    endpoint and the per-venue scheduler can share this."""
    supabase = get_supabase()
    target_monday = _target_open_week(venue["id"])

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

    period = (
        supabase.table("availability_periods")
        .insert({"venue_id": venue["id"], "week_start": target_monday.isoformat(), "status": "collecting"})
        .execute()
        .data[0]
    )

    supabase.table("activity_log").insert(
        {
            "venue_id": venue["id"],
            "action": "availability_opened",
            "detail": f"Availability opened for week of {target_monday.isoformat()}",
        }
    ).execute()

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
        .select("id, name")
        .eq("venue_id", venue["id"])
        .eq("is_active", True)
        .eq("auto_submit_availability", True)
        .execute()
        .data
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


def _send_open_emails(venue: dict, week_monday: date) -> None:
    """Tells every active staff member availability has opened for the week."""
    settings = get_settings()
    week_label = f"w/c {week_monday.strftime('%d %b %Y')}"
    deadline_label = (
        schedule_windows.format_deadline_dt(notice_window.close_for_week(venue["id"], week_monday))
        or "soon"
    )
    venue_link_url = f"{settings.frontend_url}/v/{venue['link_token']}"

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

def close_availability_for_venue(venue: dict) -> Optional[dict]:
    """Closes the venue's currently-collecting period and runs the solver.
    No-op if there's nothing collecting (already closed, or never opened)."""
    supabase = get_supabase()
    period_res = (
        supabase.table("availability_periods")
        .select("*")
        .eq("venue_id", venue["id"])
        .eq("status", "collecting")
        .order("week_start", desc=True)
        .limit(1)
        .execute()
    )
    if not period_res.data:
        return None
    period = period_res.data[0]

    supabase.table("availability_periods").update({"status": "closed"}).eq("id", period["id"]).execute()
    supabase.table("activity_log").insert(
        {
            "venue_id": venue["id"],
            "action": "availability_closed",
            "detail": f"Availability closed for week of {period['week_start']}",
        }
    ).execute()

    closed_period = {**period, "status": "closed"}
    result = run_solver_for_period(venue, closed_period, note=" (auto-generated after availability closed)")

    _send_closed_emails(venue, period["week_start"])

    # Guarantee continuity: as soon as a week closes, make sure the next week's
    # collecting period exists so staff always have an open week to fill. This
    # computes the new active window (now that this week's close has passed).
    open_availability_for_venue(venue)

    # Rebuild the scheduled jobs so the next week's open/reminder/close fire. The
    # window is derived, not stored, so there's nothing to advance by hand.
    cron_scheduler.refresh_jobs()

    return result


def _send_closed_emails(venue: dict, week_start) -> None:
    """Tells every active staff member the week's availability has locked."""
    settings = get_settings()
    week_label = f"w/c {date.fromisoformat(str(week_start)).strftime('%d %b %Y')}"
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

def send_review_email_for_venue(venue: dict) -> Optional[dict]:
    """Emails the manager the latest period's submission/conflict stats.
    No-op if the venue has no period yet or no manager email on file."""
    supabase = get_supabase()
    settings = get_settings()

    if not venue.get("manager_email"):
        return None

    period_res = (
        supabase.table("availability_periods")
        .select("*")
        .eq("venue_id", venue["id"])
        .order("week_start", desc=True)
        .limit(1)
        .execute()
    )
    if not period_res.data:
        return None
    period = period_res.data[0]

    staff = (
        supabase.table("staff_members")
        .select("id")
        .eq("venue_id", venue["id"])
        .eq("is_active", True)
        .execute()
        .data
    )
    total_count = len(staff)

    subs = (
        supabase.table("availability_submissions")
        .select("staff_id")
        .eq("period_id", period["id"])
        .execute()
        .data
    )
    submitted_count = len({s["staff_id"] for s in subs})

    summary = _build_summary(venue["id"], period)

    week_start = date.fromisoformat(str(period["week_start"]))
    week_label = f"w/c {week_start.strftime('%d %b %Y')}"

    email_result = email_service.send_manager_review_email(
        to_email=venue["manager_email"],
        manager_name="there",
        venue_name=venue["name"],
        week_label=week_label,
        submitted_count=submitted_count,
        total_count=total_count,
        review_link_url=f"{settings.frontend_url}/rota",
        conflicts=summary["conflicts"],
    )

    supabase.table("activity_log").insert(
        {
            "venue_id": venue["id"],
            "action": "review_email_sent",
            "detail": f"Review email sent to manager for week of {period['week_start']} ({submitted_count}/{total_count} submitted)",
        }
    ).execute()

    return {"period_id": period["id"], "submitted_count": submitted_count, "total_count": total_count, "email": email_result}


# Reminders ---------------------------------------------------------------------

def send_reminders_for_venue(venue: dict) -> Optional[dict]:
    """Emails everyone who hasn't submitted for the currently-collecting
    period. No-op if nothing is currently collecting."""
    supabase = get_supabase()
    settings = get_settings()

    period_res = (
        supabase.table("availability_periods")
        .select("*")
        .eq("venue_id", venue["id"])
        .eq("status", "collecting")
        .order("week_start", desc=True)
        .limit(1)
        .execute()
    )
    if not period_res.data:
        return None
    period = period_res.data[0]

    active = (
        supabase.table("staff_members")
        .select("id, name, email, pin")
        .eq("venue_id", venue["id"])
        .eq("is_active", True)
        .execute()
        .data
    )
    subs = (
        supabase.table("availability_submissions")
        .select("staff_id")
        .eq("period_id", period["id"])
        .execute()
        .data
    )
    submitted_ids = {s["staff_id"] for s in subs}
    targets = [m for m in active if m["id"] not in submitted_ids]

    if not targets:
        return {"reminded": 0, "email_sent": 0}

    week_label, deadline_label = _reminder_context(venue, period["id"])
    venue_link_url = f"{settings.frontend_url}/v/{venue['link_token']}"

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

    supabase.table("activity_log").insert(
        {
            "venue_id": venue["id"],
            "action": "reminder_sent",
            "detail": f"Reminded {len(targets)} staff who haven't submitted (automatic)",
        }
    ).execute()

    return {"reminded": len(targets), "email_sent": sent_count}


# Endpoints -----------------------------------------------------------------

@router.post("/open-availability", dependencies=[Depends(require_cron)])
def open_availability():
    opened = [v["id"] for v in _all_venues() if open_availability_for_venue(v)]
    return {"opened": len(opened), "venue_ids": opened}


@router.post("/close-availability", dependencies=[Depends(require_cron)])
def close_availability():
    closed = [v["id"] for v in _all_venues() if close_availability_for_venue(v)]
    return {"closed": len(closed), "venue_ids": closed}


@router.post("/send-review-email", dependencies=[Depends(require_cron)])
def send_review_email():
    sent = [v["id"] for v in _all_venues() if send_review_email_for_venue(v)]
    return {"sent": len(sent), "venue_ids": sent}


@router.post("/send-reminders", dependencies=[Depends(require_cron)])
def send_reminders():
    results = {}
    for v in _all_venues():
        result = send_reminders_for_venue(v)
        if result and result["reminded"] > 0:
            results[v["id"]] = result
    total_reminded = sum(r["reminded"] for r in results.values())
    return {"venues_reminded": len(results), "total_reminded": total_reminded, "detail": results}
