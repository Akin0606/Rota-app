"""Single source of truth for "is this venue entitled to the paid product?"

Two independent gates decide what a venue can do:

  * is_active  — the admin's on/off switch (soft-disable). Owned by the admin
    console; unrelated to money. A disabled venue is disabled regardless of
    billing, and `get_manager_venue(require_active=True)` already 403s on it.

  * entitlement — is this venue paying, in trial, in grace, OR comped? Owned
    here. A non-entitled venue keeps its data and its login but cannot run the
    paid machinery (auto-solve, publish, outbound rota/reminder email).

Comp (billing_exempt) is checked FIRST and completely independently of Stripe.
subscription_status is written by the Stripe webhook keyed on
stripe_customer_id; comp is never touched by it, so a design-partner venue can
never be un-comped by a subscription event. See migration 031.

Kept deliberately free of any Stripe import so the concurrent billing session
owns routers/billing.py alone. The ~10 lines of effective-status logic are
duplicated from billing._effective_status on purpose rather than imported —
services must not depend on routers, and the rule is small and stable.
"""

from datetime import datetime, timezone

# Statuses that still grant access. past_due keeps a grace window (Stripe is
# retrying the card); cancelled/expired do not. Mirrors the frontend gate in
# (manager)/layout.tsx, which redirects exactly {cancelled, expired}.
_ENTITLED_STATUSES = {"trialing", "active", "past_due"}


def _parse_ts(value) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def effective_status(venue: dict) -> str:
    """subscription_status, with an expired trial resolved to 'expired'.

    A venue sitting at 'trialing' past its subscription_ends_at has really
    expired; Stripe never fired an event because there was no subscription.
    """
    status = venue.get("subscription_status") or "trialing"
    if status == "trialing":
        end = _parse_ts(venue.get("subscription_ends_at"))
        if end and end < datetime.now(timezone.utc):
            return "expired"
    return status


def is_comped(venue: dict) -> bool:
    """True when a live admin comp covers this venue right now.

    billing_exempt_until: NULL = forever; a future date = comped until then;
    a past date = the comp has lapsed and Stripe governs again.
    """
    if not venue.get("billing_exempt"):
        return False
    until = _parse_ts(venue.get("billing_exempt_until"))
    if until is None:
        return True  # comped forever
    return until > datetime.now(timezone.utc)


def venue_is_entitled(venue: dict) -> bool:
    """The one gate every enforcement chokepoint calls.

    Comp wins outright; otherwise the effective billing status must be in the
    entitled set. A missing venue dict is treated as not entitled.
    """
    if venue is None:
        return False
    if is_comped(venue):
        return True
    return effective_status(venue) in _ENTITLED_STATUSES
