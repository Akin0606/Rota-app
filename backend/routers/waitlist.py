from fastapi import APIRouter, HTTPException

from database import get_supabase
from models.schemas import WaitlistRequest

router = APIRouter(prefix="/api/waitlist", tags=["waitlist"])


@router.post("")
def join_waitlist(payload: WaitlistRequest):
    email = payload.email.strip().lower()
    venue_name = payload.venue_name.strip()

    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Please enter a valid email address")

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
