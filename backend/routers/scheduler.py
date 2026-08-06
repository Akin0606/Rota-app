"""Scheduler API: the automated 72-hour notice window.

Managers set relative offsets (open/reminder before close, plus a safety buffer
on top of the 72h legal minimum) once; the close time for each week is derived
from that week's earliest shift, so it recalculates automatically. A manager can
also override a single upcoming week's close time, guarded against dropping below
the legal minimum without explicit confirmation.
"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query

from database import get_supabase
from models.schemas import (
    SchedulerConfigOut,
    SchedulerConfigUpdateRequest,
    SchedulerOverrideRequest,
    SchedulerOverrideResponse,
    SchedulerWeekOut,
)
from services import cron_scheduler, notice_window, schedule_windows
from services.auth_service import get_current_manager, get_manager_venue

router = APIRouter(prefix="/api/scheduler", tags=["scheduler"])

FMT = schedule_windows.FMT


def _config_out(venue_id: str) -> SchedulerConfigOut:
    data = notice_window.upcoming_for_venue(venue_id, count=6)
    off = data["offsets"]
    weeks = [
        SchedulerWeekOut(
            week_start=w["week_monday"].isoformat(),
            week_label=f"w/c {w['week_monday'].strftime('%d %b %Y')}",
            opens_at=w["opens_at"].strftime(FMT),
            reminder_at=w["reminder_at"].strftime(FMT),
            closes_at=w["closes_at"].strftime(FMT),
            earliest_shift_at=w["earliest_shift_at"].strftime(FMT),
            notice_hours=round(w["notice_hours"], 1),
            is_override=w["is_override"],
        )
        for w in data["weeks"]
    ]
    return SchedulerConfigOut(
        open_offset_hours=off["open_offset_hours"],
        reminder_offset_hours=off["reminder_offset_hours"],
        notice_buffer_hours=off["buffer_hours"],
        legal_notice_hours=schedule_windows.LEGAL_NOTICE_HOURS,
        earliest_shift_label=data["earliest_shift_label"],
        has_shifts=data["earliest_minutes"] is not None,
        weeks=weeks,
    )


@router.get("", response_model=SchedulerConfigOut)
def get_scheduler(manager: dict = Depends(get_current_manager)):
    venue = get_manager_venue(manager["id"])
    return _config_out(venue["id"])


@router.put("", response_model=SchedulerConfigOut)
def update_scheduler(
    payload: SchedulerConfigUpdateRequest,
    manager: dict = Depends(get_current_manager),
):
    venue = get_manager_venue(manager["id"])
    supabase = get_supabase()

    updates = payload.model_dump(exclude_unset=True)
    if updates:
        updates["venue_id"] = venue["id"]
        supabase.table("scheduling_rules").upsert(updates, on_conflict="venue_id").execute()

    cron_scheduler.refresh_jobs()
    return _config_out(venue["id"])


@router.post("/override", response_model=SchedulerOverrideResponse)
def set_override(
    payload: SchedulerOverrideRequest,
    manager: dict = Depends(get_current_manager),
):
    venue = get_manager_venue(manager["id"])
    supabase = get_supabase()

    try:
        week_monday = schedule_windows.monday_of(date.fromisoformat(payload.week_start))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid week_start")

    close_dt = schedule_windows.parse(payload.close_at)
    if close_dt is None:
        raise HTTPException(status_code=400, detail="Invalid close_at")

    earliest = notice_window.earliest_minutes_for_venue(venue["id"])
    if earliest is None:
        raise HTTPException(status_code=400, detail="Add at least one shift before overriding a close time.")

    hours = schedule_windows.notice_hours(close_dt, week_monday, earliest)
    if hours < schedule_windows.LEGAL_NOTICE_HOURS and not payload.confirm:
        # Don't save — let the frontend surface the legal-minimum risk popup and
        # come back with confirm=true.
        return SchedulerOverrideResponse(
            status="needs_confirm",
            notice_hours=round(hours, 1),
            legal_notice_hours=schedule_windows.LEGAL_NOTICE_HOURS,
        )

    supabase.table("schedule_week_overrides").upsert(
        {
            "venue_id": venue["id"],
            "week_start": week_monday.isoformat(),
            "close_at": close_dt.strftime(FMT),
        },
        on_conflict="venue_id,week_start",
    ).execute()

    supabase.table("activity_log").insert(
        {
            "venue_id": venue["id"],
            "action": "close_time_overridden",
            "detail": (
                f"Close time for week of {week_monday.isoformat()} set to "
                f"{close_dt.strftime('%a %d %b, %H:%M')} ({round(hours)}h notice)"
            ),
        }
    ).execute()

    cron_scheduler.refresh_jobs()
    return SchedulerOverrideResponse(status="saved", notice_hours=round(hours, 1), config=_config_out(venue["id"]))


@router.delete("/override", response_model=SchedulerConfigOut)
def clear_override(
    week_start: str = Query(...),
    manager: dict = Depends(get_current_manager),
):
    venue = get_manager_venue(manager["id"])
    supabase = get_supabase()

    try:
        week_monday = schedule_windows.monday_of(date.fromisoformat(week_start))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid week_start")

    supabase.table("schedule_week_overrides").delete().eq("venue_id", venue["id"]).eq(
        "week_start", week_monday.isoformat()
    ).execute()

    cron_scheduler.refresh_jobs()
    return _config_out(venue["id"])
