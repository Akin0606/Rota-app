from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request, Response

from config import get_settings
from database import get_supabase
from models.schemas import (
    ActivityOut,
    AutoSubmitOut,
    AutoSubmitToggleRequest,
    AvailabilityAuthResponse,
    AvailabilityClaimRequest,
    AvailabilityDropRequest,
    AvailabilityGiveActionRequest,
    AvailabilityGiveRequest,
    AvailabilitySubmitRequest,
    AvailabilitySwapActionRequest,
    AvailabilitySwapProposeRequest,
    ClaimSubmitResponse,
    ForgotPinRequest,
    PinAuthRequest,
    StaffJoinRequest,
    StaffJoinResponse,
    StaffRotaOut,
    VenueInfoResponse,
    WeekAvailabilityOut,
    WeekAvailabilityRequest,
)
from services import email_service, notice_window, rate_limit, swap_guard
from services.auth_service import INACTIVE_VENUE_MESSAGE
from services.pin_service import generate_unique_pin
from services.solver import UNAVAILABLE, check_manual_assignment

# PIN auth: block a venue_token + IP after this many wrong PINs in the window.
PIN_MAX_ATTEMPTS = 5
PIN_WINDOW_SECONDS = 15 * 60
# IP-independent backstop. The per-IP limit above is keyed on client_ip(),
# which trusts X-Forwarded-For and can therefore be dodged by rotating a
# spoofed header. This second cap counts ALL wrong PINs against a single
# venue_token regardless of source IP, so brute-forcing a 4-digit PIN is
# bounded even when the per-IP key is attacker-controlled. Set well above what
# a venue's real staff would ever trip in the window. (Proper fix is a shared
# store + longer PINs — tracked; this is the mitigation that needs no infra.)
PIN_GLOBAL_MAX = 30
PIN_GLOBAL_WINDOW_SECONDS = 15 * 60
# Forgot-PIN: cap requests per venue + email to curb enumeration/abuse.
FORGOT_MAX_REQUESTS = 3
FORGOT_WINDOW_SECONDS = 60 * 60

DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

# Notification bell: only the shift-lifecycle events staff care about — excludes
# manager/admin-internal actions (rule changes, PIN resets, venue admin,
# reminders, rota_generated pre-publish) and submitted_availability (too
# noisy at volume).
STAFF_ACTIVITY_ACTIONS = [
    "shift_posted_open",
    "shift_dropped",
    "shift_claimed_auto",
    "shift_claim_pending",
    "shift_claim_approved",
    "shift_claim_rejected",
    "shift_given",
    "shift_given_accepted",
    "shift_given_accept_pending",
    "shift_given_declined",
    "shift_swap_proposed",
    "shift_swap_accept_pending",
    "shift_swap_accepted",
    "shift_swap_declined",
    "shift_swap_approved",
    "shift_swap_rejected",
    "rota_published",
    "rota_confirmed",
    "staff_added",
    "leave_requested",
    "leave_approved",
    "leave_rejected",
    "leave_cancelled",
]

router = APIRouter(prefix="/api/availability", tags=["availability"])


