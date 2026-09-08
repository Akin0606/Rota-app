"""Billing router tests — _effective_status, webhook handling, checkout guards.

Tests the billing logic WITHOUT hitting Stripe or a real database. The webhook
tests construct events manually and verify that the right Supabase writes happen;
the checkout tests mock stripe.Customer/Session creation.
"""

from datetime import datetime, timezone, timedelta
from types import SimpleNamespace
from unittest.mock import patch, MagicMock
import json

import pytest

from tests.fake_supabase import FakeSupabase, patch_supabase


# ---------------------------------------------------------------------------
# _effective_status — pure function, no mocking needed
# ---------------------------------------------------------------------------
from routers.billing import _effective_status, _ts


class TestEffectiveStatus:
    def test_active_stays_active(self):
        assert _effective_status({"subscription_status": "active"}) == "active"

    def test_trialing_with_future_end_stays_trialing(self):
        future = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
        assert _effective_status({"subscription_status": "trialing", "subscription_ends_at": future}) == "trialing"

    def test_trialing_with_past_end_becomes_expired(self):
        past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        assert _effective_status({"subscription_status": "trialing", "subscription_ends_at": past}) == "expired"

    def test_trialing_with_no_end_stays_trialing(self):
        assert _effective_status({"subscription_status": "trialing"}) == "trialing"

    def test_trialing_with_zulu_suffix(self):
        past = (datetime.now(timezone.utc) - timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
        assert _effective_status({"subscription_status": "trialing", "subscription_ends_at": past}) == "expired"

    def test_cancelled_stays_cancelled(self):
        assert _effective_status({"subscription_status": "cancelled"}) == "cancelled"

    def test_missing_status_defaults_to_trialing(self):
        assert _effective_status({}) == "trialing"

    def test_past_due_stays_past_due(self):
        assert _effective_status({"subscription_status": "past_due"}) == "past_due"

    def test_bad_date_stays_trialing(self):
        assert _effective_status({"subscription_status": "trialing", "subscription_ends_at": "not-a-date"}) == "trialing"


# ---------------------------------------------------------------------------
# _ts helper
# ---------------------------------------------------------------------------
class TestTimestampHelper:
    def test_none_returns_none(self):
        assert _ts(None) is None

    def test_unix_epoch(self):
        assert _ts(0) == "1970-01-01T00:00:00+00:00"

    def test_known_timestamp(self):
        # 2026-01-15 12:00:00 UTC
        result = _ts(1768507200)
        assert "2026-01-15" in result


# ---------------------------------------------------------------------------
# Webhook handler — uses FakeSupabase + a mock for stripe.Webhook
# ---------------------------------------------------------------------------
VENUE_ID = "venue-abc-123"
CUSTOMER_ID = "cus_test_123"
SUB_ID = "sub_test_456"

VENUE_ROW = {
    "id": VENUE_ID,
    "manager_id": "mgr-1",
    "name": "Test Pub",
    "is_active": True,
    "stripe_customer_id": CUSTOMER_ID,
    "stripe_subscription_id": None,
    "subscription_status": "trialing",
    "subscription_started_at": None,
    "subscription_ends_at": None,
}


def _make_event(event_type: str, data_object: dict) -> dict:
    return {"type": event_type, "data": {"object": data_object}}


def _sub_object(*, status="active", start=1700000000, end=1702592000):
    return {
        "id": SUB_ID,
        "customer": CUSTOMER_ID,
        "status": status,
        "current_period_start": start,
        "current_period_end": end,
    }


@pytest.fixture
def fake_db():
    return FakeSupabase({"venues": [dict(VENUE_ROW)]})


class TestWebhookCheckoutCompleted:
    def test_updates_venue_on_checkout_completed(self, fake_db):
        event = _make_event("checkout.session.completed", {
            "customer": CUSTOMER_ID,
            "subscription": SUB_ID,
            "metadata": {"venue_id": VENUE_ID},
        })

        mock_sub = _sub_object()

        with patch_supabase(fake_db, "routers.billing"):
            with patch("routers.billing.stripe") as mock_stripe:
                mock_stripe.Webhook.construct_event.return_value = event
                mock_stripe.Subscription.retrieve.return_value = mock_sub
                mock_stripe.error = _stripe_error_module()

                from routers.billing import stripe_webhook
                import asyncio

                # Mock the request
                req = _mock_request(b"payload", "sig_test")
                result = asyncio.get_event_loop().run_until_complete(stripe_webhook(req))

        assert result == {"status": "ok"}
        venue = fake_db.rows("venues")[0]
        assert venue["subscription_status"] == "active"
        assert venue["stripe_subscription_id"] == SUB_ID
        assert venue["stripe_customer_id"] == CUSTOMER_ID
        assert venue["subscription_started_at"] is not None


class TestWebhookSubscriptionUpdated:
    def test_syncs_subscription_on_update(self, fake_db):
        sub = _sub_object(status="active")
        event = _make_event("customer.subscription.updated", sub)

        with patch_supabase(fake_db, "routers.billing"):
            with patch("routers.billing.stripe") as mock_stripe:
                mock_stripe.Webhook.construct_event.return_value = event
                mock_stripe.error = _stripe_error_module()

                from routers.billing import stripe_webhook
                import asyncio

                req = _mock_request(b"payload", "sig_test")
                result = asyncio.get_event_loop().run_until_complete(stripe_webhook(req))

        assert result == {"status": "ok"}
        venue = fake_db.rows("venues")[0]
        assert venue["subscription_status"] == "active"
        assert venue["stripe_subscription_id"] == SUB_ID


class TestWebhookSubscriptionDeleted:
    def test_marks_cancelled_on_delete(self, fake_db):
        sub = _sub_object(status="canceled")
        event = _make_event("customer.subscription.deleted", sub)

        with patch_supabase(fake_db, "routers.billing"):
            with patch("routers.billing.stripe") as mock_stripe:
                mock_stripe.Webhook.construct_event.return_value = event
                mock_stripe.error = _stripe_error_module()

                from routers.billing import stripe_webhook
                import asyncio

                req = _mock_request(b"payload", "sig_test")
                result = asyncio.get_event_loop().run_until_complete(stripe_webhook(req))

        venue = fake_db.rows("venues")[0]
        assert venue["subscription_status"] == "cancelled"


class TestWebhookPaymentFailed:
    def test_marks_past_due_on_payment_failure(self, fake_db):
        event = _make_event("invoice.payment_failed", {"customer": CUSTOMER_ID})

        with patch_supabase(fake_db, "routers.billing"):
            with patch("routers.billing.stripe") as mock_stripe:
                mock_stripe.Webhook.construct_event.return_value = event
                mock_stripe.error = _stripe_error_module()

                from routers.billing import stripe_webhook
                import asyncio

                req = _mock_request(b"payload", "sig_test")
                result = asyncio.get_event_loop().run_until_complete(stripe_webhook(req))

        venue = fake_db.rows("venues")[0]
        assert venue["subscription_status"] == "past_due"


class TestWebhookSignatureVerification:
    def test_invalid_signature_returns_400(self, fake_db):
        with patch_supabase(fake_db, "routers.billing"):
            with patch("routers.billing.stripe") as mock_stripe:
                err_mod = _stripe_error_module()
                mock_stripe.error = err_mod
                mock_stripe.Webhook.construct_event.side_effect = (
                    err_mod.SignatureVerificationError("bad", "sig")
                )

                from routers.billing import stripe_webhook
                import asyncio
                from fastapi import HTTPException

                req = _mock_request(b"payload", "bad_sig")
                with pytest.raises(HTTPException) as exc_info:
                    asyncio.get_event_loop().run_until_complete(stripe_webhook(req))

                assert exc_info.value.status_code == 400

    def test_invalid_payload_returns_400(self, fake_db):
        with patch_supabase(fake_db, "routers.billing"):
            with patch("routers.billing.stripe") as mock_stripe:
                mock_stripe.Webhook.construct_event.side_effect = ValueError("bad json")
                mock_stripe.error = _stripe_error_module()

                from routers.billing import stripe_webhook
                import asyncio
                from fastapi import HTTPException

                req = _mock_request(b"not json", "sig")
                with pytest.raises(HTTPException) as exc_info:
                    asyncio.get_event_loop().run_until_complete(stripe_webhook(req))

                assert exc_info.value.status_code == 400


class TestWebhookMissingSecret:
    def test_no_webhook_secret_returns_503(self):
        """When STRIPE_WEBHOOK_SECRET is empty, the endpoint should 503."""
        with patch("routers.billing.settings") as mock_settings:
            mock_settings.stripe_webhook_secret = ""

            from routers.billing import stripe_webhook
            import asyncio
            from fastapi import HTTPException

            req = _mock_request(b"payload", "sig")
            with pytest.raises(HTTPException) as exc_info:
                asyncio.get_event_loop().run_until_complete(stripe_webhook(req))

            assert exc_info.value.status_code == 503


# ---------------------------------------------------------------------------
# Checkout endpoint guards
# ---------------------------------------------------------------------------
class TestCheckoutGuards:
    def test_already_active_subscription_returns_400(self):
        venue = dict(VENUE_ROW, subscription_status="active", stripe_customer_id=CUSTOMER_ID)
        fake = FakeSupabase({"venues": [venue]})

        with patch_supabase(fake, "routers.billing", "services.auth_service"):
            with patch("routers.billing.settings") as mock_settings:
                mock_settings.stripe_secret_key = "sk_test_xxx"
                mock_settings.stripe_price_id = "price_xxx"
                mock_settings.frontend_url = "http://localhost:3000"

                from routers.billing import create_checkout_session
                from fastapi import HTTPException

                manager = {"id": "mgr-1", "email": "test@example.com"}
                with pytest.raises(HTTPException) as exc_info:
                    create_checkout_session(manager=manager)

                assert exc_info.value.status_code == 400
                assert "already has an active subscription" in exc_info.value.detail

    def test_missing_stripe_key_returns_503(self):
        with patch("routers.billing.settings") as mock_settings:
            mock_settings.stripe_secret_key = ""

            from routers.billing import create_checkout_session
            from fastapi import HTTPException

            with pytest.raises(HTTPException) as exc_info:
                create_checkout_session(manager={"id": "x", "email": "x@x.com"})

            assert exc_info.value.status_code == 503

    def test_missing_price_id_returns_503(self):
        with patch("routers.billing.settings") as mock_settings:
            mock_settings.stripe_secret_key = "sk_test_xxx"
            mock_settings.stripe_price_id = ""

            from routers.billing import create_checkout_session
            from fastapi import HTTPException

            with pytest.raises(HTTPException) as exc_info:
                create_checkout_session(manager={"id": "x", "email": "x@x.com"})

            assert exc_info.value.status_code == 503


# ---------------------------------------------------------------------------
# Billing status endpoint
# ---------------------------------------------------------------------------
class TestBillingStatus:
    def test_returns_effective_status(self):
        past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        venue = dict(VENUE_ROW, subscription_status="trialing", subscription_ends_at=past)
        fake = FakeSupabase({"venues": [venue]})

        with patch_supabase(fake, "routers.billing", "services.auth_service"):
            from routers.billing import get_billing_status

            result = get_billing_status(manager={"id": "mgr-1", "email": "test@example.com"})

        assert result["subscription_status"] == "expired"
        assert "stripe_customer_id" not in result
        assert "stripe_subscription_id" not in result

    def test_active_returns_has_subscription_true(self):
        venue = dict(VENUE_ROW, subscription_status="active", stripe_subscription_id=SUB_ID)
        fake = FakeSupabase({"venues": [venue]})

        with patch_supabase(fake, "routers.billing", "services.auth_service"):
            from routers.billing import get_billing_status

            result = get_billing_status(manager={"id": "mgr-1", "email": "test@example.com"})

        assert result["subscription_status"] == "active"
        assert result["has_subscription"] is True


# ---------------------------------------------------------------------------
# Customer creation idempotency
# ---------------------------------------------------------------------------
class TestCustomerCreationIdempotency:
    def test_creates_customer_when_none_exists(self):
        venue = dict(VENUE_ROW, stripe_customer_id=None)
        fake = FakeSupabase({"venues": [venue]})

        with patch_supabase(fake, "routers.billing", "services.auth_service"):
            with patch("routers.billing.stripe") as mock_stripe:
                mock_stripe.error = _stripe_error_module()
                mock_stripe.Customer.create.return_value = MagicMock(id="cus_new_123")
                mock_sub = MagicMock()
                mock_sub.latest_invoice.payment_intent.client_secret = "pi_secret_test"
                mock_stripe.Subscription.create.return_value = mock_sub

                with patch("routers.billing.settings") as mock_settings:
                    mock_settings.stripe_secret_key = "sk_test_xxx"
                    mock_settings.stripe_price_id = "price_xxx"
                    mock_settings.frontend_url = "http://localhost:3000"

                    from routers.billing import create_checkout_session

                    manager = {"id": "mgr-1", "email": "test@example.com"}
                    result = create_checkout_session(manager=manager)

                assert result == {"client_secret": "pi_secret_test"}
                mock_stripe.Customer.create.assert_called_once()
                call_kwargs = mock_stripe.Customer.create.call_args[1]
                assert call_kwargs["idempotency_key"] == f"cust_{VENUE_ID}"

    def test_reuses_existing_customer(self):
        venue = dict(VENUE_ROW, stripe_customer_id=CUSTOMER_ID, subscription_status="trialing")
        fake = FakeSupabase({"venues": [venue]})

        with patch_supabase(fake, "routers.billing", "services.auth_service"):
            with patch("routers.billing.stripe") as mock_stripe:
                mock_stripe.error = _stripe_error_module()
                mock_sub = MagicMock()
                mock_sub.latest_invoice.payment_intent.client_secret = "pi_secret_test"
                mock_stripe.Subscription.create.return_value = mock_sub

                with patch("routers.billing.settings") as mock_settings:
                    mock_settings.stripe_secret_key = "sk_test_xxx"
                    mock_settings.stripe_price_id = "price_xxx"
                    mock_settings.frontend_url = "http://localhost:3000"

                    from routers.billing import create_checkout_session

                    manager = {"id": "mgr-1", "email": "test@example.com"}
                    result = create_checkout_session(manager=manager)

                mock_stripe.Customer.create.assert_not_called()
                assert result == {"client_secret": "pi_secret_test"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _mock_request(body: bytes, sig: str):
    """Minimal async request stand-in for the webhook endpoint."""
    req = MagicMock()

    async def _body():
        return body

    req.body = _body
    req.headers = {"stripe-signature": sig}
    return req


def _stripe_error_module():
    """A stand-in for `stripe.error` with the two exception classes the webhook uses."""
    mod = SimpleNamespace()

    class SignatureVerificationError(Exception):
        def __init__(self, message, sig_header):
            super().__init__(message)

    class InvalidRequestError(Exception):
        def __init__(self, message="", param=None):
            super().__init__(message)
            self.user_message = message

    mod.SignatureVerificationError = SignatureVerificationError
    mod.InvalidRequestError = InvalidRequestError
    return mod
