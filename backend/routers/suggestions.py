from fastapi import APIRouter, HTTPException, Request

from database import get_supabase
from models.schemas import SuggestionRequest
from services import rate_limit

router = APIRouter(prefix="/api/suggestions", tags=["suggestions"])

# Unauthenticated public write — capped so the suggestion box can't be used to
# flood the admin console. Deliberately more generous than the waitlist's 5/hr:
# someone with three separate thoughts about the product is exactly who we want
# to hear from, and unlike the waitlist there's no unique constraint doing a
# second job of deduplication.
_SUGGESTION_MAX = 8
_SUGGESTION_WINDOW_SECONDS = 60 * 60

_MAX_MESSAGE_CHARS = 2000


@router.post("")
def submit_suggestion(payload: SuggestionRequest, request: Request):
    allowed, retry_after = rate_limit.hit(
        f"suggestion:{rate_limit.client_ip(request)}",
        _SUGGESTION_MAX,
        _SUGGESTION_WINDOW_SECONDS,
    )
    if not allowed:
        minutes = rate_limit.minutes_from_seconds(retry_after)
        raise HTTPException(
            status_code=429,
            detail=f"Thanks — that's a few now. Try again in {minutes} minute{'s' if minutes != 1 else ''}.",
        )

    message = payload.message.strip()
    email = (payload.email or "").strip().lower()

    if not message:
        raise HTTPException(status_code=400, detail="Please write something first")

    if len(message) > _MAX_MESSAGE_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"That's a bit long — please keep it under {_MAX_MESSAGE_CHARS} characters",
        )

    # Email is optional, but if they did give one it should be usable — a typo'd
    # address is worse than none, because we'd think we could reply.
    if email:
        if "@" not in email or "." not in email.split("@")[-1]:
            raise HTTPException(status_code=400, detail="Please enter a valid email address")
        if len(email) > 200:
            raise HTTPException(status_code=400, detail="That email looks too long")

    supabase = get_supabase()
    try:
        supabase.table("suggestions").insert(
            {"message": message, "email": email or None, "source": "landing"}
        ).execute()
    except Exception:
        raise HTTPException(
            status_code=500, detail="Could not send that, please try again"
        )

    return {"status": "ok"}
