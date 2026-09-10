import hmac
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query

from config import get_settings
from database import get_supabase
from models.schemas import (
    AdminActivityOut,
    AdminAuditOut,
    AdminCreateManagerRequest,
    AdminManagerOut,
    AdminStatsOut,
    AdminVenueDetailOut,
    AdminVenueOut,
    AdminVenueRotaOut,
    AdminVenueUpdateRequest,
    RotaSummaryOut,
    StaffManagerOut,
    SuggestionOut,
    SuggestionUpdateRequest,
    WaitlistEntryOut,
)
from routers.rota import _build_summary, run_solver_for_period
from routers.staff import _generate_unique_pin
from services import email_service, onboarding, period_resolver
from services.entitlement import effective_status, is_comped, venue_is_entitled

router = APIRouter(prefix="/api/admin", tags=["admin"])

# A live venue with no activity in this many days counts as "stale".
STALE_DAYS = 14

# Mirrors the check constraint in migration 028 — kept here so a bad status is a
# clean 400 rather than a Postgres constraint violation surfacing as a 500.
_SUGGESTION_STATUSES = {"new", "read", "actioned", "archived"}

# Comp reasons the console offers. Validated so a comp is always countable, not
# free text; "other" is the escape hatch (a note can go in admin_notes).
_COMP_REASONS = {"pilot", "friends_family", "goodwill", "other"}


def require_admin(x_admin_secret: str = Header(default="")) -> None:
    settings = get_settings()
    # Constant-time compare so a wrong secret can't be recovered by timing the
    # response. hmac.compare_digest short-circuits only on differing length.
    if not settings.admin_secret or not hmac.compare_digest(
        x_admin_secret, settings.admin_secret
    ):
        raise HTTPException(status_code=401, detail="Invalid admin secret")


def _log_admin_audit(
    action: str,
    *,
    venue: Optional[dict] = None,
    target_email: Optional[str] = None,
    detail: Optional[str] = None,
) -> None:
    """Append one row to admin_audit — the only accountability the console has
    under a single shared ADMIN_SECRET (it records what was done to which
    venue, never which admin). Stored outside the venue cascade, so the venue's
    name/email are copied onto the row and survive a delete. Best-effort: a
    logging failure must never break the action it records."""
    try:
        get_supabase().table("admin_audit").insert(
            {
                "action": action,
                "target_venue_id": venue["id"] if venue else None,
                "target_venue_name": venue.get("name") if venue else None,
                "target_email": (venue.get("manager_email") if venue else None) or target_email,
                "detail": detail,
            }
        ).execute()
    except Exception:
        pass


def _get_venue_or_404(venue_id: str) -> dict:
    supabase = get_supabase()
    res = supabase.table("venues").select("*").eq("id", venue_id).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Venue not found")
    return res.data[0]


