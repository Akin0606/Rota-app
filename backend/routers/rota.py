from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Response

from config import get_settings
from database import get_supabase
from models.schemas import (
    AssignmentEditRequest,
    AssignmentEditResponse,
    ClaimActionOut,
    ClaimApproveRequest,
    ClaimOut,
    EmailDeliveryOut,
    OpenShiftCreateRequest,
    PeriodClaimsOut,
    PeriodSubmissionsOut,
    PeriodSwapsOut,
    RotaEmailRequest,
    RotaSummaryOut,
    SubmissionEntryOut,
    SwapActionOut,
    SwapApproveRequest,
    SwapOut,
)
from services import email_service, leave, notice_window, rota_export, schedule_windows, swap_guard
from services.auth_service import get_current_manager, get_manager_venue
from services.solver import (
    AVAILABLE,
    DAY_NAMES,
    PREFERRED,
    check_manual_assignment,
    generate_rota,
    shift_duration_hours,
)

router = APIRouter(prefix="/api/rota", tags=["rota"])

VALID_ORIENTATIONS = ("staff-rows", "day-rows")


def _gather_export_data(
    venue_id: str, period_id: str, week_start: str
) -> tuple[list[dict], list[dict], list[dict], dict[str, set[int]]]:
    """Shifts (by sort_order), active staff (by name, with role + under-18 for
    the export's role grouping and U18 tag), assignments, and the same
    leave-blocked-days map the rota matrix uses — the shared input for
    PDF/Excel export, the on-screen Image view, and the rota emails."""
    supabase = get_supabase()
    shifts = sorted(
        supabase.table("shifts").select("*").eq("venue_id", venue_id).execute().data,
        key=lambda s: (s.get("sort_order", 0), s.get("name", "")),
    )
    staff = sorted(
        supabase.table("staff_members")
        .select("id, name, email, role, is_under_18")
        .eq("venue_id", venue_id)
        .eq("is_active", True)
        .execute()
        .data,
        key=lambda s: s.get("name", "").lower(),
    )
    assignments = (
        supabase.table("rota_assignments")
        .select("staff_id, day_index, shift_id")
        .eq("period_id", period_id)
        .execute()
        .data
    )
    leave_days = leave.blocked_days_for_week(supabase, venue_id, week_start)
    return shifts, staff, assignments, leave_days


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


def _build_summary(
    venue_id: str,
    period: dict,
    warnings: list[str] | None = None,
    info: list[str] | None = None,
) -> dict:
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
        if a["shift_id"] in shifts_by_id and a["staff_id"]
    )

    # A slot is "demanded" if at least one person marked themselves
    # available/preferred for it — that's the only signal we have for which
    # (day, shift) combinations the venue actually needs covering.
    demand_slots = {
        (s["day_index"], s["shift_id"])
        for s in submissions
        if s["shift_id"] and s["status"] in (AVAILABLE, PREFERRED)
    }
    # A manager-posted open shift (staff_id null) hasn't actually been picked
    # up by anyone yet, so it doesn't count as real coverage — otherwise it'd
    # vanish from uncovered/under-covered the instant it's posted, instead of
    # showing as "posted, waiting to be claimed" until someone actually claims it.
    assigned_count: dict[tuple, int] = {}
    for a in assignments:
        if not a["staff_id"]:
            continue
        key = (a["day_index"], a["shift_id"])
        assigned_count[key] = assigned_count.get(key, 0) + 1

    # Two distinct conflict types, kept separate so the builder can surface both:
    #  - uncovered:      demanded slot with nobody assigned at all.
    #  - under_covered:  demanded slot with some cover, but below the shift's
    #                    min_staff.
    uncovered = []
    under_covered = []
    for (d, shid) in sorted(demand_slots):
        count = assigned_count.get((d, shid), 0)
        required = int((shifts_by_id.get(shid) or {}).get("min_staff", 1) or 0)
        if count == 0:
            uncovered.append({"day_index": d, "shift_id": shid})
        elif count < required:
            under_covered.append(
                {"day_index": d, "shift_id": shid, "assigned": count, "required": required}
            )

    leave_blocked = leave.blocked_days_for_week(supabase, venue_id, str(period["week_start"]))

    return {
        "period_id": period["id"],
        "status": period["status"],
        "assignments": assignments,
        "total_hours": round(total_hours, 1),
        "conflicts": len(uncovered) + len(under_covered),
        "uncovered": uncovered,
        "under_covered": under_covered,
        "leave": {sid: sorted(days) for sid, days in leave_blocked.items()},
        "warnings": warnings or [],
        "info": info or [],
    }


@router.get("/{period_id}", response_model=RotaSummaryOut)
def get_rota(period_id: str, manager: dict = Depends(get_current_manager)):
    venue = get_manager_venue(manager["id"])
    period = _get_period_or_404(venue["id"], period_id)
    return _build_summary(venue["id"], period)


@router.get("/{period_id}/submissions", response_model=PeriodSubmissionsOut)
def get_submissions(period_id: str, manager: dict = Depends(get_current_manager)):
    """Read-only view of every staff member's submitted availability for a
    period, so a manager can see what's actually been submitted (not just the
    submitted/pending flag) and spot stale rows."""
    venue = get_manager_venue(manager["id"])
    period = _get_period_or_404(venue["id"], period_id)
    supabase = get_supabase()

    staff_names = {
        s["id"]: s["name"]
        for s in supabase.table("staff_members")
        .select("id, name")
        .eq("venue_id", venue["id"])
        .execute()
        .data
    }

    rows = (
        supabase.table("availability_submissions")
        .select("staff_id, day_index, shift_id, status, note")
        .eq("period_id", period["id"])
        .execute()
        .data
    )

    submissions = [
        SubmissionEntryOut(
            staff_id=r["staff_id"],
            staff_name=staff_names.get(r["staff_id"], "Unknown"),
            day_index=r["day_index"],
            shift_id=r["shift_id"],
            status=r["status"],
            note=r["note"],
        )
        for r in rows
    ]

    return PeriodSubmissionsOut(period_id=period["id"], submissions=submissions)


