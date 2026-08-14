from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query

from database import get_supabase
from models.schemas import (
    LeaveDecisionRequest,
    LeaveRequestCancelRequest,
    LeaveRequestCreateRequest,
    LeaveRequestOut,
    LeaveRequestPinRequest,
    LeaveAllowanceOut,
    LeaveRequestsOut,
)
from routers.availability import _get_staff_by_pin, _get_venue_or_404
from services import leave
from services.auth_service import get_current_manager, get_manager_venue

router = APIRouter(prefix="/api/leave", tags=["leave"])


def _to_out(
    row: dict,
    staff_name: str,
    conflicting_assignments: int = 0,
    working_days_per_week: float = leave.DEFAULT_WORKING_DAYS_PER_WEEK,
) -> LeaveRequestOut:
    return LeaveRequestOut(
        id=row["id"],
        staff_id=row["staff_id"],
        staff_name=staff_name,
        start_date=str(row["start_date"]),
        end_date=str(row["end_date"]),
        status=row["status"],
        reason=row.get("reason"),
        manager_note=row.get("manager_note"),
        created_at=str(row["created_at"]),
        decided_at=str(row["decided_at"]) if row.get("decided_at") else None,
        conflicting_assignments=conflicting_assignments,
        days=leave.leave_days_for_range(
            str(row["start_date"]), str(row["end_date"]), working_days_per_week
        ),
    )


