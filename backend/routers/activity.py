from fastapi import APIRouter, Depends, Query

from database import get_supabase
from models.schemas import ActivityOut
from services.auth_service import get_current_manager, get_manager_venue

router = APIRouter(prefix="/api/activity", tags=["activity"])


@router.get("", response_model=list[ActivityOut])
def list_activity(limit: int = Query(default=20, le=100), manager: dict = Depends(get_current_manager)):
    venue = get_manager_venue(manager["id"])
    supabase = get_supabase()

    rows = (
        supabase.table("activity_log")
        .select("*")
        .eq("venue_id", venue["id"])
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
        .data
    )

    staff_ids = {r["staff_id"] for r in rows if r.get("staff_id")}
    names_by_id: dict[str, str] = {}
    if staff_ids:
        staff_res = (
            supabase.table("staff_members")
            .select("id, name")
            .in_("id", list(staff_ids))
            .execute()
        )
        names_by_id = {s["id"]: s["name"] for s in staff_res.data}

    for row in rows:
        row["staff_name"] = names_by_id.get(row["staff_id"]) if row.get("staff_id") else None

    return rows
