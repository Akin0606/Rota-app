"""Characterization tests for the CP-SAT solver's compliance-bearing helpers.

These pin the CURRENT behaviour of the hardcoded single-time-per-shift model as
a baseline before the per-day shift-model rebuild (SHIFT_MODEL_BUILD_PROMPT.md).
Batches 1-3 must keep these green — where per-day intentionally *changes* a
result (e.g. the ``"close"`` -> 23.0 lossiness), the changing test is updated in
the same batch that changes the code, and the reason recorded in the diff.

Deliberately includes a ``"close"`` case so the known-lossy 23.0 duration is
pinned before Batch 1 replaces it with a real stored time.
"""

import pytest

from services import solver
from services.solver import (
    UNDER18_MAX_HOURS_PER_DAY,
    UNDER18_MIN_REST_HOURS,
    check_manual_assignment,
    shift_duration_hours,
    _parse_hour,
    _rest_gap_hours,
    _shift_bounds,
    _shift_touches_night_hours,
)


def shift(name="Day", start="9:00am", end="5:00pm", min_staff=1, max_staff=2, sid=None):
    return {
        "id": sid or name.lower(),
        "name": name,
        "start_time": start,
        "end_time": end,
        "min_staff": min_staff,
        "max_staff": max_staff,
    }


# --------------------------------------------------------------------------- #
# _parse_hour                                                                  #
# --------------------------------------------------------------------------- #

@pytest.mark.parametrize(
    "text,expected",
    [
        ("9:00am", 9.0),
        ("12:00am", 0.0),   # midnight
        ("12:00pm", 12.0),  # noon
        ("5:00pm", 17.0),
        ("2:30pm", 14.5),
        ("close", 23.0),    # LOSSY: pinned so Batch 1 can prove it changes
    ],
)
def test_parse_hour(text, expected):
    assert _parse_hour(text) == expected


# --------------------------------------------------------------------------- #
# shift_duration_hours / _shift_bounds                                         #
# --------------------------------------------------------------------------- #

def test_duration_normal_daytime():
    assert shift_duration_hours(shift(start="9:00am", end="5:00pm")) == 8.0


def test_duration_close_is_lossy_23():
    # "close" resolves to 23.0, so a 5pm->close evening reads as exactly 6.0h.
    # This is the under-reporting Batch 1 fixes; pinned here as the baseline.
    assert shift_duration_hours(shift(start="5:00pm", end="close")) == 6.0


def test_duration_crosses_midnight():
    # 6pm -> 2am unrolls to 18.0 -> 26.0 = 8.0h.
    assert shift_duration_hours(shift(start="6:00pm", end="2:00am")) == 8.0


def test_bounds_unroll_past_midnight():
    start, end = _shift_bounds(shift(start="6:00pm", end="2:00am"))
    assert (start, end) == (18.0, 26.0)


# --------------------------------------------------------------------------- #
# _shift_touches_night_hours (22:00-06:00 window)                             #
# --------------------------------------------------------------------------- #

def test_night_daytime_shift_is_safe():
    assert _shift_touches_night_hours(shift(start="9:00am", end="5:00pm")) is False


def test_night_boundary_6am_to_10pm_is_safe():
    # Exactly 06:00 start and 22:00 end are on the safe boundary (inclusive).
    assert _shift_touches_night_hours(shift(start="6:00am", end="10:00pm")) is False


def test_night_midnight_crossing_touches_night():
    assert _shift_touches_night_hours(shift(start="6:00pm", end="2:00am")) is True


def test_night_early_start_touches_night():
    assert _shift_touches_night_hours(shift(start="5:00am", end="1:00pm")) is True


# --------------------------------------------------------------------------- #
# _rest_gap_hours (end of day d -> start of day d+1)                          #
# --------------------------------------------------------------------------- #

def test_rest_gap_daytime_to_daytime():
    a = shift(start="9:00am", end="5:00pm")   # ends 17.0
    b = shift(start="9:00am", end="5:00pm")   # starts 9.0
    assert _rest_gap_hours(a, b) == 16.0      # (24 + 9) - 17


def test_rest_gap_uses_unrolled_end_of_midnight_crosser():
    a = shift(start="6:00pm", end="2:00am")   # unrolled end 26.0
    b = shift(start="9:00am", end="5:00pm")   # starts 9.0
    assert _rest_gap_hours(a, b) == 7.0       # (24 + 9) - 26


# --------------------------------------------------------------------------- #
# check_manual_assignment — under-18 hard blocks (severity == "block")        #
# --------------------------------------------------------------------------- #

U18 = {"id": "u18", "name": "Teen", "is_under_18": True}
ADULT = {"id": "ad", "name": "Adult", "is_under_18": False}
DEFAULT_RULES = {"max_hours_per_week": 48, "min_rest_hours": 11, "require_day_off": True}


def test_u18_block_shift_too_long():
    long_shift = shift(name="Long", start="9:00am", end="8:00pm")  # 11h > 8
    res = check_manual_assignment(
        U18, 2, long_shift, [], {long_shift["id"]: long_shift}, DEFAULT_RULES
    )
    assert res["severity"] == "block"
    assert "daily limit" in res["reason"]


