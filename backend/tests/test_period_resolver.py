"""The consolidated resolver — what batch 2 replaces nine pickers with.

These began life as the inverse of tests/test_period_resolution.py, a
characterization file that pinned the old pickers behaviour (bugs included) so
the consolidation could prove what it changed. That file went with the
functions it described; what it recorded survives here as the docstring on each
test that reverses it, and `git show a396ee5` has the original if the
before-picture is ever wanted.
"""

from datetime import date, timedelta

from services import period_resolver
from tests.fake_supabase import FakeSupabase, patch_supabase

VENUE = "venue-1"
OTHER = "venue-2"


def _p(week: str, status: str, venue_id: str = VENUE, pid: str | None = None) -> dict:
    return {"id": pid or f"p-{week}", "venue_id": venue_id, "week_start": week, "status": status}


def _monday(offset_weeks: int = 0, anchor: date | None = None) -> str:
    today = anchor or period_resolver.london_today()
    monday = today - timedelta(days=today.weekday())
    return (monday + timedelta(weeks=offset_weeks)).isoformat()


def _run(periods, fn, *args, window_week: str | None = None, **kwargs):
    """Drive the resolver with a faked DB and a pinned notice window."""
    fake = FakeSupabase({"availability_periods": periods, "activity_log": []})
    original = period_resolver.notice_window.compute_for_venue
    period_resolver.notice_window.compute_for_venue = lambda vid, now=None: (
        {"week_monday": date.fromisoformat(window_week)} if window_week else None
    )
    try:
        with patch_supabase(fake, "services.period_resolver"):
            return fn(*args, **kwargs), fake
    finally:
        period_resolver.notice_window.compute_for_venue = original


# --- collection_period ------------------------------------------------------


def test_collection_period_follows_the_notice_window_not_the_newest_week():
    """With two weeks open the old picker took the furthest out (newest
    collecting, DESC). The window points at the nearest, and the window is what
    every deadline and every email is derived from."""
    periods = [_p(_monday(0), "collecting", pid="near"), _p(_monday(2), "collecting", pid="far")]
    got, _ = _run(periods, period_resolver.collection_period, VENUE, window_week=_monday(0))
    assert got["id"] == "near"


def test_collection_period_never_creates_a_period():
    """A8/D1 — the phantom loop, closed. The old code inserted a row here.

    This is the single most important assertion in the batch: it runs on a read
    path reachable from every staff login, and a create here also makes
    open_availability_for_venue early-return, silently skipping auto-submit and
    the availability-open email.
    """
    got, fake = _run([], period_resolver.collection_period, VENUE, window_week=_monday(1))
    assert got is None, "no period for that week yet is a real answer"
    assert fake.wrote() == [], "a read path must not write"
    assert fake.rows("availability_periods") == []
    assert fake.rows("activity_log") == []


def test_collection_period_returns_a_closed_week_rather_than_skipping_it():
    """If the window's week is already closed, say so. Silently swapping the
    staff member onto a different week is how the wrong week gets filled in."""
    periods = [_p(_monday(0), "closed", pid="shut"), _p(_monday(3), "collecting", pid="other")]
    got, _ = _run(periods, period_resolver.collection_period, VENUE, window_week=_monday(0))
    assert got["id"] == "shut"


def test_collection_period_falls_back_to_newest_collecting_with_no_shifts():
    """A brand new venue has no shifts, so no window can be derived."""
    periods = [_p(_monday(0), "collecting", pid="a"), _p(_monday(1), "collecting", pid="b")]
    got, _ = _run(periods, period_resolver.collection_period, VENUE, window_week=None)
    assert got["id"] == "b"


def test_collection_period_scoped_to_venue():
    periods = [_p(_monday(0), "collecting", venue_id=OTHER, pid="theirs")]
    got, _ = _run(periods, period_resolver.collection_period, VENUE, window_week=_monday(0))
    assert got is None


# --- staff_rota_period: both failure directions -----------------------------


def test_staff_rota_keeps_this_week_when_next_week_is_published():
    """A1 — the no-show bug, fixed. The old rule took the newest live week, so
    publishing next week made this week vanish from every staff member app."""
    periods = [_p(_monday(0), "published", pid="live-now"), _p(_monday(1), "published", pid="next")]
    got, _ = _run(periods, period_resolver.staff_rota_period, VENUE)
    assert got["id"] == "live-now", "staff keep the week they are standing in"


def test_staff_rota_can_still_address_next_week_explicitly():
    """The other direction, and the reason this is week-addressable rather than
    just 'covering today': someone who knows on Tuesday that they cannot work
    next Wednesday has to be able to reach it."""
    periods = [_p(_monday(0), "published", pid="live-now"), _p(_monday(1), "published", pid="next")]
    got, _ = _run(periods, period_resolver.staff_rota_period, VENUE, week_start=_monday(1))
    assert got["id"] == "next"


