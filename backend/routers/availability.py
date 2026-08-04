from typing import Optional

from fastapi import APIRouter, HTTPException, Query

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
from services import email_service

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
def get_venue_info(venue_token: str):
    venue = _get_venue_or_404(venue_token)
    return {
        "venue_name": venue["name"],
        "shifts": _get_shifts(venue["id"]),
    }


@router.post("/{venue_token}/auth", response_model=AvailabilityAuthResponse)
def authenticate(venue_token: str, payload: PinAuthRequest):
    venue = _get_venue_or_404(venue_token)
    staff = _get_staff_by_pin(venue["id"], payload.pin)

    period = _get_current_period(venue["id"])
    submissions = []
    if period:
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

    period = _get_current_period(venue["id"])
    if not period:
        raise HTTPException(status_code=404, detail="No availability period is currently open")

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
