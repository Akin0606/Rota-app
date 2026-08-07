from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from config import get_settings
from database import get_supabase
from models.schemas import (
    RemindRequest,
    RemindResponse,
    StaffCreateRequest,
    StaffManagerOut,
    StaffUpdateRequest,
)
from services import email_service, notice_window, schedule_windows
from services.auth_service import get_current_manager, get_manager_venue
from services.pin_service import generate_pin

router = APIRouter(prefix="/api/staff", tags=["staff"])


def _get_staff_or_404(venue_id: str, staff_id: str) -> dict:
    supabase = get_supabase()
    res = (
        supabase.table("staff_members")
        .select("*")
        .eq("id", staff_id)
        .eq("venue_id", venue_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Staff member not found")
    return res.data[0]


def _generate_unique_pin(venue_id: str) -> str:
    supabase = get_supabase()
    for _ in range(10):
        candidate = generate_pin()
        clash = (
            supabase.table("staff_members")
            .select("id")
            .eq("venue_id", venue_id)
            .eq("pin", candidate)
            .limit(1)
            .execute()
        )
        if not clash.data:
            return candidate
    raise HTTPException(status_code=500, detail="Could not generate a unique PIN, please try again")


@router.get("", response_model=list[StaffManagerOut])
def list_staff(
    period_id: Optional[str] = Query(default=None),
    manager: dict = Depends(get_current_manager),
):
    venue = get_manager_venue(manager["id"])
    supabase = get_supabase()
    staff = (
        supabase.table("staff_members")
        .select("*")
        .eq("venue_id", venue["id"])
        .order("created_at")
        .execute()
        .data
    )

    submitted_staff_ids: set[str] = set()
    if period_id:
        subs = (
            supabase.table("availability_submissions")
            .select("staff_id")
            .eq("period_id", period_id)
            .execute()
            .data
        )
        submitted_staff_ids = {s["staff_id"] for s in subs}

    for member in staff:
        member["submitted"] = member["id"] in submitted_staff_ids if period_id else None

    return staff


@router.post("", response_model=StaffManagerOut)
def create_staff(payload: StaffCreateRequest, manager: dict = Depends(get_current_manager)):
    venue = get_manager_venue(manager["id"])
    supabase = get_supabase()

    pin = _generate_unique_pin(venue["id"])

    staff = (
        supabase.table("staff_members")
        .insert(
            {
                "venue_id": venue["id"],
                "name": payload.name,
                "email": payload.email,
                "phone": payload.phone,
                "role": payload.role,
                "pin": pin,
                "is_under_18": payload.is_under_18,
            }
        )
        .execute()
        .data[0]
    )

    supabase.table("activity_log").insert(
        {
            "venue_id": venue["id"],
            "staff_id": staff["id"],
            "action": "staff_added",
            "detail": f"{staff['name']} was added to the team",
        }
    ).execute()

    if staff.get("email"):
        email_service.send_staff_welcome_email(
            to_email=staff["email"],
            name=staff["name"],
            venue_name=venue["name"],
            pin=pin,
            venue_link_url=f"{get_settings().frontend_url}/v/{venue['link_token']}",
        )

    staff["submitted"] = None
    return staff


@router.put("/{staff_id}", response_model=StaffManagerOut)
def update_staff(
    staff_id: str,
    payload: StaffUpdateRequest,
    manager: dict = Depends(get_current_manager),
):
    venue = get_manager_venue(manager["id"])
    _get_staff_or_404(venue["id"], staff_id)
    supabase = get_supabase()

    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}
    if not updates:
        return _get_staff_or_404(venue["id"], staff_id) | {"submitted": None}

    staff = (
        supabase.table("staff_members")
        .update(updates)
        .eq("id", staff_id)
        .execute()
        .data[0]
    )
    staff["submitted"] = None
    return staff


@router.delete("/{staff_id}")
def delete_staff(staff_id: str, manager: dict = Depends(get_current_manager)):
    venue = get_manager_venue(manager["id"])
    _get_staff_or_404(venue["id"], staff_id)
    supabase = get_supabase()

    supabase.table("staff_members").update({"is_active": False}).eq("id", staff_id).execute()
    return {"status": "ok"}


@router.post("/{staff_id}/reset-pin", response_model=StaffManagerOut)
def reset_pin(staff_id: str, manager: dict = Depends(get_current_manager)):
    venue = get_manager_venue(manager["id"])
    staff = _get_staff_or_404(venue["id"], staff_id)
    supabase = get_supabase()

    new_pin = _generate_unique_pin(venue["id"])
    updated = (
        supabase.table("staff_members")
        .update({"pin": new_pin})
        .eq("id", staff_id)
        .execute()
        .data[0]
    )

    supabase.table("activity_log").insert(
        {
            "venue_id": venue["id"],
            "staff_id": staff_id,
            "action": "pin_reset",
            "detail": f"{staff['name']}'s PIN was reset",
        }
    ).execute()

    if updated.get("email"):
        email_service.send_pin_reset_email(
            to_email=updated["email"],
            name=updated["name"],
            venue_name=venue["name"],
            pin=new_pin,
            venue_link_url=f"{get_settings().frontend_url}/v/{venue['link_token']}",
        )

    updated["submitted"] = None
    return updated


def _reminder_context(venue: dict, period_id: Optional[str]) -> tuple[str, str]:
    """Best-effort week/deadline copy for the reminder email. Falls back to
    generic wording if no period context is available."""
    if not period_id:
        return "this week", "soon"

    supabase = get_supabase()
    period_res = (
        supabase.table("availability_periods")
        .select("week_start")
        .eq("id", period_id)
        .limit(1)
        .execute()
    )
    if not period_res.data:
        return "this week", "soon"

    week_start = date.fromisoformat(str(period_res.data[0]["week_start"]))
    week_label = f"w/c {week_start.strftime('%d %b %Y')}"

    # The close deadline is derived from this week's notice window.
    deadline_label = (
        schedule_windows.format_deadline_dt(notice_window.close_for_week(venue["id"], week_start))
        or "soon"
    )

    return week_label, deadline_label


@router.post("/remind", response_model=RemindResponse)
def remind(payload: RemindRequest, manager: dict = Depends(get_current_manager)):
    venue = get_manager_venue(manager["id"])
    supabase = get_supabase()

    active = (
        supabase.table("staff_members")
        .select("id, name, email, pin")
        .eq("venue_id", venue["id"])
        .eq("is_active", True)
        .execute()
        .data
    )

    if payload.staff_id:
        targets = [m for m in active if m["id"] == payload.staff_id]
    elif payload.period_id:
        subs = (
            supabase.table("availability_submissions")
            .select("staff_id")
            .eq("period_id", payload.period_id)
            .execute()
            .data
        )
        submitted_ids = {s["staff_id"] for s in subs}
        targets = [m for m in active if m["id"] not in submitted_ids]
    else:
        targets = active

    if targets:
        detail = (
            f"Reminded {targets[0]['name']}"
            if len(targets) == 1
            else f"Reminded {len(targets)} staff who haven't submitted"
        )
        supabase.table("activity_log").insert(
            {
                "venue_id": venue["id"],
                "staff_id": targets[0]["id"] if len(targets) == 1 else None,
                "action": "reminder_sent",
                "detail": detail,
            }
        ).execute()

    week_label, deadline_label = _reminder_context(venue, payload.period_id)
    venue_link_url = f"{get_settings().frontend_url}/v/{venue['link_token']}"

    sent_count = 0
    for member in targets:
        if not member.get("email"):
            continue
        result = email_service.send_availability_reminder_email(
            to_email=member["email"],
            name=member["name"],
            venue_name=venue["name"],
            week_label=week_label,
            venue_link_url=venue_link_url,
            deadline_label=deadline_label,
            pin=member["pin"],
        )
        if result.get("status") == "sent":
            sent_count += 1

    return {"reminded": len(targets), "email_sent": sent_count > 0}