@router.delete("/{period_id}/submissions/{staff_id}", response_model=RotaSummaryOut)
def clear_submission(
    period_id: str,
    staff_id: str,
    manager: dict = Depends(get_current_manager),
):
    """Clears a single staff member's whole availability submission for a
    period (matches how staff submit — wholesale replace, not per-cell).
    Returns the recomputed summary so the caller's conflict count reflects
    the clear immediately, without a separate re-fetch."""
    venue = get_manager_venue(manager["id"])
    period = _get_period_or_404(venue["id"], period_id)
    supabase = get_supabase()

    # Venue-scoped lookup first — a cross-tenant staff_id must never be
    # actionable, and must never even reveal whether it exists.
    staff_res = (
        supabase.table("staff_members")
        .select("id, name")
        .eq("id", staff_id)
        .eq("venue_id", venue["id"])
        .limit(1)
        .execute()
    )
    if not staff_res.data:
        raise HTTPException(status_code=404, detail="Staff member not found")
    staff = staff_res.data[0]

    supabase.table("availability_submissions").delete().eq("period_id", period["id"]).eq(
        "staff_id", staff_id
    ).execute()

    supabase.table("activity_log").insert(
        {
            "venue_id": venue["id"],
            "staff_id": staff_id,
            "action": "availability_cleared",
            "detail": f"Cleared {staff['name']}'s availability submission for week of {period['week_start']}",
        }
    ).execute()

    return _build_summary(venue["id"], period)


def _get_claims(venue_id: str, period_id: str) -> list[dict]:
    supabase = get_supabase()
    rows = (
        supabase.table("rota_assignments")
        .select("id, day_index, shift_id, staff_id, claim_staff_id, claim_reason")
        .eq("period_id", period_id)
        .eq("drop_status", "pending_approval")
        .execute()
        .data
    )
    if not rows:
        return []

    staff_ids = {r["staff_id"] for r in rows} | {r["claim_staff_id"] for r in rows}
    names = {
        s["id"]: s["name"]
        for s in supabase.table("staff_members")
        .select("id, name")
        .eq("venue_id", venue_id)
        .in_("id", list(staff_ids))
        .execute()
        .data
    }

    return [
        {
            "assignment_id": r["id"],
            "day_index": r["day_index"],
            "shift_id": r["shift_id"],
            "original_staff_id": r["staff_id"],
            "original_staff_name": names.get(r["staff_id"], "Unknown"),
            "claimant_staff_id": r["claim_staff_id"],
            "claimant_staff_name": names.get(r["claim_staff_id"], "Unknown"),
            "reason": r["claim_reason"],
        }
        for r in rows
    ]


@router.get("/{period_id}/claims", response_model=PeriodClaimsOut)
def get_claims(period_id: str, manager: dict = Depends(get_current_manager)):
    venue = get_manager_venue(manager["id"])
    _get_period_or_404(venue["id"], period_id)
    return PeriodClaimsOut(period_id=period_id, claims=_get_claims(venue["id"], period_id))


@router.post("/{period_id}/claims/{assignment_id}/approve", response_model=ClaimActionOut)
def approve_claim(
    period_id: str,
    assignment_id: str,
    payload: ClaimApproveRequest,
    manager: dict = Depends(get_current_manager),
):
    """Re-runs check_manual_assignment against the claimant before committing
    — state may have drifted since the claim was submitted (e.g. the
    claimant picked up other shifts in the meantime) — and reuses the same
    needs_confirm/risk-popup gate as a manual manager edit for adult-rule
    breaches. Under-18 violations are always rejected outright."""
    venue = get_manager_venue(manager["id"])
    period = _get_period_or_404(venue["id"], period_id)
    supabase = get_supabase()

    assignment_res = (
        supabase.table("rota_assignments")
        .select("*")
        .eq("id", assignment_id)
        .eq("period_id", period_id)
        .eq("drop_status", "pending_approval")
        .limit(1)
        .execute()
    )
    if not assignment_res.data:
        raise HTTPException(status_code=404, detail="Claim not found")
    assignment = assignment_res.data[0]
    claimant_id = assignment["claim_staff_id"]

    claimant_res = (
        supabase.table("staff_members")
        .select("id, name, is_under_18")
        .eq("id", claimant_id)
        .eq("venue_id", venue["id"])
        .limit(1)
        .execute()
    )
    if not claimant_res.data:
        raise HTTPException(status_code=404, detail="Claimant not found")
    claimant = claimant_res.data[0]

    shifts_by_id = {
        s["id"]: s for s in supabase.table("shifts").select("*").eq("venue_id", venue["id"]).execute().data
    }
    shift = shifts_by_id.get(assignment["shift_id"])
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    other_assignments = (
        supabase.table("rota_assignments")
        .select("day_index, shift_id")
        .eq("period_id", period_id)
        .eq("staff_id", claimant_id)
        .neq("day_index", assignment["day_index"])
        .execute()
        .data
    )

    rules_res = (
        supabase.table("scheduling_rules")
        .select("max_hours_per_week, min_rest_hours, require_day_off")
        .eq("venue_id", venue["id"])
        .limit(1)
        .execute()
    )
    rules = rules_res.data[0] if rules_res.data else {
        "max_hours_per_week": 48,
        "min_rest_hours": 11,
        "require_day_off": True,
    }

    check = check_manual_assignment(claimant, assignment["day_index"], shift, other_assignments, shifts_by_id, rules)

    if check["severity"] == "block":
        raise HTTPException(status_code=400, detail=check["reason"])

    if check["severity"] == "confirm" and not payload.confirm:
        return ClaimActionOut(
            status="needs_confirm", reason=check["reason"], claims=_get_claims(venue["id"], period_id)
        )

    # Enforce one-shift-per-day for the claimant before handing them the
    # claimed shift.
    supabase.table("rota_assignments").delete().eq("period_id", period_id).eq(
        "staff_id", claimant_id
    ).eq("day_index", assignment["day_index"]).neq("id", assignment["id"]).execute()

    supabase.table("rota_assignments").update(
        {
            "staff_id": claimant_id,
            "drop_status": None,
            "dropped_at": None,
            "claim_staff_id": None,
            "claim_reason": None,
            "manually_assigned": True,
        }
    ).eq("id", assignment["id"]).execute()

    supabase.table("activity_log").insert(
        {
            "venue_id": venue["id"],
            "staff_id": claimant_id,
            "action": "shift_claim_approved",
            "detail": (
                f"Approved {claimant['name']}'s claim on the {DAY_NAMES[assignment['day_index']]} shift "
                f"for week of {period['week_start']}."
            ),
        }
    ).execute()

    return ClaimActionOut(
        status="approved",
        summary=_build_summary(venue["id"], period),
        claims=_get_claims(venue["id"], period_id),
    )


