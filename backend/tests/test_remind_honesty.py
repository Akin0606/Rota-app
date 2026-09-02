"""What the chase loop reports (batch 6, D1).

`remind` used to return `{reminded: N, email_sent: bool}` where `email_sent`
meant "at least one email went out". Chasing seven people of whom three have an
address therefore reported the same success as chasing seven who all do — and
the manager's chase screen then ticked all seven green off a list of four they
had actually reached. Someone with no email on file cannot be chased through
the app at all, so that has to come back named, not folded into a count.

The plan's exit test is the first case here: chase 7 where 3 have email, and
the response reports exactly that and names the 4.
"""

import pytest

from models.schemas import RemindRequest
from routers import staff as staff_router
from tests.fake_supabase import FakeSupabase, patch_supabase

VENUE = {
    "id": "v1",
    "manager_id": "m1",
    "name": "The Gatehouse Tavern",
    "link_token": "the-gatehouse-tavern",
    "is_active": True,
}
PERIOD = {"id": "p1", "venue_id": "v1", "week_start": "2026-09-07", "status": "collecting"}


def _roster(with_email: int, total: int = 7) -> list[dict]:
    return [
        {
            "id": f"s{i}",
            "venue_id": "v1",
            "name": f"Staff {i}",
            "email": f"s{i}@example.com" if i < with_email else None,
            "pin": f"100{i}",
            "is_active": True,
            "pending": False,
        }
        for i in range(total)
    ]


@pytest.fixture
def sent_ok(monkeypatch):
    """Every send succeeds. Records the addresses actually written to."""
    calls: list[str] = []

    def fake_send(*, to_email, **kwargs):
        calls.append(to_email)
        return {"status": "sent"}

    monkeypatch.setattr(
        staff_router.email_service, "send_availability_reminder_email", fake_send
    )
    return calls


def _remind(fake: FakeSupabase, **kwargs):
    # `notice_window` is patched too: the reminder's deadline copy resolves the
    # venue's close time through it, so leaving it bound to the real client
    # sends a test straight at production.
    with patch_supabase(fake, "routers.staff", "services.auth_service", "services.notice_window"):
        return staff_router.remind(RemindRequest(**kwargs), manager={"id": "m1"})


def _fake(roster, submissions=()):
    return FakeSupabase(
        {
            "venues": [VENUE],
            "staff_members": roster,
            "availability_periods": [PERIOD],
            "availability_submissions": list(submissions),
            "activity_log": [],
        }
    )


def test_chasing_seven_where_three_have_email_reports_exactly_that(sent_ok):
    """The plan's exit test. Three emails go out; the other four come back by
    name, because 'we couldn't reach these four' is the actionable half."""
    fake = _fake(_roster(with_email=3))
    result = _remind(fake, period_id="p1")

    assert result["reminded"] == 7
    assert len(result["emailed"]) == 3
    assert len(result["skipped_no_email"]) == 4
    assert result["failed"] == []
    assert [p["name"] for p in result["skipped_no_email"]] == [
        "Staff 3", "Staff 4", "Staff 5", "Staff 6",
    ]
    assert sorted(sent_ok) == ["s0@example.com", "s1@example.com", "s2@example.com"]


def test_only_the_people_actually_emailed_come_back_as_emailed(sent_ok):
    """The ids are what the chase screen ticks. Anyone without an address must
    not appear in `emailed`, or the tick lies about who was reached."""
    fake = _fake(_roster(with_email=3))
    result = _remind(fake, period_id="p1")
    assert {p["id"] for p in result["emailed"]} == {"s0", "s1", "s2"}
    assert {p["id"] for p in result["skipped_no_email"]} == {"s3", "s4", "s5", "s6"}


def test_a_send_that_fails_is_reported_separately_from_no_address(monkeypatch):
    """Two different problems with two different fixes: a bad address the
    manager can correct, versus a delivery failure worth retrying."""
    def flaky(*, to_email, **kwargs):
        return {"status": "sent" if to_email == "s0@example.com" else "error"}

    monkeypatch.setattr(
        staff_router.email_service, "send_availability_reminder_email", flaky
    )
    fake = _fake(_roster(with_email=3))
    result = _remind(fake, period_id="p1")

    assert [p["id"] for p in result["emailed"]] == ["s0"]
    assert [p["id"] for p in result["failed"]] == ["s1", "s2"]
    assert len(result["skipped_no_email"]) == 4


def test_nobody_reachable_is_reported_as_nobody_reached(monkeypatch):
    """The worst case has to be legible: a venue where nobody has an address
    gets `reminded: 7` and zero emails, not a success."""
    monkeypatch.setattr(
        staff_router.email_service,
        "send_availability_reminder_email",
        lambda **kwargs: {"status": "sent"},
    )
    fake = _fake(_roster(with_email=0))
    result = _remind(fake, period_id="p1")
    assert result["reminded"] == 7
    assert result["emailed"] == []
    assert len(result["skipped_no_email"]) == 7


def test_people_who_already_submitted_are_not_chased(sent_ok):
    """D4 — closed by batch 2, pinned here so it stays closed."""
    fake = _fake(
        _roster(with_email=7),
        submissions=[{"staff_id": "s0", "period_id": "p1"}, {"staff_id": "s1", "period_id": "p1"}],
    )
    result = _remind(fake, period_id="p1")
    assert result["reminded"] == 5
    assert {p["id"] for p in result["emailed"]} == {"s2", "s3", "s4", "s5", "s6"}


def test_the_activity_log_records_what_was_sent_not_what_was_attempted(sent_ok):
    """The row used to be written before a single email was attempted, claiming
    the full target count — an audit trail of a chase that may have reached
    nobody."""
    fake = _fake(_roster(with_email=3))
    _remind(fake, period_id="p1")
    logged = fake.tables["activity_log"]
    assert len(logged) == 1
    assert logged[0]["detail"] == "Reminded 3 of 7 staff who haven't submitted"


def test_a_single_target_with_no_address_is_logged_as_not_reminded(sent_ok):
    """Chasing one person who has no email is the case where 'Reminded X' in
    the feed is flatly untrue."""
    fake = _fake(_roster(with_email=0, total=1))
    result = _remind(fake, staff_id="s0")
    assert result["emailed"] == []
    assert fake.tables["activity_log"][0]["detail"] == (
        "Couldn't remind Staff 0 — no email address on file"
    )
