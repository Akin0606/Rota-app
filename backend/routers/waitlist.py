from fastapi import APIRouter, HTTPException, Request

from database import get_supabase
from models.schemas import WaitlistRequest
from services import rate_limit

router = APIRouter(prefix="/api/waitlist", tags=["waitlist"])

# Unauthenticated public write — cap it so it can't be used to spam the admin
# console. Generous enough that a genuine sign-up never trips it.
_WAITLIST_MAX = 5
_WAITLIST_WINDOW_SECONDS = 60 * 60


@router.post("")
def join_waitlist(payload: WaitlistRequest, request: Request):
    allowed, retry_after = rate_limit.hit(
        f"waitlist:{rate_limit.client_ip(request)}", _WAITLIST_MAX, _WAITLIST_WINDOW_SECONDS
    )
    if not allowed:
        minutes = rate_limit.minutes_from_seconds(retry_after)
        raise HTTPException(
            status_code=429,
            detail=f"Too many attempts. Try again in {minutes} minute{'s' if minutes != 1 else ''}.",
        )

    email = payload.email.strip().lower()
    venue_name = payload.venue_name.strip()

    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Please enter a valid email address")

    if len(venue_name) > 120 or len(email) > 200:
        raise HTTPException(status_code=400, detail="That looks too long — please shorten it")

    supabase = get_supabase()

    # Friendly duplicate handling rather than surfacing the unique-constraint
    # violation as a 500.
    existing = supabase.table("waitlist").select("id").eq("email", email).limit(1).execute()
    if existing.data:
        return {"status": "ok", "already_joined": True}

    try:
        supabase.table("waitlist").insert(
            {"venue_name": venue_name, "email": email}
        ).execute()
    except Exception as exc:
        # Covers the race where two requests insert the same email between the
        # check above and the insert.
        if "duplicate" in str(exc).lower() or "waitlist_email_key" in str(exc):
            return {"status": "ok", "already_joined": True}
        raise HTTPException(status_code=500, detail="Could not join the waitlist, please try again")

    return {"status": "ok", "already_joined": False}