@router.post("/{period_id}/claims/{assignment_id}/reject", response_model=ClaimActionOut)
def reject_claim(period_id: str, assignment_id: str, manager: dict = Depends(get_current_manager)):
    venue = get_manager_venue(manager["id"])
    period = _get_period_or_404(venue["id"], period_id)
    supabase = get_supabase()

    assignment_res = (
        supabase.table("rota_assignments")
        .select("*")
        .eq("id", assignment_id)
        .eq("period_id", period_id)
        .eq("drop_status", "pending_approval")
        .limit(1)
        .execute()
    )
    if not assignment_res.data:
        raise HTTPException(status_code=404, detail="Claim not found")
    assignment = assignment_res.data[0]

    # Reverts to pending_pickup (still open in the pool) rather than clearing
    # the drop entirely — the original person doesn't have to re-drop it for
    # someone else to try.
    supabase.table("rota_assignments").update(
        {"drop_status": "pending_pickup", "claim_staff_id": None, "claim_reason": None}
    ).eq("id", assignment["id"]).execute()

    supabase.table("activity_log").insert(
        {
            "venue_id": venue["id"],
            "staff_id": assignment["claim_staff_id"],
            "action": "shift_claim_rejected",
            "detail": "Manager rejected a shift claim — shift returned to the open pool.",
        }
    ).execute()

    return ClaimActionOut(
        status="rejected",
        summary=_build_summary(venue["id"], period),
        claims=_get_claims(venue["id"], period_id),
    )


def _get_swaps(venue_id: str, period_id: str) -> list[dict]:
    supabase = get_supabase()
    rows = (
        supabase.table("shift_swaps")
        .select("*")
        .eq("venue_id", venue_id)
        .eq("period_id", period_id)
        .eq("status", "pending_approval")
        .execute()
        .data
    )
    if not rows:
        return []

    assignment_ids = {r["initiator_assignment_id"] for r in rows} | {r["recipient_assignment_id"] for r in rows}
    assignments = {
        a["id"]: a
        for a in supabase.table("rota_assignments").select("id, day_index, shift_id").in_("id", list(assignment_ids)).execute().data
    }

    staff_ids = {r["initiator_staff_id"] for r in rows} | {r["recipient_staff_id"] for r in rows}
    names = {
        s["id"]: s["name"]
        for s in supabase.table("staff_members").select("id, name").eq("venue_id", venue_id).in_("id", list(staff_ids)).execute().data
    }

    out = []
    for r in rows:
        initiator_a = assignments.get(r["initiator_assignment_id"])
        recipient_a = assignments.get(r["recipient_assignment_id"])
        if not initiator_a or not recipient_a:
            continue
        out.append(
            {
                "id": r["id"],
                "initiator_staff_id": r["initiator_staff_id"],
                "initiator_staff_name": names.get(r["initiator_staff_id"], "Unknown"),
                "initiator_day_index": initiator_a["day_index"],
                "initiator_shift_id": initiator_a["shift_id"],
                "recipient_staff_id": r["recipient_staff_id"],
                "recipient_staff_name": names.get(r["recipient_staff_id"], "Unknown"),
                "recipient_day_index": recipient_a["day_index"],
                "recipient_shift_id": recipient_a["shift_id"],
                "reason": r["reason"],
            }
        )
    return out


@router.get("/{period_id}/swaps", response_model=PeriodSwapsOut)
def get_swaps(period_id: str, manager: dict = Depends(get_current_manager)):
    venue = get_manager_venue(manager["id"])
    _get_period_or_404(venue["id"], period_id)
    return PeriodSwapsOut(period_id=period_id, swaps=_get_swaps(venue["id"], period_id))


