from fastapi import APIRouter, Depends, HTTPException

from database import get_supabase
from models.schemas import ShiftCreateRequest, ShiftOut, ShiftUpdateRequest
from services.auth_service import get_current_manager, get_manager_venue

router = APIRouter(prefix="/api/shifts", tags=["shifts"])


def _get_shift_or_404(venue_id: str, shift_id: str) -> dict:
    supabase = get_supabase()
    res = (
        supabase.table("shifts")
        .select("*")
        .eq("id", shift_id)
        .eq("venue_id", venue_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Shift not found")
    return res.data[0]


@router.get("", response_model=list[ShiftOut])
def list_shifts(manager: dict = Depends(get_current_manager)):
    venue = get_manager_venue(manager["id"])
    supabase = get_supabase()
    return (
        supabase.table("shifts")
        .select("*")
        .eq("venue_id", venue["id"])
        .order("sort_order")
        .execute()
        .data
    )


@router.post("", response_model=ShiftOut)
def create_shift(payload: ShiftCreateRequest, manager: dict = Depends(get_current_manager)):
    venue = get_manager_venue(manager["id"])
    supabase = get_supabase()
    return (
        supabase.table("shifts")
        .insert(
            {
                "venue_id": venue["id"],
                "name": payload.name,
                "start_time": payload.start_time,
                "end_time": payload.end_time,
                "color": payload.color,
                "sort_order": payload.sort_order,
            }
        )
        .execute()
        .data[0]
    )


@router.put("/{shift_id}", response_model=ShiftOut)
def update_shift(
    shift_id: str,
    payload: ShiftUpdateRequest,
    manager: dict = Depends(get_current_manager),
):
    venue = get_manager_venue(manager["id"])
    _get_shift_or_404(venue["id"], shift_id)
    supabase = get_supabase()

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return _get_shift_or_404(venue["id"], shift_id)

    return (
        supabase.table("shifts")
        .update(updates)
        .eq("id", shift_id)
        .execute()
        .data[0]
    )


@router.delete("/{shift_id}")
def delete_shift(shift_id: str, manager: dict = Depends(get_current_manager)):
    venue = get_manager_venue(manager["id"])
    _get_shift_or_404(venue["id"], shift_id)
    supabase = get_supabase()

    supabase.table("shifts").delete().eq("id", shift_id).execute()
    return {"status": "ok"}