def test_u18_block_night_hours():
    eve = shift(name="Eve", start="6:00pm", end="11:00pm")  # 5h but touches night
    res = check_manual_assignment(
        U18, 2, eve, [], {eve["id"]: eve}, DEFAULT_RULES
    )
    assert res["severity"] == "block"
    assert "night hours" in res["reason"]


def test_u18_block_weekly_cap():
    day = shift(name="Day", start="9:00am", end="5:00pm")  # 8h, night-safe
    rules = {**DEFAULT_RULES, "max_hours_per_week": 20}    # cap = min(20, 40) = 20
    others = [
        {"day_index": 0, "shift_id": day["id"]},
        {"day_index": 2, "shift_id": day["id"]},
    ]  # 16h; adding on day 4 -> 24h > 20
    res = check_manual_assignment(U18, 4, day, others, {day["id"]: day}, rules)
    assert res["severity"] == "block"
    assert "weekly limit" in res["reason"]


def test_u18_block_insufficient_rest():
    late = shift(name="Late", sid="late", start="2:00pm", end="10:00pm")  # ends 22, safe
    early = shift(name="Early", sid="early", start="8:00am", end="4:00pm")  # starts 8
    shifts_by_id = {late["id"]: late, early["id"]: early}
    others = [{"day_index": 2, "shift_id": late["id"]}]  # neighbor on day 2
    # Adding early on day 3: gap = (24 + 8) - 22 = 10h < 12h U18 minimum.
    res = check_manual_assignment(U18, 3, early, others, shifts_by_id, DEFAULT_RULES)
    assert res["severity"] == "block"
    assert f"{UNDER18_MIN_REST_HOURS:.0f}h minimum" in res["reason"]


def test_u18_block_no_two_consecutive_days_off():
    day = shift(name="Day", start="9:00am", end="5:00pm")  # 8h, night-safe
    others = [
        {"day_index": 0, "shift_id": day["id"]},
        {"day_index": 2, "shift_id": day["id"]},
        {"day_index": 4, "shift_id": day["id"]},
    ]  # working 0,2,4,6 -> free days 1,3,5, none adjacent
    res = check_manual_assignment(U18, 6, day, others, {day["id"]: day}, DEFAULT_RULES)
    assert res["severity"] == "block"
    assert "consecutive days off" in res["reason"]


def test_u18_ok_when_legal():
    day = shift(name="Day", start="9:00am", end="5:00pm")
    others = [{"day_index": 0, "shift_id": day["id"]}]
    res = check_manual_assignment(U18, 2, day, others, {day["id"]: day}, DEFAULT_RULES)
    assert res["severity"] == "ok"
    assert res["reason"] is None


# --------------------------------------------------------------------------- #
# check_manual_assignment — adult confirms (severity == "confirm")            #
# --------------------------------------------------------------------------- #

def test_adult_confirm_on_leave():
    day = shift(name="Day", start="9:00am", end="5:00pm")
    res = check_manual_assignment(
        ADULT, 2, day, [], {day["id"]: day}, DEFAULT_RULES, on_leave=True
    )
    assert res["severity"] == "confirm"
    assert "leave" in res["reason"]


def test_adult_confirm_over_weekly_hours():
    day = shift(name="Day", start="9:00am", end="5:00pm")  # 8h
    rules = {**DEFAULT_RULES, "max_hours_per_week": 20}
    others = [
        {"day_index": 0, "shift_id": day["id"]},
        {"day_index": 2, "shift_id": day["id"]},
    ]  # 16h; add on day 4 -> 24h > 20
    res = check_manual_assignment(ADULT, 4, day, others, {day["id"]: day}, rules)
    assert res["severity"] == "confirm"
    assert "weekly limit" in res["reason"]


def test_adult_confirm_insufficient_rest():
    late = shift(name="Late", sid="late", start="2:00pm", end="10:00pm")  # ends 22
    early = shift(name="Early", sid="early", start="8:00am", end="4:00pm")  # starts 8
    shifts_by_id = {late["id"]: late, early["id"]: early}
    others = [{"day_index": 2, "shift_id": late["id"]}]
    # gap = 10h < 11h adult minimum rest
    res = check_manual_assignment(ADULT, 3, early, others, shifts_by_id, DEFAULT_RULES)
    assert res["severity"] == "confirm"
    assert "minimum rest" in res["reason"]


def test_adult_confirm_no_day_off():
    short = shift(name="Short", start="10:00am", end="12:00pm")  # 2h, generous rest
    others = [{"day_index": d, "shift_id": short["id"]} for d in range(6)]  # days 0-5
    res = check_manual_assignment(ADULT, 6, short, others, {short["id"]: short}, DEFAULT_RULES)
    assert res["severity"] == "confirm"
    assert "no day off" in res["reason"]


def test_adult_ok_when_within_rules():
    day = shift(name="Day", start="9:00am", end="5:00pm")
    others = [{"day_index": 0, "shift_id": day["id"]}]
    res = check_manual_assignment(ADULT, 2, day, others, {day["id"]: day}, DEFAULT_RULES)
    assert res["severity"] == "ok"
    assert res["reason"] is None
