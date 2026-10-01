"""What the weekly cycle's emails say, rendered from the real templates.

Two of them make promises about weeks the app hasn't finished with. The close
tells staff a week has locked and when to expect their shifts, but the publish
email reaches only people who have shifts, so that promise has to be
conditional. And the manager's review is the only place a joiner's skipped
availability comes up, so it has to name them and say what to do next.
"""

import pytest

from services import email_service

WEEK = "w/c 12 Oct 2026"


@pytest.fixture
def outbox(monkeypatch):
    sent = []

    def capture(to_email, subject, html, attachments=None):
        sent.append({"to": to_email, "subject": subject, "html": html})
        return {"status": "sent"}

    monkeypatch.setattr(email_service, "_send", capture)
    return sent


def _closed() -> None:
    email_service.send_availability_closed_email(
        to_email="ada@example.test", name="Ada", venue_name="The Gatehouse", week_label=WEEK
    )


def _review(*, waiting, has_rota=True) -> None:
    email_service.send_manager_review_email(
        to_email="manager@example.test",
        manager_name="there",
        venue_name="The Gatehouse",
        week_label=WEEK,
        submitted_count=1,
        total_count=2,
        review_link_url="https://app.example.test/rota",
        has_rota=has_rota,
        waiting=waiting,
    )


# The closed email ------------------------------------------------------------


def test_the_closed_email_promises_shifts_only_to_the_people_on_the_rota(outbox):
    """Approved staff the solve gives no shifts get no publish email, so an
    unconditional "you'll be notified" leaves them waiting for nothing."""
    _closed()

    [email] = outbox
    assert "If you're on it, we'll email your shifts once it's published." in email["html"]
    assert "notified" not in email["html"]


def test_the_closed_email_has_no_link(outbox):
    """The staff rota page opens the published week, never the one that has
    just locked, so any link here would show the wrong week."""
    _closed()

    [email] = outbox
    assert "<a " not in email["html"]


# The manager's review --------------------------------------------------------


@pytest.mark.parametrize(
    "names, who, approved",
    [
        (["Jess"], "Jess", "isn't"),
        (["Jess", "Sam"], "Jess and Sam", "aren't"),
        (["Jess", "Kit", "Sam"], "Jess, Kit and Sam", "aren't"),
        (["Ali", "Jess", "Kit", "Sam"], "Ali, Jess and 2 others", "aren't"),
    ],
)
def test_the_review_names_joiners_whose_availability_was_skipped(outbox, names, who, approved):
    _review(waiting=names)

    [email] = outbox
    assert (
        f"{who} sent availability for {WEEK} but {approved} approved yet, so auto-fill skipped them. "
        "Approve them on the Staff tab, then re-run auto-fill (under More)."
    ) in email["html"]


def test_with_no_rota_the_joiner_line_says_to_build_it(outbox):
    """A week the solve couldn't build stays closed, and its page offers to
    build it rather than re-run anything."""
    _review(waiting=["Jess"], has_rota=False)

    [email] = outbox
    assert "Approve them on the Staff tab, then build the rota." in email["html"]
    assert "re-run auto-fill" not in email["html"]


def test_the_review_says_nothing_about_joiners_when_none_answered(outbox):
    _review(waiting=[])

    [email] = outbox
    assert "approved yet" not in email["html"]


def test_joiner_names_are_escaped(outbox):
    """A joiner types their own name on the public join page."""
    _review(waiting=["<img src=x onerror=alert(1)>"])

    [email] = outbox
    assert "<img" not in email["html"]
    assert "&lt;img src=x onerror=alert(1)&gt; sent availability" in email["html"]
