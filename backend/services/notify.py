"""Best-effort notifications for the events that used to be invisible.

Every drop, claim, give, swap, join and leave request wrote one `activity_log`
row and stopped there — so a manager found out by opening the app and scrolling
a feed, and a staff member found out by reopening theirs. A shift dropped on
Friday night for Saturday's shift could sit unseen until someone happened to
look, which is exactly the case where the app is supposed to earn its keep.

Two rules hold everything here together:

- **A notification must never fail the action that caused it.** Sending is
  wrapped so a Resend outage or a missing address can't 500 a drop that has
  already been committed. The `activity_log` row remains the record of fact; an
  email is a courtesy on top of it.
- **It goes beside the existing log insert, not instead of it.** The feed is
  still the audit trail.
"""

from __future__ import annotations

from config import get_settings
from services import email_service


def _dashboard_url() -> str:
    return f"{get_settings().frontend_url.rstrip('/')}/dashboard"


def manager(venue: dict, headline: str, detail: str, cta: str = "Open Rotally") -> None:
    """Tell the venue's manager that something is waiting on them."""
    email = venue.get("manager_email")
    if not email:
        return
    try:
        email_service.send_manager_action_email(
            to_email=email,
            manager_name=venue.get("name") or "there",
            headline=headline,
            detail=detail,
            dashboard_link_url=_dashboard_url(),
            cta=cta,
        )
    except Exception:
        # Swallowed on purpose — see the module docstring. The action is done
        # and logged; a failed courtesy email must not undo it.
        pass


def staff(member: dict, venue: dict, headline: str, detail: str) -> None:
    """Tell a staff member the outcome of something they asked for."""
    email = member.get("email")
    if not email:
        return
    try:
        email_service.send_request_decision_email(
            to_email=email,
            name=member.get("name") or "there",
            venue_name=venue.get("name") or "your venue",
            headline=headline,
            detail=detail,
            venue_link_url=(
                f"{get_settings().frontend_url.rstrip('/')}/v/"
                f"{venue.get('slug') or venue['link_token']}/hub"
            ),
        )
    except Exception:
        pass
