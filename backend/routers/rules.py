from fastapi import APIRouter, Depends

from database import get_supabase
from models.schemas import SchedulingRulesOut, SchedulingRulesUpdateRequest
from services import cron_scheduler
from services.auth_service import get_current_manager, get_manager_venue

router = APIRouter(prefix="/api/rules", tags=["rules"])


@router.get("", response_model=SchedulingRulesOut)
def get_rules(manager: dict = Depends(get_current_manager)):
    venue = get_manager_venue(manager["id"])
    supabase = get_supabase()
    res = (
        supabase.table("scheduling_rules")
        .select("*")
        .eq("venue_id", venue["id"])
        .limit(1)
        .execute()
    )
    if res.data:
        return res.data[0]
    return {
        "max_hours_per_week": 48,
        "min_rest_hours": 11,
        "avail_opens_day": "Saturday",
        "avail_closes_day": "Wednesday",
        "avail_closes_time": "23:00",
        "review_email_day": "Saturday",
        "review_email_time": "09:00",
    }


@router.put("", response_model=SchedulingRulesOut)
def update_rules(
    payload: SchedulingRulesUpdateRequest,
    manager: dict = Depends(get_current_manager),
):
    venue = get_manager_venue(manager["id"])
    supabase = get_supabase()

    updates = payload.model_dump(exclude_unset=True)
    updates["venue_id"] = venue["id"]

    result = (
        supabase.table("scheduling_rules")
        .upsert(updates, on_conflict="venue_id")
        .execute()
        .data[0]
    )

    cron_scheduler.refresh_jobs()

    return result
