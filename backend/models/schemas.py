from typing import Literal, Optional

from pydantic import BaseModel, Field


class ShiftOut(BaseModel):
    id: str
    name: str
    start_time: str
    end_time: str
    color: str
    sort_order: int
    min_staff: int = 1
    max_staff: int = 2


class StaffOut(BaseModel):
    id: str
    name: str
    role: str
    auto_submit_availability: bool = False
    # A self-registered member awaiting manager approval. They can PIN-auth and
    # submit availability immediately, but the solver ignores them until confirmed.
    pending: bool = False


class PeriodOut(BaseModel):
    id: str
    week_start: str
    status: str


class PeriodCreateRequest(BaseModel):
    week_start: str


class RulesOut(BaseModel):
    avail_closes_day: str
    avail_closes_time: str


class SchedulingRulesOut(BaseModel):
    max_hours_per_week: int
    min_rest_hours: int
    # Real datetimes for the availability window (naive Europe/London wall-clock,
    # "YYYY-MM-DDTHH:MM[:SS]"). These drive the scheduler and the emails.
    avail_opens_at: Optional[str] = None
    avail_reminder_at: Optional[str] = None
    avail_closes_at: Optional[str] = None
    # Legacy day-of-week fields, kept for backward compatibility.
    avail_opens_day: str
    avail_closes_day: str
    avail_closes_time: str
    review_email_day: str
    review_email_time: str


class AvailabilityEntryOut(BaseModel):
    day_index: int
    shift_id: Optional[str] = None
    status: int
    note: Optional[str] = None


class VenueInfoResponse(BaseModel):
    venue_name: str
    shifts: list[ShiftOut]


class PinAuthRequest(BaseModel):
    pin: str = Field(pattern=r"^\d{4}$")


class AvailabilityAuthResponse(BaseModel):
    staff: StaffOut
    venue_name: str
    period: Optional[PeriodOut] = None
    shifts: list[ShiftOut]
    submissions: list[AvailabilityEntryOut]
    rules: RulesOut
    # True when the current week's submission was auto-copied by the cron (§6b).
    auto_submitted: bool = False


class AvailabilityEntryIn(BaseModel):
    day_index: int = Field(ge=0, le=6)
    shift_id: Optional[str] = None
    status: int = Field(ge=0, le=3)
    note: Optional[str] = None


class AvailabilitySubmitRequest(BaseModel):
    pin: str = Field(pattern=r"^\d{4}$")
    submissions: list[AvailabilityEntryIn]
    # Optional target week (Monday, YYYY-MM-DD). Defaults to the current open
    # week when omitted, so existing clients keep working.
    week_start: Optional[str] = None


class WeekAvailabilityRequest(BaseModel):
    pin: str = Field(pattern=r"^\d{4}$")
    week_start: str


class WeekAvailabilityOut(BaseModel):
    week_start: str
    period: Optional[PeriodOut] = None
    editable: bool
    submissions: list[AvailabilityEntryOut] = []
    # True when `submissions` wasn't actually saved for this week yet, but is
    # the staff member's most recent prior pattern shown as a starting point.
    prefilled: bool = False
    # True when the saved submission was auto-copied by the cron (§6b) and not
    # yet re-affirmed — drives the "we auto-submitted for you" banner.
    auto_submitted: bool = False


class AutoSubmitToggleRequest(BaseModel):
    pin: str = Field(pattern=r"^\d{4}$")
    enabled: bool


class AutoSubmitOut(BaseModel):
    auto_submit_availability: bool


class ForgotPinRequest(BaseModel):
    email: str


class AvailabilityDropRequest(BaseModel):
    pin: str = Field(pattern=r"^\d{4}$")
    assignment_id: str


class AvailabilityClaimRequest(BaseModel):
    pin: str = Field(pattern=r"^\d{4}$")
    assignment_id: str


class AvailabilityGiveRequest(BaseModel):
    pin: str = Field(pattern=r"^\d{4}$")
    assignment_id: str
    target_staff_id: str


class AvailabilityGiveActionRequest(BaseModel):
    pin: str = Field(pattern=r"^\d{4}$")
    assignment_id: str


