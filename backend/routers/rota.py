from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException

from config import get_settings
from database import get_supabase
from models.schemas import AssignmentEditRequest, RotaSummaryOut
from services import email_service
from services.auth_service import get_current_manager, get_manager_venue
from services.solver import AVAILABLE, PREFERRED, generate_rota, shift_duration_hours

router = APIRouter(prefix="/api/rota", tags=["rota"])


def _get_period_or_404(venue_id: str, period_id: str) -> dict:
    supabase = get_supabase()
    res = (
        supabase.table("availability_periods")
        .select("*")
        .eq("id", period_id)
        .eq("venue_id", venue_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Period not found")
    return res.data[0]


def _build_summary(venue_id: str, period: dict, warnings: list[str] | None = None) -> dict:
    supabase = get_supabase()

    shifts = supabase.table("shifts").select("*").eq("venue_id", venue_id).execute().data
    shifts_by_id = {s["id"]: s for s in shifts}

    assignments = (
        supabase.table("rota_assignments")
        .select("*")
        .eq("period_id", period["id"])
        .execute()
        .data
    )

    submissions = (
        supabase.table("availability_submissions")
        .select("staff_id, day_index, shift_id, status")
        .eq("period_id", period["id"])
        .execute()
        .data
    )

    total_hours = sum(
        shift_duration_hours(shifts_by_id[a["shift_id"]])
        for a in assignments
        if a["shift_id"] in shifts_by_id
    )

    demand_slots = {
        (s["day_index"], s["shift_id"])
        for s in submissions
        if s["shift_id"] and s["status"] in (AVAILABLE, PREFERRED)
    }
    assigned_slots = {(a["day_index"], a["shift_id"]) for a in assignments}
    uncovered = [
        {"day_index": d, "shift_id": shid} for (d, shid) in sorted(demand_slots - assigned_slots)
    ]

    return {
        "period_id": period["id"],
        "status": period["status"],
        "assignments": assignments,
        "total_hours": round(total_hours, 1),
        "conflicts": len(uncovered),
        "uncovered": uncovered,
        "warnings": warnings or [],
    }


@router.get("/{period_id}", response_model=RotaSummaryOut)
def get_rota(period_id: str, manager: dict = Depends(get_current_manager)):
    venue = get_manager_venue(manager["id"])
    period = _get_period_or_404(venue["id"], period_id)
    return _build_summary(venue["id"], period)


def run_solver_for_period(venue: dict, period: dict, *, note: str = "") -> dict:
    """Runs the CP-SAT solver for a venue's period and persists the result.
    Shared by the manager-facing generate endpoint and the admin console's
    manual-trigger action."""
    period_id = period["id"]
    supabase = get_supabase()

    staff = (
        supabase.table("staff_members")
        .select("id")
        .eq("venue_id", venue["id"])
        .eq("is_active", True)
        .execute()
        .data
    )
    shifts = supabase.table("shifts").select("*").eq("venue_id", venue["id"]).execute().data
    submissions = (
        supabase.table("availability_submissions")
        .select("staff_id, day_index, shift_id, status")
        .eq("period_id", period_id)
        .execute()
        .data
    )
    rules_res = (
        supabase.table("scheduling_rules")
        .select("max_hours_per_week, min_rest_hours")
        .eq("venue_id", venue["id"])
        .limit(1)
        .execute()
    )
    rules = rules_res.data[0] if rules_res.data else {"max_hours_per_week": 48, "min_rest_hours": 11}

    result = generate_rota(staff, shifts, submissions, rules)

    # Replace solver-generated assignments, but preserve any manager overrides
    # from a previous manual-edit pass on this period.
    supabase.table("rota_assignments").delete().eq("period_id", period_id).eq(
        "manually_assigned", False
    ).execute()

    manual = (
        supabase.table("rota_assignments")
        .select("staff_id, day_index")
        .eq("period_id", period_id)
        .eq("manually_assigned", True)
        .execute()
        .data
    )
    manual_slots = {(m["staff_id"], m["day_index"]) for m in manual}

    rows = [
        {
            "period_id": period_id,
            "staff_id": a["staff_id"],
            "day_index": a["day_index"],
            "shift_id": a["shift_id"],
            "manually_assigned": False,
        }
        for a in result["assignments"]
        if (a["staff_id"], a["day_index"]) not in manual_slots
    ]
    if rows:
        supabase.table("rota_assignments").insert(rows).execute()

    supabase.table("availability_periods").update({"status": "generated"}).eq("id", period_id).execute()

    supabase.table("activity_log").insert(
        {
            "venue_id": venue["id"],
            "action": "rota_generated",
            "detail": f"Rota generated for week of {period['week_start']}{note}",
        }
    ).execute()

    updated_period = {**period, "status": "generated"}
    return _build_summary(venue["id"], updated_period, warnings=result["warnings"])


@router.post("/{period_id}/generate", response_model=RotaSummaryOut)
def generate(period_id: str, manager: dict = Depends(get_current_manager)):
    venue = get_manager_venue(manager["id"])
    period = _get_period_or_404(venue["id"], period_id)
    return run_solver_for_period(venue, period)


@router.put("/{period_id}/assignments", response_model=RotaSummaryOut)
def edit_assignment(
    period_id: str,
    payload: AssignmentEditRequest,
    manager: dict = Depends(get_current_manager),
):
    venue = get_manager_venue(manager["id"])
    period = _get_period_or_404(venue["id"], period_id)
    supabase = get_supabase()

    if payload.action == "remove":
        supabase.table("rota_assignments").delete().eq("period_id", period_id).eq(
            "staff_id", payload.staff_id
        ).eq("day_index", payload.day_index).eq("shift_id", payload.shift_id).execute()
    else:
        # Enforce one shift per staff per day: clear any existing assignment
        # for this staff on this day before adding the new one.
        supabase.table("rota_assignments").delete().eq("period_id", period_id).eq(
            "staff_id", payload.staff_id
        ).eq("day_index", payload.day_index).execute()

        supabase.table("rota_assignments").insert(
            {
                "period_id": period_id,
                "staff_id": payload.staff_id,
                "day_index": payload.day_index,
                "shift_id": payload.shift_id,
                "manually_assigned": True,
            }
        ).execute()

    return _build_summary(venue["id"], period)


def _send_published_rota_emails(venue: dict, period: dict, assignments: list[dict]) -> None:
    if not assignments:
        return

    supabase = get_supabase()
    settings = get_settings()

    shifts = supabase.table("shifts").select("*").eq("venue_id", venue["id"]).execute().data
    shifts_by_id = {s["id"]: s for s in shifts}

    staff_ids = list({a["staff_id"] for a in assignments})
    staff = (
        supabase.table("staff_members")
        .select("id, name, email")
        .in_("id", staff_ids)
        .execute()
        .data
    )
    staff_by_id = {s["id"]: s for s in staff}

    week_start = date.fromisoformat(str(period["week_start"]))
    week_label = f"w/c {week_start.strftime('%d %b %Y')}"
    venue_link = f"{settings.frontend_url}/v/{venue['link_token']}/rota"

    by_staff: dict[str, list[dict]] = {}
    for a in assignments:
        by_staff.setdefault(a["staff_id"], []).append(a)

    for staff_id, staff_assignments in by_staff.items():
        member = staff_by_id.get(staff_id)
        if not member or not member.get("email"):
            continue

        shift_rows = []
        for a in sorted(staff_assignments, key=lambda x: x["day_index"]):
            shift = shifts_by_id.get(a["shift_id"])
            if not shift:
                continue
            day_date = week_start + timedelta(days=a["day_index"])
            shift_rows.append(
                {
                    "day_label": f"{email_service.DAY_NAMES[a['day_index']]} {day_date.strftime('%d %b')}",
                    "shift_name": shift["name"],
                    "start_time": shift["start_time"],
                    "end_time": shift["end_time"],
                }
            )
        if not shift_rows:
            continue

        email_service.send_published_rota_email(
            to_email=member["email"],
            name=member["name"],
            venue_name=venue["name"],
            week_label=week_label,
            shifts=shift_rows,
            rota_link_url=venue_link,
        )


@router.post("/{period_id}/publish", response_model=RotaSummaryOut)
def publish(period_id: str, manager: dict = Depends(get_current_manager)):
    venue = get_manager_venue(manager["id"])
    period = _get_period_or_404(venue["id"], period_id)
    supabase = get_supabase()

    supabase.table("availability_periods").update({"status": "published"}).eq("id", period_id).execute()

    supabase.table("activity_log").insert(
        {
            "venue_id": venue["id"],
            "action": "rota_published",
            "detail": f"Rota published for week of {period['week_start']}",
        }
    ).execute()

    updated_period = {**period, "status": "published"}
    summary = _build_summary(venue["id"], updated_period)

    _send_published_rota_emails(venue, updated_period, summary["assignments"])

    return summary
