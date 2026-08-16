"""Data lifecycle — true erasure / anonymisation for removed staff.

Soft-delete (is_active=false) keeps a person's name, email, phone and PIN in the
database indefinitely. For UK GDPR right-to-erasure (Art 17) and to avoid
retaining plaintext credentials longer than necessary (Art 32), this scrubs the
identifying fields while keeping the row itself for referential integrity —
rota_assignments, activity_log and leave_requests all FK back to
staff_members.id, so hard-deleting the row would cascade or orphan real history.

Deliberately separate from delete_staff (which is a reversible *deactivation*):
erasure is a distinct, explicit, irreversible action a manager takes to satisfy
a data-subject request or a retention policy.
"""

import secrets

TOMBSTONE_NAME = "Removed staff member"
TOMBSTONE_DETAIL = "[details removed]"


def anonymise_staff(supabase, venue_id: str, staff_id: str) -> None:
    """Irreversibly strip a staff member's PII and neutralise their credential.

    Venue-scoped on both writes as defence-in-depth (the service-role client
    bypasses RLS, so every query must self-scope)."""
    # Null the free PII; NOT-NULL columns get a tombstone / unusable value.
    # `pin` is NOT NULL and PIN auth only ever matches a 4-digit input, so a
    # long random hex can never be matched — the account becomes unloggable
    # without violating the constraint.
    supabase.table("staff_members").update(
        {
            "name": TOMBSTONE_NAME,
            "email": None,
            "phone": None,
            "pin": secrets.token_hex(16),
            "is_active": False,
            "pending": False,
        }
    ).eq("id", staff_id).eq("venue_id", venue_id).execute()

    # Scrub the person's name out of their historical activity_log rows. The
    # event itself (action + timestamp) is retained as audit fact; only the
    # identifying free-text detail is removed.
    supabase.table("activity_log").update({"detail": TOMBSTONE_DETAIL}).eq(
        "venue_id", venue_id
    ).eq("staff_id", staff_id).execute()
