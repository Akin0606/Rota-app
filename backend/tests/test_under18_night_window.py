"""WTR 1998 reg 6A's second restricted period, end to end (batch 8).

The solver knew one window: 22:00-06:00, no exception. Reg 6A gives a young
worker whose *contract provides for work after 10pm* a restricted period of
23:00-07:00 instead. The difference is not academic — at The Gatehouse it is
the difference between two 16-year-olds having no legal evening at all and
them working Sunday through Thursday.

Three paths have to agree, because a rule enforced in one and not the others is
a rule that produces a rota the manager then can't edit (or worse, can):
the solve, the manual-add gate, and the availability notes a manager reads.
"""

from services.solver import (
    check_manual_assignment,
    generate_rota,
    under18_availability_notes,
)

MON, TUE, WED, THU, FRI, SAT, SUN = range(7)
PREFERRED = 3

EVENING = {"id": "eve", "name": "Evening", "start_time": "6:00pm", "end_time": "11:00pm",
           "color": "#b", "sort_order": 1, "min_staff": 1, "max_staff": 2}
SHIFTS = [EVENING]
RULES = {"max_hours_per_week": 48, "min_rest_hours": 11, "require_day_off": False}


def _index():
    """Mon/Wed/Thu to 11pm, Tue closed, Fri/Sat to 1am, Sun to 10:30pm."""
    rows = {}
    for d in (MON, WED, THU, FRI, SAT, SUN):
        end = "1:00am" if d in (FRI, SAT) else "10:30pm" if d == SUN else "11:00pm"
        rows[("eve", d)] = {"shift_id": "eve", "day_index": d, "start_time": "6:00pm",
                            "end_time": end, "min_staff": 1, "max_staff": 2}
    return rows


def _member(works_past_10pm: bool):
    return {"id": "u18", "name": "Amy", "is_under_18": True,
            "works_past_10pm": works_past_10pm}


def _availability(days):
    return [{"staff_id": "u18", "day_index": d, "shift_id": "eve", "status": PREFERRED}
            for d in days]


OPEN_DAYS = [MON, WED, THU, FRI, SAT, SUN]


def _solve(works_past_10pm):
    return generate_rota(
        staff=[_member(works_past_10pm)],
        shifts=SHIFTS,
        submissions=_availability(OPEN_DAYS),
        rules=RULES,
        shift_days_by_key=_index(),
    )


def test_without_the_flag_there_is_no_legal_evening_at_all():
    """The state of the world before this batch, stated as a test so the change
    is visible rather than assumed."""
    result = _solve(False)
    assert result["assignments"] == []


def test_with_the_flag_sunday_to_thursday_become_assignable():
    days = {a["day_index"] for a in _solve(True)["assignments"]}
    assert days == {MON, WED, THU, SUN}


def test_the_one_am_close_stays_blocked_with_the_flag():
    """The half of reg 6A that still bites. 6pm-1am runs two hours into the
    restricted period however the contract is written."""
    days = {a["day_index"] for a in _solve(True)["assignments"]}
    assert FRI not in days and SAT not in days


def test_ten_thirty_is_the_case_the_flag_is_for():
    """Thirty minutes past the default line. Without the flag the Sunday roast
    shift is illegal; with it, it isn't."""
    assert SUN not in {a["day_index"] for a in _solve(False)["assignments"]}
    assert SUN in {a["day_index"] for a in _solve(True)["assignments"]}


def _manual(works_past_10pm, day):
    return check_manual_assignment(
        staff=_member(works_past_10pm),
        day_index=day,
        shift=EVENING,
        other_assignments=[],
        shifts_by_id={"eve": EVENING},
        rules=RULES,
        shift_days_by_key=_index(),
    )


def test_the_manual_gate_agrees_with_the_solver():
    """It has to: it's the shared gate behind manual add, claim, give-accept and
    swap. A solve that places someone the claim path then refuses is worse than
    either rule on its own."""
    assert _manual(False, MON)["severity"] == "block"
    assert _manual(True, MON)["severity"] == "ok"
    assert _manual(True, SUN)["severity"] == "ok"
    assert _manual(True, FRI)["severity"] == "block"


