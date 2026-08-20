import re
import secrets
import unicodedata


def generate_pin() -> str:
    # Cryptographically-secure: a staff PIN is an auth credential, so it must
    # not come from a predictable PRNG (random.randint / Mersenne Twister).
    return f"{secrets.randbelow(10000):04d}"


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


def generate_venue_slug(supabase, venue_name: str) -> str:
    """A bare, human-readable slug for the public team link (e.g. "bar-so16"),
    unique across venues. Collisions get a numeric suffix (-2, -3, …). Unlike
    generate_venue_token this carries no random hex — it's the vanity alias."""
    base = slugify(venue_name)
    candidate = base
    n = 1
    while n <= 50:
        clash = (
            supabase.table("venues")
            .select("id")
            .eq("slug", candidate)
            .limit(1)
            .execute()
        )
        if not clash.data:
            return candidate
        n += 1
        candidate = f"{base}-{n}"
    # Extremely unlikely fallback — keep it unique without another round-trip.
    return f"{base}-{secrets.token_hex(2)}"
