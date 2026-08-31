from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from config import get_settings
from database import get_supabase
from models.schemas import (
    RemindRequest,
    RemindResponse,
    StaffApproveRequest,
    StaffCreateRequest,
    StaffManagerOut,
    StaffUpdateRequest,
)
from services import email_service, lifecycle, notice_window, schedule_windows
from services.auth_service import get_current_manager, get_manager_venue
from services.pin_service import generate_unique_pin

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


def _primary_role_id(venue_id: str, role_name: str) -> Optional[str]:
    supabase = get_supabase()
    res = (
        supabase.table("roles")
        .select("id")
        .eq("venue_id", venue_id)
        .eq("name", role_name)
        .limit(1)
        .execute()
    )
    return res.data[0]["id"] if res.data else None


def _sync_staff_roles(
    venue_id: str,
    staff_id: str,
    primary_role_name: str,
    role_ids: Optional[list[str]],
) -> None:
    """Keep the staff_roles M2M in step with a member's primary role and any
    explicit extra roles. Primary is always folded in so eligibility ⊇ primary.
    role_ids=None on update means "leave membership alone" (handled by caller);
    this is only invoked when membership should be (re)written."""
    supabase = get_supabase()
    wanted: set[str] = set(role_ids or [])
    primary_id = _primary_role_id(venue_id, primary_role_name)
    if primary_id:
        wanted.add(primary_id)
    # Only keep ids that are real roles of this venue.
    if wanted:
        valid = (
            supabase.table("roles")
            .select("id")
            .eq("venue_id", venue_id)
            .in_("id", list(wanted))
            .execute()
            .data
        )
        wanted = {r["id"] for r in valid}
    supabase.table("staff_roles").delete().eq("staff_id", staff_id).execute()
    if wanted:
        supabase.table("staff_roles").insert(
            [{"staff_id": staff_id, "role_id": rid} for rid in wanted]
        ).execute()


def _read_role_ids(staff_id: str) -> list[str]:
    supabase = get_supabase()
    rows = (
        supabase.table("staff_roles").select("role_id").eq("staff_id", staff_id).execute().data
    )
    return [r["role_id"] for r in rows]


def _generate_unique_pin(venue_id: str) -> str:
    return generate_unique_pin(get_supabase(), venue_id)


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

    # Eligible-role membership (staff_roles) for every member, in one query.
    role_ids_by_staff: dict[str, list[str]] = {}
    if staff:
        sr = (
            supabase.table("staff_roles")
            .select("staff_id, role_id")
            .in_("staff_id", [m["id"] for m in staff])
            .execute()
            .data
        )
        for row in sr:
            role_ids_by_staff.setdefault(row["staff_id"], []).append(row["role_id"])

    for member in staff:
        member["submitted"] = member["id"] in submitted_staff_ids if period_id else None
        member["role_ids"] = role_ids_by_staff.get(member["id"], [])

    return staff


def _assert_unique_name(supabase, venue_id: str, name: str, exclude_id: Optional[str] = None) -> str:
    """Team-member names are unique per venue, case-insensitively ("Priya" ==
    "priYa"), so a manager never ends up with two indistinguishable people.
    Trims and returns the cleaned name. Only the live roster (is_active) is
    checked — a soft-deleted name frees up for reuse."""
    cleaned = (name or "").strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Enter a name")
    rows = (
        supabase.table("staff_members")
        .select("id,name")
        .eq("venue_id", venue_id)
        .eq("is_active", True)
        .execute()
        .data
        or []
    )
    target = cleaned.lower()
    for r in rows:
        if r["id"] == exclude_id:
            continue
        if (r.get("name") or "").strip().lower() == target:
            raise HTTPException(status_code=409, detail=f"You already have someone named {r['name']}.")
    return cleaned