def _get_venue_or_404(venue_token: str) -> dict:
    supabase = get_supabase()
    res = (
        supabase.table("venues")
        .select("*")
        .eq("link_token", venue_token)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Venue link not found")
    venue = res.data[0]
    if not venue.get("is_active", True):
        raise HTTPException(status_code=403, detail=INACTIVE_VENUE_MESSAGE)
    return venue


def _get_staff_by_pin(venue_id: str, pin: str) -> dict:
    supabase = get_supabase()
    res = (
        supabase.table("staff_members")
        .select("*")
        .eq("venue_id", venue_id)
        .eq("pin", pin)
        .eq("is_active", True)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=401, detail="Incorrect PIN")
    return res.data[0]


def _get_current_period(venue_id: str) -> Optional[dict]:
    supabase = get_supabase()
    res = (
        supabase.table("availability_periods")
        .select("*")
        .eq("venue_id", venue_id)
        .eq("status", "collecting")
        .order("week_start", desc=True)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def _get_or_create_current_period(venue_id: str) -> dict:
    """Returns the venue's open (collecting) period, creating one on the fly if
    none exists. This guarantees a staff member who taps the venue link always
    has a week to fill in, even if the open/close cron timing left a gap."""
    existing = _get_current_period(venue_id)
    if existing:
        return existing

    from datetime import date, timedelta

    supabase = get_supabase()
    today = date.today()
    this_monday = today - timedelta(days=today.weekday())

    # Pick the earliest upcoming week (from this week) that doesn't already have
    # a period, so we don't collide with a closed/generated week.
    taken = {
        str(r["week_start"])
        for r in supabase.table("availability_periods")
        .select("week_start")
        .eq("venue_id", venue_id)
        .gte("week_start", this_monday.isoformat())
        .execute()
        .data
    }
    candidate = this_monday
    for _ in range(8):
        if candidate.isoformat() not in taken:
            break
        candidate = candidate + timedelta(days=7)

    period = (
        supabase.table("availability_periods")
        .insert({"venue_id": venue_id, "week_start": candidate.isoformat(), "status": "collecting"})
        .execute()
        .data[0]
    )
    supabase.table("activity_log").insert(
        {
            "venue_id": venue_id,
            "action": "availability_opened",
            "detail": f"Availability opened for week of {candidate.isoformat()} (auto)",
        }
    ).execute()
    return period


# Staff can plan availability up to this many weeks ahead of the current week.
AVAIL_WEEKS_AHEAD = 4


def _week_window() -> tuple["date", "date"]:
    from datetime import date, timedelta

    today = date.today()
    this_monday = today - timedelta(days=today.weekday())
    return this_monday, this_monday + timedelta(weeks=AVAIL_WEEKS_AHEAD)


def _normalize_monday(week_start: str) -> "date":
    from datetime import date, timedelta

    d = date.fromisoformat(week_start)
    return d - timedelta(days=d.weekday())


def _period_for_week(venue_id: str, monday: "date") -> Optional[dict]:
    supabase = get_supabase()
    res = (
        supabase.table("availability_periods")
        .select("*")
        .eq("venue_id", venue_id)
        .eq("week_start", monday.isoformat())
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def _get_or_create_period_for_week(venue_id: str, monday: "date") -> dict:
    existing = _period_for_week(venue_id, monday)
    if existing:
        return existing
    supabase = get_supabase()
    period = (
        supabase.table("availability_periods")
        .insert({"venue_id": venue_id, "week_start": monday.isoformat(), "status": "collecting"})
        .execute()
        .data[0]
    )
    supabase.table("activity_log").insert(
        {
            "venue_id": venue_id,
            "action": "availability_opened",
            "detail": f"Availability opened for week of {monday.isoformat()} (auto)",
        }
    ).execute()
    return period


def _get_shifts(venue_id: str) -> list[dict]:
    supabase = get_supabase()
    return (
        supabase.table("shifts")
        .select("*")
        .eq("venue_id", venue_id)
        .order("sort_order")
        .execute()
        .data
    )


def _get_rules(venue_id: str) -> dict:
    """Staff-facing close deadline (day + time) for the week currently open. The
    close is derived from that week's notice window, so it stays accurate as the
    formula recalculates each week."""
    fallback = {"avail_closes_day": "Wednesday", "avail_closes_time": "23:00"}
    window = notice_window.compute_for_venue(venue_id)
    if not window:
        return fallback
    dt = window["closes_at"]
    return {
        "avail_closes_day": DAY_NAMES[dt.weekday()],
        "avail_closes_time": dt.strftime("%H:%M"),
    }


@router.get("/{venue_token}", response_model=VenueInfoResponse)
def get_venue_info(venue_token: str, response: Response):
    venue = _get_venue_or_404(venue_token)
    # Never let a browser/CDN serve a cached venue name — it must always reflect
    # the latest rename.
    response.headers["Cache-Control"] = "no-store, max-age=0"
    return {
        "venue_name": venue["name"],
        "shifts": _get_shifts(venue["id"]),
    }


@router.post("/{venue_token}/auth", response_model=AvailabilityAuthResponse)
def authenticate(venue_token: str, payload: PinAuthRequest, request: Request):
    venue = _get_venue_or_404(venue_token)

    lock_key = f"pinauth:{venue_token}:{rate_limit.client_ip(request)}"
    global_key = f"pinauth-global:{venue_token}"
    for key, limit, window in (
        (lock_key, PIN_MAX_ATTEMPTS, PIN_WINDOW_SECONDS),
        (global_key, PIN_GLOBAL_MAX, PIN_GLOBAL_WINDOW_SECONDS),
    ):
        locked, retry_after = rate_limit.is_locked(key, limit, window)
        if locked:
            minutes = rate_limit.minutes_from_seconds(retry_after)
            raise HTTPException(
                status_code=429,
                detail=f"Too many incorrect attempts. Try again in {minutes} minute{'s' if minutes != 1 else ''}.",
            )

    try:
        staff = _get_staff_by_pin(venue["id"], payload.pin)
    except HTTPException as exc:
        if exc.status_code == 401:
            # Only wrong PINs count toward the lockout — both the per-IP key and
            # the IP-independent venue-wide backstop.
            rate_limit.record(lock_key)
            rate_limit.record(global_key)
        raise
    # Successful PIN clears the per-IP failure count for this venue_token + IP.
    # The global backstop is deliberately NOT cleared by one success, so a
    # single valid login can't reset an in-progress venue-wide brute-force.
    rate_limit.clear(lock_key)

    # Always give the staff member an open week to fill — create one on the fly
    # if the cron cycle left a gap.
    period = _get_or_create_current_period(venue["id"])
    supabase = get_supabase()
    saved = (
        supabase.table("availability_submissions")
        .select("day_index, shift_id, status, note, auto_submitted")
        .eq("period_id", period["id"])
        .eq("staff_id", staff["id"])
        .execute()
        .data
    )
    auto_submitted = period["status"] == "collecting" and any(r.get("auto_submitted") for r in saved)
    submissions = [{k: v for k, v in r.items() if k != "auto_submitted"} for r in saved]

    return {
        "staff": {
            "id": staff["id"],
            "name": staff["name"],
            "role": staff["role"],
            "auto_submit_availability": staff.get("auto_submit_availability", False),
            "pending": staff.get("pending", False),
        },
        "venue_name": venue["name"],
        "auto_submitted": auto_submitted,
        "period": (
            {
                "id": period["id"],
                "week_start": str(period["week_start"]),
                "status": period["status"],
            }
            if period
            else None
        ),
        "shifts": _get_shifts(venue["id"]),
        "submissions": submissions,
        "rules": _get_rules(venue["id"]),
    }


def _default_join_role(venue_id: str) -> str:
    """The role a self-registered member is created with — the venue's first
    role by sort order, so it's a real, valid role. Falls back to "Staff" for a
    venue with no roles configured. The manager sets the real role on approval."""
    supabase = get_supabase()
    res = (
        supabase.table("roles")
        .select("name")
        .eq("venue_id", venue_id)
        .order("sort_order")
        .limit(1)
        .execute()
    )
    return res.data[0]["name"] if res.data else "Staff"


@router.post("/{venue_token}/join", response_model=StaffJoinResponse)
def join_team(venue_token: str, payload: StaffJoinRequest, request: Request):
    """Public self-registration. Gated by the venue's rotatable join_pin — a
    forwarded link with no code is inert, and the roster is never exposed to an
    unauthenticated visitor. Creates a *pending* staff row (is_active=true,
    pending=true: can PIN-auth and submit availability, but the solver ignores
    them) and returns their new PIN exactly once. Rate-limited like PIN auth."""
    venue = _get_venue_or_404(venue_token)

    join_pin = venue.get("join_pin")
    if not join_pin:
        # Joining disabled for this venue — no code set. Same 403 shape whether
        # the code is unset here or wrong below is deliberately avoided: an
        # unset code is a venue-config state worth stating plainly, and it
        # leaks nothing (there's no roster to protect if nobody can join).
        raise HTTPException(status_code=403, detail="Joining isn't open for this venue right now.")

    lock_key = f"joinpin:{venue_token}:{rate_limit.client_ip(request)}"
    global_key = f"joinpin-global:{venue_token}"
    for key, limit, window in (
        (lock_key, PIN_MAX_ATTEMPTS, PIN_WINDOW_SECONDS),
        (global_key, PIN_GLOBAL_MAX, PIN_GLOBAL_WINDOW_SECONDS),
    ):
        locked, retry_after = rate_limit.is_locked(key, limit, window)
        if locked:
            minutes = rate_limit.minutes_from_seconds(retry_after)
            raise HTTPException(
                status_code=429,
                detail=f"Too many incorrect attempts. Try again in {minutes} minute{'s' if minutes != 1 else ''}.",
            )

    if payload.join_pin != join_pin:
        # Count the wrong code against both the per-IP key and the
        # IP-independent venue-wide backstop (spoof-proof).
        rate_limit.record(lock_key)
        rate_limit.record(global_key)
        raise HTTPException(status_code=401, detail="Incorrect join code")
    rate_limit.clear(lock_key)

    supabase = get_supabase()
    pin = generate_unique_pin(supabase, venue["id"])
    staff = (
        supabase.table("staff_members")
        .insert(
            {
                "venue_id": venue["id"],
                "name": payload.name.strip(),
                "role": _default_join_role(venue["id"]),
                "pin": pin,
                "pending": True,
                "is_active": True,
            }
        )
        .execute()
        .data[0]
    )

    supabase.table("activity_log").insert(
        {
            "venue_id": venue["id"],
            "staff_id": staff["id"],
            "action": "staff_joined_pending",
            "detail": f"{staff['name']} joined via the team link and is awaiting approval",
        }
    ).execute()

    return {
        "staff_id": staff["id"],
        "name": staff["name"],
        "pin": pin,
        "venue_name": venue["name"],
    }


def _most_recent_submission_pattern(venue_id: str, staff_id: str, before_monday: "date") -> list[dict]:
    """This staff member's most recent prior week's submission rows (any
    period earlier than `before_monday`), or [] if they've never submitted.
    Used to pre-fill a blank week and to auto-carry-forward on open."""
    supabase = get_supabase()
    earlier_periods = (
        supabase.table("availability_periods")
        .select("id, week_start")
        .eq("venue_id", venue_id)
        .lt("week_start", before_monday.isoformat())
        .order("week_start", desc=True)
        .limit(8)
        .execute()
        .data
    )
    for p in earlier_periods:
        rows = (
            supabase.table("availability_submissions")
            .select("day_index, shift_id, status, note")
            .eq("period_id", p["id"])
            .eq("staff_id", staff_id)
            .execute()
            .data
        )
        if rows:
            return rows
    return []


@router.post("/{venue_token}/week", response_model=WeekAvailabilityOut)
def get_week_availability(venue_token: str, payload: WeekAvailabilityRequest):
    """Availability for a specific upcoming week (within the 1-month window),
    so staff can plan ahead. Read-only for weeks whose collection has closed."""
    venue = _get_venue_or_404(venue_token)
    staff = _get_staff_by_pin(venue["id"], payload.pin)

    monday = _normalize_monday(payload.week_start)
    window_start, window_end = _week_window()
    if monday < window_start or monday > window_end:
        raise HTTPException(status_code=400, detail="That week is outside the planning window")

    period = _period_for_week(venue["id"], monday)
    editable = period is None or period["status"] == "collecting"

    submissions = []
    auto_submitted = False
    if period:
        supabase = get_supabase()
        saved = (
            supabase.table("availability_submissions")
            .select("day_index, shift_id, status, note, auto_submitted")
            .eq("period_id", period["id"])
            .eq("staff_id", staff["id"])
            .execute()
            .data
        )
        # The cron copied this week forward (§6b) if any saved row is flagged.
        # A manual re-submit re-inserts without the flag, so it clears itself.
        auto_submitted = editable and any(r.get("auto_submitted") for r in saved)
        submissions = [{k: v for k, v in r.items() if k != "auto_submitted"} for r in saved]

    # Nothing saved for this week yet — show their last pattern as a
    # starting point so a no-change week is a single tap, not a rebuild.
    prefilled = False
    if editable and not submissions:
        submissions = _most_recent_submission_pattern(venue["id"], staff["id"], monday)
        prefilled = bool(submissions)

    return {
        "week_start": monday.isoformat(),
        "prefilled": prefilled,
        "auto_submitted": auto_submitted,
        "period": (
            {"id": period["id"], "week_start": str(period["week_start"]), "status": period["status"]}
            if period
            else None
        ),
        "editable": editable,
        "submissions": submissions,
    }


@router.put("/{venue_token}/auto-submit", response_model=AutoSubmitOut)
def set_auto_submit(venue_token: str, payload: AutoSubmitToggleRequest):
    """Turns weekly auto-carry-forward on/off for this staff member. When on,
    `open_availability_for_venue` (services/cron) copies their most recent
    pattern into each new week the moment it opens, so they don't have to log
    in at all if nothing's changed."""
    venue = _get_venue_or_404(venue_token)
    staff = _get_staff_by_pin(venue["id"], payload.pin)
    supabase = get_supabase()

    supabase.table("staff_members").update(
        {"auto_submit_availability": payload.enabled}
    ).eq("id", staff["id"]).execute()

    return {"auto_submit_availability": payload.enabled}


@router.post("/{venue_token}/submit")
def submit_availability(venue_token: str, payload: AvailabilitySubmitRequest):
    venue = _get_venue_or_404(venue_token)
    staff = _get_staff_by_pin(venue["id"], payload.pin)

    if payload.week_start:
        monday = _normalize_monday(payload.week_start)
        window_start, window_end = _week_window()
        if monday < window_start or monday > window_end:
            raise HTTPException(status_code=400, detail="That week is outside the planning window")
        existing = _period_for_week(venue["id"], monday)
        if existing and existing["status"] != "collecting":
            raise HTTPException(status_code=400, detail="Availability for that week has already closed")
        period = _get_or_create_period_for_week(venue["id"], monday)
    else:
        period = _get_or_create_current_period(venue["id"])

    supabase = get_supabase()

    # Replace this staff member's submissions for the period wholesale —
    # simpler and safer than trying to upsert against a unique constraint
    # where shift_id (used for day-level notes) can be NULL.
    supabase.table("availability_submissions").delete().eq(
        "period_id", period["id"]
    ).eq("staff_id", staff["id"]).execute()

    rows = [
        {
            "period_id": period["id"],
            "staff_id": staff["id"],
            "day_index": e.day_index,
            "shift_id": e.shift_id,
            "status": e.status,
            "note": e.note,
        }
        for e in payload.submissions
        if e.status != 0 or e.note
    ]
    if rows:
        supabase.table("availability_submissions").insert(rows).execute()

    supabase.table("activity_log").insert(
        {
            "venue_id": venue["id"],
            "staff_id": staff["id"],
            "action": "submitted_availability",
            "detail": f"{staff['name']} submitted availability for week of {period['week_start']}",
        }
    ).execute()

    return {"status": "ok"}


@router.post("/{venue_token}/forgot-pin")
def forgot_pin(venue_token: str, payload: ForgotPinRequest):
    venue = _get_venue_or_404(venue_token)

    # Rate limit per venue + email so this can't be used to hammer an inbox or
    # probe which emails belong to staff. Keyed on the normalised email so case
    # variations can't multiply the allowance.
    limit_key = f"forgotpin:{venue['id']}:{payload.email.strip().lower()}"
    allowed, retry_after = rate_limit.hit(limit_key, FORGOT_MAX_REQUESTS, FORGOT_WINDOW_SECONDS)
    if not allowed:
        minutes = rate_limit.minutes_from_seconds(retry_after)
        raise HTTPException(
            status_code=429,
            detail=f"Too many requests. Try again in {minutes} minute{'s' if minutes != 1 else ''}.",
        )

    supabase = get_supabase()

    match = (
        supabase.table("staff_members")
        .select("id, name, email, pin")
        .eq("venue_id", venue["id"])
        .eq("email", payload.email)
        .eq("is_active", True)
        .limit(1)
        .execute()
    )
    if match.data:
        staff = match.data[0]
        email_service.send_pin_reminder_email(
            to_email=staff["email"],
            name=staff["name"],
            venue_name=venue["name"],
            pin=staff["pin"],
            venue_link_url=f"{get_settings().frontend_url}/v/{venue['link_token']}",
        )

    # Always respond with the same generic message regardless of whether the
    # email matches, so this endpoint can't be used to enumerate staff
    # emails at a venue.
    return {"status": "ok"}


def _get_published_period(venue_id: str) -> Optional[dict]:
    """The active rota staff should see — provisional (status "published") or
    confirmed, whichever is the most recent week. Both are equally "live" from
    a staff member's point of view; confirmed just means the window has
    closed on it, not that it's any more or less visible."""
    supabase = get_supabase()
    res = (
        supabase.table("availability_periods")
        .select("*")
        .eq("venue_id", venue_id)
        .in_("status", ["published", "confirmed"])
        .order("week_start", desc=True)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def _pending_swaps_for_staff(period_id: str, staff_id: str) -> list[dict]:
    """Swap proposals the caller is party to (either side), still unresolved.
    Resolved swaps (approved/declined/rejected) are omitted — their effect is
    already reflected in `assignments`, or simply gone, matching how a
    resolved drop/give also stops appearing once it's settled."""
    supabase = get_supabase()
    rows = (
        supabase.table("shift_swaps")
        .select("*")
        .eq("period_id", period_id)
        .in_("status", ["pending_response", "pending_approval"])
        .or_(f"initiator_staff_id.eq.{staff_id},recipient_staff_id.eq.{staff_id}")
        .execute()
        .data
    )
    if not rows:
        return []

    counterpart_ids = {
        (r["recipient_staff_id"] if r["initiator_staff_id"] == staff_id else r["initiator_staff_id"])
        for r in rows
    }
    names = {
        s["id"]: s["name"]
        for s in supabase.table("staff_members").select("id, name").in_("id", list(counterpart_ids)).execute().data
    }

    out = []
    for r in rows:
        is_initiator = r["initiator_staff_id"] == staff_id
        counterpart_id = r["recipient_staff_id"] if is_initiator else r["initiator_staff_id"]
        my_side = "initiator" if is_initiator else "recipient"
        my_assignment_id = r["initiator_assignment_id"] if is_initiator else r["recipient_assignment_id"]
        their_assignment_id = r["recipient_assignment_id"] if is_initiator else r["initiator_assignment_id"]
        out.append(
            {
                "id": r["id"],
                "role": my_side,
                "status": r["status"],
                "counterpart_id": counterpart_id,
                "counterpart_name": names.get(counterpart_id, "a teammate"),
                "my_assignment_id": my_assignment_id,
                "their_assignment_id": their_assignment_id,
            }
        )
    return out


def _swap_side_from_assignment(assignment: dict) -> dict:
    return {"assignment_id": assignment["id"], "day_index": assignment["day_index"], "shift_id": assignment["shift_id"]}


def _build_staff_rota(venue: dict, staff_id: str) -> dict:
    period = _get_published_period(venue["id"])
    if not period:
        return {"venue_name": venue["name"], "staff_id": staff_id, "period": None}

    supabase = get_supabase()
    assignments = (
        supabase.table("rota_assignments")
        .select(
            "id, staff_id, day_index, shift_id, drop_status, claim_staff_id, target_staff_id, required_role"
        )
        .eq("period_id", period["id"])
        .execute()
        .data
    )
    assignments_by_id = {a["id"]: a for a in assignments}

    # A manager-posted open shift has no owner yet — exclude the None before
    # looking up team members, or the .in_() lookup chokes on it.
    staff_ids = list({a["staff_id"] for a in assignments if a["staff_id"]})
    team = (
        supabase.table("staff_members").select("id, name, role").in_("id", staff_ids).execute().data
        if staff_ids
        else []
    )

    venue_staff = [
        s
        for s in supabase.table("staff_members")
        .select("id, name, role")
        .eq("venue_id", venue["id"])
        .eq("is_active", True)
        # Pending self-registrants can't be a give/swap counterpart until approved.
        .eq("pending", False)
        .execute()
        .data
        if s["id"] != staff_id
    ]

    pending_swaps = []
    for sw in _pending_swaps_for_staff(period["id"], staff_id):
        my_a = assignments_by_id.get(sw["my_assignment_id"])
        their_a = assignments_by_id.get(sw["their_assignment_id"])
        if not my_a or not their_a:
            continue
        pending_swaps.append(
            {
                "id": sw["id"],
                "role": sw["role"],
                "status": sw["status"],
                "counterpart_id": sw["counterpart_id"],
                "counterpart_name": sw["counterpart_name"],
                "my_shift": _swap_side_from_assignment(my_a),
                "their_shift": _swap_side_from_assignment(their_a),
            }
        )

    return {
        "venue_name": venue["name"],
        "staff_id": staff_id,
        "period": {"id": period["id"], "week_start": str(period["week_start"]), "status": period["status"]},
        "shifts": _get_shifts(venue["id"]),
        "assignments": assignments,
        "team": team,
        "venue_staff": venue_staff,
        "pending_swaps": pending_swaps,
    }


@router.post("/{venue_token}/rota", response_model=StaffRotaOut)
def get_staff_rota(venue_token: str, payload: PinAuthRequest):
    # POST (not GET) so the PIN travels in the request body, never the URL —
    # a URL-borne credential lands in access logs, proxy logs, browser history
    # and Referer headers. A read done over POST; the staff cache classifies it
    # by path tail, not method, so caching is unaffected.
    venue = _get_venue_or_404(venue_token)
    staff = _get_staff_by_pin(venue["id"], payload.pin)
    return _build_staff_rota(venue, staff["id"])


@router.post("/{venue_token}/rota/drop", response_model=StaffRotaOut)
def drop_shift(venue_token: str, payload: AvailabilityDropRequest):
    """Part 1 of drop-a-shift: marks the caller's own assignment as open for
    pickup. Does NOT reassign or remove it — the original person stays on the
    shift until a valid claim exists (part 2), so this never creates a gap
    the system itself is responsible for."""
    from datetime import date, datetime, timedelta

    venue = _get_venue_or_404(venue_token)
    staff = _get_staff_by_pin(venue["id"], payload.pin)
    supabase = get_supabase()

    period = _get_published_period(venue["id"])
    if not period:
        raise HTTPException(status_code=404, detail="No published rota found")

    # Venue + ownership scoped in the same query: a cross-tenant or someone
    # else's assignment_id simply matches zero rows.
    assignment_res = (
        supabase.table("rota_assignments")
        .select("*")
        .eq("id", payload.assignment_id)
        .eq("period_id", period["id"])
        .eq("staff_id", staff["id"])
        .limit(1)
        .execute()
    )
    if not assignment_res.data:
        raise HTTPException(status_code=404, detail="Shift not found")
    assignment = assignment_res.data[0]

    if assignment.get("drop_status"):
        raise HTTPException(status_code=400, detail="This shift has already been dropped")

    if swap_guard.active_swaps_for_assignments([assignment["id"]]):
        raise HTTPException(status_code=400, detail="This shift has a swap offer pending — resolve that first")

    shift_date = date.fromisoformat(str(period["week_start"])) + timedelta(days=assignment["day_index"])
    if shift_date < date.today():
        raise HTTPException(status_code=400, detail="Can't drop a shift that's already passed")

    supabase.table("rota_assignments").update(
        {"drop_status": "pending_pickup", "dropped_at": datetime.utcnow().isoformat()}
    ).eq("id", assignment["id"]).execute()

    supabase.table("activity_log").insert(
        {
            "venue_id": venue["id"],
            "staff_id": staff["id"],
            "action": "shift_dropped",
            "detail": f"{staff['name']} dropped their {DAY_NAMES[assignment['day_index']]} shift for week of {period['week_start']}",
        }
    ).execute()

    return _build_staff_rota(venue, staff["id"])


def _get_rules_for_solver(venue_id: str) -> dict:
    supabase = get_supabase()
    rules_res = (
        supabase.table("scheduling_rules")
        .select("max_hours_per_week, min_rest_hours, require_day_off")
        .eq("venue_id", venue_id)
        .limit(1)
        .execute()
    )
    return rules_res.data[0] if rules_res.data else {
        "max_hours_per_week": 48,
        "min_rest_hours": 11,
        "require_day_off": True,
    }


@router.post("/{venue_token}/rota/claim", response_model=ClaimSubmitResponse)
def claim_shift(venue_token: str, payload: AvailabilityClaimRequest):
    """Part 2 of drop-a-shift: a staff member claims an open (pending_pickup)
    shift. Reuses check_manual_assignment — the same rest/hours/under-18
    checks a manager's manual rota edit already goes through — rather than
    reimplementing that rule logic here.

    Auto-approves only when the claimant's role matches the original
    assignee's, they haven't marked themselves unavailable for that slot, and
    check_manual_assignment says "ok". Anything else that isn't an outright
    under-18 block goes to pending_approval for a manager to review — never
    auto-rejected.
    """
    venue = _get_venue_or_404(venue_token)
    staff = _get_staff_by_pin(venue["id"], payload.pin)
    supabase = get_supabase()

    period = _get_published_period(venue["id"])
    if not period:
        raise HTTPException(status_code=404, detail="No published rota found")

    assignment_res = (
        supabase.table("rota_assignments")
        .select("*")
        .eq("id", payload.assignment_id)
        .eq("period_id", period["id"])
        .eq("drop_status", "pending_pickup")
        .limit(1)
        .execute()
    )
    if not assignment_res.data:
        raise HTTPException(status_code=404, detail="This shift isn't open to claim")
    assignment = assignment_res.data[0]

    if assignment["staff_id"] == staff["id"]:
        raise HTTPException(status_code=400, detail="You can't claim your own dropped shift")

    shifts_by_id = {s["id"]: s for s in _get_shifts(venue["id"])}
    shift = shifts_by_id.get(assignment["shift_id"])
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    original_staff = None
    if assignment["staff_id"]:
        original_res = (
            supabase.table("staff_members")
            .select("id, name, role")
            .eq("id", assignment["staff_id"])
            .limit(1)
            .execute()
        )
        original_staff = original_res.data[0] if original_res.data else None

    claimant = (
        supabase.table("staff_members")
        .select("id, name, role, is_under_18")
        .eq("id", staff["id"])
        .limit(1)
        .execute()
        .data[0]
    )

    # A manager-posted open shift (no original assignee) carries its own
    # explicit required_role instead — unset means it's open to any role.
    if assignment.get("required_role"):
        role_mismatch = claimant["role"] != assignment["required_role"]
    else:
        role_mismatch = bool(original_staff) and claimant["role"] != original_staff["role"]

    sub_res = (
        supabase.table("availability_submissions")
        .select("status")
        .eq("period_id", period["id"])
        .eq("staff_id", staff["id"])
        .eq("day_index", assignment["day_index"])
        .eq("shift_id", assignment["shift_id"])
        .limit(1)
        .execute()
    )
    marked_unavailable = bool(sub_res.data) and sub_res.data[0]["status"] == UNAVAILABLE

    other_assignments = (
        supabase.table("rota_assignments")
        .select("day_index, shift_id")
        .eq("period_id", period["id"])
        .eq("staff_id", staff["id"])
        .neq("day_index", assignment["day_index"])
        .execute()
        .data
    )
    rules = _get_rules_for_solver(venue["id"])
    check = check_manual_assignment(claimant, assignment["day_index"], shift, other_assignments, shifts_by_id, rules)

    # Under-18 legal violations are a hard block — can never be claimed at
    # all, not even into a pending state.
    if check["severity"] == "block":
        raise HTTPException(status_code=400, detail=check["reason"])

    reasons = []
    if role_mismatch:
        needed_role = assignment.get("required_role") or (original_staff["role"] if original_staff else "unknown")
        reasons.append(f"different role ({claimant['role']} vs {needed_role})")
    if marked_unavailable:
        reasons.append("marked unavailable for this shift")
    if check["severity"] == "confirm":
        reasons.append(check["reason"])

    original_name = original_staff["name"] if original_staff else "a teammate"

    if not reasons:
        # Enforce one-shift-per-day for the claimant before handing them the
        # claimed shift — but never silently blow away a row that's the
        # subject of one of the claimant's own pending swaps.
        same_day = (
            supabase.table("rota_assignments")
            .select("id")
            .eq("period_id", period["id"])
            .eq("staff_id", staff["id"])
            .eq("day_index", assignment["day_index"])
            .execute()
            .data
        )
        if swap_guard.active_swaps_for_assignments([r["id"] for r in same_day]):
            raise HTTPException(
                status_code=400,
                detail="You have a swap pending on that day — resolve it before claiming this shift",
            )

        # Atomic claim: only the first concurrent claimant wins. Guarding the
        # write on drop_status='pending_pickup' means a second claimant whose
        # read passed but whose write arrives late gets zero rows back — the
        # shift moved under them — instead of silently overwriting the winner.
        # Do this BEFORE deleting the claimant's other same-day row, so a lost
        # race never destroys their existing assignment.
        claimed = (
            supabase.table("rota_assignments")
            .update(
                {
                    "staff_id": staff["id"],
                    "drop_status": None,
                    "dropped_at": None,
                    "claim_staff_id": None,
                    "claim_reason": None,
                    "manually_assigned": True,
                }
            )
            .eq("id", assignment["id"])
            .eq("drop_status", "pending_pickup")
            .execute()
        )
        if not claimed.data:
            raise HTTPException(status_code=409, detail="Someone just picked up this shift")

        # Now clear any OTHER assignment the claimant held that day (one shift
        # per day) — excluding the shift they just claimed.
        supabase.table("rota_assignments").delete().eq("period_id", period["id"]).eq(
            "staff_id", staff["id"]
        ).eq("day_index", assignment["day_index"]).neq("id", assignment["id"]).execute()

        supabase.table("activity_log").insert(
            {
                "venue_id": venue["id"],
                "staff_id": staff["id"],
                "action": "shift_claimed_auto",
                "detail": (
                    f"{staff['name']} picked up {original_name}'s {DAY_NAMES[assignment['day_index']]} "
                    f"shift — auto-approved (like-for-like)."
                ),
            }
        ).execute()

        return ClaimSubmitResponse(status="approved", rota=_build_staff_rota(venue, staff["id"]))

    reason_text = "; ".join(reasons)
    requested = (
        supabase.table("rota_assignments")
        .update({"drop_status": "pending_approval", "claim_staff_id": staff["id"], "claim_reason": reason_text})
        .eq("id", assignment["id"])
        .eq("drop_status", "pending_pickup")
        .execute()
    )
    if not requested.data:
        raise HTTPException(status_code=409, detail="Someone just picked up this shift")

    supabase.table("activity_log").insert(
        {
            "venue_id": venue["id"],
            "staff_id": staff["id"],
            "action": "shift_claim_pending",
            "detail": (
                f"{staff['name']} requested {original_name}'s {DAY_NAMES[assignment['day_index']]} shift — "
                f"needs manager approval ({reason_text})."
            ),
        }
    ).execute()

    return ClaimSubmitResponse(status="pending", reason=reason_text, rota=_build_staff_rota(venue, staff["id"]))


@router.post("/{venue_token}/rota/give", response_model=StaffRotaOut)
def give_shift(venue_token: str, payload: AvailabilityGiveRequest):
    """Offers the caller's own assignment directly to a named colleague,
    rather than opening it to the whole pool. Same pending_pickup state and
    no-gap guarantee as a drop — target_staff_id is what makes it visible +
    actionable only by that one person."""
    from datetime import date, datetime, timedelta

    venue = _get_venue_or_404(venue_token)
    staff = _get_staff_by_pin(venue["id"], payload.pin)
    supabase = get_supabase()

    period = _get_published_period(venue["id"])
    if not period:
        raise HTTPException(status_code=404, detail="No published rota found")

    assignment_res = (
        supabase.table("rota_assignments")
        .select("*")
        .eq("id", payload.assignment_id)
        .eq("period_id", period["id"])
        .eq("staff_id", staff["id"])
        .limit(1)
        .execute()
    )
    if not assignment_res.data:
        raise HTTPException(status_code=404, detail="Shift not found")
    assignment = assignment_res.data[0]

    if assignment.get("drop_status"):
        raise HTTPException(status_code=400, detail="This shift has already been dropped")

    if swap_guard.active_swaps_for_assignments([assignment["id"]]):
        raise HTTPException(status_code=400, detail="This shift has a swap offer pending — resolve that first")

    shift_date = date.fromisoformat(str(period["week_start"])) + timedelta(days=assignment["day_index"])
    if shift_date < date.today():
        raise HTTPException(status_code=400, detail="Can't give away a shift that's already passed")

    if payload.target_staff_id == staff["id"]:
        raise HTTPException(status_code=400, detail="You can't give a shift to yourself")

    target_res = (
        supabase.table("staff_members")
        .select("id, name, email")
        .eq("id", payload.target_staff_id)
        .eq("venue_id", venue["id"])
        .eq("is_active", True)
        # A shift can't be given/swapped to a member still awaiting approval.
        .eq("pending", False)
        .limit(1)
        .execute()
    )
    if not target_res.data:
        raise HTTPException(status_code=404, detail="Staff member not found")
    target = target_res.data[0]

    shifts_by_id = {s["id"]: s for s in _get_shifts(venue["id"])}
    shift = shifts_by_id.get(assignment["shift_id"])
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    supabase.table("rota_assignments").update(
        {
            "drop_status": "pending_pickup",
            "dropped_at": datetime.utcnow().isoformat(),
            "target_staff_id": target["id"],
        }
    ).eq("id", assignment["id"]).execute()

    supabase.table("activity_log").insert(
        {
            "venue_id": venue["id"],
            "staff_id": staff["id"],
            "action": "shift_given",
            "detail": (
                f"{staff['name']} offered their {DAY_NAMES[assignment['day_index']]} shift to {target['name']}"
            ),
        }
    ).execute()

    email_service.send_shift_give_email(
        to_email=target.get("email"),
        name=target["name"],
        giver_name=staff["name"],
        venue_name=venue["name"],
        shift_label=f"{DAY_NAMES[assignment['day_index']]} {shift['name']}",
        venue_link_url=f"{get_settings().frontend_url}/v/{venue['link_token']}",
    )

    return _build_staff_rota(venue, staff["id"])


@router.post("/{venue_token}/rota/give/accept", response_model=ClaimSubmitResponse)
def accept_give(venue_token: str, payload: AvailabilityGiveActionRequest):
    """Recipient accepts a shift given to them. Unlike claim_shift, this only
    runs check_manual_assignment — no role-match or availability check —
    since the giver already vouched for this specific person by naming them."""
    venue = _get_venue_or_404(venue_token)
    staff = _get_staff_by_pin(venue["id"], payload.pin)
    supabase = get_supabase()

    period = _get_published_period(venue["id"])
    if not period:
        raise HTTPException(status_code=404, detail="No published rota found")

    assignment_res = (
        supabase.table("rota_assignments")
        .select("*")
        .eq("id", payload.assignment_id)
        .eq("period_id", period["id"])
        .eq("target_staff_id", staff["id"])
        .eq("drop_status", "pending_pickup")
        .limit(1)
        .execute()
    )
    if not assignment_res.data:
        raise HTTPException(status_code=404, detail="This isn't available to accept")
    assignment = assignment_res.data[0]

    shifts_by_id = {s["id"]: s for s in _get_shifts(venue["id"])}
    shift = shifts_by_id.get(assignment["shift_id"])
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    original_res = (
        supabase.table("staff_members").select("id, name").eq("id", assignment["staff_id"]).limit(1).execute()
    )
    original_name = original_res.data[0]["name"] if original_res.data else "a teammate"

    recipient = (
        supabase.table("staff_members")
        .select("id, name, role, is_under_18")
        .eq("id", staff["id"])
        .limit(1)
        .execute()
        .data[0]
    )

    other_assignments = (
        supabase.table("rota_assignments")
        .select("day_index, shift_id")
        .eq("period_id", period["id"])
        .eq("staff_id", staff["id"])
        .neq("day_index", assignment["day_index"])
        .execute()
        .data
    )
    rules = _get_rules_for_solver(venue["id"])
    check = check_manual_assignment(recipient, assignment["day_index"], shift, other_assignments, shifts_by_id, rules)

    if check["severity"] == "block":
        raise HTTPException(status_code=400, detail=check["reason"])

    if check["severity"] == "ok":
        same_day = (
            supabase.table("rota_assignments")
            .select("id")
            .eq("period_id", period["id"])
            .eq("staff_id", staff["id"])
            .eq("day_index", assignment["day_index"])
            .execute()
            .data
        )
        if swap_guard.active_swaps_for_assignments([r["id"] for r in same_day]):
            raise HTTPException(
                status_code=400,
                detail="You have a swap pending on that day — resolve it before accepting this shift",
            )

        # Atomic accept — see claim_shift. Guard the write on the still-open
        # state so a race can't double-assign the given shift, and take it
        # before deleting the recipient's other same-day row.
        accepted = (
            supabase.table("rota_assignments")
            .update(
                {
                    "staff_id": staff["id"],
                    "drop_status": None,
                    "dropped_at": None,
                    "target_staff_id": None,
                    "claim_staff_id": None,
                    "claim_reason": None,
                    "manually_assigned": True,
                }
            )
            .eq("id", assignment["id"])
            .eq("drop_status", "pending_pickup")
            .execute()
        )
        if not accepted.data:
            raise HTTPException(status_code=409, detail="This shift is no longer available")

        supabase.table("rota_assignments").delete().eq("period_id", period["id"]).eq(
            "staff_id", staff["id"]
        ).eq("day_index", assignment["day_index"]).neq("id", assignment["id"]).execute()

        supabase.table("activity_log").insert(
            {
                "venue_id": venue["id"],
                "staff_id": staff["id"],
                "action": "shift_given_accepted",
                "detail": (
                    f"{staff['name']} accepted {original_name}'s {DAY_NAMES[assignment['day_index']]} shift — "
                    f"auto-approved."
                ),
            }
        ).execute()

        return ClaimSubmitResponse(status="approved", rota=_build_staff_rota(venue, staff["id"]))

    reason_text = check["reason"]
    accept_pending = (
        supabase.table("rota_assignments")
        .update(
            {
                "drop_status": "pending_approval",
                "target_staff_id": None,
                "claim_staff_id": staff["id"],
                "claim_reason": reason_text,
            }
        )
        .eq("id", assignment["id"])
        .eq("drop_status", "pending_pickup")
        .execute()
    )
    if not accept_pending.data:
        raise HTTPException(status_code=409, detail="This shift is no longer available")

    supabase.table("activity_log").insert(
        {
            "venue_id": venue["id"],
            "staff_id": staff["id"],
            "action": "shift_given_accept_pending",
            "detail": (
                f"{staff['name']} accepted {original_name}'s {DAY_NAMES[assignment['day_index']]} shift — "
                f"needs manager approval ({reason_text})."
            ),
        }
    ).execute()

    return ClaimSubmitResponse(status="pending", reason=reason_text, rota=_build_staff_rota(venue, staff["id"]))


@router.post("/{venue_token}/rota/give/decline", response_model=StaffRotaOut)
def decline_give(venue_token: str, payload: AvailabilityGiveActionRequest):
    """Recipient declines. Reverts cleanly to the giver — does NOT enter the
    open pool, unlike a manager's claim-reject."""
    venue = _get_venue_or_404(venue_token)
    staff = _get_staff_by_pin(venue["id"], payload.pin)
    supabase = get_supabase()

    period = _get_published_period(venue["id"])
    if not period:
        raise HTTPException(status_code=404, detail="No published rota found")

    assignment_res = (
        supabase.table("rota_assignments")
        .select("*")
        .eq("id", payload.assignment_id)
        .eq("period_id", period["id"])
        .eq("target_staff_id", staff["id"])
        .eq("drop_status", "pending_pickup")
        .limit(1)
        .execute()
    )
    if not assignment_res.data:
        raise HTTPException(status_code=404, detail="This isn't available to decline")
    assignment = assignment_res.data[0]

    original_res = (
        supabase.table("staff_members").select("id, name").eq("id", assignment["staff_id"]).limit(1).execute()
    )
    original_name = original_res.data[0]["name"] if original_res.data else "a teammate"

    supabase.table("rota_assignments").update(
        {"drop_status": None, "dropped_at": None, "target_staff_id": None}
    ).eq("id", assignment["id"]).execute()

    supabase.table("activity_log").insert(
        {
            "venue_id": venue["id"],
            "staff_id": staff["id"],
            "action": "shift_given_declined",
            "detail": (
                f"{staff['name']} declined {original_name}'s {DAY_NAMES[assignment['day_index']]} shift offer"
            ),
        }
    ).execute()

    return _build_staff_rota(venue, staff["id"])


def _own_open_assignment(period_id: str, staff_id: str, assignment_id: str) -> dict:
    """Fetches an assignment the caller owns outright — not already dropped,
    given, or tied up in another swap. Shared validation for both sides of a
    swap proposal. period_id is already venue-scoped (via _get_published_period)
    and staff_id is validated venue-scoped by the caller, so no separate
    venue check is needed here."""
    supabase = get_supabase()
    res = (
        supabase.table("rota_assignments")
        .select("*")
        .eq("id", assignment_id)
        .eq("period_id", period_id)
        .eq("staff_id", staff_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Shift not found")
    assignment = res.data[0]
    if not assignment.get("shift_id"):
        raise HTTPException(status_code=404, detail="Shift not found")
    if assignment.get("drop_status"):
        raise HTTPException(status_code=400, detail="That shift is already mid-drop/give — resolve it first")
    if swap_guard.active_swaps_for_assignments([assignment["id"]]):
        raise HTTPException(status_code=400, detail="That shift already has a swap pending")
    return assignment


@router.post("/{venue_token}/rota/swap/propose", response_model=StaffRotaOut)
def propose_swap(venue_token: str, payload: AvailabilitySwapProposeRequest):
    """Initiator offers one of their own shifts in exchange for one of a named
    colleague's shifts. Neither rota_assignments row is touched here — both
    stay with their current owners until the swap is fully accepted (or
    approved, if it needs a manager) — same no-gap guarantee as give/drop,
    just symmetric across two rows instead of one."""
    from datetime import date, timedelta

    venue = _get_venue_or_404(venue_token)
    staff = _get_staff_by_pin(venue["id"], payload.pin)
    supabase = get_supabase()

    period = _get_published_period(venue["id"])
    if not period:
        raise HTTPException(status_code=404, detail="No published rota found")

    if payload.target_staff_id == staff["id"]:
        raise HTTPException(status_code=400, detail="You can't swap a shift with yourself")

    target_res = (
        supabase.table("staff_members")
        .select("id, name, email")
        .eq("id", payload.target_staff_id)
        .eq("venue_id", venue["id"])
        .eq("is_active", True)
        # A shift can't be given/swapped to a member still awaiting approval.
        .eq("pending", False)
        .limit(1)
        .execute()
    )
    if not target_res.data:
        raise HTTPException(status_code=404, detail="Staff member not found")
    target = target_res.data[0]

    my_assignment = _own_open_assignment(period["id"], staff["id"], payload.assignment_id)
    their_assignment = _own_open_assignment(period["id"], target["id"], payload.target_assignment_id)

    week_start = date.fromisoformat(str(period["week_start"]))
    if week_start + timedelta(days=my_assignment["day_index"]) < date.today():
        raise HTTPException(status_code=400, detail="Can't swap a shift that's already passed")
    if week_start + timedelta(days=their_assignment["day_index"]) < date.today():
        raise HTTPException(status_code=400, detail="Can't request a shift that's already passed")

    shifts_by_id = {s["id"]: s for s in _get_shifts(venue["id"])}
    my_shift = shifts_by_id.get(my_assignment["shift_id"])
    their_shift = shifts_by_id.get(their_assignment["shift_id"])
    if not my_shift or not their_shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    supabase.table("shift_swaps").insert(
        {
            "venue_id": venue["id"],
            "period_id": period["id"],
            "initiator_staff_id": staff["id"],
            "initiator_assignment_id": my_assignment["id"],
            "recipient_staff_id": target["id"],
            "recipient_assignment_id": their_assignment["id"],
        }
    ).execute()

    supabase.table("activity_log").insert(
        {
            "venue_id": venue["id"],
            "staff_id": staff["id"],
            "action": "shift_swap_proposed",
            "detail": (
                f"{staff['name']} offered their {DAY_NAMES[my_assignment['day_index']]} {my_shift['name']} shift "
                f"to {target['name']} in exchange for their {DAY_NAMES[their_assignment['day_index']]} "
                f"{their_shift['name']} shift"
            ),
        }
    ).execute()

    email_service.send_shift_swap_email(
        to_email=target.get("email"),
        name=target["name"],
        initiator_name=staff["name"],
        venue_name=venue["name"],
        their_shift_label=f"{DAY_NAMES[my_assignment['day_index']]} {my_shift['name']}",
        my_shift_label=f"{DAY_NAMES[their_assignment['day_index']]} {their_shift['name']}",
        venue_link_url=f"{get_settings().frontend_url}/v/{venue['link_token']}",
    )

    return _build_staff_rota(venue, staff["id"])


def _get_active_swap_or_404(period_id: str, swap_id: str, *, statuses: tuple[str, ...]) -> dict:
    supabase = get_supabase()
    res = (
        supabase.table("shift_swaps")
        .select("*")
        .eq("id", swap_id)
        .eq("period_id", period_id)
        .in_("status", list(statuses))
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Swap not found")
    return res.data[0]


@router.post("/{venue_token}/rota/swap/accept", response_model=ClaimSubmitResponse)
def accept_swap(venue_token: str, payload: AvailabilitySwapActionRequest):
    """Recipient accepts a proposed swap. Validates BOTH resulting positions —
    initiator into the recipient's old shift, recipient into the initiator's
    old shift — via check_manual_assignment. The worse of the two outcomes
    governs the whole swap: any block hard-rejects it (never reaches
    pending), any confirm sends the whole thing to manager approval, and only
    if both sides are "ok" does it auto-approve and actually move anyone."""
    venue = _get_venue_or_404(venue_token)
    staff = _get_staff_by_pin(venue["id"], payload.pin)
    supabase = get_supabase()

    period = _get_published_period(venue["id"])
    if not period:
        raise HTTPException(status_code=404, detail="No published rota found")

    swap = _get_active_swap_or_404(period["id"], payload.swap_id, statuses=("pending_response",))
    if swap["recipient_staff_id"] != staff["id"]:
        raise HTTPException(status_code=404, detail="Swap not found")

    initiator_res = (
        supabase.table("staff_members")
        .select("id, name, is_under_18")
        .eq("id", swap["initiator_staff_id"])
        .limit(1)
        .execute()
    )
    if not initiator_res.data:
        raise HTTPException(status_code=404, detail="Initiator not found")
    initiator = initiator_res.data[0]

    recipient = (
        supabase.table("staff_members")
        .select("id, name, is_under_18")
        .eq("id", staff["id"])
        .limit(1)
        .execute()
        .data[0]
    )

    initiator_assignment_res = (
        supabase.table("rota_assignments").select("*").eq("id", swap["initiator_assignment_id"]).limit(1).execute()
    )
    recipient_assignment_res = (
        supabase.table("rota_assignments").select("*").eq("id", swap["recipient_assignment_id"]).limit(1).execute()
    )
    if not initiator_assignment_res.data or not recipient_assignment_res.data:
        raise HTTPException(status_code=404, detail="One of the shifts in this swap no longer exists")
    initiator_assignment = initiator_assignment_res.data[0]
    recipient_assignment = recipient_assignment_res.data[0]

    shifts_by_id = {s["id"]: s for s in _get_shifts(venue["id"])}
    initiator_shift = shifts_by_id.get(initiator_assignment["shift_id"])
    recipient_shift = shifts_by_id.get(recipient_assignment["shift_id"])
    if not initiator_shift or not recipient_shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    initiator_other = (
        supabase.table("rota_assignments")
        .select("day_index, shift_id")
        .eq("period_id", period["id"])
        .eq("staff_id", initiator["id"])
        .neq("day_index", initiator_assignment["day_index"])
        .execute()
        .data
    )
    recipient_other = (
        supabase.table("rota_assignments")
        .select("day_index, shift_id")
        .eq("period_id", period["id"])
        .eq("staff_id", recipient["id"])
        .neq("day_index", recipient_assignment["day_index"])
        .execute()
        .data
    )

    rules = _get_rules_for_solver(venue["id"])
    # Initiator moving into the recipient's old slot; recipient moving into
    # the initiator's old slot.
    check_a = check_manual_assignment(
        initiator, recipient_assignment["day_index"], recipient_shift, initiator_other, shifts_by_id, rules
    )
    check_b = check_manual_assignment(
        recipient, initiator_assignment["day_index"], initiator_shift, recipient_other, shifts_by_id, rules
    )

    block_reasons = [c["reason"] for c in (check_a, check_b) if c["severity"] == "block"]
    if block_reasons:
        raise HTTPException(status_code=400, detail="; ".join(block_reasons))

    confirm_reasons = [c["reason"] for c in (check_a, check_b) if c["severity"] == "confirm"]
    if confirm_reasons:
        reason_text = "; ".join(confirm_reasons)
        swap_pending = (
            supabase.table("shift_swaps")
            .update({"status": "pending_approval", "reason": reason_text})
            .eq("id", swap["id"])
            .eq("status", "pending_response")
            .execute()
        )
        if not swap_pending.data:
            raise HTTPException(status_code=409, detail="This swap was already handled")

        supabase.table("activity_log").insert(
            {
                "venue_id": venue["id"],
                "staff_id": staff["id"],
                "action": "shift_swap_accept_pending",
                "detail": (
                    f"{recipient['name']} accepted {initiator['name']}'s swap offer — needs manager approval "
                    f"({reason_text})."
                ),
            }
        ).execute()

        return ClaimSubmitResponse(status="pending", reason=reason_text, rota=_build_staff_rota(venue, staff["id"]))

    from datetime import datetime

    # Atomically claim the swap before moving anyone: guard the status flip on
    # 'pending_response' so two concurrent accepts can't both run execute_swap
    # (which would move the assignments twice). Zero rows = already handled.
    locked = (
        supabase.table("shift_swaps")
        .update({"status": "approved", "resolved_at": datetime.utcnow().isoformat()})
        .eq("id", swap["id"])
        .eq("status", "pending_response")
        .execute()
    )
    if not locked.data:
        raise HTTPException(status_code=409, detail="This swap was already handled")

    swap_guard.execute_swap(period["id"], initiator_assignment, recipient_assignment)

    supabase.table("activity_log").insert(
        {
            "venue_id": venue["id"],
            "staff_id": staff["id"],
            "action": "shift_swap_accepted",
            "detail": f"{recipient['name']} and {initiator['name']} swapped shifts — auto-approved.",
        }
    ).execute()

    return ClaimSubmitResponse(status="approved", rota=_build_staff_rota(venue, staff["id"]))


@router.post("/{venue_token}/rota/swap/decline", response_model=StaffRotaOut)
def decline_swap(venue_token: str, payload: AvailabilitySwapActionRequest):
    """Recipient declines. Reverts cleanly — neither rota_assignments row was
    ever touched, so there's nothing to revert there; just marks the swap
    proposal itself as declined."""
    venue = _get_venue_or_404(venue_token)
    staff = _get_staff_by_pin(venue["id"], payload.pin)
    supabase = get_supabase()

    period = _get_published_period(venue["id"])
    if not period:
        raise HTTPException(status_code=404, detail="No published rota found")

    swap = _get_active_swap_or_404(period["id"], payload.swap_id, statuses=("pending_response",))
    if swap["recipient_staff_id"] != staff["id"]:
        raise HTTPException(status_code=404, detail="Swap not found")

    initiator_res = (
        supabase.table("staff_members").select("id, name").eq("id", swap["initiator_staff_id"]).limit(1).execute()
    )
    initiator_name = initiator_res.data[0]["name"] if initiator_res.data else "a teammate"

    from datetime import datetime

    supabase.table("shift_swaps").update(
        {"status": "declined", "resolved_at": datetime.utcnow().isoformat()}
    ).eq("id", swap["id"]).execute()

    supabase.table("activity_log").insert(
        {
            "venue_id": venue["id"],
            "staff_id": staff["id"],
            "action": "shift_swap_declined",
            "detail": f"{staff['name']} declined {initiator_name}'s swap offer",
        }
    ).execute()

    return _build_staff_rota(venue, staff["id"])


@router.post("/{venue_token}/activity", response_model=list[ActivityOut])
def get_staff_activity(venue_token: str, payload: PinAuthRequest, limit: int = Query(default=20, le=50)):
    """Venue-wide notification feed for the hub bell — same shape and join
    pattern as the manager's GET /api/activity, just PIN-gated instead of a
    manager session, and filtered to STAFF_ACTIVITY_ACTIONS so rule-change/
    admin/PIN-reset noise doesn't show up for staff."""
    venue = _get_venue_or_404(venue_token)
    _get_staff_by_pin(venue["id"], payload.pin)
    supabase = get_supabase()

    rows = (
        supabase.table("activity_log")
        .select("*")
        .eq("venue_id", venue["id"])
        .in_("action", STAFF_ACTIVITY_ACTIONS)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
        .data
    )

    staff_ids = {r["staff_id"] for r in rows if r.get("staff_id")}
    names_by_id: dict[str, str] = {}
    if staff_ids:
        staff_res = (
            supabase.table("staff_members")
            .select("id, name")
            .in_("id", list(staff_ids))
            .execute()
        )
        names_by_id = {s["id"]: s["name"] for s in staff_res.data}

    for row in rows:
        row["staff_name"] = names_by_id.get(row["staff_id"]) if row.get("staff_id") else None

    return rows
