"""Shared helpers for approved-leave lookups. Kept separate from the router so
the solver, the manual-add compliance check, and the rota grid's "On leave"
tag all read the exact same blocked-day computation."""

import math
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


# ---------------------------------------------------------------------------
# Allowance
#
# One definition of "how many days does this cost" and "how much is left",
# shared by the staff screen and the manager's team page, for the same reason
# blocked_days_for_week is shared: two implementations of this would drift and
# nobody would notice until a staff member and their manager disagreed about
# how much holiday was left.
# ---------------------------------------------------------------------------

DEFAULT_WORKING_DAYS_PER_WEEK = 5.0
DEFAULT_FULL_TIME_LEAVE_DAYS = 28.0
# Statutory entitlement is expressed against a five-day week, so pro-rata for
# anyone working fewer days is scaled from that, not from seven.
FULL_TIME_WEEK = 5.0


def _ceil_half(value: float) -> float:
    """Round up to the nearest half day.

    Rounding *up* is deliberate on both figures it's used for: an entitlement
    must never land under the statutory pro-rata minimum, and a request must
    never quietly cost less than it really does, which would let someone book
    past their allowance.
    """
    return math.ceil(round(value * 2, 6)) / 2


def leave_days_for_range(start_date: str, end_date: str, working_days_per_week: float) -> float:
    """What a leave range costs this person, in working days.

    Pub staff work days spread across all seven, so a seven-day absence costs a
    five-day-a-week worker five days, not seven — whole weeks come out exact.
    Shorter ranges are the expected value (a five-day block costs a five-day
    worker 5 x 5/7 = 3.6 -> 4), because nothing records *which* days someone
    works, and leave is usually requested before a rota for those weeks exists.
    """
    start = date.fromisoformat(str(start_date))
    end = date.fromisoformat(str(end_date))
    calendar_days = (end - start).days + 1
    if calendar_days < 1:
        return 0.0
    w = float(working_days_per_week or DEFAULT_WORKING_DAYS_PER_WEEK)
    return _ceil_half(calendar_days * w / 7.0)


def entitlement_days(staff: dict, venue: dict) -> float:
    """This person's annual entitlement: their explicit override if the manager
    set one, otherwise the venue's full-time figure prorated by working days."""
    explicit = staff.get("annual_leave_days")
    if explicit is not None:
        return float(explicit)
    full_time = float(venue.get("full_time_leave_days") or DEFAULT_FULL_TIME_LEAVE_DAYS)
    w = float(staff.get("working_days_per_week") or DEFAULT_WORKING_DAYS_PER_WEEK)
    return _ceil_half(full_time * w / FULL_TIME_WEEK)


def leave_year_bounds(venue: dict, today: date | None = None) -> tuple[date, date]:
    """The leave year containing `today`, per the venue's start month."""
    today = today or date.today()
    start_month = int(venue.get("leave_year_start_month") or 1)
    start_year = today.year if today.month >= start_month else today.year - 1
    start = date(start_year, start_month, 1)
    end = date(start_year + 1, start_month, 1) - timedelta(days=1)
    return start, end


def allowance_for_staff(supabase, venue: dict, staff: dict, today: date | None = None) -> dict:
    """Entitlement, booked, pending and remaining for the current leave year.

    A request counts toward the year it *starts* in, so a range straddling the
    boundary isn't split across two years' allowances — simpler to explain, and
    it matches how the request reads on screen.
    """
    year_start, year_end = leave_year_bounds(venue, today)
    rows = (
        supabase.table("leave_requests")
        .select("start_date, end_date, status")
        .eq("venue_id", venue["id"])
        .eq("staff_id", staff["id"])
        .gte("start_date", year_start.isoformat())
        .lte("start_date", year_end.isoformat())
        .in_("status", ["pending", "approved"])
        .execute()
        .data
    ) or []

    w = float(staff.get("working_days_per_week") or DEFAULT_WORKING_DAYS_PER_WEEK)
    booked = sum(leave_days_for_range(r["start_date"], r["end_date"], w) for r in rows if r["status"] == "approved")
    pending = sum(leave_days_for_range(r["start_date"], r["end_date"], w) for r in rows if r["status"] == "pending")
    entitlement = entitlement_days(staff, venue)

    return {
        "entitlement_days": entitlement,
        "booked_days": round(booked, 1),
        "pending_days": round(pending, 1),
        "remaining_days": round(entitlement - booked - pending, 1),
        "working_days_per_week": w,
        "leave_year_start": year_start.isoformat(),
        "leave_year_end": year_end.isoformat(),
    }
