import random
import re
import secrets
import unicodedata


def generate_pin() -> str:
    return f"{random.randint(0, 9999):04d}"


def slugify(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", normalized).strip("-").lower()
    return slug or "venue"


def generate_venue_token(venue_name: str) -> str:
    return f"{slugify(venue_name)}-{secrets.token_hex(3)}"