class AvailabilitySwapProposeRequest(BaseModel):
    pin: str = Field(pattern=r"^\d{4}$")
    assignment_id: str
    target_staff_id: str
    target_assignment_id: str


class AvailabilitySwapActionRequest(BaseModel):
    pin: str = Field(pattern=r"^\d{4}$")
    swap_id: str


class VenueOut(BaseModel):
    id: str
    name: str
    manager_email: str
    link_token: str
    created_at: str
    is_active: bool = True
    # The rotatable join code that gates self-registration. None = joining is
    # disabled for this venue (a forwarded link can't register anyone).
    join_pin: Optional[str] = None
    # Onboarding save-and-resume (§1). {"step": N} while in-flight,
    # {"completed": true} when done, None on a legacy/already-onboarded venue.
    setup_state: Optional[dict] = None
    # True for venues the per-day migration backfilled from a free-text 'close'
    # (a safe '11:00pm' placeholder). Prompts the manager to enter the real
    # close times via the per-day editor; cleared the moment they save a
    # per-day schedule (PUT /shifts/{id}/days).
    needs_shift_recapture: bool = False


class OnboardingActivateRequest(BaseModel):
    token: str = Field(min_length=1)


class OnboardingSessionOut(BaseModel):
    access_token: str
    refresh_token: str
    email: str


class SetupStateRequest(BaseModel):
    setup_state: Optional[dict] = None


class VenueCreateRequest(BaseModel):
    name: str = Field(min_length=1)


class JoinCodeOut(BaseModel):
    join_pin: Optional[str] = None


class StaffJoinRequest(BaseModel):
    # Gates registration on the venue's shared link. Same 4-digit shape as a
    # staff PIN so the entry UI is identical.
    join_pin: str = Field(pattern=r"^\d{4}$")
    name: str = Field(min_length=1, max_length=80)


class StaffJoinResponse(BaseModel):
    staff_id: str
    name: str
    pin: str
    venue_name: str


class StaffApproveRequest(BaseModel):
    # Manager confirms role + U18 (defaults pre-filled from the join) and
    # activates the member.
    role: str = Field(min_length=1)
    is_under_18: bool = False
    role_ids: list[str] = []


class VenueUpdateRequest(BaseModel):
    name: str = Field(min_length=1)


class VenueLeaveSettingsRequest(BaseModel):
    leave_year_start_month: Optional[int] = Field(default=None, ge=1, le=12)
    full_time_leave_days: Optional[float] = Field(default=None, ge=0, le=366)


class VenueLeaveSettingsOut(BaseModel):
    leave_year_start_month: int = 1
    full_time_leave_days: float = 28


class ShiftCreateRequest(BaseModel):
    name: str = Field(min_length=1)
    start_time: str
    end_time: str
    color: str
    sort_order: int = 0
    min_staff: int = Field(default=1, ge=0)
    max_staff: int = Field(default=2, ge=1)


class StaffCreateRequest(BaseModel):
    name: str = Field(min_length=1)
    email: Optional[str] = None
    phone: Optional[str] = None
    role: str = Field(min_length=1)
    is_under_18: bool = False
    # Additional roles this person can work, beyond their primary `role`. The
    # primary role is always folded in server-side, so eligibility ⊇ primary.
    role_ids: list[str] = []


class StaffManagerOut(BaseModel):
    id: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    role: str
    pin: str
    is_active: bool
    is_under_18: bool = False
    # Self-registered, awaiting manager approval (§3). Orthogonal to is_active.
    pending: bool = False
    submitted: Optional[bool] = None
    working_days_per_week: float = 5
    # None means "prorate the venue's full-time figure by working_days_per_week".
    annual_leave_days: Optional[float] = None
    # Every role this person is eligible to work (the staff_roles M2M). The
    # single `role` above is still their primary/display role; this is the
    # superset used by the "who can work this role" and multi-role controls.
    role_ids: list[str] = []


class RoleOut(BaseModel):
    id: str
    name: str
    icon: str
    sort_order: int = 0
    # Staff eligible to work this role (staff_roles membership).
    staff_ids: list[str] = []


class RoleCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    icon: str = "users"
    staff_ids: list[str] = []


class RoleUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=40)
    icon: Optional[str] = None
    # None = leave membership unchanged; [] = clear all members.
    staff_ids: Optional[list[str]] = None


class ActivityOut(BaseModel):
    id: str
    staff_id: Optional[str] = None
    staff_name: Optional[str] = None
    action: str
    detail: Optional[str] = None
    created_at: str


class StaffUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1)
    email: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = Field(default=None, min_length=1)
    is_active: Optional[bool] = None
    is_under_18: Optional[bool] = None
    working_days_per_week: Optional[float] = Field(default=None, gt=0, le=7)
    # Explicitly nullable: clearing it returns this person to the pro-rata
    # calculation rather than pinning whatever number was there before.
    annual_leave_days: Optional[float] = Field(default=None, ge=0, le=366)
    # None = leave eligible-role membership unchanged. A list replaces it (the
    # primary role is always folded back in server-side).
    role_ids: Optional[list[str]] = None


class RemindRequest(BaseModel):
    period_id: Optional[str] = None
    staff_id: Optional[str] = None


class RemindResponse(BaseModel):
    reminded: int
    email_sent: bool


class ShiftUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1)
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None
    min_staff: Optional[int] = Field(default=None, ge=0)
    max_staff: Optional[int] = Field(default=None, ge=1)


class ShiftDayIn(BaseModel):
    """One OPEN day of a shift's per-day schedule. Days not listed in a
    ShiftScheduleUpdateRequest are closed (no shift_days row)."""
    day_index: int = Field(ge=0, le=6)
    start_time: str
    end_time: str
    min_staff: int = Field(default=1, ge=0)
    max_staff: int = Field(default=2, ge=1)


class ShiftScheduleUpdateRequest(BaseModel):
    # Only the OPEN days. Any day_index 0-6 absent from this list is a closed
    # day for the shift. Must contain at least one day — a shift closed every
    # day would never be schedulable.
    days: list[ShiftDayIn]


class ShiftDayOut(BaseModel):
    day_index: int
    open: bool
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    min_staff: int = 1
    max_staff: int = 2


class ShiftScheduleOut(BaseModel):
    shift_id: str
    # Always 7 entries, day_index 0 (Monday) .. 6 (Sunday), in order.
    days: list[ShiftDayOut]


class SchedulingRulesUpdateRequest(BaseModel):
    max_hours_per_week: Optional[int] = Field(default=None, ge=1)
    min_rest_hours: Optional[int] = Field(default=None, ge=0)
    # Availability window datetimes (naive Europe/London wall-clock strings).
    avail_opens_at: Optional[str] = None
    avail_reminder_at: Optional[str] = None
    avail_closes_at: Optional[str] = None
    avail_opens_day: Optional[str] = None
    avail_closes_day: Optional[str] = None
    avail_closes_time: Optional[str] = None
    review_email_day: Optional[str] = None
    review_email_time: Optional[str] = None


class SchedulerWeekOut(BaseModel):
    """One upcoming rota week with its computed notice window, for the Scheduler
    preview and the week-override dropdown."""

    week_start: str
    week_label: str
    opens_at: str
    reminder_at: str
    closes_at: str
    earliest_shift_at: str
    notice_hours: float
    is_override: bool


class SchedulerConfigOut(BaseModel):
    # Relative offsets (hours) that define the window each week.
    open_offset_hours: int
    reminder_offset_hours: int
    notice_buffer_hours: int
    # The fixed legal minimum (72h), for display.
    legal_notice_hours: int
    earliest_shift_label: Optional[str] = None
    has_shifts: bool
    weeks: list[SchedulerWeekOut] = []
    # 1-day-off-in-7 solver constraint. Default on; disabling it risks a UK
    # Working Time Regulations breach, so the frontend gates it on the
    # "needs_confirm" status below (same risk-popup pattern as the notice
    # override).
    require_day_off: bool = True
    status: Literal["saved", "needs_confirm"] = "saved"


