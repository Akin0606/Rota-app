"""Tests for the shared per-day accessor (services/shift_bounds).

Batch 1 is fallback-only: with the total backfill in place every (shift, day)
has a row identical to the shift-level values, so the accessor returns the same
numbers whether it reads a row or falls back. These prove both paths and the
existence semantics per-day will rely on in Batch 3.
"""

from services.shift_bounds import (
    bounds_for,
    exists_on_day,
    index_shift_days,
    staffing_for,
)

SHIFT = {
    "id": "s1",
    "name": "Day",
    "start_time": "9:00am",
    "end_time": "5:00pm",
    "min_staff": 1,
    "max_staff": 3,
}


def test_bounds_fallback_when_no_index():
    assert bounds_for(SHIFT, 2, None) == ("9:00am", "5:00pm")


def test_staffing_fallback_when_no_index():
    assert staffing_for(SHIFT, 2, None) == (1, 3)


def test_staffing_fallback_defaults_when_missing():
    bare = {"id": "s2", "start_time": "9:00am", "end_time": "5:00pm"}
    assert staffing_for(bare, 0, None) == (1, 2)


def test_bounds_prefers_shift_day_row():
    rows = [
        {"shift_id": "s1", "day_index": 4, "start_time": "5:00pm",
         "end_time": "2:30am", "min_staff": 2, "max_staff": 4},
    ]
    idx = index_shift_days(rows)
    # Day 4 has a distinct late row; other days fall back to shift-level.
    assert bounds_for(SHIFT, 4, idx) == ("5:00pm", "2:30am")
    assert staffing_for(SHIFT, 4, idx) == (2, 4)
    assert bounds_for(SHIFT, 0, idx) == ("9:00am", "5:00pm")


def test_exists_on_day_true_without_index():
    assert exists_on_day(SHIFT, 0, None) is True


def test_exists_on_day_true_for_present_row():
    idx = index_shift_days([
        {"shift_id": "s1", "day_index": 5, "start_time": "9:00am",
         "end_time": "5:00pm", "min_staff": 1, "max_staff": 2},
    ])
    assert exists_on_day(SHIFT, 5, idx) is True


def test_exists_on_day_false_for_closed_day():
    # Shift has SOME rows but not day 0 -> that day is closed.
    idx = index_shift_days([
        {"shift_id": "s1", "day_index": 5, "start_time": "9:00am",
         "end_time": "5:00pm", "min_staff": 1, "max_staff": 2},
    ])
    assert exists_on_day(SHIFT, 0, idx) is False


def test_exists_on_day_fallback_for_unmigrated_shift():
    # Index exists but has no rows for THIS shift -> unmigrated, runs every day.
    idx = index_shift_days([
        {"shift_id": "other", "day_index": 0, "start_time": "9:00am",
         "end_time": "5:00pm", "min_staff": 1, "max_staff": 2},
    ])
    assert exists_on_day(SHIFT, 0, idx) is True
