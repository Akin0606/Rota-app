"""The manager's leave queue answers the question a landlord actually asks
(batch 10, H4).

The queue showed a name, a range, a cost and a shift-conflict count. It could
not answer "who else is off that week", which is the first thing anyone running
a bar wants to know — one person away is a rota problem, three is a shut door.
Nor did it say what approving would leave the requester with, even though
`allowance_for_staff` had computed exactly that for the staff screen since the
allowance batch.
"""

from routers import leave as leave_router
from services import leave
from tests.fake_supabase import FakeSupabase, patch_supabase

VENUE = {"id": "v1", "manager_id": "m1", "name": "The Gatehouse Tavern",
         "is_active": True, "full_time_leave_days": 28, "leave_year_start_month": 1}
STAFF = [
    {"id": "s1", "venue_id": "v1", "name": "Amy", "working_days_per_week": 5,
     "annual_leave_days": None, "is_active": True},
    {"id": "s2", "venue_id": "v1", "name": "Ben", "working_days_per_week": 5,
     "annual_leave_days": None, "is_active": True},
    {"id": "s3", "venue_id": "v1", "name": "Cara", "working_days_per_week": 5,
     "annual_leave_days": None, "is_active": True},
]


def _req(rid, staff_id, start, end, status="pending"):
    return {"id": rid, "venue_id": "v1", "staff_id": staff_id, "start_date": start,
            "end_date": end, "status": status, "reason": None, "manager_note": None,
            "created_at": f"2026-01-0{rid[-1]}T09:00:00", "decided_at": None}


def _queue(requests, status=None):
    fake = FakeSupabase({
        "venues": [dict(VENUE)],
        "staff_members": [dict(s) for s in STAFF],
        "leave_requests": [dict(r) for r in requests],
        "rota_assignments": [],
        "availability_periods": [],
    })
    with patch_supabase(fake, "routers.leave", "services.auth_service"):
        return leave_router.list_leave_requests(status=status, manager={"id": "m1"}).requests


def _by_id(rows, rid):
    return next(r for r in rows if r.id == rid)


# --- the pure rule -----------------------------------------------------------

def test_touching_at_the_edges_counts_as_overlap():
    """Both ends are inclusive dates, so a request ending the day another
    starts genuinely shares that day."""
    a = _req("r1", "s1", "2026-03-02", "2026-03-08")
    b = _req("r2", "s2", "2026-03-08", "2026-03-14")
    assert [o["id"] for o in leave.overlapping_requests(a, [a, b])] == ["r2"]


def test_a_day_apart_does_not():
    a = _req("r1", "s1", "2026-03-02", "2026-03-08")
    b = _req("r2", "s2", "2026-03-09", "2026-03-14")
    assert leave.overlapping_requests(a, [a, b]) == []


def test_your_own_other_request_is_not_a_collision():
    """Two ranges from the same person is an allowance question, not a
    coverage one — and listing someone under "also off" against their own
    request reads as a bug."""
    a = _req("r1", "s1", "2026-03-02", "2026-03-08")
    b = _req("r2", "s1", "2026-03-04", "2026-03-05")
    assert leave.overlapping_requests(a, [a, b]) == []


# --- through the endpoint ----------------------------------------------------

def test_the_queue_names_who_else_is_off():
    rows = _queue([
        _req("r1", "s1", "2026-03-02", "2026-03-08"),
        _req("r2", "s2", "2026-03-04", "2026-03-06", status="approved"),
        _req("r3", "s3", "2026-06-01", "2026-06-07"),
    ])
    amy = _by_id(rows, "r1")
    assert [(o.staff_name, o.status) for o in amy.overlapping] == [("Ben", "approved")]
    # A request in a different month collides with nobody.
    assert _by_id(rows, "r3").overlapping == []


def test_a_pending_filter_still_sees_the_approved_leave_it_collides_with():
    """The failure this guards: filtering the queue to `pending` narrows the
    rows returned, and if the overlap set were built from those rows the
    already-approved week off would vanish exactly when it matters most."""
    rows = _queue(
        [
            _req("r1", "s1", "2026-03-02", "2026-03-08"),
            _req("r2", "s2", "2026-03-04", "2026-03-06", status="approved"),
        ],
        status="pending",
    )
    assert [r.id for r in rows] == ["r1"]
    assert [o.staff_name for o in rows[0].overlapping] == ["Ben"]


def test_remaining_is_already_net_of_the_request_being_decided():
    """It reads as "N left after this", so it must not double-count. A pending
    request is inside `pending_days`, so the staff endpoint's own number is
    already the post-approval figure."""
    rows = _queue([_req("r1", "s1", "2026-03-02", "2026-03-08")])
    # 28 days entitlement, a 7-calendar-day range at 5 days a week costs 5.
    assert rows[0].days == 5
    assert rows[0].remaining_days == 23


def test_a_decided_request_carries_neither():
    """History rows show a name, a range and a status. Computing an overlap set
    for every cancelled request months back is work nothing renders."""
    rows = _queue([
        _req("r1", "s1", "2026-03-02", "2026-03-08", status="cancelled"),
        _req("r2", "s2", "2026-03-04", "2026-03-06", status="approved"),
    ])
    cancelled = _by_id(rows, "r1")
    assert cancelled.overlapping == [] and cancelled.remaining_days is None