def _trial_days_left(venue: dict) -> Optional[int]:
    """Whole days until a trialing venue's end date, else None. Negative days
    (an already-expired trial) clamp to 0 so the UI never shows a past figure."""
    if (venue.get("subscription_status") or "trialing") != "trialing":
        return None
    ends_at = venue.get("subscription_ends_at")
    if not ends_at:
        return None
    try:
        end = datetime.fromisoformat(str(ends_at).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    return max(0, (end - datetime.now(timezone.utc)).days)



@router.get("/venues", response_model=list[AdminVenueOut], dependencies=[Depends(require_admin)])
def list_venues():
    supabase = get_supabase()
    venues = supabase.table("venues").select("*").order("created_at", desc=True).execute().data

    all_staff = supabase.table("staff_members").select("id, venue_id, is_active").execute().data
    staff_counts: dict[str, int] = {}
    for s in all_staff:
        if s["is_active"]:
            staff_counts[s["venue_id"]] = staff_counts.get(s["venue_id"], 0) + 1

    all_periods = (
        supabase.table("availability_periods")
        .select("venue_id, status, week_start")
        .order("week_start", desc=True)
        .execute()
        .data
    )
    latest_status: dict[str, str] = {}
    for p in all_periods:
        latest_status.setdefault(p["venue_id"], p["status"])

    # Most recent activity per venue, for spotting stale venues.
    activity = (
        supabase.table("activity_log")
        .select("venue_id, created_at")
        .order("created_at", desc=True)
        .limit(2000)
        .execute()
        .data
    )
    last_active: dict[str, str] = {}
    for a in activity:
        if a.get("venue_id"):
            last_active.setdefault(a["venue_id"], a["created_at"])

    rows = [
        {
            "id": v["id"],
            "name": v["name"],
            "manager_email": v["manager_email"],
            "created_at": v["created_at"],
            "staff_count": staff_counts.get(v["id"], 0),
            "period_status": latest_status.get(v["id"]),
            "pending": False,
            "is_active": v.get("is_active", True),
            "last_active_at": last_active.get(v["id"]),
            "effective_status": effective_status(v),
            "billing_exempt": bool(v.get("billing_exempt")),
            "billing_exempt_until": v.get("billing_exempt_until"),
            "entitled": venue_is_entitled(v),
            "trial_days_left": _trial_days_left(v),
        }
        for v in venues
    ]

    # Managers who have a Supabase auth account but haven't run the onboarding
    # wizard yet (no venue) — surface them so the admin can see accounts they
    # created that are still awaiting onboarding.
    venue_emails = {(v.get("manager_email") or "").lower() for v in venues}
    try:
        users = supabase.auth.admin.list_users()
    except Exception:
        users = []
    for u in users:
        email = (getattr(u, "email", None) or "").lower()
        if not email or email in venue_emails:
            continue
        rows.append(
            {
                "id": f"pending:{getattr(u, 'id', '')}",
                "name": getattr(u, "email", ""),
                "manager_email": getattr(u, "email", ""),
                "created_at": str(getattr(u, "created_at", "")),
                "staff_count": 0,
                "period_status": "awaiting_onboarding",
                "pending": True,
            }
        )

    return rows


@router.get("/stats", response_model=AdminStatsOut, dependencies=[Depends(require_admin)])
def get_stats():
    """At-a-glance operational stats across all venues."""
    supabase = get_supabase()

    venues = (
        supabase.table("venues")
        .select(
            "id, is_active, subscription_status, subscription_ends_at, "
            "billing_exempt, billing_exempt_until"
        )
        .execute()
        .data
    )
    active = sum(1 for v in venues if v.get("is_active", True))

    # Billing breakdown. comped wins first (a comped trial counts as comped, not
    # trialing); then paying (active/past_due Stripe) vs live trials.
    comped = sum(1 for v in venues if is_comped(v))
    paying = sum(
        1
        for v in venues
        if not is_comped(v) and effective_status(v) in ("active", "past_due")
    )
    trialing = sum(
        1 for v in venues if not is_comped(v) and effective_status(v) == "trialing"
    )

    staff = supabase.table("staff_members").select("id").eq("is_active", True).execute().data

    periods = supabase.table("availability_periods").select("venue_id, status").execute().data
    open_periods = sum(1 for p in periods if p["status"] == "collecting")
    published = sum(1 for p in periods if p["status"] in ("published", "confirmed"))

    # Stale: an active venue whose most recent activity is older than STALE_DAYS.
    activity = (
        supabase.table("activity_log")
        .select("venue_id, created_at")
        .order("created_at", desc=True)
        .limit(2000)
        .execute()
        .data
    )
    last_active: dict[str, str] = {}
    for a in activity:
        if a.get("venue_id"):
            last_active.setdefault(a["venue_id"], a["created_at"])

    cutoff = datetime.now(timezone.utc) - timedelta(days=STALE_DAYS)
    stale = 0
    for v in venues:
        if not v.get("is_active", True):
            continue
        ts = last_active.get(v["id"])
        if not ts:
            continue
        try:
            when = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
            if when.tzinfo is None:
                when = when.replace(tzinfo=timezone.utc)
            if when < cutoff:
                stale += 1
        except ValueError:
            continue

    return {
        "total_venues": len(venues),
        "active_venues": active,
        "inactive_venues": len(venues) - active,
        "stale_venues": stale,
        "total_staff": len(staff),
        "open_periods": open_periods,
        "published_rotas": published,
        "paying_venues": paying,
        "trialing_venues": trialing,
        "comped_venues": comped,
    }


def _create_manager_account(email: str) -> str:
    """Creates a confirmed Supabase auth user for `email` so they can sign in
    via the OTP flow and run onboarding. Returns the login URL to hand them.
    Raises HTTPException on invalid input, an existing venue, or an existing
    account. Shared by the Add Manager and waitlist Invite actions."""
    email = email.strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Enter a valid email address")

    supabase = get_supabase()

    existing_venue = (
        supabase.table("venues").select("id").eq("manager_email", email).limit(1).execute()
    )
    if existing_venue.data:
        raise HTTPException(status_code=409, detail="A venue already exists for this email")

    try:
        # email_confirm=True marks the account confirmed so the activation link
        # signs them straight in, with no email-verification step or Supabase
        # "allow signups" toggle getting in the way.
        supabase.auth.admin.create_user({"email": email, "email_confirm": True})
    except Exception as exc:
        message = str(exc)
        if "already" in message.lower() or "registered" in message.lower():
            raise HTTPException(status_code=409, detail="That email already has an account")
        raise HTTPException(status_code=500, detail=f"Could not create account: {message}")

    # Activation link = auth + email proof (§1). One email, no OTP on first run:
    # tapping it mints a session server-side and drops them into the wizard.
    activation_url = onboarding.mint_activation_token(email)
    email_service.send_activation_email(email, activation_url)
    return activation_url


@router.post("/managers", response_model=AdminManagerOut, dependencies=[Depends(require_admin)])
def add_manager(payload: AdminCreateManagerRequest):
    login_url = _create_manager_account(payload.email)
    return {"email": payload.email.strip().lower(), "status": "created", "login_url": login_url}


@router.get(
    "/waitlist", response_model=list[WaitlistEntryOut], dependencies=[Depends(require_admin)]
)
def list_waitlist():
    supabase = get_supabase()
    return (
        supabase.table("waitlist")
        .select("*")
        .order("created_at", desc=True)
        .execute()
        .data
    )


@router.post(
    "/waitlist/{entry_id}/invite",
    response_model=AdminManagerOut,
    dependencies=[Depends(require_admin)],
)
def invite_waitlist_entry(entry_id: str):
    supabase = get_supabase()
    res = supabase.table("waitlist").select("*").eq("id", entry_id).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Waitlist entry not found")
    entry = res.data[0]

    login_url = _create_manager_account(entry["email"])
    supabase.table("waitlist").update({"status": "invited"}).eq("id", entry_id).execute()

    return {"email": entry["email"], "status": "invited", "login_url": login_url}


@router.get(
    "/suggestions", response_model=list[SuggestionOut], dependencies=[Depends(require_admin)]
)
def list_suggestions():
    supabase = get_supabase()
    return (
        supabase.table("suggestions")
        .select("*")
        .order("created_at", desc=True)
        .limit(200)
        .execute()
        .data
    )


@router.patch(
    "/suggestions/{suggestion_id}",
    response_model=SuggestionOut,
    dependencies=[Depends(require_admin)],
)
def update_suggestion(suggestion_id: str, payload: SuggestionUpdateRequest):
    if payload.status not in _SUGGESTION_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Status must be one of: {', '.join(sorted(_SUGGESTION_STATUSES))}",
        )
    supabase = get_supabase()
    res = (
        supabase.table("suggestions")
        .update({"status": payload.status})
        .eq("id", suggestion_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Suggestion not found")
    return res.data[0]


@router.get(
    "/venues/{venue_id}",
    response_model=AdminVenueDetailOut,
    dependencies=[Depends(require_admin)],
)
def get_venue_detail(venue_id: str):
    supabase = get_supabase()
    venue = _get_venue_or_404(venue_id)

    staff = (
        supabase.table("staff_members")
        .select("*")
        .eq("venue_id", venue_id)
        .order("created_at")
        .execute()
        .data
    )

    # A9 — the submitted flags are a *collection* question, so they follow the
    # notice window. The old rule was newest-of-any-status, which a phantom
    # period captured by definition: support saw "0 of 8 submitted" for a week
    # nobody had ever been asked about.
    period = period_resolver.collection_period(venue_id)
    submitted_ids: set[str] = set()
    if period:
        subs = (
            supabase.table("availability_submissions")
            .select("staff_id")
            .eq("period_id", period["id"])
            .execute()
            .data
        )
        submitted_ids = {s["staff_id"] for s in subs}

    for member in staff:
        member["submitted"] = member["id"] in submitted_ids if period else None

    return {
        "id": venue["id"],
        "name": venue["name"],
        "manager_email": venue["manager_email"],
        "created_at": venue["created_at"],
        "link_token": venue["link_token"],
        "is_active": venue.get("is_active", True),
        "admin_notes": venue.get("admin_notes"),
        "staff": staff,
        "period": (
            {"id": period["id"], "week_start": str(period["week_start"]), "status": period["status"]}
            if period
            else None
        ),
        "effective_status": effective_status(venue),
        "subscription_started_at": venue.get("subscription_started_at"),
        "subscription_ends_at": venue.get("subscription_ends_at"),
        "billing_exempt": bool(venue.get("billing_exempt")),
        "billing_exempt_reason": venue.get("billing_exempt_reason"),
        "billing_exempt_until": venue.get("billing_exempt_until"),
        "billing_exempt_at": venue.get("billing_exempt_at"),
        "billing_exempt_by": venue.get("billing_exempt_by"),
        "entitled": venue_is_entitled(venue),
    }


@router.patch(
    "/venues/{venue_id}",
    response_model=AdminVenueDetailOut,
    dependencies=[Depends(require_admin)],
)
def set_venue_active(venue_id: str, payload: AdminVenueUpdateRequest):
    """Enables/disables a venue, updates support notes, and controls the billing
    comp (free pass) + trial end.

    is_active is the on/off switch (blocks login/PIN entry). billing_exempt is
    the separate comp gate: a comped venue is entitled to the paid machinery
    regardless of Stripe, and is never touched by the billing webhook. Only the
    fields declared on AdminVenueUpdateRequest are writable here, so
    subscription_status (Stripe's) can't be set through this endpoint."""
    supabase = get_supabase()
    venue = _get_venue_or_404(venue_id)

    updates = payload.model_dump(exclude_unset=True)

    # --- Validate the comp fields before writing anything. ---
    setting_exempt = updates.get("billing_exempt")
    if setting_exempt is True:
        # A reason is required when turning comp ON (from the payload, or already
        # stored). A comp with no reason is a future support mystery.
        reason = updates.get("billing_exempt_reason") or venue.get("billing_exempt_reason")
        if not reason:
            raise HTTPException(
                status_code=400, detail="A reason is required to comp a venue"
            )
    if "billing_exempt_reason" in updates and updates["billing_exempt_reason"] is not None:
        if updates["billing_exempt_reason"] not in _COMP_REASONS:
            raise HTTPException(
                status_code=400,
                detail=f"Reason must be one of: {', '.join(sorted(_COMP_REASONS))}",
            )
    for date_field in ("billing_exempt_until", "subscription_ends_at"):
        val = updates.get(date_field)
        if val:
            try:
                datetime.fromisoformat(str(val).replace("Z", "+00:00"))
            except (ValueError, TypeError):
                raise HTTPException(
                    status_code=400, detail=f"{date_field} must be an ISO timestamp"
                )

    # Stamp who/when whenever the comp flag itself is toggled, in either
    # direction, so the audit stays honest about when a venue went (un)comped.
    if "billing_exempt" in updates:
        updates["billing_exempt_at"] = datetime.now(timezone.utc).isoformat()
        updates["billing_exempt_by"] = "admin console"
        if setting_exempt is False:
            # Clearing the comp clears its reason/expiry too, so a lapsed comp
            # doesn't leave a stale "why" behind.
            updates["billing_exempt_reason"] = None
            updates["billing_exempt_until"] = None

    if updates:
        supabase.table("venues").update(updates).eq("id", venue_id).execute()

    if "is_active" in updates:
        supabase.table("activity_log").insert(
            {
                "venue_id": venue_id,
                "action": "venue_activated" if payload.is_active else "venue_deactivated",
                "detail": (
                    f"Venue {'enabled' if payload.is_active else 'disabled'} via admin console"
                ),
            }
        ).execute()
        _log_admin_audit(
            "venue_activated" if payload.is_active else "venue_deactivated",
            venue=venue,
        )

    if "billing_exempt" in updates:
        if setting_exempt:
            reason = updates.get("billing_exempt_reason") or venue.get("billing_exempt_reason")
            until = updates.get("billing_exempt_until")
            detail = f"Comped ({reason})" + (f" until {until}" if until else " — no expiry")
        else:
            detail = "Comp removed"
        _log_admin_audit("venue_comped" if setting_exempt else "venue_uncomped", venue=venue, detail=detail)

    if "subscription_ends_at" in updates and "billing_exempt" not in updates:
        _log_admin_audit(
            "trial_end_changed",
            venue=venue,
            detail=f"Trial end set to {updates['subscription_ends_at']}",
        )

    return get_venue_detail(venue_id)


def _generate_magic_link(email: str) -> str:
    supabase = get_supabase()
    try:
        link = supabase.auth.admin.generate_link({"type": "magiclink", "email": email})
        action_link = getattr(getattr(link, "properties", None), "action_link", None)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not create login link: {exc}")

    if not action_link:
        raise HTTPException(status_code=500, detail="Could not create login link")

    return action_link


@router.post(
    "/venues/{venue_id}/login-link",
    response_model=AdminManagerOut,
    dependencies=[Depends(require_admin)],
)
def create_support_login_link(venue_id: str):
    """Mints a one-time magic login link for the venue's manager, so the founder
    can sign in as them to reproduce/diagnose an issue. Desktop support use — the
    link establishes the manager's session on click."""
    venue = _get_venue_or_404(venue_id)
    action_link = _generate_magic_link(venue["manager_email"])
    # Impersonation is the most sensitive thing the console does — always audited.
    _log_admin_audit(
        "support_login_link",
        venue=venue,
        detail="Support magic login link minted (impersonation)",
    )
    return {"email": venue["manager_email"], "status": "link_created", "login_url": action_link}


@router.post(
    "/managers/{email}/login-link",
    response_model=AdminManagerOut,
    dependencies=[Depends(require_admin)],
)
def resend_pending_manager_login_link(email: str):
    """Resends the activation link for a manager who has an account but hasn't
    finished onboarding (no venue yet) — the resend wall behind an expired/used
    link. Mints a fresh 7-day token and emails it (§1), NOT a Supabase magic
    link (whose PKCE breaks in the in-app browser)."""
    email = email.strip().lower()
    activation_url = onboarding.mint_activation_token(email)
    email_service.send_activation_email(email, activation_url)
    return {"email": email, "status": "link_created", "login_url": activation_url}


def _export_venue_data(venue: dict) -> dict:
    """Assembles a plain-dict snapshot of everything the venue cascade would
    erase — staff (incl. PII), shifts, periods, submissions, assignments, leave,
    activity — so the admin has a record before a destructive delete. Read-only.
    """
    supabase = get_supabase()
    venue_id = venue["id"]

    def _rows(table: str, select: str = "*") -> list[dict]:
        try:
            return supabase.table(table).select(select).eq("venue_id", venue_id).execute().data or []
        except Exception:
            return []

    staff = _rows("staff_members")
    period_ids = [p["id"] for p in _rows("availability_periods")]
    submissions: list[dict] = []
    assignments: list[dict] = []
    if period_ids:
        try:
            submissions = (
                supabase.table("availability_submissions")
                .select("*").in_("period_id", period_ids).execute().data or []
            )
            assignments = (
                supabase.table("rota_assignments")
                .select("*").in_("period_id", period_ids).execute().data or []
            )
        except Exception:
            pass

    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "venue": venue,
        "staff": staff,
        "shifts": _rows("shifts"),
        "periods": _rows("availability_periods"),
        "submissions": submissions,
        "assignments": assignments,
        "leave_requests": _rows("leave_requests"),
        "activity_log": _rows("activity_log"),
    }


@router.get("/venues/{venue_id}/export", dependencies=[Depends(require_admin)])
def export_venue(venue_id: str):
    """Full JSON snapshot of a venue's data, for the admin to keep before a
    delete (a delete cascades away staff PII with no other backup) or on
    request. Reading it is audited so a bulk data pull leaves a trail."""
    venue = _get_venue_or_404(venue_id)
    data = _export_venue_data(venue)
    _log_admin_audit(
        "venue_exported",
        venue=venue,
        detail=f"Data export: {len(data['staff'])} staff, {len(data['assignments'])} assignments",
    )
    return data


@router.delete("/venues/{venue_id}", dependencies=[Depends(require_admin)])
def delete_venue(venue_id: str):
    """Permanently deletes a venue and all related data. Foreign-key cascades
    remove shifts, staff, scheduling rules, periods, submissions, assignments
    and activity log for the venue (see migrations 001/007/008). The admin_audit
    row is written BEFORE the delete and survives it (target_venue_id is a plain
    uuid, not an FK), so a deleted venue still has an accountability trail."""
    supabase = get_supabase()
    venue = _get_venue_or_404(venue_id)

    staff_count = (
        len(supabase.table("staff_members").select("id").eq("venue_id", venue_id).execute().data or [])
    )
    _log_admin_audit(
        "venue_deleted",
        venue=venue,
        detail=f"Venue permanently deleted ({staff_count} staff records erased)",
    )

    supabase.table("venues").delete().eq("id", venue_id).execute()

    return {"status": "deleted", "name": venue["name"]}


@router.get("/activity", response_model=list[AdminActivityOut], dependencies=[Depends(require_admin)])
def list_all_activity(limit: int = Query(default=50, le=200)):
    supabase = get_supabase()
    rows = (
        supabase.table("activity_log")
        .select("*")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
        .data
    )

    venue_ids = {r["venue_id"] for r in rows if r.get("venue_id")}
    staff_ids = {r["staff_id"] for r in rows if r.get("staff_id")}

    venues_by_id: dict[str, str] = {}
    if venue_ids:
        vres = supabase.table("venues").select("id, name").in_("id", list(venue_ids)).execute()
        venues_by_id = {v["id"]: v["name"] for v in vres.data}

    staff_by_id: dict[str, str] = {}
    if staff_ids:
        sres = supabase.table("staff_members").select("id, name").in_("id", list(staff_ids)).execute()
        staff_by_id = {s["id"]: s["name"] for s in sres.data}

    for r in rows:
        r["venue_name"] = venues_by_id.get(r["venue_id"], "Unknown venue")
        r["staff_name"] = staff_by_id.get(r["staff_id"]) if r.get("staff_id") else None

    return rows


@router.get("/audit", response_model=list[AdminAuditOut], dependencies=[Depends(require_admin)])
def list_admin_audit(limit: int = Query(default=100, le=500)):
    """The admin-action trail (comps, deletes, impersonation, trial edits).
    Self-contained rows — no join — so deleted venues still read correctly."""
    supabase = get_supabase()
    return (
        supabase.table("admin_audit")
        .select("*")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
        .data
    )


@router.get(
    "/venues/{venue_id}/rota",
    response_model=AdminVenueRotaOut,
    dependencies=[Depends(require_admin)],
)
def get_venue_rota(venue_id: str):
    """Read-only view of a venue's current (latest) rota, for admin support."""
    supabase = get_supabase()
    venue = _get_venue_or_404(venue_id)

    shifts = (
        supabase.table("shifts")
        .select("*")
        .eq("venue_id", venue_id)
        .order("sort_order")
        .execute()
        .data
    )
    staff = (
        supabase.table("staff_members")
        .select("id, name, role")
        .eq("venue_id", venue_id)
        .eq("is_active", True)
        .order("name")
        .execute()
        .data
    )

    # A9 — the rota view wants the newest week that actually has a rota, not
    # the newest row of any kind.
    period = period_resolver.newest_rota_period(venue_id)
    summary = _build_summary(venue_id, period) if period else None

    return {
        "venue_name": venue["name"],
        "period": (
            {"id": period["id"], "week_start": str(period["week_start"]), "status": period["status"]}
            if period
            else None
        ),
        "shifts": shifts,
        "staff": staff,
        "summary": summary,
    }


@router.post(
    "/venues/{venue_id}/generate",
    response_model=RotaSummaryOut,
    dependencies=[Depends(require_admin)],
)
def admin_generate_rota(venue_id: str):
    venue = _get_venue_or_404(venue_id)
    # A9 — support's "generate" means "build the week this venue is currently
    # on". That is the collection week while it is unsolved (the common failure
    # being a week the cron closed and the solve then failed on), and otherwise
    # the newest week that has a rota. run_solver_for_period still refuses a
    # published/confirmed period; unpublish below is the way out of that.
    period = period_resolver.collection_period(venue_id) or period_resolver.newest_rota_period(venue_id)
    if not period:
        raise HTTPException(status_code=404, detail="This venue has no availability period yet")

    # run_solver_for_period refuses a published/confirmed period — it deletes
    # every solver-placed row before it solves, so on a live week that destroys
    # the rota staff already have. Bring it down with the unpublish below first;
    # that path logs to activity_log, so the trail shows a support action took
    # the week off staff deliberately.
    return run_solver_for_period(venue, period, note=" (triggered via admin console)")


@router.post(
    "/venues/{venue_id}/unpublish",
    response_model=RotaSummaryOut,
    dependencies=[Depends(require_admin)],
)
def admin_unpublish_rota(venue_id: str):
    """Pulls a venue's newest published/confirmed rota back to "generated".

    Exists because the generate guard would otherwise leave support with a dead
    end: once a manager publishes their newest week — the steady state — the
    console's Generate button 400s telling the operator to unpublish first,
    which the console had no way to do. Same status flip and same activity_log
    row as the manager-facing endpoint, so a rota only ever comes down one way.
    """
    venue = _get_venue_or_404(venue_id)
    # A9 — you unpublish a week that has a rota, by definition.
    period = period_resolver.newest_rota_period(venue_id)
    if not period:
        raise HTTPException(status_code=404, detail="This venue has no availability period yet")
    if period["status"] not in ("published", "confirmed"):
        raise HTTPException(status_code=400, detail="This venue's newest rota isn't published")

    supabase = get_supabase()
    supabase.table("availability_periods").update({"status": "generated"}).eq(
        "id", period["id"]
    ).execute()
    supabase.table("activity_log").insert(
        {
            "venue_id": venue["id"],
            "action": "rota_unpublished",
            "detail": (
                f"Rota for week of {period['week_start']} was unpublished "
                f"(via admin console)"
            ),
        }
    ).execute()
    return _build_summary(venue["id"], {**period, "status": "generated"})


@router.post(
    "/staff/{staff_id}/reset-pin",
    response_model=StaffManagerOut,
    dependencies=[Depends(require_admin)],
)
def admin_reset_pin(staff_id: str):
    supabase = get_supabase()
    staff_res = supabase.table("staff_members").select("*").eq("id", staff_id).limit(1).execute()
    if not staff_res.data:
        raise HTTPException(status_code=404, detail="Staff member not found")
    staff = staff_res.data[0]

    new_pin = _generate_unique_pin(staff["venue_id"])
    updated = (
        supabase.table("staff_members")
        .update({"pin": new_pin})
        .eq("id", staff_id)
        .execute()
        .data[0]
    )

    supabase.table("activity_log").insert(
        {
            "venue_id": staff["venue_id"],
            "staff_id": staff_id,
            "action": "pin_reset",
            "detail": f"{staff['name']}'s PIN was reset (via admin console)",
        }
    ).execute()

    updated["submitted"] = None
    return updated