@router.post("/{period_id}/swaps/{swap_id}/approve", response_model=SwapActionOut)
def approve_swap(
    period_id: str,
    swap_id: str,
    payload: SwapApproveRequest,
    manager: dict = Depends(get_current_manager),
):
    """Re-runs both check_manual_assignment calls against current state before
    committing — state may have drifted since the swap was accepted (e.g.
    either party picked up other shifts in the meantime) — same
    needs_confirm/risk-popup gate and re-check-at-approval-time pattern as
    approve_claim. The worse of the two sides still governs."""
    venue = get_manager_venue(manager["id"])
    period = _get_period_or_404(venue["id"], period_id)
    supabase = get_supabase()

    swap_res = (
        supabase.table("shift_swaps")
        .select("*")
        .eq("id", swap_id)
        .eq("period_id", period_id)
        .eq("status", "pending_approval")
        .limit(1)
        .execute()
    )
    if not swap_res.data:
        raise HTTPException(status_code=404, detail="Swap not found")
    swap = swap_res.data[0]

    initiator_res = (
        supabase.table("staff_members")
        .select("id, name, is_under_18")
        .eq("id", swap["initiator_staff_id"])
        .eq("venue_id", venue["id"])
        .limit(1)
        .execute()
    )
    recipient_res = (
        supabase.table("staff_members")
        .select("id, name, is_under_18")
        .eq("id", swap["recipient_staff_id"])
        .eq("venue_id", venue["id"])
        .limit(1)
        .execute()
    )
    if not initiator_res.data or not recipient_res.data:
        raise HTTPException(status_code=404, detail="Staff member not found")
    initiator = initiator_res.data[0]
    recipient = recipient_res.data[0]

    initiator_assignment_res = (
        supabase.table("rota_assignments").select("*").eq("id", swap["initiator_assignment_id"]).limit(1).execute()
    )
    recipient_assignment_res = (
        supabase.table("rota_assignments").select("*").eq("id", swap["recipient_assignment_id"]).limit(1).execute()
    )
    if not initiator_assignment_res.data or not recipient_assignment_res.data:
        raise HTTPException(status_code=404, detail="One of the shifts in this swap no longer exists")
    initiator_assignment = initiator_assignment_res.data[0]
    recipient_assignment = recipient_assignment_res.data[0]

    shifts_by_id = {
        s["id"]: s for s in supabase.table("shifts").select("*").eq("venue_id", venue["id"]).execute().data
    }
    initiator_shift = shifts_by_id.get(initiator_assignment["shift_id"])
    recipient_shift = shifts_by_id.get(recipient_assignment["shift_id"])
    if not initiator_shift or not recipient_shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    initiator_other = (
        supabase.table("rota_assignments")
        .select("day_index, shift_id")
        .eq("period_id", period_id)
        .eq("staff_id", initiator["id"])
        .neq("day_index", initiator_assignment["day_index"])
        .execute()
        .data
    )
    recipient_other = (
        supabase.table("rota_assignments")
        .select("day_index, shift_id")
        .eq("period_id", period_id)
        .eq("staff_id", recipient["id"])
        .neq("day_index", recipient_assignment["day_index"])
        .execute()
        .data
    )

    rules_res = (
        supabase.table("scheduling_rules")
        .select("max_hours_per_week, min_rest_hours, require_day_off")
        .eq("venue_id", venue["id"])
        .limit(1)
        .execute()
    )
    rules = rules_res.data[0] if rules_res.data else {
        "max_hours_per_week": 48,
        "min_rest_hours": 11,
        "require_day_off": True,
    }

    check_a = check_manual_assignment(
        initiator, recipient_assignment["day_index"], recipient_shift, initiator_other, shifts_by_id, rules
    )
    check_b = check_manual_assignment(
        recipient, initiator_assignment["day_index"], initiator_shift, recipient_other, shifts_by_id, rules
    )

    block_reasons = [c["reason"] for c in (check_a, check_b) if c["severity"] == "block"]
    if block_reasons:
        raise HTTPException(status_code=400, detail="; ".join(block_reasons))

    confirm_reasons = [c["reason"] for c in (check_a, check_b) if c["severity"] == "confirm"]
    if confirm_reasons and not payload.confirm:
        return SwapActionOut(
            status="needs_confirm",
            reason="; ".join(confirm_reasons),
            swaps=_get_swaps(venue["id"], period_id),
        )

    from datetime import datetime

    swap_guard.execute_swap(period_id, initiator_assignment, recipient_assignment)
    supabase.table("shift_swaps").update(
        {"status": "approved", "resolved_at": datetime.utcnow().isoformat()}
    ).eq("id", swap["id"]).execute()

    supabase.table("activity_log").insert(
        {
            "venue_id": venue["id"],
            "action": "shift_swap_approved",
            "detail": f"Manager approved {initiator['name']} and {recipient['name']}'s shift swap.",
        }
    ).execute()

    return SwapActionOut(
        status="approved",
        summary=_build_summary(venue["id"], period),
        swaps=_get_swaps(venue["id"], period_id),
    )


@router.post("/{period_id}/swaps/{swap_id}/reject", response_model=SwapActionOut)
def reject_swap(period_id: str, swap_id: str, manager: dict = Depends(get_current_manager)):
    """Rejects a pending swap. Neither rota_assignments row was ever touched,
    so unlike a claim-reject there's nothing to revert there — just marks the
    swap itself as rejected."""
    venue = get_manager_venue(manager["id"])
    period = _get_period_or_404(venue["id"], period_id)
    supabase = get_supabase()

    swap_res = (
        supabase.table("shift_swaps")
        .select("*")
        .eq("id", swap_id)
        .eq("period_id", period_id)
        .eq("status", "pending_approval")
        .limit(1)
        .execute()
    )
    if not swap_res.data:
        raise HTTPException(status_code=404, detail="Swap not found")
    swap = swap_res.data[0]

    from datetime import datetime

    supabase.table("shift_swaps").update(
        {"status": "rejected", "resolved_at": datetime.utcnow().isoformat()}
    ).eq("id", swap["id"]).execute()

    supabase.table("activity_log").insert(
        {
            "venue_id": venue["id"],
            "action": "shift_swap_rejected",
            "detail": "Manager rejected a shift swap.",
        }
    ).execute()

    return SwapActionOut(
        status="rejected",
        summary=_build_summary(venue["id"], period),
        swaps=_get_swaps(venue["id"], period_id),
    )


