"""Closed-day gating on the assignment write paths, and the under-18 night
boundary that batch 8 is about to move.

Both halves are safety net, not new product behaviour:

* The gating tests pin that a shift which does not run on a day cannot be
  written onto that day by ANY route. `post_open_shift` was the one hole
  (finding B1, fixed in batch 1) — it is covered here so it stays fixed.
* The night-boundary tests pin exactly which shifts a 16-17 year-old is
  refused today. Batch 8 adds a `works_past_10pm` contract flag that moves the
  restricted period from 22:00-06:00 to 23:00-07:00; these tests say which
  cases must flip and which must not, before the flag exists.

Shapes are The Gatehouse Tavern's, the venue the lifecycle test used:
Mon/Wed/Thu 11am-11pm, Tue closed, Fri/Sat 11am-1am, Sun 12pm-10:30pm.
"""

import pytest
from fastapi import HTTPException

from services import shift_bounds
from services.solver import check_manual_assignment
from tests.fake_supabase import FakeSupabase, patch_supabase

MON, TUE, WED, THU, FRI, SAT, SUN = range(7)

EVENING = {"id": "sh-eve", "name": "Evening", "start_time": "6:00pm", "end_time": "11:00pm",
           "min_staff": 1, "max_staff": 3}


def _gatehouse_index() -> dict:
    """Evening runs every day except Tuesday; Fri/Sat run to 1am, Sun to 10:30pm."""
    rows = []
    for day in (MON, WED, THU, FRI, SAT, SUN):
        if day in (FRI, SAT):
            start, end = "6:00pm", "1:00am"
        elif day == SUN:
            start, end = "6:00pm", "10:30pm"
        else:
            start, end = "6:00pm", "11:00pm"
        rows.append({"shift_id": "sh-eve", "day_index": day, "start_time": start,
                     "end_time": end, "min_staff": 1, "max_staff": 3})
    return shift_bounds.index_shift_days(rows)


# --- the gate itself --------------------------------------------------------


def test_closed_day_does_not_exist():
    idx = _gatehouse_index()
    assert shift_bounds.exists_on_day(EVENING, TUE, idx) is False
    assert all(shift_bounds.exists_on_day(EVENING, d, idx) for d in (MON, WED, THU, FRI, SAT, SUN))


def test_manual_assignment_hard_blocks_a_closed_day():
    """The shared gate behind manual-add, claim, give-accept and swap. One
    check covers four write paths because they all route through here."""
    adult = {"id": "s1", "name": "Marcus", "is_under_18": False}
    result = check_manual_assignment(
        adult, TUE, EVENING, [], {"sh-eve": EVENING},
        {"max_hours_per_week": 48, "min_rest_hours": 11, "require_day_off": True},
        shift_days_by_key=_gatehouse_index(),
    )
    assert result["severity"] == "block", "a closed day is not a manager-discretion confirm"


def test_manual_assignment_allows_an_open_day():
    adult = {"id": "s1", "name": "Marcus", "is_under_18": False}
    result = check_manual_assignment(
        adult, WED, EVENING, [], {"sh-eve": EVENING},
        {"max_hours_per_week": 48, "min_rest_hours": 11, "require_day_off": True},
        shift_days_by_key=_gatehouse_index(),
    )
    assert result["severity"] != "block"


# --- B1: post_open_shift, the path that had no gate at all ------------------


def _post_open(day_index: int):
    """Drive the real endpoint function with both its DB modules faked."""
    from routers import rota

    fake = FakeSupabase({
        "venues": [{"id": "v1", "manager_id": "m1", "name": "The Gatehouse Tavern", "is_active": True}],
        "availability_periods": [{"id": "per1", "venue_id": "v1", "week_start": "2026-09-07",
                                  "status": "generated"}],
        "shifts": [dict(EVENING, venue_id="v1")],
        "shift_days": [
            {"shift_id": "sh-eve", "day_index": d, "start_time": "6:00pm",
             "end_time": "11:00pm", "min_staff": 1, "max_staff": 3}
            for d in (MON, WED, THU, FRI, SAT, SUN)
        ],
        "rota_assignments": [],
        "activity_log": [],
    })

    class _Payload:
        shift_id = "sh-eve"
        required_role = None

    payload = _Payload()
    payload.day_index = day_index

    with patch_supabase(fake, "routers.rota", "services.auth_service"):
        try:
            rota.post_open_shift("per1", payload, manager={"id": "m1"})
            return None, fake
        except HTTPException as exc:
            return exc, fake


def test_post_open_shift_rejects_a_closed_day():
    """B1. Before the fix this inserted a row that could never be claimed
    (claim_shift runs the same check) and never showed as uncovered (a closed
    day carries no demand) — invisible to the manager who created it."""
    exc, fake = _post_open(TUE)
    assert exc is not None and exc.status_code == 400
    assert "Tue" in exc.detail
    assert fake.rows("rota_assignments") == [], "no ghost row may be written"


def test_post_open_shift_allows_an_open_day():
    exc, fake = _post_open(WED)
    assert exc is None
    assert len(fake.rows("rota_assignments")) == 1
    assert fake.rows("rota_assignments")[0]["drop_status"] == "pending_pickup"


# --- batch 8: the under-18 night boundary, before the flag exists -----------
#
# Today the restricted period is 22:00-06:00 with no exception. WTR 1998 reg 6A
# allows 23:00-07:00 where the young worker's contract provides for work after
# 10pm, which is what batch 8 adds. Each case below says what must happen now
# and what the flag should do to it.


@pytest.mark.parametrize(
    "start,end,restricted_today,should_flip_with_flag,why",
    [
        ("6:00pm", "10:00pm", False, False, "ends exactly on the 10pm line - legal either way"),
        ("6:00am", "10:00pm", False, False, "the full safe window, inclusive at both ends"),
        ("6:00pm", "10:30pm", True, True, "the Gatehouse Sunday - 30 minutes is the whole problem"),
        ("6:00pm", "11:00pm", True, True, "the ordinary weekday evening, blocked today"),
        ("6:00pm", "1:00am", True, False, "Fri/Sat late close - past 11pm too, must STAY blocked"),
        ("5:00am", "11:00am", True, False, "starts before 6am; the flag moves the start to 7am"),
    ],
)
def test_night_boundary_cases(start, end, restricted_today, should_flip_with_flag, why):
    assert shift_bounds.touches_night(start, end) is restricted_today, why

    # What the batch 8 window would say. Kept as a local reimplementation on
    # purpose: it states the target behaviour without asserting it yet, so this
    # file documents the intended change rather than pre-empting it.
    lo, hi = shift_bounds.bounds(start, end)
    restricted_with_flag = not (lo >= 7.0 and hi <= 23.0)
    assert (restricted_today and not restricted_with_flag) is should_flip_with_flag, why


def test_gatehouse_under18s_are_unrosterable_on_every_evening_today():
    """Why batch 8 is worth doing: at this venue the current window leaves two
    16-year-olds with no legal evening at all, which reads to them as the
    manager freezing them out."""
    idx = _gatehouse_index()
    open_days = [d for d in range(7) if shift_bounds.exists_on_day(EVENING, d, idx)]
    assert all(shift_bounds.touches_night_for(EVENING, d, idx) for d in open_days)
