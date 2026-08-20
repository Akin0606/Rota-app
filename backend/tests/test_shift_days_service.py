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
