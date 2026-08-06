from typing import Literal, Optional

from pydantic import BaseModel, Field


class ShiftOut(BaseModel):
    id: str
    name: str
    start_time: str
    end_time: str
    color: str
    sort_order: int


class StaffOut(BaseModel):
    id: str
    name: str
    role: str


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


class ForgotPinRequest(BaseModel):
    email: str


class VenueOut(BaseModel):
    id: str
    name: str
    manager_email: str
    link_token: str
    created_at: str


class VenueCreateRequest(BaseModel):
    name: str = Field(min_length=1)


class VenueUpdateRequest(BaseModel):
    name: str = Field(min_length=1)


class ShiftCreateRequest(BaseModel):
    name: str = Field(min_length=1)
    start_time: str
    end_time: str
    color: str
    sort_order: int = 0


class StaffCreateRequest(BaseModel):
    name: str = Field(min_length=1)
    email: Optional[str] = None
    phone: Optional[str] = None
    role: str = Field(min_length=1)


class StaffManagerOut(BaseModel):
    id: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    role: str
    pin: str
    is_active: bool
    submitted: Optional[bool] = None


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


class SchedulingRulesUpdateRequest(BaseModel):
    max_hours_per_week: Optional[int] = Field(default=None, ge=1)
    min_rest_hours: Optional[int] = Field(default=None, ge=0)
    avail_opens_day: Optional[str] = None
    avail_closes_day: Optional[str] = None
    avail_closes_time: Optional[str] = None
    review_email_day: Optional[str] = None
    review_email_time: Optional[str] = None


class AssignmentOut(BaseModel):
    id: str
    staff_id: str
    day_index: int
    shift_id: Optional[str] = None
    manually_assigned: bool


class UncoveredSlot(BaseModel):
    day_index: int
    shift_id: str


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
    conflicts: int
    uncovered: list[UncoveredSlot]
    warnings: list[str] = []
    # Present only on the publish response — how the staff notification emails
    # actually landed. None for read/generate/edit responses.
    email: Optional[EmailDeliveryOut] = None


class AssignmentEditRequest(BaseModel):
    staff_id: str
    day_index: int = Field(ge=0, le=6)
    shift_id: str
    action: Literal["add", "remove"]


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
    staff: list[AdminStaffOut]
    period: Optional[PeriodOut] = None


class StaffRotaAssignmentOut(BaseModel):
    id: str
    staff_id: str
    day_index: int
    shift_id: Optional[str] = None


class StaffRotaTeamMemberOut(BaseModel):
    id: str
    name: str
    role: str


class StaffRotaOut(BaseModel):
    venue_name: str
    staff_id: str
    period: Optional[PeriodOut] = None
    shifts: list[ShiftOut] = []
    assignments: list[StaffRotaAssignmentOut] = []
    team: list[StaffRotaTeamMemberOut] = []


class AdminActivityOut(BaseModel):
    id: str
    venue_id: str
    venue_name: str
    staff_id: Optional[str] = None
    staff_name: Optional[str] = None
    action: str
    detail: Optional[str] = None
    created_at: str
