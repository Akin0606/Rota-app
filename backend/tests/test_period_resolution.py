"""Characterization tests for period resolution — the safety net for batch 2.

These pin what each picker returns TODAY, bugs included. They are not a
statement that the current behaviour is right; several of them encode the exact
defects batch 2 exists to fix, and say so. The point is that the consolidation
onto services/period_resolver.py has to prove which behaviours it changed and
which it left alone, across nine call sites that currently have no coverage.

Where a test encodes a known defect it is named `..._today_...` and carries the
finding id, so a future change that flips it is an intentional edit rather than
a surprise.
"""

from datetime import date, timedelta

from tests.fake_supabase import FakeSupabase, patch_supabase

VENUE = "venue-1"
OTHER = "venue-2"


def _p(week: str, status: str, venue_id: str = VENUE, pid: str | None = None) -> dict:
    return {
        "id": pid or f"p-{week}-{status}",
        "venue_id": venue_id,
        "week_start": week,
        "status": status,
    }


def _monday(offset_weeks: int = 0) -> str:
    today = date.today()
    monday = today - timedelta(days=today.weekday())
    return (monday + timedelta(weeks=offset_weeks)).isoformat()


def _fake(periods: list[dict]) -> FakeSupabase:
    return FakeSupabase({"availability_periods": periods, "activity_log": []})


# --- picker 2: availability._get_current_period -----------------------------
# Rule today: newest `collecting`, by week_start DESC.


def test_current_period_takes_newest_collecting():
    from routers import availability

    fake = _fake([_p(_monday(0), "collecting"), _p(_monday(2), "collecting")])
    with patch_supabase(fake, "routers.availability"):
        got = availability._get_current_period(VENUE)
    # This is the defect, not a feature: with two weeks open the staff app
    # collects for the furthest-out one while the notice window points at the
    # nearest. Batch 2's collection_period must reverse this.
    assert got["week_start"] == _monday(2)


def test_current_period_ignores_other_venues():
    from routers import availability

    fake = _fake([_p(_monday(3), "collecting", venue_id=OTHER), _p(_monday(0), "collecting")])
    with patch_supabase(fake, "routers.availability"):
        got = availability._get_current_period(VENUE)
    assert got["week_start"] == _monday(0)


def test_current_period_none_when_nothing_collecting():
    from routers import availability

    fake = _fake([_p(_monday(0), "published"), _p(_monday(1), "generated")])
    with patch_supabase(fake, "routers.availability"):
        assert availability._get_current_period(VENUE) is None


# --- picker 2b: _get_or_create_current_period — the phantom generator (A4/A8)


def test_get_or_create_returns_existing_without_writing():
    from routers import availability

    fake = _fake([_p(_monday(0), "collecting")])
    with patch_supabase(fake, "routers.availability"):
        got = availability._get_or_create_current_period(VENUE)
    assert got["week_start"] == _monday(0)
    assert fake.wrote() == [], "a read that finds a period must not write"


def test_get_or_create_today_invents_earliest_free_week():
    """A8 — the phantom loop, pinned.

    With every week published there is nothing collecting, so this silently
    inserts a brand new period for the earliest free week: one no notice window
    points at, which then becomes what the admin console targets. Batch 2 must
    make this impossible; when it does, rewrite this to assert no row is created.
    """
    from routers import availability

    fake = _fake([_p(_monday(0), "published"), _p(_monday(1), "published")])
    with patch_supabase(fake, "routers.availability"):
        got = availability._get_or_create_current_period(VENUE)

    assert got["week_start"] == _monday(2), "skips taken weeks, takes the earliest free one"
    assert got["status"] == "collecting"
    assert ("insert", "availability_periods") in fake.calls, "a READ path created a period"
    # It announces itself as an ordinary open, which is why the loop is hard to
    # spot in the activity log.
    log = fake.rows("activity_log")
    assert len(log) == 1 and log[0]["action"] == "availability_opened"
    assert "(auto)" in log[0]["detail"]


def test_get_or_create_today_is_reachable_from_an_ordinary_staff_read():
    """The trigger is hot: this runs off staff PIN auth, which fires on every
    login and every hub load, not some rare admin action."""
    from routers import availability

    fake = _fake([])
    with patch_supabase(fake, "routers.availability"):
        availability._get_or_create_current_period(VENUE)
    assert len(fake.rows("availability_periods")) == 1


# --- picker 5: availability._get_published_period — A1, the no-show bug -----


def test_published_period_takes_newest_published_or_confirmed():
    from routers import availability

    fake = _fake([_p(_monday(0), "published"), _p(_monday(1), "confirmed")])
    with patch_supabase(fake, "routers.availability"):
        got = availability._get_published_period(VENUE)
    assert got["week_start"] == _monday(1)


def test_published_period_today_hides_the_live_week_once_next_is_published():
    """A1 — the no-show bug, pinned.

    This is the sole period source for _build_staff_rota and all eight
    drop/give/swap/claim endpoints. Publish next week while this week is still
    being worked and every staff member loses the week they are actually in:
    the rota they are working from vanishes and its shifts become undroppable.
    """
    from routers import availability

    fake = _fake([_p(_monday(0), "published", pid="live-now"), _p(_monday(1), "published", pid="next")])
    with patch_supabase(fake, "routers.availability"):
        got = availability._get_published_period(VENUE)
    assert got["id"] == "next", "today: the week staff are standing in is not what they get"


def test_published_period_ignores_collecting_and_generated():
    from routers import availability

    fake = _fake([_p(_monday(0), "collecting"), _p(_monday(1), "generated")])
    with patch_supabase(fake, "routers.availability"):
        assert availability._get_published_period(VENUE) is None


# --- picker 4: admin._latest_period — newest of ANY status (A9) -------------


def test_admin_latest_period_takes_newest_of_any_status():
    """A9 — one rule serving two questions. It backs both the submitted flags
    (which want the week being collected for) and the rota view / generate /
    unpublish (which want the newest week with a rota). A phantom period is
    newest by definition, so it captures both.
    """
    from routers import admin

    fake = _fake([_p(_monday(0), "published"), _p(_monday(3), "collecting", pid="phantom")])
    with patch_supabase(fake, "routers.admin"):
        got = admin._latest_period(VENUE)
    assert got["id"] == "phantom"


def test_admin_latest_period_scoped_to_venue():
    from routers import admin

    fake = _fake([_p(_monday(4), "collecting", venue_id=OTHER), _p(_monday(0), "published")])
    with patch_supabase(fake, "routers.admin"):
        got = admin._latest_period(VENUE)
    assert got["week_start"] == _monday(0)


# --- the disagreement itself ------------------------------------------------


def test_the_pickers_disagree_on_the_same_venue():
    """The whole point of batch 2, in one assertion.

    One venue, one moment: the staff app collects for one week, the staff rota
    shows another, and the admin console targets a third. Every one of them is
    behaving exactly as written.
    """
    from routers import admin, availability

    periods = [
        _p(_monday(0), "published", pid="live"),
        _p(_monday(1), "collecting", pid="collecting-soon"),
        _p(_monday(3), "collecting", pid="phantom"),
    ]
    with patch_supabase(_fake(periods), "routers.availability"):
        collecting = availability._get_current_period(VENUE)
        staff_rota = availability._get_published_period(VENUE)
    with patch_supabase(_fake(periods), "routers.admin"):
        admin_target = admin._latest_period(VENUE)

    assert collecting["id"] == "phantom"
    assert staff_rota["id"] == "live"
    assert admin_target["id"] == "phantom"
    assert len({collecting["id"], staff_rota["id"]}) == 2, "two surfaces, two different weeks"
