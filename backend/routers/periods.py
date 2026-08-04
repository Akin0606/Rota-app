from fastapi import APIRouter, Depends

from database import get_supabase
from models.schemas import PeriodOut
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
