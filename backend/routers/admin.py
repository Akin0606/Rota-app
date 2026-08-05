from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query

from config import get_settings
from database import get_supabase
from models.schemas import (
    AdminActivityOut,
    AdminCreateManagerRequest,
    AdminManagerOut,
    AdminVenueDetailOut,
    AdminVenueOut,
    RotaSummaryOut,
    StaffManagerOut,
    WaitlistEntryOut,
)
from routers.rota import run_solver_for_period
from routers.staff import _generate_unique_pin

router = APIRouter(prefix="/api/admin", tags=["admin"])


def require_admin(x_admin_secret: str = Header(default="")) -> None:
    settings = get_settings()
    if not settings.admin_secret or x_admin_secret != settings.admin_secret:
        raise HTTPException(status_code=401, detail="Invalid admin secret")


def _get_venue_or_404(venue_id: str) -> dict:
    supabase = get_supabase()
    res = supabase.table("venues").select("*").eq("id", venue_id).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Venue not found")
    return res.data[0]


def _latest_period(venue_id: str) -> Optional[dict]:
    supabase = get_supabase()
    res = (
        supabase.table("availability_periods")
        .select("*")
        .eq("venue_id", venue_id)
        .order("week_start", desc=True)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


@router.get("/venues", response_model=list[AdminVenueOut], dependencies=[Depends(require_admin)])
def list_venues():
    supabase = get_supabase()
    venues = supabase.table("venues").select("*").order("created_at", desc=True).execute().data

    all_staff = supabase.table("staff_members").select("id, venue_id, is_active").execute().data
    staff_counts: dict[str, int] = {}
    for s in all_staff:
        if s["is_active"]:
            staff_counts[s["venue_id"]] = staff_counts.get(s["venue_id"], 0) + 1

    all_periods = (
        supabase.table("availability_periods")
        .select("venue_id, status, week_start")
        .order("week_start", desc=True)
        .execute()
        .data
    )
    latest_status: dict[str, str] = {}
    for p in all_periods:
        latest_status.setdefault(p["venue_id"], p["status"])

    rows = [
        {
            "id": v["id"],
            "name": v["name"],
            "manager_email": v["manager_email"],
            "created_at": v["created_at"],
            "staff_count": staff_counts.get(v["id"], 0),
            "period_status": latest_status.get(v["id"]),
            "pending": False,
        }
        for v in venues
    ]

    # Managers who have a Supabase auth account but haven't run the onboarding
    # wizard yet (no venue) — surface them so the admin can see accounts they
    # created that are still awaiting onboarding.
    venue_emails = {(v.get("manager_email") or "").lower() for v in venues}
    try:
        users = supabase.auth.admin.list_users()
    except Exception:
        users = []
    for u in users:
        email = (getattr(u, "email", None) or "").lower()
        if not email or email in venue_emails:
            continue
        rows.append(
            {
                "id": f"pending:{getattr(u, 'id', '')}",
                "name": getattr(u, "email", ""),
                "manager_email": getattr(u, "email", ""),
                "created_at": str(getattr(u, "created_at", "")),
                "staff_count": 0,
                "period_status": "awaiting_onboarding",
                "pending": True,
            }
        )

    return rows


def _create_manager_account(email: str) -> str:
    """Creates a confirmed Supabase auth user for `email` so they can sign in
    via the OTP flow and run onboarding. Returns the login URL to hand them.
    Raises HTTPException on invalid input, an existing venue, or an existing
    account. Shared by the Add Manager and waitlist Invite actions."""
    email = email.strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Enter a valid email address")

    supabase = get_supabase()

    existing_venue = (
        supabase.table("venues").select("id").eq("manager_email", email).limit(1).execute()
    )
    if existing_venue.data:
        raise HTTPException(status_code=409, detail="A venue already exists for this email")

    try:
        # email_confirm=True marks the account confirmed so they can request a
        # login code and sign in immediately, without any email verification
        # step or Supabase "allow signups" toggle getting in the way.
        supabase.auth.admin.create_user({"email": email, "email_confirm": True})
    except Exception as exc:
        message = str(exc)
        if "already" in message.lower() or "registered" in message.lower():
            raise HTTPException(status_code=409, detail="That email already has an account")
        raise HTTPException(status_code=500, detail=f"Could not create account: {message}")

    return f"{get_settings().frontend_url}/login"


@router.post("/managers", response_model=AdminManagerOut, dependencies=[Depends(require_admin)])
def add_manager(payload: AdminCreateManagerRequest):
    login_url = _create_manager_account(payload.email)
    return {"email": payload.email.strip().lower(), "status": "created", "login_url": login_url}


@router.get(
    "/waitlist", response_model=list[WaitlistEntryOut], dependencies=[Depends(require_admin)]
)
def list_waitlist():
    supabase = get_supabase()
    return (
        supabase.table("waitlist")
        .select("*")
        .order("created_at", desc=True)
        .execute()
        .data
    )


@router.post(
    "/waitlist/{entry_id}/invite",
    response_model=AdminManagerOut,
    dependencies=[Depends(require_admin)],
)
def invite_waitlist_entry(entry_id: str):
    supabase = get_supabase()
    res = supabase.table("waitlist").select("*").eq("id", entry_id).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Waitlist entry not found")
    entry = res.data[0]

    login_url = _create_manager_account(entry["email"])
    supabase.table("waitlist").update({"status": "invited"}).eq("id", entry_id).execute()

    return {"email": entry["email"], "status": "invited", "login_url": login_url}


@router.get(
    "/venues/{venue_id}",
    response_model=AdminVenueDetailOut,
    dependencies=[Depends(require_admin)],
)
def get_venue_detail(venue_id: str):
    supabase = get_supabase()
    venue = _get_venue_or_404(venue_id)

    staff = (
        supabase.table("staff_members")
        .select("*")
        .eq("venue_id", venue_id)
        .order("created_at")
        .execute()
        .data
    )

    period = _latest_period(venue_id)
    submitted_ids: set[str] = set()
    if period:
        subs = (
            supabase.table("availability_submissions")
            .select("staff_id")
            .eq("period_id", period["id"])
            .execute()
            .data
        )
        submitted_ids = {s["staff_id"] for s in subs}

    for member in staff:
        member["submitted"] = member["id"] in submitted_ids if period else None

    return {
        "id": venue["id"],
        "name": venue["name"],
        "manager_email": venue["manager_email"],
        "created_at": venue["created_at"],
        "link_token": venue["link_token"],
        "staff": staff,
        "period": (
            {"id": period["id"], "week_start": str(period["week_start"]), "status": period["status"]}
            if period
            else None
        ),
    }


@router.get("/activity", response_model=list[AdminActivityOut], dependencies=[Depends(require_admin)])
def list_all_activity(limit: int = Query(default=50, le=200)):
    supabase = get_supabase()
    rows = (
        supabase.table("activity_log")
        .select("*")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
        .data
    )

    venue_ids = {r["venue_id"] for r in rows if r.get("venue_id")}
    staff_ids = {r["staff_id"] for r in rows if r.get("staff_id")}

    venues_by_id: dict[str, str] = {}
    if venue_ids:
        vres = supabase.table("venues").select("id, name").in_("id", list(venue_ids)).execute()
        venues_by_id = {v["id"]: v["name"] for v in vres.data}

    staff_by_id: dict[str, str] = {}
    if staff_ids:
        sres = supabase.table("staff_members").select("id, name").in_("id", list(staff_ids)).execute()
        staff_by_id = {s["id"]: s["name"] for s in sres.data}

    for r in rows:
        r["venue_name"] = venues_by_id.get(r["venue_id"], "Unknown venue")
        r["staff_name"] = staff_by_id.get(r["staff_id"]) if r.get("staff_id") else None

    return rows


@router.post(
    "/venues/{venue_id}/generate",
    response_model=RotaSummaryOut,
    dependencies=[Depends(require_admin)],
)
def admin_generate_rota(venue_id: str):
    venue = _get_venue_or_404(venue_id)
    period = _latest_period(venue_id)
    if not period:
        raise HTTPException(status_code=404, detail="This venue has no availability period yet")

    return run_solver_for_period(venue, period, note=" (triggered via admin console)")


@router.post(
    "/staff/{staff_id}/reset-pin",
    response_model=StaffManagerOut,
    dependencies=[Depends(require_admin)],
)
def admin_reset_pin(staff_id: str):
    supabase = get_supabase()
    staff_res = supabase.table("staff_members").select("*").eq("id", staff_id).limit(1).execute()
    if not staff_res.data:
        raise HTTPException(status_code=404, detail="Staff member not found")
    staff = staff_res.data[0]

    new_pin = _generate_unique_pin(staff["venue_id"])
    updated = (
        supabase.table("staff_members")
        .update({"pin": new_pin})
        .eq("id", staff_id)
        .execute()
        .data[0]
    )

    supabase.table("activity_log").insert(
        {
            "venue_id": staff["venue_id"],
            "staff_id": staff_id,
            "action": "pin_reset",
            "detail": f"{staff['name']}'s PIN was reset (via admin console)",
        }
    ).execute()

    updated["submitted"] = None
    return updated