def _validate_range(start_date: str, end_date: str) -> tuple[date, date]:
    try:
        start = date.fromisoformat(start_date)
        end = date.fromisoformat(end_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date")
    if end < start:
        raise HTTPException(status_code=400, detail="End date must be on or after the start date")
    if start < date.today():
        raise HTTPException(status_code=400, detail="Leave can't be requested for a date that's already passed")
    return start, end


# ---------------------------------------------------------------------------
# Staff-facing (PIN auth)
# ---------------------------------------------------------------------------


@router.post("/{venue_token}/request", response_model=LeaveRequestOut)
def request_leave(venue_token: str, payload: LeaveRequestCreateRequest):
    venue = _get_venue_or_404(venue_token)
    staff = _get_staff_by_pin(venue["id"], payload.pin)
    start, end = _validate_range(payload.start_date, payload.end_date)

    supabase = get_supabase()

    # Block overlapping requests against this staff member's own other
    # non-resolved requests, so they can't stack contradictory ranges.
    existing = (
        supabase.table("leave_requests")
        .select("start_date, end_date")
        .eq("staff_id", staff["id"])
        .in_("status", ["pending", "approved"])
        .execute()
        .data
    )
    for r in existing:
        r_start = date.fromisoformat(str(r["start_date"]))
        r_end = date.fromisoformat(str(r["end_date"]))
        if start <= r_end and r_start <= end:
            raise HTTPException(status_code=400, detail="This overlaps a request you've already made")

    row = (
        supabase.table("leave_requests")
        .insert(
            {
                "venue_id": venue["id"],
                "staff_id": staff["id"],
                "start_date": start.isoformat(),
                "end_date": end.isoformat(),
                "reason": payload.reason,
                "status": "pending",
            }
        )
        .execute()
        .data[0]
    )

    label = start.isoformat() if start == end else f"{start.isoformat()} to {end.isoformat()}"
    supabase.table("activity_log").insert(
        {
            "venue_id": venue["id"],
            "staff_id": staff["id"],
            "action": "leave_requested",
            "detail": f"{staff['name']} requested leave for {label}",
        }
    ).execute()

    return _to_out(
        row,
        staff["name"],
        working_days_per_week=staff.get("working_days_per_week") or leave.DEFAULT_WORKING_DAYS_PER_WEEK,
    )


@router.post("/{venue_token}/mine", response_model=LeaveRequestsOut)
def my_leave_requests(venue_token: str, payload: LeaveRequestPinRequest):
    venue = _get_venue_or_404(venue_token)
    staff = _get_staff_by_pin(venue["id"], payload.pin)

    supabase = get_supabase()
    rows = (
        supabase.table("leave_requests")
        .select("*")
        .eq("staff_id", staff["id"])
        .order("start_date", desc=True)
        .execute()
        .data
    )
    w = staff.get("working_days_per_week") or leave.DEFAULT_WORKING_DAYS_PER_WEEK
    return LeaveRequestsOut(
        requests=[_to_out(r, staff["name"], working_days_per_week=w) for r in rows],
        allowance=LeaveAllowanceOut(**leave.allowance_for_staff(supabase, venue, staff)),
    )


@router.post("/{venue_token}/cancel", response_model=LeaveRequestOut)
def cancel_leave(venue_token: str, payload: LeaveRequestCancelRequest):
    venue = _get_venue_or_404(venue_token)
    staff = _get_staff_by_pin(venue["id"], payload.pin)

    supabase = get_supabase()
    res = (
        supabase.table("leave_requests")
        .select("*")
        .eq("id", payload.request_id)
        .eq("staff_id", staff["id"])
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Leave request not found")
    row = res.data[0]

    if row["status"] not in ("pending", "approved"):
        raise HTTPException(status_code=400, detail="This request has already been resolved")
    if row["status"] == "approved" and date.fromisoformat(str(row["start_date"])) < date.today():
        raise HTTPException(status_code=400, detail="Can't cancel leave that's already started")

    updated = (
        supabase.table("leave_requests")
        .update({"status": "cancelled"})
        .eq("id", row["id"])
        .execute()
        .data[0]
    )

    supabase.table("activity_log").insert(
        {
            "venue_id": venue["id"],
            "staff_id": staff["id"],
            "action": "leave_cancelled",
            "detail": f"{staff['name']} cancelled their leave request for {row['start_date']} to {row['end_date']}",
        }
    ).execute()

    return _to_out(
        updated,
        staff["name"],
        working_days_per_week=staff.get("working_days_per_week") or leave.DEFAULT_WORKING_DAYS_PER_WEEK,
    )


# ---------------------------------------------------------------------------
# Manager-facing (Supabase auth)
# ---------------------------------------------------------------------------


@router.get("", response_model=LeaveRequestsOut)
def list_leave_requests(
    status: str | None = Query(default=None),
    manager: dict = Depends(get_current_manager),
):
    venue = get_manager_venue(manager["id"])
    supabase = get_supabase()

    query = supabase.table("leave_requests").select("*").eq("venue_id", venue["id"])
    if status:
        query = query.eq("status", status)
    rows = query.order("created_at", desc=True).execute().data

    staff_ids = list({r["staff_id"] for r in rows})
    names_by_id: dict[str, str] = {}
    days_by_id: dict[str, float] = {}
    if staff_ids:
        staff_rows = (
            supabase.table("staff_members")
            .select("id, name, working_days_per_week")
            .in_("id", staff_ids)
            .execute()
            .data
        )
        names_by_id = {s["id"]: s["name"] for s in staff_rows}
        days_by_id = {
            s["id"]: float(s.get("working_days_per_week") or leave.DEFAULT_WORKING_DAYS_PER_WEEK)
            for s in staff_rows
        }

    out = []
    for r in rows:
        conflicts = 0
        if r["status"] in ("pending", "approved"):
            conflicts = leave.conflicting_assignment_count(
                supabase, venue["id"], r["staff_id"], str(r["start_date"]), str(r["end_date"])
            )
        out.append(
            _to_out(
                r,
                names_by_id.get(r["staff_id"], "Staff member"),
                conflicts,
                working_days_per_week=days_by_id.get(
                    r["staff_id"], leave.DEFAULT_WORKING_DAYS_PER_WEEK
                ),
            )
        )

    return LeaveRequestsOut(requests=out)


def _decide(request_id: str, manager: dict, payload: LeaveDecisionRequest, new_status: str, action: str) -> LeaveRequestOut:
    venue = get_manager_venue(manager["id"])
    supabase = get_supabase()

    res = (
        supabase.table("leave_requests")
        .select("*")
        .eq("id", request_id)
        .eq("venue_id", venue["id"])
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Leave request not found")
    row = res.data[0]
    if row["status"] != "pending":
        raise HTTPException(status_code=400, detail="This request has already been resolved")

    from datetime import datetime

    updated = (
        supabase.table("leave_requests")
        .update(
            {
                "status": new_status,
                "manager_note": payload.manager_note,
                "decided_at": datetime.utcnow().isoformat(),
            }
        )
        .eq("id", row["id"])
        .execute()
        .data[0]
    )

    staff_res = (
        supabase.table("staff_members")
        .select("name, working_days_per_week")
        .eq("id", row["staff_id"])
        .limit(1)
        .execute()
    )
    staff_name = staff_res.data[0]["name"] if staff_res.data else "Staff member"
    staff_days = (
        float(staff_res.data[0].get("working_days_per_week") or leave.DEFAULT_WORKING_DAYS_PER_WEEK)
        if staff_res.data
        else leave.DEFAULT_WORKING_DAYS_PER_WEEK
    )

    verb = "approved" if new_status == "approved" else "rejected"
    supabase.table("activity_log").insert(
        {
            "venue_id": venue["id"],
            "staff_id": row["staff_id"],
            "action": action,
            "detail": f"{staff_name}'s leave request for {row['start_date']} to {row['end_date']} was {verb}",
        }
    ).execute()

    conflicts = 0
    if new_status == "approved":
        conflicts = leave.conflicting_assignment_count(
            supabase, venue["id"], row["staff_id"], str(row["start_date"]), str(row["end_date"])
        )

    return _to_out(updated, staff_name, conflicts, working_days_per_week=staff_days)


@router.post("/{request_id}/approve", response_model=LeaveRequestOut)
def approve_leave(request_id: str, payload: LeaveDecisionRequest, manager: dict = Depends(get_current_manager)):
    return _decide(request_id, manager, payload, "approved", "leave_approved")


@router.post("/{request_id}/reject", response_model=LeaveRequestOut)
def reject_leave(request_id: str, payload: LeaveDecisionRequest, manager: dict = Depends(get_current_manager)):
    return _decide(request_id, manager, payload, "rejected", "leave_rejected")