def test_the_block_reason_names_the_window_that_actually_applies():
    """Telling a manager a 6pm-1am shift 'falls between 10pm and 6am' when the
    person's contract says 11pm-7am is a small lie that costs trust in the whole
    legal block."""
    assert "10pm and 6am" in _manual(False, MON)["reason"]
    assert "11pm and 7am" in _manual(True, FRI)["reason"]


def test_the_notes_a_manager_reads_use_the_same_window():
    """under18_availability_notes is what paints the legal block on every read
    of the rota page. If it kept the default window it would report four slots
    as illegal that the solver had just filled."""
    warnings, _info, _unreadable = under18_availability_notes(
        [_member(True)], _availability(OPEN_DAYS), SHIFTS, RULES,
        shift_days_by_key=_index(),
    )
    night_notes = [w for w in warnings if "can't work night hours" in w]
    assert len(night_notes) == 2, "only Fri and Sat"
    assert all("11pm and 7am" in w for w in night_notes)


# --------------------------------------------------------------------------- #
# G3 — the same rule, said on the staff member's own screen                    #
# --------------------------------------------------------------------------- #
#
# The solve can be perfectly correct and still read to a teenager as the manager
# freezing them out: they tick green on six evenings and get nothing back, with
# nothing anywhere in the staff app mentioning their age. `/week` therefore
# marks each shift-day the young-worker rules bar — computed here, off the same
# accessor the solve gates on, because a client re-deriving it from the times
# would eventually disagree with the gate that actually blocks the assignment.

from routers import availability as availability_router  # noqa: E402
from tests.fake_supabase import FakeSupabase, patch_supabase  # noqa: E402

_VENUE = "v1"
_SHIFT_ROW = {
    "id": "eve", "venue_id": _VENUE, "name": "Evening", "start_time": "6:00pm",
    "end_time": "11:00pm", "color": "#b", "sort_order": 1,
    "min_staff": 1, "max_staff": 2,
}


def _fake_venue():
    return FakeSupabase(
        {
            "shifts": [_SHIFT_ROW],
            "shift_days": [
                dict(row, id=f"sd{d}") for (_s, d), row in sorted(_index().items())
            ],
        }
    )


def _restricted_days(staff):
    fake = _fake_venue()
    with patch_supabase(fake, "routers.availability", "routers.rota"):
        shifts = availability_router._week_shifts(_VENUE, staff)
    assert len(shifts) == 1
    return sorted(d["day_index"] for d in shifts[0]["days"] if d["restricted"])


def test_an_adult_sees_no_locked_slots_at_all():
    adult = {"id": "a1", "name": "Sam", "is_under_18": False}
    assert _restricted_days(adult) == []


def test_the_screen_locks_exactly_the_days_the_solver_refuses():
    """The exit test, from the other end: what the teenager is shown must be
    what the solve does. Without the contract flag every open evening runs past
    10pm, so every one is locked."""
    assert _restricted_days(_member(False)) == OPEN_DAYS
    assert _solve(False)["assignments"] == []

    # With it, only the two 1am closes remain barred — and the days the screen
    # leaves unlocked are exactly the days the solve fills.
    assert _restricted_days(_member(True)) == [FRI, SAT]
    assigned = sorted(a["day_index"] for a in _solve(True)["assignments"])
    assert assigned == [MON, WED, THU, SUN]


def test_a_closed_day_is_absent_rather_than_locked():
    """Tuesday isn't barred by law, the venue just shuts. Marking it restricted
    would blame the wrong thing."""
    days = _fake_days(_member(False))
    assert TUE not in [d["day_index"] for d in days]


def _fake_days(staff):
    fake = _fake_venue()
    with patch_supabase(fake, "routers.availability", "routers.rota"):
        return availability_router._week_shifts(_VENUE, staff)[0]["days"]