@router.post("", response_model=StaffManagerOut)
def create_staff(payload: StaffCreateRequest, manager: dict = Depends(get_current_manager)):
    venue = get_manager_venue(manager["id"])
    supabase = get_supabase()

    name = _assert_unique_name(supabase, venue["id"], payload.name)
    pin = _generate_unique_pin(venue["id"])

    staff = (
        supabase.table("staff_members")
        .insert(
            {
                "venue_id": venue["id"],
                "name": name,
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

    _sync_staff_roles(venue["id"], staff["id"], payload.role, payload.role_ids)

    if staff.get("email"):
        email_service.send_staff_welcome_email(
            to_email=staff["email"],
            name=staff["name"],
            venue_name=venue["name"],
            pin=pin,
            venue_link_url=f"{get_settings().frontend_url}/v/{venue['link_token']}",
        )

    staff["submitted"] = None
    staff["role_ids"] = _read_role_ids(staff["id"])
    return staff


@router.post("/{staff_id}/approve", response_model=StaffManagerOut)
def approve_staff(
    staff_id: str,
    payload: StaffApproveRequest,
    manager: dict = Depends(get_current_manager),
):
    """Confirm a self-registered member: set their real role + U18 (defaults
    were pre-filled from the join), fold in eligible roles, and activate them —
    one tap flips pending=false so the solver can now schedule them."""
    venue = get_manager_venue(manager["id"])
    existing = _get_staff_or_404(venue["id"], staff_id)
    if not existing.get("pending"):
        raise HTTPException(status_code=400, detail="This person has already been approved")
    supabase = get_supabase()

    staff = (
        supabase.table("staff_members")
        .update(
            {
                "role": payload.role,
                "is_under_18": payload.is_under_18,
                "pending": False,
                "is_active": True,
            }
        )
        .eq("id", staff_id)
        .execute()
        .data[0]
    )

    _sync_staff_roles(venue["id"], staff_id, payload.role, payload.role_ids)

    supabase.table("activity_log").insert(
        {
            "venue_id": venue["id"],
            "staff_id": staff_id,
            "action": "staff_approved",
            "detail": f"{staff['name']} was approved and added to the team",
        }
    ).execute()

    staff["submitted"] = None
    staff["role_ids"] = _read_role_ids(staff_id)
    return staff


@router.post("/{staff_id}/reject")
def reject_staff(staff_id: str, manager: dict = Depends(get_current_manager)):
    """Discard a pending self-registration. Soft-delete (is_active=false) so the
    PIN stops working and the row leaves every roster; pending is cleared so it
    can never resurface in the approvals surface. Their availability rows, if
    any, are harmless — the solver already ignores inactive members."""
    venue = get_manager_venue(manager["id"])
    existing = _get_staff_or_404(venue["id"], staff_id)
    if not existing.get("pending"):
        raise HTTPException(status_code=400, detail="This person isn't awaiting approval")
    supabase = get_supabase()

    supabase.table("staff_members").update({"is_active": False, "pending": False}).eq(
        "id", staff_id
    ).execute()

    supabase.table("activity_log").insert(
        {
            "venue_id": venue["id"],
            "staff_id": staff_id,
            "action": "staff_rejected",
            "detail": f"{existing['name']}'s join request was declined",
        }
    ).execute()

    return {"status": "ok"}


@router.put("/{staff_id}", response_model=StaffManagerOut)
def update_staff(
    staff_id: str,
    payload: StaffUpdateRequest,
    manager: dict = Depends(get_current_manager),
):
    venue = get_manager_venue(manager["id"])
    existing = _get_staff_or_404(venue["id"], staff_id)
    supabase = get_supabase()

    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}
    # role_ids lives in the staff_roles join, not on staff_members — pull it out
    # of the column update so it never reaches the table write.
    role_ids_provided = "role_ids" in updates
    role_ids = updates.pop("role_ids", None)

    # Renames respect the same case-insensitive per-venue uniqueness (excluding self).
    if "name" in updates:
        updates["name"] = _assert_unique_name(supabase, venue["id"], updates["name"], exclude_id=staff_id)

    staff = existing
    if updates:
        staff = (
            supabase.table("staff_members")
            .update(updates)
            .eq("id", staff_id)
            .execute()
            .data[0]
        )

    primary_role = updates.get("role", existing["role"])
    if role_ids_provided:
        # Explicit membership replaces whatever was there (primary folded in).
        _sync_staff_roles(venue["id"], staff_id, primary_role, role_ids)
    elif "role" in updates:
        # Primary role changed with no explicit list: add the new primary to
        # the existing eligible set rather than wiping the extras.
        _sync_staff_roles(
            venue["id"], staff_id, primary_role, _read_role_ids(staff_id)
        )

    staff["submitted"] = None
    staff["role_ids"] = _read_role_ids(staff_id)
    return staff


@router.delete("/{staff_id}")
def delete_staff(staff_id: str, manager: dict = Depends(get_current_manager)):
    venue = get_manager_venue(manager["id"])
    _get_staff_or_404(venue["id"], staff_id)
    supabase = get_supabase()

    supabase.table("staff_members").update({"is_active": False}).eq("id", staff_id).execute()
    return {"status": "ok"}


@router.post("/{staff_id}/erase")
def erase_staff(staff_id: str, manager: dict = Depends(get_current_manager)):
    """Right-to-erasure (UK GDPR Art 17): irreversibly anonymise a staff
    member's personal data — name, email, phone, PIN — and scrub their name
    from historical activity_log detail, while keeping the row so rota/leave
    history stays referentially intact. Distinct from delete (deactivation):
    this cannot be undone."""
    venue = get_manager_venue(manager["id"])
    _get_staff_or_404(venue["id"], staff_id)
    supabase = get_supabase()

    lifecycle.anonymise_staff(supabase, venue["id"], staff_id)

    # Logged AFTER the scrub so this row (which names no one) survives it.
    supabase.table("activity_log").insert(
        {
            "venue_id": venue["id"],
            "action": "staff_erased",
            "detail": "A staff member's personal data was erased on request",
        }
    ).execute()

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

    # Pending self-registrants are excluded, the same as every other
    # assignable-roster query (solver, give/swap targets, copy-previous). They
    # are `is_active=true, pending=true`, so an is_active filter alone would
    # email people the manager hasn't approved onto the team — and would return
    # a "reminded N" count larger than the list of names the manager just saw.
    active = (
        supabase.table("staff_members")
        .select("id, name, email, pin")
        .eq("venue_id", venue["id"])
        .eq("is_active", True)
        .eq("pending", False)
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