class SchedulerConfigUpdateRequest(BaseModel):
    open_offset_hours: Optional[int] = Field(default=None, ge=0)
    reminder_offset_hours: Optional[int] = Field(default=None, ge=0)
    notice_buffer_hours: Optional[int] = Field(default=None, ge=0)
    require_day_off: Optional[bool] = None
    # Managers must explicitly confirm when switching require_day_off off;
    # the first attempt returns needs_confirm instead of saving.
    confirm: bool = False


class SchedulerOverrideRequest(BaseModel):
    week_start: str
    close_at: str
    # Managers must explicitly confirm when a close time leaves under the legal
    # minimum notice; the first attempt returns needs_confirm instead of saving.
    confirm: bool = False


class SchedulerOverrideResponse(BaseModel):
    status: Literal["saved", "needs_confirm"]
    notice_hours: Optional[float] = None
    legal_notice_hours: int = 72
    config: Optional[SchedulerConfigOut] = None


class AssignmentOut(BaseModel):
    id: str
    staff_id: Optional[str] = None
    day_index: int
    shift_id: Optional[str] = None
    manually_assigned: bool
    required_role: Optional[str] = None
    # The shift's real hours for THIS assignment's day, resolved through
    # shift_days. Present so a per-day (e.g. later weekend close) shift shows the
    # correct time here rather than the shift-level representative. Falls back to
    # the shift-level time when there's no per-day row.
    start_time: Optional[str] = None
    end_time: Optional[str] = None


class OpenShiftCreateRequest(BaseModel):
    day_index: int = Field(ge=0, le=6)
    shift_id: str
    required_role: Optional[str] = None


class UncoveredSlot(BaseModel):
    day_index: int
    shift_id: str


class UnderCoveredSlot(BaseModel):
    """A demanded shift slot that has some cover but fewer people than the
    manager's min_staff for that shift. Distinct from UncoveredSlot, which is a
    slot with willing staff but nobody assigned at all."""

    day_index: int
    shift_id: str
    assigned: int
    required: int


class EmailDeliveryOut(BaseModel):
    """Per-recipient outcome of a batch email send (e.g. publishing a rota),
    so the frontend can surface partial failures instead of them being silently
    swallowed."""

    sent: int = 0
    failed: int = 0
    skipped_no_email: int = 0
    errors: list[str] = []


class RotaSummaryOut(BaseModel):
    period_id: str
    status: str
    assignments: list[AssignmentOut]
    total_hours: float
    # Total conflict count: uncovered slots + under-covered slots.
    conflicts: int
    # Demanded slots with willing staff but nobody assigned at all.
    uncovered: list[UncoveredSlot]
    # Demanded slots below the shift's min_staff (but not empty).
    under_covered: list[UnderCoveredSlot] = []
    # Approved leave overlapping this period's week: {staff_id: [day_index, ...]},
    # so the grid can show "On leave" instead of a blank/"+ Add" cell.
    leave: dict[str, list[int]] = {}
    warnings: list[str] = []
    # Non-blocking notes — e.g. an under-18's hours trimmed by the 40h weekly
    # cap or the 2-consecutive-days-off rule. Distinct from warnings: these
    # aren't a slot that couldn't be used at all, just context for why
    # someone's scheduled less than they're available for.
    info: list[str] = []
    # Present only on the publish response — how the staff notification emails
    # actually landed. None for read/generate/edit responses.
    email: Optional[EmailDeliveryOut] = None


class AssignmentEditRequest(BaseModel):
    staff_id: str
    day_index: int = Field(ge=0, le=6)
    shift_id: str
    action: Literal["add", "remove"]
    # Managers must explicitly confirm an "add" that trips an adult rule
    # (rest gap, day-off-in-7); the first attempt returns needs_confirm
    # instead of saving. Under-18 violations have no confirm path — they're
    # always rejected outright, regardless of this flag.
    confirm: bool = False


class AssignmentEditResponse(BaseModel):
    status: Literal["saved", "needs_confirm"]
    reason: Optional[str] = None
    summary: Optional[RotaSummaryOut] = None


