"""Shared guard against a rota_assignments row being deleted or reassigned by
some OTHER write path (drop, give, claim, edit_assignment) while it's tied up
in an active shift swap. Every path that deletes/reassigns a rota_assignments
row not already known-safe by construction must check this first — same
"every write path" principle as the compliance checks in solver.py."""

from database import get_supabase

ACTIVE_STATUSES = ("pending_response", "pending_approval")


def active_swaps_for_assignments(assignment_ids: list[str]) -> dict[str, dict]:
    """Returns {assignment_id: swap_row} for any of the given ids that are
    currently the initiator or recipient side of a non-terminal swap."""
    ids = [a for a in assignment_ids if a]
    if not ids:
        return {}

    supabase = get_supabase()
    id_list = ",".join(ids)
    rows = (
        supabase.table("shift_swaps")
        .select("id, initiator_assignment_id, recipient_assignment_id, status")
        .in_("status", list(ACTIVE_STATUSES))
        .or_(f"initiator_assignment_id.in.({id_list}),recipient_assignment_id.in.({id_list})")
        .execute()
        .data
    )

    result: dict[str, dict] = {}
    ids_set = set(ids)
    for r in rows:
        if r["initiator_assignment_id"] in ids_set:
            result[r["initiator_assignment_id"]] = r
        if r["recipient_assignment_id"] in ids_set:
            result[r["recipient_assignment_id"]] = r
    return result


def execute_swap(period_id: str, initiator_assignment: dict, recipient_assignment: dict) -> None:
    """Flips staff_id on both assignment rows so each person ends up on the
    other's shift. Defensively clears any OTHER pre-existing same-day row for
    either person first (mirrors claim/give's one-shift-per-day defensive
    delete) — but excludes BOTH swap rows from that clear. Without that
    exclusion, a same-day swap (e.g. trading who works Monday-Day vs
    Monday-Evening) would have each row's day_index match the other row,
    making the defensive delete wipe out the very row it's about to update."""
    supabase = get_supabase()
    both_ids = [initiator_assignment["id"], recipient_assignment["id"]]

    supabase.table("rota_assignments").delete().eq("period_id", period_id).eq(
        "staff_id", initiator_assignment["staff_id"]
    ).eq("day_index", recipient_assignment["day_index"]).not_.in_("id", both_ids).execute()
    supabase.table("rota_assignments").delete().eq("period_id", period_id).eq(
        "staff_id", recipient_assignment["staff_id"]
    ).eq("day_index", initiator_assignment["day_index"]).not_.in_("id", both_ids).execute()

    supabase.table("rota_assignments").update(
        {"staff_id": initiator_assignment["staff_id"], "manually_assigned": True}
    ).eq("id", recipient_assignment["id"]).execute()
    supabase.table("rota_assignments").update(
        {"staff_id": recipient_assignment["staff_id"], "manually_assigned": True}
    ).eq("id", initiator_assignment["id"]).execute()
