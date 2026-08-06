from fastapi import APIRouter, Depends

from database import get_supabase
from models.schemas import SchedulingRulesOut, SchedulingRulesUpdateRequest
from services import cron_scheduler, schedule_windows
from services.auth_service import get_current_manager, get_manager_venue

router = APIRouter(prefix="/api/rules", tags=["rules"])

DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _normalise_dt(value):
    """Store datetimes as a consistent naive wall-clock string."""
    dt = schedule_windows.parse(value)
    return dt.strftime(schedule_windows.FMT) if dt else None


def _legacy_from_closes(closes_at: str | None) -> dict:
    """Derive the legacy avail_closes_day/time from the real close datetime, so
    the staff-facing deadline copy stays accurate without a schema change."""
    dt = schedule_windows.parse(closes_at)
    if not dt:
        return {}
    return {
        "avail_closes_day": DAY_NAMES[dt.weekday()],
        "avail_closes_time": dt.strftime("%H:%M"),
    }


def _with_defaults(row: dict) -> dict:
    """Ensure the window datetimes are populated (older rows may predate them)
    and normalised for the frontend picker."""
    defaults = schedule_windows.default_window()
    for key in ("avail_opens_at", "avail_reminder_at", "avail_closes_at"):
        row[key] = _normalise_dt(row.get(key)) or defaults[key]
    return row


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
        return _with_defaults(res.data[0])

    return {
        "max_hours_per_week": 48,
        "min_rest_hours": 11,
        **schedule_windows.default_window(),
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
    for key in ("avail_opens_at", "avail_reminder_at", "avail_closes_at"):
        if key in updates:
            updates[key] = _normalise_dt(updates[key])

    # Keep the legacy day/time in sync with the real close datetime.
    if updates.get("avail_closes_at"):
        updates.update(_legacy_from_closes(updates["avail_closes_at"]))

    updates["venue_id"] = venue["id"]

    result = (
        supabase.table("scheduling_rules")
        .upsert(updates, on_conflict="venue_id")
        .execute()
        .data[0]
    )

    cron_scheduler.refresh_jobs()

    return _with_defaults(result)
