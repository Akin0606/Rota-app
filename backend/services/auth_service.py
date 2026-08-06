from fastapi import Header, HTTPException

from database import get_supabase, get_supabase_anon

# Shown to a manager or staff member whose venue has been disabled (e.g. by the
# admin console, or in future by a lapsed subscription).
INACTIVE_VENUE_MESSAGE = "This venue is currently inactive. Please contact Crewplan support."


def get_current_manager(authorization: str = Header(default="")) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")

    token = authorization.split(" ", 1)[1]
    client = get_supabase_anon()
    try:
        res = client.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    user = getattr(res, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    return {"id": user.id, "email": user.email}


def get_manager_venue(manager_id: str, *, require_active: bool = True) -> dict:
    """Loads the venue for a manager. By default an inactive venue is blocked with
    a 403 so every manager operation stops working when it's disabled. The venue
    read endpoint passes require_active=False so the app can render a clear
    "inactive" screen instead of looking like the account has no venue."""
    supabase = get_supabase()
    res = (
        supabase.table("venues")
        .select("*")
        .eq("manager_id", manager_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="No venue found for this account")
    venue = res.data[0]
    if require_active and not venue.get("is_active", True):
        raise HTTPException(status_code=403, detail=INACTIVE_VENUE_MESSAGE)
    return venue
