from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException

from database import get_supabase
from models.schemas import (
    JoinCodeOut,
    SetupStateRequest,
    VenueCreateRequest,
    VenueLeaveSettingsOut,
    VenueLeaveSettingsRequest,
    VenueOut,
    VenueUpdateRequest,
)
from services import cron_scheduler, schedule_windows
from services.auth_service import get_current_manager, get_manager_venue
from services.pin_service import generate_pin, generate_venue_slug, generate_venue_token

router = APIRouter(prefix="/api/venue", tags=["venue"])


@router.get("", response_model=VenueOut)
def get_venue(manager: dict = Depends(get_current_manager)):
    # Readable even when inactive, so the app can show a clear "inactive" screen
    # rather than redirecting as if the account has no venue.
    return get_manager_venue(manager["id"], require_active=False)


@router.post("", response_model=VenueOut)
def create_venue(payload: VenueCreateRequest, manager: dict = Depends(get_current_manager)):
    supabase = get_supabase()

    existing = (
        supabase.table("venues")
        .select("*")
        .eq("manager_email", manager["email"])
        .limit(1)
        .execute()
    )
    if existing.data:
        row = existing.data[0]
        if row["manager_id"] and row["manager_id"] != manager["id"]:
            raise HTTPException(status_code=409, detail="A venue already exists for this account")
        if row["manager_id"] == manager["id"]:
            raise HTTPException(status_code=409, detail="A venue already exists for this account")
        # Row exists (e.g. pre-provisioned) but was never claimed — attach it
        # to this manager instead of failing on the manager_email unique
        # constraint.
        update = {"manager_id": manager["id"], "name": payload.name}
        # Give it a slug now if it has none (pre-slug row, or the name changed).
        if not row.get("slug"):
            update["slug"] = generate_venue_slug(supabase, payload.name)
        venue = (
            supabase.table("venues")
            .update(update)
            .eq("id", row["id"])
            .execute()
            .data[0]
        )
        return venue

    venue = (
        supabase.table("venues")
        .insert(
            {
                "name": payload.name,
                "manager_email": manager["email"],
                "manager_id": manager["id"],
                "link_token": generate_venue_token(payload.name),
                "slug": generate_venue_slug(supabase, payload.name),
            }
        )
        .execute()
        .data[0]
    )

    supabase.table("scheduling_rules").insert(
        {"venue_id": venue["id"], **schedule_windows.default_window()}
    ).execute()

    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    supabase.table("availability_periods").insert(
        {"venue_id": venue["id"], "week_start": week_start.isoformat(), "status": "collecting"}
    ).execute()

    supabase.table("activity_log").insert(
        {"venue_id": venue["id"], "action": "venue_created", "detail": f"{payload.name} was set up"}
    ).execute()

    cron_scheduler.refresh_jobs()

    return venue


@router.put("", response_model=VenueOut)
def update_venue(payload: VenueUpdateRequest, manager: dict = Depends(get_current_manager)):
    venue = get_manager_venue(manager["id"])
    supabase = get_supabase()
    return (
        supabase.table("venues")
        .update({"name": payload.name})
        .eq("id", venue["id"])
        .execute()
        .data[0]
    )


@router.put("/setup-state", response_model=VenueOut)
def update_setup_state(payload: SetupStateRequest, manager: dict = Depends(get_current_manager)):
    """Persist onboarding wizard progress on the manager's venue so a phone
    interruption resumes where it stopped (§1 save-and-resume). Passing a
    setup_state of null marks onboarding finished (the manager skips to the app
    on any later visit)."""
    venue = get_manager_venue(manager["id"])
    return (
        get_supabase()
        .table("venues")
        .update({"setup_state": payload.setup_state})
        .eq("id", venue["id"])
        .execute()
        .data[0]
    )


@router.post("/join-code", response_model=JoinCodeOut)
def rotate_join_code(manager: dict = Depends(get_current_manager)):
    """Generate (or reset, for a leak) the venue's self-registration code. The
    first call enables joining; a later call rotates it, invalidating the old
    one. Same one-tap pattern as reset-PIN."""
    venue = get_manager_venue(manager["id"])
    new_code = generate_pin()
    get_supabase().table("venues").update({"join_pin": new_code}).eq("id", venue["id"]).execute()
    return JoinCodeOut(join_pin=new_code)


@router.delete("/join-code", response_model=JoinCodeOut)
def disable_join_code(manager: dict = Depends(get_current_manager)):
    """Turn self-registration off — clears the code so a forwarded link can't
    register anyone until the manager generates a new one."""
    venue = get_manager_venue(manager["id"])
    get_supabase().table("venues").update({"join_pin": None}).eq("id", venue["id"]).execute()
    return JoinCodeOut(join_pin=None)


@router.get("/leave-settings", response_model=VenueLeaveSettingsOut)
def get_leave_settings(manager: dict = Depends(get_current_manager)):
    venue = get_manager_venue(manager["id"])
    return VenueLeaveSettingsOut(
        leave_year_start_month=int(venue.get("leave_year_start_month") or 1),
        full_time_leave_days=float(venue.get("full_time_leave_days") or 28),
    )


@router.put("/leave-settings", response_model=VenueLeaveSettingsOut)
def update_leave_settings(
    payload: VenueLeaveSettingsRequest,
    manager: dict = Depends(get_current_manager),
):
    venue = get_manager_venue(manager["id"])
    updates = payload.model_dump(exclude_unset=True)
    if updates:
        get_supabase().table("venues").update(updates).eq("id", venue["id"]).execute()
        venue = {**venue, **updates}
    return VenueLeaveSettingsOut(
        leave_year_start_month=int(venue.get("leave_year_start_month") or 1),
        full_time_leave_days=float(venue.get("full_time_leave_days") or 28),
    )
