from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException

from database import get_supabase
from models.schemas import PeriodCreateRequest, PeriodOut
from services.auth_service import get_current_manager, get_manager_venue

router = APIRouter(prefix="/api/periods", tags=["periods"])


@router.get("", response_model=list[PeriodOut])
def list_periods(manager: dict = Depends(get_current_manager)):
    venue = get_manager_venue(manager["id"])
    supabase = get_supabase()
    return (
        supabase.table("availability_periods")
        .select("id, week_start, status")
        .eq("venue_id", venue["id"])
        .order("week_start", desc=True)
        .execute()
        .data
    )


@router.post("", response_model=PeriodOut)
def create_period(payload: PeriodCreateRequest, manager: dict = Depends(get_current_manager)):
    """Ensures a collecting period exists for the given week so the manager can
    plan/generate a rota ahead of time. Idempotent — returns the existing period
    if one already exists for that week. Capped to 4 weeks out."""
    venue = get_manager_venue(manager["id"])
    supabase = get_supabase()

    try:
        requested = date.fromisoformat(payload.week_start)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid week_start")
    monday = requested - timedelta(days=requested.weekday())

    today = date.today()
    this_monday = today - timedelta(days=today.weekday())
    if monday < this_monday or monday > this_monday + timedelta(weeks=4):
        raise HTTPException(status_code=400, detail="Week must be within the next 4 weeks")

    existing = (
        supabase.table("availability_periods")
        .select("id, week_start, status")
        .eq("venue_id", venue["id"])
        .eq("week_start", monday.isoformat())
        .limit(1)
        .execute()
    )
    if existing.data:
        return existing.data[0]

    period = (
        supabase.table("availability_periods")
        .insert({"venue_id": venue["id"], "week_start": monday.isoformat(), "status": "collecting"})
        .execute()
        .data[0]
    )
    supabase.table("activity_log").insert(
        {
            "venue_id": venue["id"],
            "action": "availability_opened",
            "detail": f"Planning week opened for {monday.isoformat()}",
        }
    ).execute()
    return period
