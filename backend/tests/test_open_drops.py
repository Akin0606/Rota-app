"""An unclaimed drop has to be visible on the manager's own screen (batch 6).

`drop_shift` wrote one `activity_log` row and returned. The manager found out
by scrolling a feed that also carries every availability submission, so a shift
dropped on Thursday for Saturday could sit in the pool unnoticed until Saturday.
The pool is now part of the rota summary every manager surface already reads.

It is deliberately NOT folded into `uncovered`: until a claim is approved the
original person is still rostered, and reporting the slot as empty would be a
lie the coverage line then repeats to the publish confirm.
"""

from routers import rota as rota_router
from tests.fake_supabase import FakeSupabase, patch_supabase

MON, TUE, WED, THU, FRI, SAT, SUN = range(7)

PERIOD = {"id": "p1", "venue_id": "v1", "week_start": "2026-09-07", "status": "published"}
DAY = {"id": "sh-day", "venue_id": "v1", "name": "Day", "start_time": "11:00am",
       "end_time": "6:00pm", "color": "#aaa", "sort_order": 0, "min_staff": 1, "max_staff": 3}


def _assignment(aid, day, staff_id, drop_status=None, required_role=None):
    return {"id": aid, "period_id": "p1", "staff_id": staff_id, "day_index": day,
            "shift_id": "sh-day", "manually_assigned": False, "drop_status": drop_status,
            "claim_staff_id": None, "required_role": required_role}


def _summary(assignments, staff=None):
    fake = FakeSupabase({
        "shifts": [dict(DAY)],
        "shift_days": [],
        "rota_assignments": assignments,
        "availability_submissions": [],
        "leave_requests": [],
        "staff_members": staff if staff is not None else [
            {"id": "s1", "venue_id": "v1", "name": "Priya", "is_active": True,
             "pending": False, "is_under_18": False},
        ],
        "scheduling_rules": [],
    })
    with patch_supabase(fake, "routers.rota", "services.auth_service"):
        return rota_router._build_summary("v1", PERIOD), fake


def test_a_dropped_shift_appears_in_the_pool_with_who_dropped_it():
    result, _ = _summary([_assignment("a1", SAT, "s1", "pending_pickup")])
    assert result["open_drops"] == [
        {"assignment_id": "a1", "day_index": SAT, "shift_id": "sh-day",
         "dropped_by_name": "Priya", "required_role": None}
    ]


def test_a_shift_in_the_pool_is_not_reported_as_uncovered():
    """The whole reason it's a separate list. Priya is still on the rota until
    a claim is approved; calling the slot empty would double-count it against
    the coverage line and the publish confirm."""
    result, _ = _summary([_assignment("a1", SAT, "s1", "pending_pickup")])
    assert result["uncovered"] == []
    assert result["conflicts"] == 0


def test_a_manager_posted_open_shift_has_no_dropper():
    result, _ = _summary([_assignment("a1", FRI, None, "pending_pickup", "Bartender")])
    assert result["open_drops"][0]["dropped_by_name"] is None
    assert result["open_drops"][0]["required_role"] == "Bartender"


def test_a_claim_awaiting_approval_is_no_longer_in_the_pool():
    """Someone has already put their hand up, so it isn't the manager's chase
    any more — it's their approval, which the approvals row already carries."""
    result, _ = _summary([_assignment("a1", SAT, "s1", "pending_approval")])
    assert result["open_drops"] == []


def test_a_normal_assignment_is_not_in_the_pool():
    result, _ = _summary([_assignment("a1", SAT, "s1")])
    assert result["open_drops"] == []


def test_the_pool_is_ordered_by_day():
    result, _ = _summary([
        _assignment("a3", SUN, "s1", "pending_pickup"),
        _assignment("a1", TUE, "s1", "pending_pickup"),
        _assignment("a2", SAT, "s1", "pending_pickup"),
    ])
    assert [d["day_index"] for d in result["open_drops"]] == [TUE, SAT, SUN]


def test_an_empty_pool_costs_no_name_lookup():
    """The normal week. A summary runs on every read, edit and week scrub, so
    the pool must not add a query to a venue that has nothing dropped."""
    _, fake = _summary([_assignment("a1", SAT, "s1")])
    selects = [c for c in fake.calls if c == ("select", "staff_members")]
    # Only the under-18 notes lookup — no dropper-name query.
    assert len(selects) == 1
