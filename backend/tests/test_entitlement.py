"""Entitlement rules: comp checked first, past_due grace, expired trials."""

from datetime import datetime, timedelta, timezone

from services.entitlement import effective_status, is_comped, venue_is_entitled


def _future(days: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


def _past(days: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


# --- effective_status --------------------------------------------------------

def test_active_status_unchanged():
    assert effective_status({"subscription_status": "active"}) == "active"


def test_missing_status_defaults_trialing():
    assert effective_status({}) == "trialing"


def test_trial_within_window_stays_trialing():
    assert effective_status({"subscription_status": "trialing", "subscription_ends_at": _future(5)}) == "trialing"


def test_trial_past_end_becomes_expired():
    assert effective_status({"subscription_status": "trialing", "subscription_ends_at": _past(1)}) == "expired"


def test_cancelled_trial_end_ignored():
    # A non-trialing status is never re-derived from the date.
    assert effective_status({"subscription_status": "cancelled", "subscription_ends_at": _past(1)}) == "cancelled"


# --- is_comped ---------------------------------------------------------------

def test_not_comped_by_default():
    assert is_comped({}) is False
    assert is_comped({"billing_exempt": False}) is False


def test_comped_forever_when_until_null():
    assert is_comped({"billing_exempt": True, "billing_exempt_until": None}) is True


def test_comped_until_future():
    assert is_comped({"billing_exempt": True, "billing_exempt_until": _future(30)}) is True


def test_comp_lapsed_when_until_past():
    assert is_comped({"billing_exempt": True, "billing_exempt_until": _past(1)}) is False


# --- venue_is_entitled -------------------------------------------------------

def test_none_venue_not_entitled():
    assert venue_is_entitled(None) is False
    assert venue_is_entitled({}) is True  # {} => trialing, entitled


def test_entitled_statuses():
    for status in ("trialing", "active", "past_due"):
        assert venue_is_entitled({"subscription_status": status}) is True


def test_cancelled_not_entitled():
    assert venue_is_entitled({"subscription_status": "cancelled"}) is False


def test_expired_trial_not_entitled():
    assert venue_is_entitled({"subscription_status": "trialing", "subscription_ends_at": _past(1)}) is False


def test_comp_wins_over_cancelled():
    # The load-bearing case: a comped venue with a cancelled Stripe subscription
    # is still entitled — comp is checked first and independently.
    assert venue_is_entitled({"subscription_status": "cancelled", "billing_exempt": True}) is True


def test_comp_wins_over_expired_trial():
    assert venue_is_entitled(
        {"subscription_status": "trialing", "subscription_ends_at": _past(10), "billing_exempt": True}
    ) is True


def test_lapsed_comp_falls_back_to_stripe():
    # Comp until a past date + cancelled Stripe => not entitled.
    assert venue_is_entitled(
        {"subscription_status": "cancelled", "billing_exempt": True, "billing_exempt_until": _past(1)}
    ) is False
