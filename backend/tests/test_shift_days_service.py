"""Tests for the per-day schedule write service's pure + validation logic.

The DB-touching paths (create/update/replace round-trips) are covered by the
Batch 4 integration run against real Supabase; here we pin the validation and
representative-derivation that must reject bad input BEFORE any write.
"""

import pytest

from services import shift_days_service as svc
from services import shift_days_service
from services.shift_days_service import ScheduleError
from tests.fake_supabase import FakeSupabase


def test_validate_time_accepts_clock_and_close():
    svc.validate_time("Start", "9:00am")
    svc.validate_time("End", "2:30am")
    svc.validate_time("End", "close")  # legacy value still parses


def test_validate_time_rejects_junk():
    with pytest.raises(ScheduleError):
        svc.validate_time("Start", "banana")


def test_representative_is_first_open_day():
    days = [
        {"day_index": 6, "start_time": "2:00pm", "end_time": "10:00pm", "min_staff": 1, "max_staff": 2},
        {"day_index": 4, "start_time": "5:00pm", "end_time": "2:30am", "min_staff": 2, "max_staff": 3},
    ]
    rep = svc.representative(days)
    assert rep == {"start_time": "5:00pm", "end_time": "2:30am", "min_staff": 2, "max_staff": 3}


def test_replace_schedule_rejects_empty():
    # Validation runs before any DB call, so supabase=None is never reached.
    with pytest.raises(ScheduleError):
        svc.replace_schedule(None, "sid", [])


def test_replace_schedule_rejects_duplicate_day():
    days = [
        {"day_index": 4, "start_time": "5:00pm", "end_time": "11:00pm", "min_staff": 1, "max_staff": 2},
        {"day_index": 4, "start_time": "6:00pm", "end_time": "11:00pm", "min_staff": 1, "max_staff": 2},
    ]
    with pytest.raises(ScheduleError):
        svc.replace_schedule(None, "sid", days)


def test_replace_schedule_rejects_bad_time_before_write():
    days = [{"day_index": 4, "start_time": "nope", "end_time": "11:00pm", "min_staff": 1, "max_staff": 2}]
    with pytest.raises(ScheduleError):
        svc.replace_schedule(None, "sid", days)


def test_replace_schedule_rejects_min_over_max():
    days = [{"day_index": 4, "start_time": "5:00pm", "end_time": "11:00pm", "min_staff": 3, "max_staff": 2}]
    with pytest.raises(ScheduleError):
        svc.replace_schedule(None, "sid", days)


# --- per-day divergence survival (batch 0 safety net for F1/F2) -------------
#
# The fix plan predicted this pair "fails today". It does not, and the
# distinction matters for where batch 7 puts its fix: propagate_fields is
# already correct — it pushes only the columns it was handed. The flattening is
# entirely in the Scheduler, which always sends BOTH staffing fields whether or
# not either changed (grounding fact 4). So F1 belongs in the caller, and F2's
# 409 guard is defense in depth behind it, not the primary fix.


def _diverged_rows(shift_id: str = "s1") -> list[dict]:
    """A shift whose Sunday carries more cover than the rest of the week —
    the Sunday-roast shape a real venue actually has."""
    return [
        {
            "id": f"sd-{d}",
            "shift_id": shift_id,
            "day_index": d,
            "start_time": "5:00pm",
            "end_time": "11:00pm",
            "min_staff": 3 if d == 6 else 1,
            "max_staff": 2,
        }
        for d in range(7)
    ]


def test_propagate_preserves_divergence_in_columns_it_was_not_given():
    from tests.fake_supabase import FakeSupabase

    fake = FakeSupabase({"shift_days": _diverged_rows()})
    svc.propagate_fields(fake, "s1", {"max_staff": 4})

    by_day = {r["day_index"]: r for r in fake.rows("shift_days")}
    assert by_day[6]["min_staff"] == 3, "Sunday's cover must survive a max-only edit"
    assert all(r["max_staff"] == 4 for r in fake.rows("shift_days"))


def test_propagate_refuses_a_column_it_IS_given_when_it_diverges():
    """This test used to assert the opposite, and it was right to: it pinned the
    flattening as it stood, so batch 7 could prove it changed. The Scheduler is
    no longer allowed to send min_staff at all (F4), and if anything ever does
    again it now gets a 409 instead of Sunday's cover."""
    from tests.fake_supabase import FakeSupabase

    fake = FakeSupabase({"shift_days": _diverged_rows()})
    with pytest.raises(svc.DivergenceError):
        svc.propagate_fields(fake, "s1", {"min_staff": 1, "max_staff": 4})

    by_day = {r["day_index"]: r for r in fake.rows("shift_days")}
    assert by_day[6]["min_staff"] == 3, "Sunday's cover survives"
    assert by_day[0]["max_staff"] == 2, "and nothing else was half-written either"


def test_propagate_ignores_non_per_day_fields():
    from tests.fake_supabase import FakeSupabase

    fake = FakeSupabase({"shift_days": _diverged_rows()})
    svc.propagate_fields(fake, "s1", {"name": "Evening"})
    assert fake.wrote() == [], "a name edit must not touch shift_days at all"


# --------------------------------------------------------------------------- #
# F2 — a single-value edit must not flatten what the per-day editor created    #
# --------------------------------------------------------------------------- #


