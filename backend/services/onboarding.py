"""Onboarding activation (§1).

Our own one-time, 7-day activation token — NOT a Supabase magic link, whose
PKCE code-exchange fails in the Gmail/Mail in-app browser (documented in
CLAUDE.md). The accept email links to /onboarding?token=…; the token-landing
route calls `activate`, which validates + burns the token and mints a real
Supabase session server-side via the Admin API. The frontend then installs that
session with `setSession` — no client-side code exchange anywhere.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from config import get_settings
from database import get_supabase, get_supabase_anon

TOKEN_TTL_DAYS = 7


def mint_activation_token(email: str) -> str:
    """Create a fresh one-time token for `email` and return the activation URL to
    put in the accept email. Any older unused tokens for this email are left as
    is (they simply expire); the newest is the one we send."""
    email = email.strip().lower()
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=TOKEN_TTL_DAYS)
    get_supabase().table("onboarding_tokens").insert(
        {"email": email, "token": token, "expires_at": expires_at.isoformat()}
    ).execute()
    return f"{get_settings().frontend_url}/onboarding?token={token}"


def _mint_session_for(email: str) -> dict:
    """Mint a real Supabase session for a pre-created user, entirely server-side.
    generate_link (Admin API) yields a one-time email OTP without sending any
    email; verifying it with the anon client returns access + refresh tokens.
    This is NOT a PKCE code exchange, so it can't hit the in-app-browser failure."""
    admin = get_supabase()
    link = admin.auth.admin.generate_link({"type": "magiclink", "email": email})
    props = getattr(link, "properties", None)
    email_otp = getattr(props, "email_otp", None) if props else None
    if not email_otp:
        raise HTTPException(status_code=500, detail="Could not start your session, please try again")

    verified = get_supabase_anon().auth.verify_otp(
        {"email": email, "token": email_otp, "type": "email"}
    )
    session = getattr(verified, "session", None)
    if not session or not session.access_token or not session.refresh_token:
        raise HTTPException(status_code=500, detail="Could not start your session, please try again")

    return {
        "access_token": session.access_token,
        "refresh_token": session.refresh_token,
        "email": email,
    }


def activate(token: str) -> dict:
    """Validate + burn an activation token, then mint the session. Raises 410 for
    an expired/used/unknown token so the frontend can show the resend wall
    (distinct from a generic failure)."""
    supabase = get_supabase()
    res = (
        supabase.table("onboarding_tokens")
        .select("*")
        .eq("token", token)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=410, detail="This link is no longer valid.")
    row = res.data[0]

    if row.get("used_at"):
        raise HTTPException(status_code=410, detail="This link has already been used.")
    if datetime.fromisoformat(str(row["expires_at"])) < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="This link has expired.")

    # Burn it before minting the session so a token can never be replayed even if
    # the mint below is retried.
    supabase.table("onboarding_tokens").update(
        {"used_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", row["id"]).execute()

    return _mint_session_for(row["email"])
