from fastapi import APIRouter, Depends, HTTPException

from database import get_supabase
from models.schemas import (
    ShiftCreateRequest,
    ShiftOut,
    ShiftScheduleOut,
    ShiftScheduleUpdateRequest,
    ShiftUpdateRequest,
)
from services import shift_days_service
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

    # Validate the time at the write path (G5) before anything is inserted.
    try:
        shift_days_service.validate_time("Start time", payload.start_time)
        shift_days_service.validate_time("End time", payload.end_time)
    except shift_days_service.ScheduleError as e:
        raise HTTPException(status_code=400, detail=str(e))

    shift = (
        supabase.table("shifts")
        .insert(
            {
                "venue_id": venue["id"],
                "name": payload.name,
                "start_time": payload.start_time,
                "end_time": payload.end_time,
                "color": payload.color,
                "sort_order": payload.sort_order,
                "min_staff": payload.min_staff,
                "max_staff": payload.max_staff,
            }
        )
        .execute()
        .data[0]
    )
    # Seed a same-every-day schedule so the new shift is immediately per-day
    # coherent (runs every day at this time until edited per-day).
    shift_days_service.sync_uniform(
        supabase, shift["id"], payload.start_time, payload.end_time,
        payload.min_staff, payload.max_staff,
    )
    return shift


@router.put("/{shift_id}", response_model=ShiftOut)
def update_shift(
    shift_id: str,
    payload: ShiftUpdateRequest,
    manager: dict = Depends(get_current_manager),
):
    venue = get_manager_venue(manager["id"])
    existing = _get_shift_or_404(venue["id"], shift_id)
    supabase = get_supabase()

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return existing

    # Validate any incoming time at the write path (G5).
    try:
        if "start_time" in updates:
            shift_days_service.validate_time("Start time", updates["start_time"])
        if "end_time" in updates:
            shift_days_service.validate_time("End time", updates["end_time"])
    except shift_days_service.ScheduleError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Validate the staffing range against the merged (existing + incoming) values
    # so a partial update can't leave max_staff below min_staff.
    merged_min = updates.get("min_staff", existing.get("min_staff", 1))
    merged_max = updates.get("max_staff", existing.get("max_staff", 2))
    if merged_max < merged_min:
        raise HTTPException(
            status_code=400, detail="Max staff can't be lower than min staff."
        )

    updated = (
        supabase.table("shifts")
        .update(updates)
        .eq("id", shift_id)
        .execute()
        .data[0]
    )
    # Keep the per-day rows coherent: the simple editor edits one field at a time,
    # so push only the changed time/staff columns onto every day (preserving
    # per-day divergence in the columns it didn't touch). The per-day editor
    # (PUT /days) is the path for divergent schedules and closed days.
    shift_days_service.propagate_fields(supabase, shift_id, updates)
    return updated


@router.get("/{shift_id}/days", response_model=ShiftScheduleOut)
def get_shift_schedule(shift_id: str, manager: dict = Depends(get_current_manager)):
    venue = get_manager_venue(manager["id"])
    shift = _get_shift_or_404(venue["id"], shift_id)
    supabase = get_supabase()
    return {"shift_id": shift_id, "days": shift_days_service.get_schedule(supabase, shift)}


@router.put("/{shift_id}/days", response_model=ShiftScheduleOut)
def set_shift_schedule(
    shift_id: str,
    payload: ShiftScheduleUpdateRequest,
    manager: dict = Depends(get_current_manager),
):
    venue = get_manager_venue(manager["id"])
    shift = _get_shift_or_404(venue["id"], shift_id)
    supabase = get_supabase()

    days = [d.model_dump() for d in payload.days]
    try:
        representative = shift_days_service.replace_schedule(supabase, shift_id, days)
    except shift_days_service.ScheduleError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Mirror the first open day onto shifts.* so the fallback and any not-yet-
    # per-day surface (the frontend) show a representative time.
    supabase.table("shifts").update(representative).eq("id", shift_id).execute()

    # The manager has now entered real per-day times — clear any backfill
    # recapture prompt for this venue (was set when a shift's end was 'close').
    if venue.get("needs_shift_recapture"):
        supabase.table("venues").update({"needs_shift_recapture": False}).eq("id", venue["id"]).execute()

    updated = _get_shift_or_404(venue["id"], shift_id)
    return {"shift_id": shift_id, "days": shift_days_service.get_schedule(supabase, updated)}


@router.delete("/{shift_id}")
def delete_shift(shift_id: str, manager: dict = Depends(get_current_manager)):
    venue = get_manager_venue(manager["id"])
    _get_shift_or_404(venue["id"], shift_id)
    supabase = get_supabase()

    # shift_days rows cascade via the FK (migration 026).
    supabase.table("shifts").delete().eq("id", shift_id).execute()
    return {"status": "ok"}
