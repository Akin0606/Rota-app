from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request, Response

from config import get_settings
from database import get_supabase
from models.schemas import (
    AvailabilityAuthResponse,
    AvailabilitySubmitRequest,
    ForgotPinRequest,
    PinAuthRequest,
    StaffRotaOut,
    VenueInfoResponse,
)
from services import email_service, rate_limit

# PIN auth: block a venue_token + IP after this many wrong PINs in the window.
PIN_MAX_ATTEMPTS = 5
PIN_WINDOW_SECONDS = 15 * 60
# Forgot-PIN: cap requests per venue + email to curb enumeration/abuse.
FORGOT_MAX_REQUESTS = 3
FORGOT_WINDOW_SECONDS = 60 * 60

router = APIRouter(prefix="/api/availability", tags=["availability"])


def _get_venue_or_404(venue_token: str) -> dict:
    supabase = get_supabase()
    res = (
        supabase.table("venues")
        .select("*")
        .eq("link_token", venue_token)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Venue link not found")
    return res.data[0]


def _get_staff_by_pin(venue_id: str, pin: str) -> dict:
    supabase = get_supabase()
    res = (
        supabase.table("staff_members")
        .select("*")
        .eq("venue_id", venue_id)
        .eq("pin", pin)
        .eq("is_active", True)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=401, detail="Incorrect PIN")
    return res.data[0]


def _get_current_period(venue_id: str) -> Optional[dict]:
    supabase = get_supabase()
    res = (
        supabase.table("availability_periods")
        .select("*")
        .eq("venue_id", venue_id)
        .eq("status", "collecting")
        .order("week_start", desc=True)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def _get_or_create_current_period(venue_id: str) -> dict:
    """Returns the venue's open (collecting) period, creating one on the fly if
    none exists. This guarantees a staff member who taps the venue link always
    has a week to fill in, even if the open/close cron timing left a gap."""
    existing = _get_current_period(venue_id)
    if existing:
        return existing

    from datetime import date, timedelta

    supabase = get_supabase()
    today = date.today()
    this_monday = today - timedelta(days=today.weekday())

    # Pick the earliest upcoming week (from this week) that doesn't already have
    # a period, so we don't collide with a closed/generated week.
    taken = {
        str(r["week_start"])
        for r in supabase.table("availability_periods")
        .select("week_start")
        .eq("venue_id", venue_id)
        .gte("week_start", this_monday.isoformat())
        .execute()
        .data
    }
    candidate = this_monday
    for _ in range(8):
        if candidate.isoformat() not in taken:
            break
        candidate = candidate + timedelta(days=7)

    period = (
        supabase.table("availability_periods")
        .insert({"venue_id": venue_id, "week_start": candidate.isoformat(), "status": "collecting"})
        .execute()
        .data[0]
    )
    supabase.table("activity_log").insert(
        {
            "venue_id": venue_id,
            "action": "availability_opened",
            "detail": f"Availability opened for week of {candidate.isoformat()} (auto)",
        }
    ).execute()
    return period


def _get_shifts(venue_id: str) -> list[dict]:
    supabase = get_supabase()
    return (
        supabase.table("shifts")
        .select("*")
        .eq("venue_id", venue_id)
        .order("sort_order")
        .execute()
        .data
    )


def _get_rules(venue_id: str) -> dict:
    supabase = get_supabase()
    res = (
        supabase.table("scheduling_rules")
        .select("avail_closes_day, avail_closes_time")
        .eq("venue_id", venue_id)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else {
        "avail_closes_day": "Wednesday",
        "avail_closes_time": "23:00",
    }


@router.get("/{venue_token}", response_model=VenueInfoResponse)
def get_venue_info(venue_token: str, response: Response):
    venue = _get_venue_or_404(venue_token)
    # Never let a browser/CDN serve a cached venue name — it must always reflect
    # the latest rename.
    response.headers["Cache-Control"] = "no-store, max-age=0"
    return {
        "venue_name": venue["name"],
        "shifts": _get_shifts(venue["id"]),
    }


@router.post("/{venue_token}/auth", response_model=AvailabilityAuthResponse)
def authenticate(venue_token: str, payload: PinAuthRequest, request: Request):
    venue = _get_venue_or_404(venue_token)

    lock_key = f"pinauth:{venue_token}:{rate_limit.client_ip(request)}"
    locked, retry_after = rate_limit.is_locked(lock_key, PIN_MAX_ATTEMPTS, PIN_WINDOW_SECONDS)
    if locked:
        minutes = rate_limit.minutes_from_seconds(retry_after)
        raise HTTPException(
            status_code=429,
            detail=f"Too many incorrect attempts. Try again in {minutes} minute{'s' if minutes != 1 else ''}.",
        )

    try:
        staff = _get_staff_by_pin(venue["id"], payload.pin)
    except HTTPException as exc:
        if exc.status_code == 401:
            # Only wrong PINs count toward the lockout.
            rate_limit.record(lock_key)
        raise
    # Successful PIN clears the failure count for this venue_token + IP.
    rate_limit.clear(lock_key)

    # Always give the staff member an open week to fill — create one on the fly
    # if the cron cycle left a gap.
    period = _get_or_create_current_period(venue["id"])
    supabase = get_supabase()
    submissions = (
        supabase.table("availability_submissions")
        .select("day_index, shift_id, status, note")
        .eq("period_id", period["id"])
        .eq("staff_id", staff["id"])
        .execute()
        .data
    )

    return {
        "staff": {"id": staff["id"], "name": staff["name"], "role": staff["role"]},
        "venue_name": venue["name"],
        "period": (
            {
                "id": period["id"],
                "week_start": str(period["week_start"]),
                "status": period["status"],
            }
            if period
            else None
        ),
        "shifts": _get_shifts(venue["id"]),
        "submissions": submissions,
        "rules": _get_rules(venue["id"]),
    }


@router.post("/{venue_token}/submit")
def submit_availability(venue_token: str, payload: AvailabilitySubmitRequest):
    venue = _get_venue_or_404(venue_token)
    staff = _get_staff_by_pin(venue["id"], payload.pin)

    period = _get_or_create_current_period(venue["id"])

    supabase = get_supabase()

    # Replace this staff member's submissions for the period wholesale —
    # simpler and safer than trying to upsert against a unique constraint
    # where shift_id (used for day-level notes) can be NULL.
    supabase.table("availability_submissions").delete().eq(
        "period_id", period["id"]
    ).eq("staff_id", staff["id"]).execute()

    rows = [
        {
            "period_id": period["id"],
            "staff_id": staff["id"],
            "day_index": e.day_index,
            "shift_id": e.shift_id,
            "status": e.status,
            "note": e.note,
        }
        for e in payload.submissions
        if e.status != 0 or e.note
    ]
    if rows:
        supabase.table("availability_submissions").insert(rows).execute()

    supabase.table("activity_log").insert(
        {
            "venue_id": venue["id"],
            "staff_id": staff["id"],
            "action": "submitted_availability",
            "detail": f"{staff['name']} submitted availability for week of {period['week_start']}",
        }
    ).execute()

    return {"status": "ok"}


@router.post("/{venue_token}/forgot-pin")
def forgot_pin(venue_token: str, payload: ForgotPinRequest):
    venue = _get_venue_or_404(venue_token)

    # Rate limit per venue + email so this can't be used to hammer an inbox or
    # probe which emails belong to staff. Keyed on the normalised email so case
    # variations can't multiply the allowance.
    limit_key = f"forgotpin:{venue['id']}:{payload.email.strip().lower()}"
    allowed, retry_after = rate_limit.hit(limit_key, FORGOT_MAX_REQUESTS, FORGOT_WINDOW_SECONDS)
    if not allowed:
        minutes = rate_limit.minutes_from_seconds(retry_after)
        raise HTTPException(
            status_code=429,
            detail=f"Too many requests. Try again in {minutes} minute{'s' if minutes != 1 else ''}.",
        )

    supabase = get_supabase()

    match = (
        supabase.table("staff_members")
        .select("id, name, email, pin")
        .eq("venue_id", venue["id"])
        .eq("email", payload.email)
        .eq("is_active", True)
        .limit(1)
        .execute()
    )
    if match.data:
        staff = match.data[0]
        email_service.send_pin_reminder_email(
            to_email=staff["email"],
            name=staff["name"],
            venue_name=venue["name"],
            pin=staff["pin"],
            venue_link_url=f"{get_settings().frontend_url}/v/{venue['link_token']}",
        )

    # Always respond with the same generic message regardless of whether the
    # email matches, so this endpoint can't be used to enumerate staff
    # emails at a venue.
    return {"status": "ok"}


@router.get("/{venue_token}/rota", response_model=StaffRotaOut)
def get_staff_rota(venue_token: str, pin: str = Query(pattern=r"^\d{4}$")):
    venue = _get_venue_or_404(venue_token)
    staff = _get_staff_by_pin(venue["id"], pin)
    supabase = get_supabase()

    period_res = (
        supabase.table("availability_periods")
        .select("*")
        .eq("venue_id", venue["id"])
        .eq("status", "published")
        .order("week_start", desc=True)
        .limit(1)
        .execute()
    )
    if not period_res.data:
        return {"venue_name": venue["name"], "staff_id": staff["id"], "period": None}
    period = period_res.data[0]

    assignments = (
        supabase.table("rota_assignments")
        .select("id, staff_id, day_index, shift_id")
        .eq("period_id", period["id"])
        .execute()
        .data
    )

    staff_ids = list({a["staff_id"] for a in assignments})
    team = (
        supabase.table("staff_members").select("id, name, role").in_("id", staff_ids).execute().data
        if staff_ids
        else []
    )

    return {
        "venue_name": venue["name"],
        "staff_id": staff["id"],
        "period": {"id": period["id"], "week_start": str(period["week_start"]), "status": period["status"]},
        "shifts": _get_shifts(venue["id"]),
        "assignments": assignments,
        "team": team,
    }