class SubmissionEntryOut(BaseModel):
    staff_id: str
    staff_name: str
    day_index: int
    shift_id: Optional[str] = None
    status: int
    note: Optional[str] = None


class PeriodSubmissionsOut(BaseModel):
    period_id: str
    submissions: list[SubmissionEntryOut] = []


class RotaEmailRequest(BaseModel):
    target: Literal["staff", "manager"]
    orientation: Literal["staff-rows", "day-rows"] = "staff-rows"


class AdminVenueOut(BaseModel):
    id: str
    name: str
    manager_email: str
    created_at: str
    staff_count: int
    period_status: Optional[str] = None
    pending: bool = False
    is_active: bool = True
    # Most recent activity_log timestamp for the venue (for spotting stale
    # venues). None if the venue has no activity yet.
    last_active_at: Optional[str] = None


class AdminVenueUpdateRequest(BaseModel):
    is_active: Optional[bool] = None
    admin_notes: Optional[str] = None


class WaitlistRequest(BaseModel):
    venue_name: str = Field(min_length=1)
    email: str = Field(min_length=3)


class WaitlistEntryOut(BaseModel):
    id: str
    venue_name: str
    email: str
    status: str
    created_at: str


class AdminCreateManagerRequest(BaseModel):
    email: str = Field(min_length=3)


class AdminManagerOut(BaseModel):
    email: str
    status: str
    login_url: str


class AdminStaffOut(BaseModel):
    id: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    role: str
    pin: str
    is_active: bool
    submitted: Optional[bool] = None


class AdminVenueDetailOut(BaseModel):
    id: str
    name: str
    manager_email: str
    created_at: str
    link_token: str
    is_active: bool = True
    admin_notes: Optional[str] = None
    staff: list[AdminStaffOut]
    period: Optional[PeriodOut] = None


class StaffRotaAssignmentOut(BaseModel):
    id: str
    staff_id: Optional[str] = None
    day_index: int
    shift_id: Optional[str] = None
    drop_status: Optional[str] = None
    claim_staff_id: Optional[str] = None
    target_staff_id: Optional[str] = None
    required_role: Optional[str] = None
    # The shift's real hours for THIS assignment's day (per-day, via shift_days),
    # so a staffer sees the actual time of the shift they're on, not the
    # shift-level representative. Falls back to shift-level when no per-day row.
    start_time: Optional[str] = None
    end_time: Optional[str] = None


class StaffRotaTeamMemberOut(BaseModel):
    id: str
    name: str
    role: str


class SwapSideOut(BaseModel):
    assignment_id: str
    day_index: int
    shift_id: str


class SwapForStaffOut(BaseModel):
    """A swap proposal from the caller's point of view — either side of it,
    while it's still non-terminal (pending_response/pending_approval).
    Resolved swaps (approved/declined/rejected) don't appear here; their
    effect is already reflected in `assignments`, or simply gone."""

    id: str
    role: Literal["initiator", "recipient"]
    status: Literal["pending_response", "pending_approval"]
    counterpart_id: str
    counterpart_name: str
    my_shift: SwapSideOut
    their_shift: SwapSideOut


class StaffRotaOut(BaseModel):
    venue_name: str
    staff_id: str
    period: Optional[PeriodOut] = None
    shifts: list[ShiftOut] = []
    assignments: list[StaffRotaAssignmentOut] = []
    team: list[StaffRotaTeamMemberOut] = []
    # Full active roster (excluding the caller), for the "give to" picker —
    # distinct from `team`, which is only staff with an assignment this period.
    venue_staff: list[StaffRotaTeamMemberOut] = []
    # Swap proposals the caller is party to (either side), still unresolved.
    pending_swaps: list[SwapForStaffOut] = []


class ClaimSubmitResponse(BaseModel):
    status: Literal["approved", "pending"]
    reason: Optional[str] = None
    rota: Optional[StaffRotaOut] = None


class ClaimOut(BaseModel):
    assignment_id: str
    day_index: int
    shift_id: str
    original_staff_id: str
    original_staff_name: str
    claimant_staff_id: str
    claimant_staff_name: str
    reason: Optional[str] = None