def test_staff_rota_falls_back_to_newest_live_in_a_gap_week():
    """Nothing published covers today — a quiet week, or the small hours of a
    Monday before the new week goes out. The most recent live week is what they
    were last working from."""
    periods = [_p(_monday(-2), "confirmed", pid="older"), _p(_monday(-1), "published", pid="last")]
    got, _ = _run(periods, period_resolver.staff_rota_period, VENUE)
    assert got["id"] == "last"


def test_staff_rota_refuses_a_week_that_is_not_live():
    """Week-addressable is not a way to read an unpublished draft."""
    periods = [_p(_monday(1), "generated", pid="draft")]
    got, _ = _run(periods, period_resolver.staff_rota_period, VENUE, week_start=_monday(1))
    assert got is None


def test_staff_rota_ignores_collecting_and_generated():
    periods = [_p(_monday(0), "collecting"), _p(_monday(1), "generated")]
    got, _ = _run(periods, period_resolver.staff_rota_period, VENUE)
    assert got is None


# --- newest_rota_period -----------------------------------------------------


def test_newest_rota_period_ignores_a_collecting_phantom():
    """A9 — the admin console used newest-of-any-status, so a phantom period
    (newest by definition) captured its rota view, generate and unpublish."""
    periods = [_p(_monday(0), "published", pid="real"), _p(_monday(3), "collecting", pid="phantom")]
    got, _ = _run(periods, period_resolver.newest_rota_period, VENUE)
    assert got["id"] == "real"


def test_newest_rota_period_includes_a_generated_week_that_placed_nobody():
    """Status-based, not assignment-based: a solve that placed nobody still
    produced a week support needs to be able to open."""
    periods = [_p(_monday(1), "generated", pid="empty-solve")]
    got, _ = _run(periods, period_resolver.newest_rota_period, VENUE)
    assert got["id"] == "empty-solve"


def test_newest_rota_period_none_before_anything_is_built():
    periods = [_p(_monday(0), "collecting")]
    got, _ = _run(periods, period_resolver.newest_rota_period, VENUE)
    assert got is None


# --- the disagreement, resolved ---------------------------------------------


def test_the_three_questions_now_have_three_defensible_answers():
    """The old pickers returned three different weeks here and at least one was
    always a phantom. These still return different weeks — correct, they are
    different questions — but each is now right for what it was asked, and none
    is a week nobody was ever asked about.
    """
    periods = [
        _p(_monday(0), "published", pid="live"),
        _p(_monday(1), "collecting", pid="collecting-now"),
        _p(_monday(3), "collecting", pid="phantom"),
    ]
    collecting, _ = _run(periods, period_resolver.collection_period, VENUE, window_week=_monday(1))
    rota, _ = _run(periods, period_resolver.staff_rota_period, VENUE)
    admin_target, _ = _run(periods, period_resolver.newest_rota_period, VENUE)

    assert collecting["id"] == "collecting-now", "the week the window points at"
    assert rota["id"] == "live", "the week staff are standing in"
    assert admin_target["id"] == "live", "the newest week that has a rota"
    assert "phantom" not in {collecting["id"], rota["id"], admin_target["id"]}


# --- the guarantee that has to survive every future change ------------------


def test_no_resolver_function_ever_writes():
    """D1, as a standing guard rather than a comment.

    The predecessor of collection_period created a period when it could not
    find one, on a path reachable from every staff login. Beyond manufacturing
    weeks nothing pointed at, the row it wrote made
    cron.open_availability_for_venue early-return, silently skipping both
    auto-submit and the availability-open email for that week.

    So: resolution is a question, never an action. If a future change needs a
    period created, it belongs in open_availability_for_venue, which is
    idempotent and does the whole job.
    """
    periods = [_p(_monday(0), "published"), _p(_monday(1), "collecting")]
    for fn, kwargs in (
        (period_resolver.collection_period, {}),
        (period_resolver.staff_rota_period, {}),
        (period_resolver.staff_rota_period, {"week_start": _monday(1)}),
        (period_resolver.newest_rota_period, {}),
    ):
        for window in (_monday(1), None):
            _, fake = _run(periods, fn, VENUE, window_week=window, **kwargs)
            assert fake.wrote() == [], f"{fn.__name__} wrote to the database"

    # And the same holds when it finds nothing at all, which is where the old
    # code did its damage.
    for window in (_monday(3), None):
        _, fake = _run([], period_resolver.collection_period, VENUE, window_week=window)
        assert fake.wrote() == []
