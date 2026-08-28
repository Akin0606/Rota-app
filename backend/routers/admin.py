from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query

from config import get_settings
from database import get_supabase
from models.schemas import (
    AdminActivityOut,
    AdminCreateManagerRequest,
    AdminManagerOut,
    AdminStatsOut,
    AdminVenueDetailOut,
    AdminVenueOut,
    AdminVenueRotaOut,
    AdminVenueUpdateRequest,
    RotaSummaryOut,
    StaffManagerOut,
    SuggestionOut,
    SuggestionUpdateRequest,
    WaitlistEntryOut,
)
from routers.rota import _build_summary, run_solver_for_period
from routers.staff import _generate_unique_pin
from services import email_service, onboarding

router = APIRouter(prefix="/api/admin", tags=["admin"])

# A live venue with no activity in this many days counts as "stale".
STALE_DAYS = 14

# Mirrors the check constraint in migration 028 — kept here so a bad status is a
# clean 400 rather than a Postgres constraint violation surfacing as a 500.
_SUGGESTION_STATUSES = {"new", "read", "actioned", "archived"}


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

    # Most recent activity per venue, for spotting stale venues.
    activity = (
        supabase.table("activity_log")
        .select("venue_id, created_at")
        .order("created_at", desc=True)
        .limit(2000)
        .execute()
        .data
    )
    last_active: dict[str, str] = {}
    for a in activity:
        if a.get("venue_id"):
            last_active.setdefault(a["venue_id"], a["created_at"])

    rows = [
        {
            "id": v["id"],
            "name": v["name"],
            "manager_email": v["manager_email"],
            "created_at": v["created_at"],
            "staff_count": staff_counts.get(v["id"], 0),
            "period_status": latest_status.get(v["id"]),
            "pending": False,
            "is_active": v.get("is_active", True),
            "last_active_at": last_active.get(v["id"]),
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


@router.get("/stats", response_model=AdminStatsOut, dependencies=[Depends(require_admin)])
def get_stats():
    """At-a-glance operational stats across all venues."""
    supabase = get_supabase()

    venues = supabase.table("venues").select("id, is_active").execute().data
    active = sum(1 for v in venues if v.get("is_active", True))

    staff = supabase.table("staff_members").select("id").eq("is_active", True).execute().data

    periods = supabase.table("availability_periods").select("venue_id, status").execute().data
    open_periods = sum(1 for p in periods if p["status"] == "collecting")
    published = sum(1 for p in periods if p["status"] in ("published", "confirmed"))

    # Stale: an active venue whose most recent activity is older than STALE_DAYS.
    activity = (
        supabase.table("activity_log")
        .select("venue_id, created_at")
        .order("created_at", desc=True)
        .limit(2000)
        .execute()
        .data
    )
    last_active: dict[str, str] = {}
    for a in activity:
        if a.get("venue_id"):
            last_active.setdefault(a["venue_id"], a["created_at"])

    cutoff = datetime.now(timezone.utc) - timedelta(days=STALE_DAYS)
    stale = 0
    for v in venues:
        if not v.get("is_active", True):
            continue
        ts = last_active.get(v["id"])
        if not ts:
            continue
        try:
            when = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
            if when.tzinfo is None:
                when = when.replace(tzinfo=timezone.utc)
            if when < cutoff:
                stale += 1
        except ValueError:
            continue

    return {
        "total_venues": len(venues),
        "active_venues": active,
        "inactive_venues": len(venues) - active,
        "stale_venues": stale,
        "total_staff": len(staff),
        "open_periods": open_periods,
        "published_rotas": published,
    }


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
        # email_confirm=True marks the account confirmed so the activation link
        # signs them straight in, with no email-verification step or Supabase
        # "allow signups" toggle getting in the way.
        supabase.auth.admin.create_user({"email": email, "email_confirm": True})
    except Exception as exc:
        message = str(exc)
        if "already" in message.lower() or "registered" in message.lower():
            raise HTTPException(status_code=409, detail="That email already has an account")
        raise HTTPException(status_code=500, detail=f"Could not create account: {message}")

    # Activation link = auth + email proof (§1). One email, no OTP on first run:
    # tapping it mints a session server-side and drops them into the wizard.
    activation_url = onboarding.mint_activation_token(email)
    email_service.send_activation_email(email, activation_url)
    return activation_url


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
    "/suggestions", response_model=list[SuggestionOut], dependencies=[Depends(require_admin)]
)
def list_suggestions():
    supabase = get_supabase()
    return (
        supabase.table("suggestions")
        .select("*")
        .order("created_at", desc=True)
        .limit(200)
        .execute()
        .data
    )


@router.patch(
    "/suggestions/{suggestion_id}",
    response_model=SuggestionOut,
    dependencies=[Depends(require_admin)],
)
def update_suggestion(suggestion_id: str, payload: SuggestionUpdateRequest):
    if payload.status not in _SUGGESTION_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Status must be one of: {', '.join(sorted(_SUGGESTION_STATUSES))}",
        )
    supabase = get_supabase()
    res = (
        supabase.table("suggestions")
        .update({"status": payload.status})
        .eq("id", suggestion_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Suggestion not found")
    return res.data[0]


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
        "is_active": venue.get("is_active", True),
        "admin_notes": venue.get("admin_notes"),
        "staff": staff,
        "period": (
            {"id": period["id"], "week_start": str(period["week_start"]), "status": period["status"]}
            if period
            else None
        ),
    }


@router.patch(
    "/venues/{venue_id}",
    response_model=AdminVenueDetailOut,
    dependencies=[Depends(require_admin)],
)
def set_venue_active(venue_id: str, payload: AdminVenueUpdateRequest):
    """Enables/disables a venue and/or updates the admin's support notes for it.
    Disabling blocks manager login and staff PIN entry immediately — this is the
    hook a payment gateway can flip automatically later. Notes are admin-only,
    never shown to managers or staff."""
    supabase = get_supabase()
    venue = _get_venue_or_404(venue_id)

    updates = payload.model_dump(exclude_unset=True)
    if updates:
        supabase.table("venues").update(updates).eq("id", venue_id).execute()

    if "is_active" in updates:
        supabase.table("activity_log").insert(
            {
                "venue_id": venue_id,
                "action": "venue_activated" if payload.is_active else "venue_deactivated",
                "detail": (
                    f"Venue {'enabled' if payload.is_active else 'disabled'} via admin console"
                ),
            }
        ).execute()

    return get_venue_detail(venue_id)


def _generate_magic_link(email: str) -> str:
    supabase = get_supabase()
    try:
        link = supabase.auth.admin.generate_link({"type": "magiclink", "email": email})
        action_link = getattr(getattr(link, "properties", None), "action_link", None)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not create login link: {exc}")

    if not action_link:
        raise HTTPException(status_code=500, detail="Could not create login link")

    return action_link


@router.post(
    "/venues/{venue_id}/login-link",
    response_model=AdminManagerOut,
    dependencies=[Depends(require_admin)],
)
def create_support_login_link(venue_id: str):
    """Mints a one-time magic login link for the venue's manager, so the founder
    can sign in as them to reproduce/diagnose an issue. Desktop support use — the
    link establishes the manager's session on click."""
    venue = _get_venue_or_404(venue_id)
    action_link = _generate_magic_link(venue["manager_email"])
    return {"email": venue["manager_email"], "status": "link_created", "login_url": action_link}


@router.post(
    "/managers/{email}/login-link",
    response_model=AdminManagerOut,
    dependencies=[Depends(require_admin)],
)
def resend_pending_manager_login_link(email: str):
    """Resends the activation link for a manager who has an account but hasn't
    finished onboarding (no venue yet) — the resend wall behind an expired/used
    link. Mints a fresh 7-day token and emails it (§1), NOT a Supabase magic
    link (whose PKCE breaks in the in-app browser)."""
    email = email.strip().lower()
    activation_url = onboarding.mint_activation_token(email)
    email_service.send_activation_email(email, activation_url)
    return {"email": email, "status": "link_created", "login_url": activation_url}


@router.delete("/venues/{venue_id}", dependencies=[Depends(require_admin)])
def delete_venue(venue_id: str):
    """Permanently deletes a venue and all related data. Foreign-key cascades
    remove shifts, staff, scheduling rules, periods, submissions, assignments
    and activity log for the venue (see migrations 001/007/008)."""
    supabase = get_supabase()
    venue = _get_venue_or_404(venue_id)

    supabase.table("venues").delete().eq("id", venue_id).execute()

    return {"status": "deleted", "name": venue["name"]}


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


@router.get(
    "/venues/{venue_id}/rota",
    response_model=AdminVenueRotaOut,
    dependencies=[Depends(require_admin)],
)
def get_venue_rota(venue_id: str):
    """Read-only view of a venue's current (latest) rota, for admin support."""
    supabase = get_supabase()
    venue = _get_venue_or_404(venue_id)

    shifts = (
        supabase.table("shifts")
        .select("*")
        .eq("venue_id", venue_id)
        .order("sort_order")
        .execute()
        .data
    )
    staff = (
        supabase.table("staff_members")
        .select("id, name, role")
        .eq("venue_id", venue_id)
        .eq("is_active", True)
        .order("name")
        .execute()
        .data
    )

    period = _latest_period(venue_id)
    summary = _build_summary(venue_id, period) if period else None

    return {
        "venue_name": venue["name"],
        "period": (
            {"id": period["id"], "week_start": str(period["week_start"]), "status": period["status"]}
            if period
            else None
        ),
        "shifts": shifts,
        "staff": staff,
        "summary": summary,
    }


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
