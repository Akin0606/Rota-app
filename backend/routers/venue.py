from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException

from database import get_supabase
from models.schemas import VenueCreateRequest, VenueOut, VenueUpdateRequest
from services import cron_scheduler, schedule_windows
from services.auth_service import get_current_manager, get_manager_venue
from services.pin_service import generate_venue_token

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
        venue = (
            supabase.table("venues")
            .update({"manager_id": manager["id"], "name": payload.name})
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
