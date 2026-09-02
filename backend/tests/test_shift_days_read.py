"""The bulk per-day read the manager app is built on (batch 4).

Before this endpoint the manager surfaces had no per-day data at all — the rota
summary loaded a `shift_days` index and returned only assignments, and
`listShifts()` was a bare `shifts.*` select. Every manager screen therefore
reasoned about the whole week from one representative time and one min_staff,
which is why The Gatehouse's closed Tuesday rendered as a red uncovered day at
hours the venue isn't open, and why the Scheduler said 35 shifts a week for a
venue that runs 29.

The Gatehouse shape throughout: Mon/Wed/Thu 11am-11pm, Tue closed,
Fri/Sat 11am-1am, Sun 12pm-10:30pm.
"""

from routers import shifts as shifts_router
from tests.fake_supabase import FakeSupabase, patch_supabase

MON, TUE, WED, THU, FRI, SAT, SUN = range(7)

VENUE = {"id": "v1", "manager_id": "m1", "name": "The Gatehouse Tavern", "is_active": True}
# Shift-level min_staff is the *representative* — Sunday's evening is quieter
# and carries its own lower minimum in shift_days. Together with the closed
# Tuesday this is exactly the 35-vs-29 discrepancy the Scheduler was printing.
DAY = {"id": "sh-day", "venue_id": "v1", "name": "Day", "start_time": "11:00am",
       "end_time": "6:00pm", "color": "#aaa", "sort_order": 0, "min_staff": 2, "max_staff": 3}
EVE = {"id": "sh-eve", "venue_id": "v1", "name": "Evening", "start_time": "6:00pm",
       "end_time": "11:00pm", "color": "#bbb", "sort_order": 1, "min_staff": 3, "max_staff": 4}


def _gatehouse_rows() -> list[dict]:
    """Evening: every day but Tuesday; 1am Fri/Sat; 10:30pm and min 2 on Sunday."""
    rows = []
    for d in (MON, WED, THU, FRI, SAT, SUN):
        end = "1:00am" if d in (FRI, SAT) else "10:30pm" if d == SUN else "11:00pm"
        rows.append({"shift_id": "sh-eve", "day_index": d, "start_time": "6:00pm",
                     "end_time": end, "min_staff": 2 if d == SUN else 3, "max_staff": 4})
    for d in (MON, WED, THU, FRI, SAT, SUN):
        rows.append({"shift_id": "sh-day", "day_index": d, "start_time": "11:00am",
                     "end_time": "6:00pm", "min_staff": 2, "max_staff": 3})
    return rows


def _call(shift_rows, shift_defs=(DAY, EVE)):
    fake = FakeSupabase({
        "venues": [VENUE],
        "shifts": [dict(s) for s in shift_defs],
        "shift_days": shift_rows,
    })
    with patch_supabase(fake, "routers.shifts", "services.auth_service"):
        return shifts_router.list_shifts_with_days(manager={"id": "m1"}), fake


def _days(result, shift_id):
    return next(s["days"] for s in result if s["id"] == shift_id)


def test_every_shift_comes_back_with_seven_days():
    """Always 7, always in order — a client that has to reconstruct the missing
    days is a client that will get the closed ones wrong."""
    result, _ = _call(_gatehouse_rows())
    assert len(result) == 2
    for shift in result:
        assert [d["day_index"] for d in shift["days"]] == list(range(7))


def test_the_closed_day_is_marked_closed():
    days = _days(_call(_gatehouse_rows())[0], "sh-eve")
    assert days[TUE]["open"] is False
    assert all(days[d]["open"] for d in (MON, WED, THU, FRI, SAT, SUN))


def test_divergent_hours_survive_the_read():
    """C1 — the header-vs-chip contradiction. The manager card read 6-11pm over
    a chip reading 6pm-1am because the header used the representative time."""
    days = _days(_call(_gatehouse_rows())[0], "sh-eve")
    assert days[FRI]["end_time"] == "1:00am"
    assert days[SAT]["end_time"] == "1:00am"
    assert days[SUN]["end_time"] == "10:30pm"
    assert days[MON]["end_time"] == "11:00pm"


def test_per_day_minimums_survive_the_read():
    """B3/B7 — a quieter Sunday must not be counted or displayed at the busier
    weekday minimum the shift-level column carries."""
    days = _days(_call(_gatehouse_rows())[0], "sh-eve")
    assert days[SUN]["min_staff"] == 2
    assert days[SAT]["min_staff"] == 3


def test_an_unmigrated_shift_reads_as_open_every_day():
    """The fallback is resolved server-side on purpose: a client that had to
    re-implement `shift_bounds.exists_on_day` would eventually disagree with the
    solver about which days exist."""
    result, _ = _call([])
    for shift in result:
        assert all(d["open"] for d in shift["days"])
        assert {d["start_time"] for d in shift["days"]} == {shift["start_time"]}


def test_the_read_writes_nothing():
    _, fake = _call(_gatehouse_rows())
    assert fake.wrote() == []


def test_one_query_for_every_shifts_days():
    """N+1 is the reason this endpoint exists rather than a loop of
    GET /shifts/{id}/days on a screen that loads three at a time."""
    _, fake = _call(_gatehouse_rows())
    assert [c for c in fake.calls if c[1] == "shift_days"] == [("select", "shift_days")]


def test_no_shifts_returns_empty_without_querying_days():
    result, fake = _call([], shift_defs=())
    assert result == []
    assert [c for c in fake.calls if c[1] == "shift_days"] == []


def test_the_gatehouse_runs_twenty_nine_shifts_a_week():
    """B7, as the number the Scheduler prints. `7 x sum(min_staff)` gave 35: it
    counts a Tuesday the venue shuts and flattens Sunday's higher minimum."""
    result, _ = _call(_gatehouse_rows())
    per_week = sum(
        d["min_staff"] for shift in result for d in shift["days"] if d["open"]
    )
    flat = sum(s["min_staff"] for s in result) * 7
    assert per_week == 29
    assert flat == 35
