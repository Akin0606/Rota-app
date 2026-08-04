from fastapi import Header, HTTPException

from database import get_supabase, get_supabase_anon


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


def get_manager_venue(manager_id: str) -> dict:
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
    return res.data[0]
