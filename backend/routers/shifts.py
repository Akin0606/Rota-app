from fastapi import APIRouter, Depends, HTTPException

from database import get_supabase
from models.schemas import (
    ShiftCreateRequest,
    ShiftOut,
    ShiftScheduleOut,
    ShiftScheduleUpdateRequest,
    ShiftUpdateRequest,
    ShiftWithDaysOut,
)
from services import cron_scheduler, shift_days_service
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


@router.get("/days", response_model=list[ShiftWithDaysOut])
def list_shifts_with_days(manager: dict = Depends(get_current_manager)):
    """Every shift with its full per-day schedule, in one read.

    The manager app needs this on three screens at once (Rota, Scheduler,
    Today), and per-shift GETs would be N+1 on every load. Declared before
    `/{shift_id}/days` is irrelevant to routing (different segment counts) but
    kept adjacent to `list_shifts` because it is the same question with the
    per-day answer.

    An unmigrated shift (no `shift_days` rows) comes back as 7 open days at the
    shift-level time, exactly as `shift_bounds` resolves it — so a client can
    trust `days` unconditionally and never needs the fallback logic itself.
    """
    venue = get_manager_venue(manager["id"])
    supabase = get_supabase()
    shifts = (
        supabase.table("shifts")
        .select("*")
        .eq("venue_id", venue["id"])
        .order("sort_order")
        .execute()
        .data
        or []
    )
    if not shifts:
        return []

    rows = (
        supabase.table("shift_days")
        .select("shift_id, day_index, start_time, end_time, min_staff, max_staff")
        .in_("shift_id", [s["id"] for s in shifts])
        .execute()
        .data
        or []
    )
    by_shift: dict[str, list[dict]] = {}
    for row in rows:
        by_shift.setdefault(row["shift_id"], []).append(row)

    return [
        {**shift, "days": shift_days_service.schedule_from_rows(shift, by_shift.get(shift["id"], []))}
        for shift in shifts
    ]


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
    # The notice window is derived from the venue's earliest shift start, so a
    # shift change moves every open/remind/close job. Nothing here used to
    # refresh them: it limped because create_venue seeded a period and a read
    # path invented one whenever the cadence slipped, and batch 2 removes both
    # of those. Without this the jobs a venue gets at creation — when it has no
    # shifts and therefore no window at all — would be the jobs it keeps.
    cron_scheduler.refresh_jobs()
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

    # Per-day rows FIRST, so a refusal leaves nothing half-written. A
    # single-value edit pushes only the changed time/staff columns onto every
    # day (preserving per-day divergence in the columns it didn't touch), and
    # refuses outright when the column it was handed already differs across
    # days — the per-day editor (PUT /days) is the path for that.
    try:
        shift_days_service.propagate_fields(supabase, shift_id, updates)
    except shift_days_service.DivergenceError as e:
        raise HTTPException(status_code=409, detail=str(e))

    updated = (
        supabase.table("shifts")
        .update(updates)
        .eq("id", shift_id)
        .execute()
        .data[0]
    )
    # The notice window is derived from the venue's earliest shift start, so a
    # shift change moves every open/remind/close job. Nothing here used to
    # refresh them: it limped because create_venue seeded a period and a read
    # path invented one whenever the cadence slipped, and batch 2 removes both
    # of those. Without this the jobs a venue gets at creation — when it has no
    # shifts and therefore no window at all — would be the jobs it keeps.
    cron_scheduler.refresh_jobs()
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

    # I2 — a GET body is a valid PUT body: drop the days it marks closed, and
    # `open` itself is not a shift_days column. A day left open with no times is
    # a real mistake, not a closed day, so it goes to replace_schedule and comes
    # back as a 400 naming the field rather than being silently dropped.
    days = [
        {k: v for k, v in d.model_dump().items() if k != "open"}
        for d in payload.days
        if d.open
    ]
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
    # The notice window is derived from the venue's earliest shift start, so a
    # shift change moves every open/remind/close job. Nothing here used to
    # refresh them: it limped because create_venue seeded a period and a read
    # path invented one whenever the cadence slipped, and batch 2 removes both
    # of those. Without this the jobs a venue gets at creation — when it has no
    # shifts and therefore no window at all — would be the jobs it keeps.
    cron_scheduler.refresh_jobs()
    return {"shift_id": shift_id, "days": shift_days_service.get_schedule(supabase, updated)}


@router.delete("/{shift_id}")
def delete_shift(shift_id: str, manager: dict = Depends(get_current_manager)):
    venue = get_manager_venue(manager["id"])
    _get_shift_or_404(venue["id"], shift_id)
    supabase = get_supabase()

    # shift_days rows cascade via the FK (migration 026).
    supabase.table("shifts").delete().eq("id", shift_id).execute()
    # The notice window is derived from the venue's earliest shift start, so a
    # shift change moves every open/remind/close job. Nothing here used to
    # refresh them: it limped because create_venue seeded a period and a read
    # path invented one whenever the cadence slipped, and batch 2 removes both
    # of those. Without this the jobs a venue gets at creation — when it has no
    # shifts and therefore no window at all — would be the jobs it keeps.
    cron_scheduler.refresh_jobs()
    return {"status": "ok"}
