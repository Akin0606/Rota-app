"""The availability deadline the staff screen quotes belongs to the week on
screen (batch 10, I3).

The screen has a week switcher covering a month ahead, and it was labelling
every one of those weeks with a single sentence derived from the *currently
collecting* week's window ("closes Friday, 5am") — no date, and no way for a
week that genuinely shuts on a different day to say so. A staff member planning
three weeks out was reading a deadline that had already passed.

The close is per-week by construction: `close_for_week` honours a manager's
per-week override first, and otherwise runs the formula from that week's own
Monday. Both paths are exercised here through the endpoint the screen calls.
"""

from datetime import date, timedelta

from fastapi import HTTPException
import pytest

from models.schemas import WeekAvailabilityRequest
from routers import availability as availability_router
from tests.fake_supabase import FakeSupabase, patch_supabase

VENUE = {"id": "v1", "link_token": "gatehouse", "slug": "gatehouse",
         "name": "The Gatehouse Tavern", "is_active": True}
STAFF = {"id": "s1", "venue_id": "v1", "pin": "1234", "name": "Sam",
         "is_active": True, "pending": False, "is_under_18": False}
# 11am is the venue's earliest start every day, so the formula close is the
# same clock time each week — the *date* is what has to move.
SHIFT = {"id": "sh-day", "venue_id": "v1", "name": "Day", "start_time": "11:00am",
         "end_time": "6:00pm", "color": "#aaa", "sort_order": 0,
         "min_staff": 2, "max_staff": 3}


def _monday(weeks_ahead: int) -> date:
    today = date.today()
    return today - timedelta(days=today.weekday()) + timedelta(weeks=weeks_ahead)


def _fake(overrides=(), shifts=(SHIFT,)):
    return FakeSupabase({
        "venues": [dict(VENUE)],
        "staff_members": [dict(STAFF)],
        "shifts": [dict(s) for s in shifts],
        "shift_days": [],
        "availability_periods": [],
        "availability_submissions": [],
        "scheduling_rules": [{"venue_id": "v1"}],
        "schedule_week_overrides": list(overrides),
    })


def _closes_at(weeks_ahead: int, overrides=(), shifts=(SHIFT,)):
    fake = _fake(overrides, shifts)
    payload = WeekAvailabilityRequest(pin="1234", week_start=_monday(weeks_ahead).isoformat())
    with patch_supabase(fake, "routers.availability", "routers.rota",
                        "services.notice_window"):
        return availability_router.get_week_availability("gatehouse", payload)["closes_at"]


def test_each_week_carries_its_own_close():
    """The bug, stated directly: three weeks, three different answers."""
    seen = [_closes_at(w) for w in (0, 1, 2)]
    assert all(c is not None for c in seen)
    assert len(set(seen)) == 3


def test_the_close_lands_in_the_week_before_the_one_it_collects_for():
    """The formula is `earliest shift start - (72h legal notice + buffer)`, so a
    week's deadline falls the *previous* Friday. That is exactly why dropping
    the date was so misleading: "closes Friday, 5am" on w/c 14 Sep means Friday
    4 Sep, and a reader with only a weekday in front of them will assume the
    Friday inside the week they are looking at."""
    for w in (0, 1, 2):
        closes = date.fromisoformat(_closes_at(w)[:10])
        assert _monday(w) - timedelta(days=7) <= closes < _monday(w)


def test_a_per_week_override_is_what_the_staff_member_sees():
    """The case the old label could not represent at all: one week shut early
    for a private function. Before this, the screen quoted the formula day for
    every week regardless."""
    target = _monday(2)
    early = f"{(target + timedelta(days=1)).isoformat()}T09:00:00"
    overridden = _closes_at(2, overrides=[{"venue_id": "v1", "week_start": target.isoformat(),
                                           "close_at": early}])
    assert overridden == early
    # And it is genuinely a change — the formula would have said something else.
    assert overridden != _closes_at(2)


def test_a_venue_with_no_shifts_says_nothing():
    """There is no window to derive, so the screen drops the clause rather than
    falling back to a day nobody chose."""
    assert _closes_at(0, shifts=()) is None


def test_a_week_outside_the_planning_window_is_still_refused():
    """The deadline is additive — it must not widen what the endpoint accepts."""
    with pytest.raises(HTTPException) as err:
        _closes_at(9)
    assert err.value.status_code == 400