class PeriodClaimsOut(BaseModel):
    period_id: str
    claims: list[ClaimOut] = []


class ClaimApproveRequest(BaseModel):
    # Managers must explicitly confirm approving a claim that trips an adult
    # rule at approval time (state may have drifted since the claim was
    # made); the first attempt returns needs_confirm instead of approving.
    confirm: bool = False


class ClaimActionOut(BaseModel):
    status: Literal["approved", "needs_confirm", "rejected"]
    reason: Optional[str] = None
    summary: Optional[RotaSummaryOut] = None
    claims: list[ClaimOut] = []


class SwapOut(BaseModel):
    id: str
    initiator_staff_id: str
    initiator_staff_name: str
    initiator_day_index: int
    initiator_shift_id: str
    recipient_staff_id: str
    recipient_staff_name: str
    recipient_day_index: int
    recipient_shift_id: str
    reason: Optional[str] = None


class PeriodSwapsOut(BaseModel):
    period_id: str
    swaps: list[SwapOut] = []


class SwapApproveRequest(BaseModel):
    # Managers must explicitly confirm approving a swap that trips an adult
    # rule on either side at approval time (state may have drifted since the
    # swap was proposed); the first attempt returns needs_confirm instead of
    # approving. Under-18 violations on either side have no confirm path.
    confirm: bool = False


class SwapActionOut(BaseModel):
    status: Literal["approved", "needs_confirm", "rejected"]
    reason: Optional[str] = None
    summary: Optional[RotaSummaryOut] = None
    swaps: list[SwapOut] = []


class AdminStatsOut(BaseModel):
    """At-a-glance operational stats across all venues, for the admin home."""

    total_venues: int
    active_venues: int
    inactive_venues: int
    stale_venues: int
    total_staff: int
    open_periods: int
    published_rotas: int


class AdminVenueRotaOut(BaseModel):
    """Read-only snapshot of a venue's current rota, for the admin console."""

    venue_name: str
    period: Optional[PeriodOut] = None
    shifts: list[ShiftOut] = []
    staff: list[StaffRotaTeamMemberOut] = []
    summary: Optional[RotaSummaryOut] = None


class AdminActivityOut(BaseModel):
    id: str
    venue_id: str
    venue_name: str
    staff_id: Optional[str] = None
    staff_name: Optional[str] = None
    action: str
    detail: Optional[str] = None
    created_at: str


class LeaveRequestCreateRequest(BaseModel):
    pin: str = Field(pattern=r"^\d{4}$")
    start_date: str
    end_date: str
    reason: Optional[str] = None


class LeaveRequestPinRequest(BaseModel):
    pin: str = Field(pattern=r"^\d{4}$")


class LeaveRequestCancelRequest(BaseModel):
    pin: str = Field(pattern=r"^\d{4}$")
    request_id: str


class LeaveDecisionRequest(BaseModel):
    manager_note: Optional[str] = None


class LeaveRequestOut(BaseModel):
    id: str
    staff_id: str
    staff_name: str
    start_date: str
    end_date: str
    status: Literal["pending", "approved", "rejected", "cancelled"]
    reason: Optional[str] = None
    manager_note: Optional[str] = None
    created_at: str
    decided_at: Optional[str] = None
    # Manager view only: how many of this staff member's existing rota
    # assignments fall inside the requested range — 0 on the staff-facing view.
    conflicting_assignments: int = 0
    # What this range costs the requester, in working days. Computed server-side
    # so the staff screen and the manager's queue can never disagree.
    days: float = 0


class LeaveAllowanceOut(BaseModel):
    entitlement_days: float
    booked_days: float
    pending_days: float
    remaining_days: float
    working_days_per_week: float
    leave_year_start: str
    leave_year_end: str


class LeaveRequestsOut(BaseModel):
    requests: list[LeaveRequestOut] = []
    # Staff-facing only: null on the manager's cross-venue queue, which spans
    # several people and so has no single allowance to report.
    allowance: Optional[LeaveAllowanceOut] = None
