import random
import re
import secrets
import unicodedata


def generate_pin() -> str:
    return f"{random.randint(0, 9999):04d}"


def generate_unique_pin(supabase, venue_id: str) -> str:
    """A 4-digit PIN not already in use by any staff member at this venue.
    Shared by manager staff-creation and self-registration so both go through
    the same collision check."""
    for _ in range(10):
        candidate = generate_pin()
        clash = (
            supabase.table("staff_members")
            .select("id")
            .eq("venue_id", venue_id)
            .eq("pin", candidate)
            .limit(1)
            .execute()
        )
        if not clash.data:
            return candidate
    from fastapi import HTTPException

    raise HTTPException(status_code=500, detail="Could not generate a unique PIN, please try again")


def slugify(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", normalized).strip("-").lower()
    return slug or "venue"


def generate_venue_token(venue_name: str) -> str:
    return f"{slugify(venue_name)}-{secrets.token_hex(3)}"
