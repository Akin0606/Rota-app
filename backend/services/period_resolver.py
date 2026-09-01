"""Which week is which. One module, three questions, three answers.

Before this there were nine different answers to "the current period" spread
across the routers, and they disagreed with each other on the same venue at the
same moment: the staff app collected for one week, the staff rota showed
another, and the admin console targeted a third. Every one of them was behaving
exactly as written. See tests/test_period_resolution.py, which pins that
disagreement as an executable fact.

The three questions are genuinely different and must not be collapsed:

    collection_period   - which week are we asking staff about right now?
    staff_rota_period   - which week's rota is a staff member looking at?
    newest_rota_period  - which week does support/admin act on?

Two rules this module holds that its predecessors did not:

**Nothing here creates a period.** The old `_get_or_create_current_period` fell
back to "the earliest week that doesn't have a period yet" and inserted it. With
every week published there is nothing collecting, so an ordinary staff PIN
login — which happens on every login and every hub load — silently created a
period for a week no notice window points at, which then became what the admin
console targeted. Creating periods belongs to `cron.open_availability_for_venue`
alone: it is idempotent, and it is the only path that also runs auto-submit and
sends the "availability is open" email. A resolver that inserts rows behind it
makes that early-return and silently disables both.

**Today is Europe/London.** The backend has two conventions — `date.today()`
(UTC on Render) and `schedule_windows.now_london()`. During BST the UTC date is
wrong for an hour every night, which is exactly when a late-close pub manager is
looking at their phone. Everything here uses London.
"""

from datetime import date, timedelta
from typing import Optional

from database import get_supabase
from services import notice_window, schedule_windows

# A period that has been solved, whatever the solve produced. Deliberately
# status-based rather than "has assignments": a `generated` week where the
# solver placed nobody is still a week that has been built, and inferring
# otherwise is a bug this project has already shipped once.
ROTA_STATUSES = ("generated", "published", "confirmed")
LIVE_STATUSES = ("published", "confirmed")


def london_today() -> date:
    return schedule_windows.now_london().date()


def _select(venue_id: str, statuses: Optional[tuple[str, ...]] = None) -> list[dict]:
    q = get_supabase().table("availability_periods").select("*").eq("venue_id", venue_id)
    if statuses:
        q = q.in_("status", list(statuses))
    return q.order("week_start", desc=True).execute().data or []


def period_for_week(venue_id: str, week_start) -> Optional[dict]:
    """The venue's period for one specific week, whatever its status."""
    week = week_start.isoformat() if hasattr(week_start, "isoformat") else str(week_start)
    rows = (
        get_supabase()
        .table("availability_periods")
        .select("*")
        .eq("venue_id", venue_id)
        .eq("week_start", week)
        .limit(1)
        .execute()
        .data
    )
    return rows[0] if rows else None


def collection_week(venue_id: str) -> Optional[date]:
    """The Monday the notice window is currently collecting for, or None when
    the venue has no shifts yet (nothing to derive a window from)."""
    window = notice_window.compute_for_venue(venue_id)
    return window["week_monday"] if window else None


def collection_period(venue_id: str) -> Optional[dict]:
    """The week we are currently asking staff about.

    Read-only, and returns None rather than inventing a week. None is a real
    answer with two honest meanings — the venue has no shifts yet, or the
    opener has not run for this week — and both are better than a phantom.

    Returns the period at the notice window's week whatever its status: if that
    week is already `closed`, the staff app must say so rather than quietly
    swapping them onto a different week. Callers that care about editability
    already test the status themselves.

    Falls back to the newest `collecting` period only when there is no window at
    all, which is the pre-shift state a brand new venue is in.
    """
    week = collection_week(venue_id)
    if week is None:
        rows = _select(venue_id, ("collecting",))
        return rows[0] if rows else None
    return period_for_week(venue_id, week)


def staff_rota_period(venue_id: str, week_start: Optional[str] = None) -> Optional[dict]:
    """The rota a staff member is looking at.

    With `week_start`, that exact week — this is what makes the staff rota
    week-addressable, so publishing next week no longer hides it, and a staff
    member can still drop or swap a shift in a week that is not the one they
    are standing in.

    Without it, the live week covering today; failing that, the most recent live
    week. Both directions matter and the old rule got each of them wrong in turn:
    taking only the newest published week hid the week staff were actually
    working, and taking only the week covering today would hide next week from
    everyone planning ahead.

    Post-midnight note: at 00:30 on a Monday the week containing "today" is the
    new one, while a Sunday 5pm-1am shift from last week is still running. If
    the new week is not live yet this falls through to the newest live week,
    which is last week — the right answer by accident but the right answer. If
    both are live, the caller sees the new week and can address the old one
    explicitly by week_start. A true shift-phase carry-over would need every
    shift's end time on a request that does not otherwise load them, which is
    not worth it for a surface that shows a whole week at a time.
    """
    if week_start:
        period = period_for_week(venue_id, week_start)
        return period if period and period["status"] in LIVE_STATUSES else None

    live = _select(venue_id, LIVE_STATUSES)
    if not live:
        return None

    today = london_today()
    for period in live:
        monday = date.fromisoformat(str(period["week_start"]))
        if monday <= today <= monday + timedelta(days=6):
            return period
    return live[0]


def newest_rota_period(venue_id: str) -> Optional[dict]:
    """The newest week that has been solved — what the admin console's rota
    view, generate and unpublish all act on.

    Status-based on purpose (see ROTA_STATUSES): a `generated` week the solver
    placed nobody into is still a built week, and support needs to be able to
    look at exactly that.
    """
    rows = _select(venue_id, ROTA_STATUSES)
    return rows[0] if rows else None
