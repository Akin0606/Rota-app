"""E9 — a venue still being set up must not email its staff.

Almost every write the onboarding wizard makes ends in
`cron_scheduler.refresh_jobs()`, which calls straight back into
`open_availability_for_venue` whenever the clock is already inside a notice
window. That creates the collecting period and emails every active staff member
"tell us your availability" — while the manager is still three screens from
finishing, with hours and coverage they are about to change.

It was silent only because onboarding could not capture an email address.
Batch 9 fixes exactly that (E1), so this stops being theoretical the moment it
ships.
"""

import pytest

from routers import cron
from tests.fake_supabase import FakeSupabase, patch_supabase

VENUE_ID = "v1"
MONDAY = "2026-09-14"


def _venue(setup_state):
    return {"id": VENUE_ID, "name": "The Gatehouse", "link_token": "gatehouse",
            "setup_state": setup_state}


@pytest.fixture
def fake(monkeypatch):
    f = FakeSupabase({"availability_periods": [], "activity_log": [], "staff_members": []})
    # The window calculation and the send are both out of scope here; what is
    # being pinned is whether we get as far as either.
    monkeypatch.setattr(cron, "_target_open_week", lambda _vid: __import__("datetime").date.fromisoformat(MONDAY))
    monkeypatch.setattr(cron, "_auto_submit_for_new_period", lambda *a: None)
    sent: list = []
    monkeypatch.setattr(cron, "_send_open_emails", lambda v, w: sent.append((v["id"], w)))
    f.sent = sent
    return f


MID_WIZARD = [
    ({"step": 2, "name": "Sam"}, "a blob with a step is a wizard in flight"),
    ({"step": 7}, "even the last step is still setup"),
    ({}, "a blob with nothing in it is a blob, and nothing writes one"),
]


@pytest.mark.parametrize("state, why", MID_WIZARD)
def test_a_venue_mid_setup_gets_no_period_and_no_email(fake, state, why):
    with patch_supabase(fake, "routers.cron"):
        assert cron.open_availability_for_venue(_venue(state)) is None, why
    assert fake.rows("availability_periods") == [], why
    assert fake.sent == [], why


@pytest.mark.parametrize("state", [None, {"completed": True}])
def test_a_finished_venue_opens_normally(fake, state):
    """The guard must not become a venue that never opens. Both shapes the
    wizard leaves behind — a cleared null and an explicit completed flag —
    count as finished, as does a legacy venue that predates save-and-resume."""
    with patch_supabase(fake, "routers.cron"):
        period = cron.open_availability_for_venue(_venue(state))
    assert period is not None
    assert len(fake.rows("availability_periods")) == 1
    assert fake.sent == [(VENUE_ID, __import__("datetime").date.fromisoformat(MONDAY))]


def test_the_predicate_is_the_whole_rule():
    assert cron.setup_is_complete({"setup_state": None})
    assert cron.setup_is_complete({})
    assert cron.setup_is_complete({"setup_state": {"completed": True}})
    assert not cron.setup_is_complete({"setup_state": {"step": 4}})
