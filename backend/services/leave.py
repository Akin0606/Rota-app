"""Shared helpers for approved-leave lookups. Kept separate from the router so
the solver, the manual-add compliance check, and the rota grid's "On leave"
tag all read the exact same blocked-day computation."""

from datetime import date, timedelta


def blocked_days_for_week(supabase, venue_id: str, week_start: str) -> dict[str, set[int]]:
    """{staff_id: {day_index, ...}} for approved leave overlapping the 7-day
    week starting on week_start (a 'YYYY-MM-DD' Monday)."""
    monday = date.fromisoformat(week_start)
    week_dates = [monday + timedelta(days=i) for i in range(7)]

    requests = (
        supabase.table("leave_requests")
        .select("staff_id, start_date, end_date")
        .eq("venue_id", venue_id)
        .eq("status", "approved")
        .lte("start_date", week_dates[-1].isoformat())
        .gte("end_date", week_dates[0].isoformat())
        .execute()
        .data
    )

    blocked: dict[str, set[int]] = {}
    for r in requests:
        start = date.fromisoformat(r["start_date"])
        end = date.fromisoformat(r["end_date"])
        for i, d in enumerate(week_dates):
            if start <= d <= end:
                blocked.setdefault(r["staff_id"], set()).add(i)
    return blocked


def conflicting_assignment_count(supabase, venue_id: str, staff_id: str, start_date: str, end_date: str) -> int:
    """How many of this staff member's existing rota_assignments fall inside
    [start_date, end_date] — surfaced to the manager on approve, since
    approving leave never auto-removes assignments."""
    start = date.fromisoformat(start_date)
    end = date.fromisoformat(end_date)

    periods = (
        supabase.table("availability_periods")
        .select("id, week_start")
        .eq("venue_id", venue_id)
        .gte("week_start", (start - timedelta(days=6)).isoformat())
        .lte("week_start", end.isoformat())
        .execute()
        .data
    )
    if not periods:
        return 0

    week_start_by_id = {p["id"]: date.fromisoformat(str(p["week_start"])) for p in periods}
    assignments = (
        supabase.table("rota_assignments")
        .select("period_id, day_index")
        .eq("staff_id", staff_id)
        .in_("period_id", list(week_start_by_id.keys()))
        .execute()
        .data
    )

    count = 0
    for a in assignments:
        wk = week_start_by_id.get(a["period_id"])
        if wk and start <= wk + timedelta(days=a["day_index"]) <= end:
            count += 1
    return count