def run_solver_for_period(venue: dict, period: dict, *, note: str = "") -> dict:
    """Runs the CP-SAT solver for a venue's period and persists the result.
    Shared by the manager-facing generate endpoint and the admin console's
    manual-trigger action."""
    period_id = period["id"]
    supabase = get_supabase()

    staff = (
        supabase.table("staff_members")
        .select("id, name, is_under_18")
        .eq("venue_id", venue["id"])
        .eq("is_active", True)
        # Self-registered members awaiting approval are never scheduled — an
        # unconfirmed under-18 must not be assignable. This is the hard safety
        # gate for §3; the matrix/manual-add paths guard separately.
        .eq("pending", False)
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

    # Nothing to schedule if no one has marked themselves available/preferred
    # for an actual shift. Return early with a clear warning instead of wiping
    # any existing assignments and silently producing an empty rota.
    has_real_availability = any(
        s.get("shift_id") and s["status"] in (AVAILABLE, PREFERRED) for s in submissions
    )
    if not has_real_availability:
        return _build_summary(
            venue["id"],
            period,
            warnings=["No availability has been submitted yet — there's nothing to schedule."],
        )

    rules_res = (
        supabase.table("scheduling_rules")
        .select("max_hours_per_week, min_rest_hours, require_day_off")
        .eq("venue_id", venue["id"])
        .limit(1)
        .execute()
    )
    rules = rules_res.data[0] if rules_res.data else {
        "max_hours_per_week": 48,
        "min_rest_hours": 11,
        "require_day_off": True,
    }

    leave_blocked = leave.blocked_days_for_week(supabase, venue["id"], str(period["week_start"]))
    result = generate_rota(staff, shifts, submissions, rules, leave_days=leave_blocked)

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
    return _build_summary(
        venue["id"], updated_period, warnings=result["warnings"], info=result.get("info", [])
    )


@router.post("/{period_id}/generate", response_model=RotaSummaryOut)
def generate(period_id: str, manager: dict = Depends(get_current_manager)):
    venue = get_manager_venue(manager["id"])
    period = _get_period_or_404(venue["id"], period_id)
    return run_solver_for_period(venue, period)


@router.post("/{period_id}/copy-previous", response_model=RotaSummaryOut)
def copy_previous(period_id: str, manager: dict = Depends(get_current_manager)):
    """Copies the venue's most recent earlier rota (any period with
    assignments) into this one, staff/shifts that no longer exist skipped.
    Only allowed onto an empty period — this is a clean-slate copy, not a
    merge. Doesn't re-run compliance checks (same as solver output), so any
    conflicts show up the normal way on review before publish."""
    venue = get_manager_venue(manager["id"])
    period = _get_period_or_404(venue["id"], period_id)
    supabase = get_supabase()

    existing = (
        supabase.table("rota_assignments").select("id").eq("period_id", period_id).limit(1).execute()
    )
    if existing.data:
        raise HTTPException(status_code=400, detail="This week already has assignments")

    earlier_periods = (
        supabase.table("availability_periods")
        .select("id, week_start")
        .eq("venue_id", venue["id"])
        .lt("week_start", str(period["week_start"]))
        .order("week_start", desc=True)
        .execute()
        .data
    )

    source_assignments = None
    for candidate in earlier_periods:
        rows = (
            supabase.table("rota_assignments")
            .select("staff_id, day_index, shift_id")
            .eq("period_id", candidate["id"])
            .execute()
            .data
        )
        if rows:
            source_assignments = rows
            break

    if not source_assignments:
        raise HTTPException(status_code=404, detail="No previous rota to copy from")

    active_staff_ids = {
        s["id"]
        for s in supabase.table("staff_members")
        .select("id")
        .eq("venue_id", venue["id"])
        .eq("is_active", True)
        .eq("pending", False)
        .execute()
        .data
    }
    valid_shift_ids = {s["id"] for s in supabase.table("shifts").select("id").eq("venue_id", venue["id"]).execute().data}

    rows = [
        {
            "period_id": period_id,
            "staff_id": a["staff_id"],
            "day_index": a["day_index"],
            "shift_id": a["shift_id"],
            "manually_assigned": True,
        }
        for a in source_assignments
        if a["staff_id"] in active_staff_ids and a["shift_id"] in valid_shift_ids
    ]
    if rows:
        supabase.table("rota_assignments").insert(rows).execute()

    supabase.table("availability_periods").update({"status": "generated"}).eq("id", period_id).execute()

    supabase.table("activity_log").insert(
        {
            "venue_id": venue["id"],
            "action": "rota_generated",
            "detail": f"Rota for week of {period['week_start']} copied from the previous week",
        }
    ).execute()

    updated_period = {**period, "status": "generated"}
    warnings = (
        ["Some staff or shifts from the previous rota no longer exist and were skipped."]
        if len(rows) < len(source_assignments)
        else []
    )
    return _build_summary(venue["id"], updated_period, warnings=warnings)


@router.put("/{period_id}/assignments", response_model=AssignmentEditResponse)
def edit_assignment(
    period_id: str,
    payload: AssignmentEditRequest,
    manager: dict = Depends(get_current_manager),
):
    venue = get_manager_venue(manager["id"])
    period = _get_period_or_404(venue["id"], period_id)
    supabase = get_supabase()

    if payload.action == "remove":
        # Removing can only improve compliance, so no rule-checking. No extra
        # ownership check needed either: period_id is already venue-scoped, so
        # a foreign staff_id/shift_id simply matches zero rows. Still must not
        # silently delete a row that's the subject of a pending swap — the
        # swap would be left pointing at a row that no longer exists.
        target_rows = (
            supabase.table("rota_assignments")
            .select("id")
            .eq("period_id", period_id)
            .eq("staff_id", payload.staff_id)
            .eq("day_index", payload.day_index)
            .eq("shift_id", payload.shift_id)
            .execute()
            .data
        )
        if swap_guard.active_swaps_for_assignments([r["id"] for r in target_rows]):
            raise HTTPException(
                status_code=400, detail="This shift has a swap pending — resolve it before removing"
            )
        supabase.table("rota_assignments").delete().eq("period_id", period_id).eq(
            "staff_id", payload.staff_id
        ).eq("day_index", payload.day_index).eq("shift_id", payload.shift_id).execute()
        return AssignmentEditResponse(status="saved", summary=_build_summary(venue["id"], period))

    # Venue-scoped lookups first — a cross-tenant staff_id or shift_id must
    # never be assignable, and must never even reveal whether it exists.
    staff_res = (
        supabase.table("staff_members")
        .select("id, name, is_under_18, pending")
        .eq("id", payload.staff_id)
        .eq("venue_id", venue["id"])
        .limit(1)
        .execute()
    )
    if not staff_res.data:
        raise HTTPException(status_code=404, detail="Staff member not found")
    staff = staff_res.data[0]
    # A pending self-registrant can't be manually assigned either — approve them
    # first. Defends the manual-add path the same way the solver query is guarded.
    if staff.get("pending"):
        raise HTTPException(status_code=400, detail="Approve this person before adding them to the rota")

    shifts_by_id = {
        s["id"]: s for s in supabase.table("shifts").select("*").eq("venue_id", venue["id"]).execute().data
    }
    shift = shifts_by_id.get(payload.shift_id)
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    # This staff's other assignments in the period — excluding day_index,
    # since an add always clears that day first — so the check judges the
    # POST-add state of their week, not a stale pre-add snapshot.
    other_assignments = (
        supabase.table("rota_assignments")
        .select("day_index, shift_id")
        .eq("period_id", period_id)
        .eq("staff_id", payload.staff_id)
        .neq("day_index", payload.day_index)
        .execute()
        .data
    )

    rules_res = (
        supabase.table("scheduling_rules")
        .select("max_hours_per_week, min_rest_hours, require_day_off")
        .eq("venue_id", venue["id"])
        .limit(1)
        .execute()
    )
    rules = rules_res.data[0] if rules_res.data else {
        "max_hours_per_week": 48,
        "min_rest_hours": 11,
        "require_day_off": True,
    }

    leave_blocked = leave.blocked_days_for_week(supabase, venue["id"], str(period["week_start"]))
    on_leave = payload.day_index in leave_blocked.get(payload.staff_id, set())

    check = check_manual_assignment(
        staff, payload.day_index, shift, other_assignments, shifts_by_id, rules, on_leave=on_leave
    )

    # Under-18 violations are a hard block — no override, regardless of confirm.
    if check["severity"] == "block":
        raise HTTPException(status_code=400, detail=check["reason"])

    # Adult violations go through the same needs_confirm/confirm gate as the
    # scheduler's other risk popups — managers keep discretion here.
    if check["severity"] == "confirm" and not payload.confirm:
        return AssignmentEditResponse(status="needs_confirm", reason=check["reason"])

    # Enforce one shift per staff per day: clear any existing assignment for
    # this staff on this day before adding the new one — but never a row
    # that's the subject of a pending swap for this staff member.
    same_day_rows = (
        supabase.table("rota_assignments")
        .select("id")
        .eq("period_id", period_id)
        .eq("staff_id", payload.staff_id)
        .eq("day_index", payload.day_index)
        .execute()
        .data
    )
    if swap_guard.active_swaps_for_assignments([r["id"] for r in same_day_rows]):
        raise HTTPException(
            status_code=400,
            detail="This staff member has a swap pending on that day — resolve it before reassigning",
        )

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

    if check["severity"] == "confirm":
        supabase.table("activity_log").insert(
            {
                "venue_id": venue["id"],
                "staff_id": payload.staff_id,
                "action": "manual_assignment_override",
                "detail": check["reason"],
            }
        ).execute()

    return AssignmentEditResponse(status="saved", summary=_build_summary(venue["id"], period))


@router.post("/{period_id}/assignments/open", response_model=RotaSummaryOut)
def post_open_shift(
    period_id: str,
    payload: OpenShiftCreateRequest,
    manager: dict = Depends(get_current_manager),
):
    """Posts an uncovered/under-staffed slot as claimable by any staff member,
    without assigning it to anyone first — the same pending_pickup pool a
    staff-initiated drop feeds, just entering it from the manager's side.
    `required_role` is an explicit choice: set it to only let a matching role
    auto-approve on claim (same as a like-for-like drop claim), or leave it
    unset to let anyone claim outright."""
    venue = get_manager_venue(manager["id"])
    period = _get_period_or_404(venue["id"], period_id)
    supabase = get_supabase()

    shifts_by_id = {
        s["id"]: s for s in supabase.table("shifts").select("id, name").eq("venue_id", venue["id"]).execute().data
    }
    shift = shifts_by_id.get(payload.shift_id)
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    supabase.table("rota_assignments").insert(
        {
            "period_id": period_id,
            "staff_id": None,
            "day_index": payload.day_index,
            "shift_id": payload.shift_id,
            "manually_assigned": True,
            "drop_status": "pending_pickup",
            "dropped_at": datetime.utcnow().isoformat(),
            "required_role": payload.required_role,
        }
    ).execute()

    supabase.table("activity_log").insert(
        {
            "venue_id": venue["id"],
            "action": "shift_posted_open",
            "detail": (
                f"Manager posted the {DAY_NAMES[payload.day_index]} {shift['name']} shift as open"
                + (f" — needs {payload.required_role}" if payload.required_role else " — any role")
            ),
        }
    ).execute()

    return _build_summary(venue["id"], period)


@router.delete("/{period_id}/assignments/open/{assignment_id}", response_model=RotaSummaryOut)
def cancel_open_shift(
    period_id: str,
    assignment_id: str,
    manager: dict = Depends(get_current_manager),
):
    """Withdraws a manager-posted open shift that nobody has claimed yet.
    Scoped to staff_id is null so this can never be used to delete a real
    assignment or a staff-initiated drop through this path."""
    venue = get_manager_venue(manager["id"])
    period = _get_period_or_404(venue["id"], period_id)
    supabase = get_supabase()

    res = (
        supabase.table("rota_assignments")
        .select("id")
        .eq("id", assignment_id)
        .eq("period_id", period_id)
        .is_("staff_id", "null")
        .eq("drop_status", "pending_pickup")
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="This open shift isn't there any more")

    supabase.table("rota_assignments").delete().eq("id", assignment_id).execute()

    return _build_summary(venue["id"], period)


def _send_published_rota_emails(
    venue: dict,
    period: dict,
    assignments: list[dict],
    attachment: dict | None = None,
) -> dict:
    """Emails each staff member the shifts they were assigned. Returns delivery
    stats ({sent, failed, skipped_no_email, errors}) so the caller can surface
    partial failures instead of them being silently swallowed. When `attachment`
    is provided (the branded rota PDF), it's attached to every email."""
    stats = {"sent": 0, "failed": 0, "skipped_no_email": 0, "errors": []}
    if not assignments:
        return stats

    supabase = get_supabase()
    settings = get_settings()

    shifts = supabase.table("shifts").select("*").eq("venue_id", venue["id"]).execute().data
    shifts_by_id = {s["id"]: s for s in shifts}

    staff_ids = list({a["staff_id"] for a in assignments})
    staff = (
        supabase.table("staff_members")
        .select("id, name, email")
        .eq("venue_id", venue["id"])
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
        if not member:
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

        if not member.get("email"):
            stats["skipped_no_email"] += 1
            continue

        result = email_service.send_published_rota_email(
            to_email=member["email"],
            name=member["name"],
            venue_name=venue["name"],
            week_label=week_label,
            shifts=shift_rows,
            rota_link_url=venue_link,
            attachments=[attachment] if attachment else None,
        )
        if result.get("status") == "sent":
            stats["sent"] += 1
        else:
            stats["failed"] += 1
            reason = result.get("error") or result.get("reason") or "unknown error"
            stats["errors"].append(f"{member['name']}: {reason}")

    return stats


@router.post("/{period_id}/publish", response_model=RotaSummaryOut)
def publish(period_id: str, manager: dict = Depends(get_current_manager)):
    """Publishing before the availability window has closed produces a
    provisional rota (status stays "published", staff can see it but it may
    still change); publishing after the window has closed goes straight to
    "confirmed". A provisional rota is promoted to confirmed automatically
    once its window closes — see confirm_published_periods_for_venue, swept
    from cron_scheduler.refresh_jobs()."""
    venue = get_manager_venue(manager["id"])
    period = _get_period_or_404(venue["id"], period_id)
    supabase = get_supabase()

    week_monday = date.fromisoformat(str(period["week_start"]))
    close_at = notice_window.close_for_week(venue["id"], week_monday)
    now = schedule_windows.now_london()
    window_closed = close_at is not None and close_at <= now
    new_status = "confirmed" if window_closed else "published"

    supabase.table("availability_periods").update({"status": new_status}).eq("id", period_id).execute()

    supabase.table("activity_log").insert(
        {
            "venue_id": venue["id"],
            "action": "rota_published",
            "detail": (
                f"Rota published for week of {period['week_start']}"
                + (" (confirmed — availability window already closed)" if window_closed else " (provisional — availability window still open)")
            ),
        }
    ).execute()

    updated_period = {**period, "status": new_status}
    summary = _build_summary(venue["id"], updated_period)

    summary["email"] = _send_published_rota_emails(venue, updated_period, summary["assignments"])

    return summary


@router.post("/{period_id}/unpublish", response_model=RotaSummaryOut)
def unpublish(period_id: str, manager: dict = Depends(get_current_manager)):
    """Pulls a published/confirmed rota back to "generated" — off the
    staff-facing view, assignments untouched, so a mistake can be fixed and
    re-published. Does not recall any "rota published" emails already sent,
    and does not undo any drop/claim/swap actions staff already took while it
    was live — those stay in place if the rota is re-published."""
    venue = get_manager_venue(manager["id"])
    period = _get_period_or_404(venue["id"], period_id)

    if period["status"] not in ("published", "confirmed"):
        raise HTTPException(status_code=400, detail="This rota isn't published")

    supabase = get_supabase()
    supabase.table("availability_periods").update({"status": "generated"}).eq("id", period_id).execute()

    supabase.table("activity_log").insert(
        {
            "venue_id": venue["id"],
            "action": "rota_unpublished",
            "detail": f"Rota for week of {period['week_start']} was unpublished",
        }
    ).execute()

    updated_period = {**period, "status": "generated"}
    return _build_summary(venue["id"], updated_period)


def confirm_published_periods_for_venue(venue: dict) -> list[dict]:
    """Promotes any provisional (status "published") period whose availability
    window has now closed to "confirmed". Swept from cron_scheduler.refresh_jobs()
    rather than scheduled as a precise one-shot job, since that already runs on
    every server startup (so a missed transition self-heals after a redeploy)
    and after every settings/weekly-close change — good enough cadence for what
    is purely a status label, without needing new scheduler plumbing."""
    supabase = get_supabase()
    published = (
        supabase.table("availability_periods")
        .select("*")
        .eq("venue_id", venue["id"])
        .eq("status", "published")
        .execute()
        .data
    )
    if not published:
        return []

    now = schedule_windows.now_london()
    confirmed = []
    for period in published:
        week_monday = date.fromisoformat(str(period["week_start"]))
        close_at = notice_window.close_for_week(venue["id"], week_monday)
        if close_at is None or close_at > now:
            continue

        supabase.table("availability_periods").update({"status": "confirmed"}).eq("id", period["id"]).execute()
        supabase.table("activity_log").insert(
            {
                "venue_id": venue["id"],
                "action": "rota_confirmed",
                "detail": f"Rota for week of {period['week_start']} is now confirmed — availability window closed",
            }
        ).execute()
        confirmed.append(period)

    return confirmed


def _normalise_orientation(orientation: str) -> str:
    return orientation if orientation in VALID_ORIENTATIONS else "staff-rows"


def _export_filename(venue: dict, period: dict, ext: str) -> str:
    week = str(period["week_start"])
    slug = "".join(c if c.isalnum() else "-" for c in venue["name"].lower()).strip("-") or "rota"
    return f"{slug}-rota-{week}.{ext}"


@router.get("/{period_id}/export.pdf")
def export_pdf(
    period_id: str,
    orientation: str = Query("staff-rows"),
    manager: dict = Depends(get_current_manager),
):
    venue = get_manager_venue(manager["id"])
    period = _get_period_or_404(venue["id"], period_id)
    shifts, staff, assignments, leave_days = _gather_export_data(
        venue["id"], period_id, str(period["week_start"])
    )
    pdf = rota_export.build_rota_pdf(
        venue_name=venue["name"],
        week_start=date.fromisoformat(str(period["week_start"])),
        shifts=shifts,
        staff=staff,
        assignments=assignments,
        leave=leave_days,
        orientation=_normalise_orientation(orientation),
    )
    filename = _export_filename(venue, period, "pdf")
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{period_id}/export.xlsx")
def export_xlsx(
    period_id: str,
    orientation: str = Query("staff-rows"),
    manager: dict = Depends(get_current_manager),
):
    venue = get_manager_venue(manager["id"])
    period = _get_period_or_404(venue["id"], period_id)
    shifts, staff, assignments, leave_days = _gather_export_data(
        venue["id"], period_id, str(period["week_start"])
    )
    xlsx = rota_export.build_rota_xlsx(
        venue_name=venue["name"],
        week_start=date.fromisoformat(str(period["week_start"])),
        shifts=shifts,
        staff=staff,
        assignments=assignments,
        leave=leave_days,
        orientation=_normalise_orientation(orientation),
    )
    filename = _export_filename(venue, period, "xlsx")
    return Response(
        content=xlsx,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{period_id}/email", response_model=EmailDeliveryOut)
def email_rota(
    period_id: str,
    payload: RotaEmailRequest,
    manager: dict = Depends(get_current_manager),
):
    """Emails the current rota with the branded PDF attached, either to all
    staff (each gets their own shifts) or to the manager (full rota). Used by
    the publish options panel."""
    venue = get_manager_venue(manager["id"])
    period = _get_period_or_404(venue["id"], period_id)
    settings = get_settings()

    shifts, staff, assignments, leave_days = _gather_export_data(
        venue["id"], period_id, str(period["week_start"])
    )
    orientation = _normalise_orientation(payload.orientation)
    week_start = date.fromisoformat(str(period["week_start"]))
    pdf = rota_export.build_rota_pdf(
        venue_name=venue["name"],
        week_start=week_start,
        shifts=shifts,
        staff=staff,
        assignments=assignments,
        leave=leave_days,
        orientation=orientation,
    )
    attachment = email_service.pdf_attachment(_export_filename(venue, period, "pdf"), pdf)
    week_label = f"w/c {week_start.strftime('%d %b %Y')}"

    if payload.target == "manager":
        result = email_service.send_manager_rota_email(
            to_email=venue["manager_email"],
            venue_name=venue["name"],
            week_label=week_label,
            total_shifts=len(assignments),
            dashboard_link_url=f"{settings.frontend_url}/rota",
            attachments=[attachment],
        )
        if result.get("status") == "sent":
            return EmailDeliveryOut(sent=1)
        return EmailDeliveryOut(
            failed=1, errors=[result.get("error") or result.get("reason") or "unknown error"]
        )

    stats = _send_published_rota_emails(venue, period, assignments, attachment=attachment)
    return EmailDeliveryOut(**stats)
