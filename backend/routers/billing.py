import stripe
from fastapi import APIRouter, Depends, HTTPException, Request

from config import get_settings
from database import get_supabase
from services.auth_service import get_current_manager, get_manager_venue

router = APIRouter(prefix="/api/billing", tags=["billing"])

settings = get_settings()
stripe.api_key = settings.stripe_secret_key


@router.post("/checkout")
def create_checkout_session(manager: dict = Depends(get_current_manager)):
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=503, detail="Billing is not configured")
    if not settings.stripe_price_id:
        raise HTTPException(status_code=503, detail="No price configured")

    venue = get_manager_venue(manager["id"], require_active=False)

    if venue.get("subscription_status") == "active":
        raise HTTPException(status_code=400, detail="Venue already has an active subscription")

    customer_id = venue.get("stripe_customer_id")
    if not customer_id:
        customer = stripe.Customer.create(
            email=manager["email"],
            metadata={"venue_id": venue["id"], "venue_name": venue["name"]},
        )
        customer_id = customer.id
        get_supabase().table("venues").update(
            {"stripe_customer_id": customer_id}
        ).eq("id", venue["id"]).execute()

    session = stripe.checkout.Session.create(
        customer=customer_id,
        line_items=[{"price": settings.stripe_price_id, "quantity": 1}],
        mode="subscription",
        ui_mode="embedded_page",
        return_url=f"{settings.frontend_url}/billing?session_id={{CHECKOUT_SESSION_ID}}",
        metadata={"venue_id": venue["id"]},
    )

    return {"client_secret": session.client_secret}


@router.post("/portal")
def create_portal_session(manager: dict = Depends(get_current_manager)):
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=503, detail="Billing is not configured")

    venue = get_manager_venue(manager["id"], require_active=False)
    customer_id = venue.get("stripe_customer_id")
    if not customer_id:
        raise HTTPException(status_code=400, detail="No billing account found — subscribe first")

    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=f"{settings.frontend_url}/billing",
    )

    return {"url": session.url}


@router.get("/status")
def get_billing_status(manager: dict = Depends(get_current_manager)):
    venue = get_manager_venue(manager["id"], require_active=False)
    return {
        "subscription_status": venue.get("subscription_status", "trialing"),
        "subscription_started_at": venue.get("subscription_started_at"),
        "subscription_ends_at": venue.get("subscription_ends_at"),
        "stripe_customer_id": venue.get("stripe_customer_id"),
        "has_subscription": bool(venue.get("stripe_subscription_id")),
    }


@router.post("/webhook")
async def stripe_webhook(request: Request):
    if not settings.stripe_webhook_secret:
        raise HTTPException(status_code=503, detail="Webhook secret not configured")

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.stripe_webhook_secret
        )
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")

    supabase = get_supabase()

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        venue_id = session.get("metadata", {}).get("venue_id")
        if venue_id and session.get("subscription"):
            sub = stripe.Subscription.retrieve(session["subscription"])
            supabase.table("venues").update({
                "stripe_customer_id": session["customer"],
                "stripe_subscription_id": session["subscription"],
                "subscription_status": "active",
                "subscription_started_at": _ts(sub["current_period_start"]),
                "subscription_ends_at": _ts(sub["current_period_end"]),
            }).eq("id", venue_id).execute()

    elif event["type"] == "customer.subscription.updated":
        sub = event["data"]["object"]
        _sync_subscription(supabase, sub)

    elif event["type"] == "customer.subscription.deleted":
        sub = event["data"]["object"]
        _sync_subscription(supabase, sub, status_override="cancelled")

    elif event["type"] == "invoice.payment_failed":
        invoice = event["data"]["object"]
        customer_id = invoice.get("customer")
        if customer_id:
            supabase.table("venues").update({
                "subscription_status": "past_due",
            }).eq("stripe_customer_id", customer_id).execute()

    return {"status": "ok"}


def _sync_subscription(supabase, sub, *, status_override: str | None = None):
    customer_id = sub.get("customer")
    if not customer_id:
        return
    status = status_override or sub.get("status", "active")
    update = {
        "subscription_status": status,
        "stripe_subscription_id": sub["id"],
    }
    if sub.get("current_period_start"):
        update["subscription_started_at"] = _ts(sub["current_period_start"])
    if sub.get("current_period_end"):
        update["subscription_ends_at"] = _ts(sub["current_period_end"])
    supabase.table("venues").update(update).eq("stripe_customer_id", customer_id).execute()


def _ts(unix: int | None) -> str | None:
    if unix is None:
        return None
    from datetime import datetime, timezone
    return datetime.fromtimestamp(unix, tz=timezone.utc).isoformat()
