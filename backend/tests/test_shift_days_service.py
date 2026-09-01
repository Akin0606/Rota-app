"""Tests for the per-day schedule write service's pure + validation logic.

The DB-touching paths (create/update/replace round-trips) are covered by the
Batch 4 integration run against real Supabase; here we pin the validation and
representative-derivation that must reject bad input BEFORE any write.
"""

import pytest

from services import shift_days_service as svc
from services.shift_days_service import ScheduleError


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


def test_propagate_flattens_a_column_it_IS_given():
    """The mechanism F1 has to stop feeding. Not a bug here — this is
    propagate_fields doing exactly its job. The bug is the Scheduler sending
    min_staff at all when only max changed."""
    from tests.fake_supabase import FakeSupabase

    fake = FakeSupabase({"shift_days": _diverged_rows()})
    svc.propagate_fields(fake, "s1", {"min_staff": 1, "max_staff": 4})

    by_day = {r["day_index"]: r for r in fake.rows("shift_days")}
    assert by_day[6]["min_staff"] == 1, "Sunday's 3 is gone — this is what the Scheduler does today"


def test_propagate_ignores_non_per_day_fields():
    from tests.fake_supabase import FakeSupabase

    fake = FakeSupabase({"shift_days": _diverged_rows()})
    svc.propagate_fields(fake, "s1", {"name": "Evening"})
    assert fake.wrote() == [], "a name edit must not touch shift_days at all"