def _gatehouse_rows():
    """The Gatehouse's evening: Sunday is quieter and needs one fewer body."""
    return [
        {"shift_id": "sh1", "day_index": d, "start_time": "6:00pm",
         "end_time": "11:00pm", "min_staff": 2 if d == 6 else 3, "max_staff": 4}
        for d in range(7)
    ]


def test_editing_a_diverged_column_is_refused():
    fake = FakeSupabase({"shift_days": _gatehouse_rows()})
    try:
        shift_days_service.propagate_fields(fake, "sh1", {"min_staff": 3})
    except shift_days_service.DivergenceError as e:
        assert e.field == "min_staff"
        assert e.values == [2, 3]
    else:
        raise AssertionError("expected a refusal")
    # The exit test: Sunday still needs 2.
    assert {r["min_staff"] for r in fake.rows("shift_days")} == {2, 3}


def test_editing_a_uniform_column_still_works():
    """Every shift onboarding has ever created. The guard must not turn the
    normal single-value edit into an error."""
    fake = FakeSupabase({"shift_days": _gatehouse_rows()})
    shift_days_service.propagate_fields(fake, "sh1", {"max_staff": 5})
    assert {r["max_staff"] for r in fake.rows("shift_days")} == {5}
    # And the diverged column it wasn't handed is untouched.
    assert {r["min_staff"] for r in fake.rows("shift_days")} == {2, 3}


def test_divergence_in_a_column_you_are_not_editing_is_irrelevant():
    fake = FakeSupabase({"shift_days": _gatehouse_rows()})
    shift_days_service.propagate_fields(fake, "sh1", {"start_time": "5:00pm"})
    assert {r["start_time"] for r in fake.rows("shift_days")} == {"5:00pm"}


def test_a_shift_with_no_rows_is_still_left_alone():
    """Unmigrated: it runs every day off the shift-level fallback, and there is
    nothing to diverge from."""
    fake = FakeSupabase({"shift_days": []})
    shift_days_service.propagate_fields(fake, "sh1", {"min_staff": 4})
    assert fake.rows("shift_days") == []


# --------------------------------------------------------------------------- #
# I2 — a GET response must be a valid PUT body                                 #
# --------------------------------------------------------------------------- #
#
# get_schedule returns all seven days, marking the closed ones `open: false`
# with null times. The PUT used to 422 on exactly that, so "read the schedule,
# change one day, write it back" — the obvious way to use the pair — was the one
# thing a caller could not do.


def _round_trip_body(fake, shift):
    """What GET hands back, fed straight into what PUT accepts."""
    from models.schemas import ShiftScheduleUpdateRequest

    days = shift_days_service.get_schedule(fake, shift)
    return ShiftScheduleUpdateRequest(days=days)


def test_a_get_response_parses_as_a_put_body():
    fake = FakeSupabase({"shift_days": [
        {"shift_id": "sh1", "day_index": d, "start_time": "6:00pm", "end_time": "11:00pm",
         "min_staff": 2, "max_staff": 4}
        for d in (0, 2, 3)
    ]})
    shift = {"id": "sh1", "start_time": "6:00pm", "end_time": "11:00pm"}
    body = _round_trip_body(fake, shift)

    assert len(body.days) == 7, "every day comes back, open or not"
    assert [d.day_index for d in body.days if d.open] == [0, 2, 3]
    # The closed ones are what used to 422.
    assert all(d.start_time is None for d in body.days if not d.open)


def test_writing_a_get_response_straight_back_changes_nothing():
    """The round trip has to be a no-op, or 'change one day' silently changes
    the others too."""
    before = [
        {"shift_id": "sh1", "day_index": d, "start_time": "6:00pm", "end_time": "11:00pm",
         "min_staff": 2, "max_staff": 4}
        for d in (0, 2, 3)
    ]
    fake = FakeSupabase({"shift_days": list(before)})
    shift = {"id": "sh1", "start_time": "6:00pm", "end_time": "11:00pm"}
    body = _round_trip_body(fake, shift)

    days = [
        {k: v for k, v in d.model_dump().items() if k != "open"}
        for d in body.days
        if d.open
    ]
    shift_days_service.replace_schedule(fake, "sh1", days)

    got = sorted(
        ({k: r[k] for k in ("day_index", "start_time", "end_time", "min_staff", "max_staff")}
         for r in fake.rows("shift_days")),
        key=lambda r: r["day_index"],
    )
    want = sorted(
        ({k: r[k] for k in ("day_index", "start_time", "end_time", "min_staff", "max_staff")}
         for r in before),
        key=lambda r: r["day_index"],
    )
    assert got == want


def test_an_open_day_with_no_times_is_an_error_not_a_closed_day():
    """The one thing `open` must not do is turn a mistake into a silent
    deletion: a day left open with nothing in it is a 400, not a shut Tuesday."""
    with pytest.raises(ScheduleError):
        shift_days_service.replace_schedule(
            None, "sh1",
            [{"day_index": 0, "start_time": None, "end_time": None, "min_staff": 1, "max_staff": 2}],
        )


def test_closing_every_day_is_still_refused():
    from models.schemas import ShiftScheduleUpdateRequest

    body = ShiftScheduleUpdateRequest(
        days=[{"day_index": d, "open": False} for d in range(7)]
    )
    days = [d.model_dump() for d in body.days if d.open]
    with pytest.raises(ScheduleError):
        shift_days_service.replace_schedule(None, "sh1", days)
