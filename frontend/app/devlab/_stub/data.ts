// Device Lab canned dataset.
//
// One coherent fake venue ("The Anchor Demo", token "demo") that drives every
// staff and manager screen into a rich state with no backend and no auth. The
// `_stub` folder is underscore-prefixed so Next never routes it, but it's still
// importable as a plain module.
//
// The shapes here mirror lib/api.ts exactly. Keep them in step if the API types
// change — this is dev-only tooling, so a drift shows up as a preview that
// renders wrong, never as anything a real user sees.

import type {
  Activity,
  LeaveRequest,
  Period,
  PinAuthData,
  Role,
  RotaSummary,
  SchedulerConfig,
  SchedulingRules,
  Shift,
  ShiftSchedule,
  ShiftWithDays,
  StaffManager,
  StaffRota,
  VenueLeaveSettings,
  Venue,
  WeekAvailability,
  WeekShift,
} from "@/lib/api";
import { mondayISO } from "@/lib/utils";

export const TOKEN = "demo";
export const PIN = "1988";

// The current collecting/planning week. Computed so the previews always read as
// "this week" whenever the harness is opened.
const WEEK = mondayISO(0);
const NEXT_WEEK = mondayISO(1);

// day_index: 0 = Mon … 6 = Sun. Monday is the venue's closed day.
const CLOSED_DAY = 0;
const LATE_DAYS = [4, 5]; // Fri, Sat close at 1am

// ---- Shifts ---------------------------------------------------------------

export const SHIFTS: Shift[] = [
  { id: "day", name: "Day", start_time: "11:00am", end_time: "5:00pm", color: "#2f9e6b", sort_order: 0, min_staff: 1, max_staff: 2 },
  { id: "eve", name: "Evening", start_time: "5:00pm", end_time: "11:00pm", color: "#7c5cff", sort_order: 1, min_staff: 2, max_staff: 3 },
];

// Real per-day hours: Monday closed, Fri/Sat evening runs past midnight.
function scheduleFor(shift: Shift) {
  return Array.from({ length: 7 }, (_, d) => {
    const open = d !== CLOSED_DAY;
    let end = shift.end_time;
    if (shift.id === "eve" && LATE_DAYS.includes(d)) end = "1:00am";
    return {
      day_index: d,
      open,
      start_time: open ? shift.start_time : null,
      end_time: open ? end : null,
      min_staff: shift.min_staff,
      max_staff: shift.max_staff,
    };
  });
}

export const SHIFT_SCHEDULES: Record<string, ShiftSchedule> = {
  day: { shift_id: "day", days: scheduleFor(SHIFTS[0]) },
  eve: { shift_id: "eve", days: scheduleFor(SHIFTS[1]) },
};

export const SHIFTS_WITH_DAYS: ShiftWithDays[] = SHIFTS.map((s) => ({
  ...s,
  days: SHIFT_SCHEDULES[s.id].days,
}));

// Resolve the real start/end for a (shift, day) off the per-day schedule.
function timesFor(shiftId: string, day: number): { start_time: string; end_time: string } {
  const d = SHIFT_SCHEDULES[shiftId].days[day];
  return { start_time: d.start_time ?? "", end_time: d.end_time ?? "" };
}

// ---- Roles ----------------------------------------------------------------

export const ROLES: Role[] = [
  { id: "r-bar", name: "Bar", icon: "glass", sort_order: 0, staff_ids: ["s1", "s4"] },
  { id: "r-floor", name: "Floor", icon: "users", sort_order: 1, staff_ids: ["s2", "s5"] },
  { id: "r-kitchen", name: "Kitchen", icon: "chef", sort_order: 2, staff_ids: ["s3"] },
];

// ---- Staff ----------------------------------------------------------------

export const STAFF: StaffManager[] = [
  { id: "s1", name: "Maya Chen", email: "maya@demo.test", phone: null, role: "Bar", pin: PIN, is_active: true, is_under_18: false, works_past_10pm: false, pending: false, submitted: true, working_days_per_week: 4, annual_leave_days: null, role_ids: ["r-bar"] },
  { id: "s2", name: "Tom Reilly", email: "tom@demo.test", phone: null, role: "Floor", pin: "4471", is_active: true, is_under_18: false, works_past_10pm: false, pending: false, submitted: true, working_days_per_week: 5, annual_leave_days: null, role_ids: ["r-floor"] },
  { id: "s3", name: "Priya Nair", email: "priya@demo.test", phone: null, role: "Kitchen", pin: "5502", is_active: true, is_under_18: false, works_past_10pm: false, pending: false, submitted: true, working_days_per_week: 3, annual_leave_days: null, role_ids: ["r-kitchen"] },
  { id: "s4", name: "Amara Okafor", email: "amara@demo.test", phone: null, role: "Bar", pin: "8810", is_active: true, is_under_18: true, works_past_10pm: false, pending: false, submitted: true, working_days_per_week: 3, annual_leave_days: null, role_ids: ["r-bar"] },
  { id: "s5", name: "Jordan Blake", email: "jordan@demo.test", phone: null, role: "Floor", pin: "6093", is_active: true, is_under_18: false, works_past_10pm: false, pending: false, submitted: false, working_days_per_week: 4, annual_leave_days: null, role_ids: ["r-floor"] },
  { id: "s6", name: "Sam Doyle", email: "sam@demo.test", phone: null, role: "Floor", pin: "2213", is_active: true, is_under_18: false, works_past_10pm: false, pending: true, submitted: false, working_days_per_week: 5, annual_leave_days: null, role_ids: [] },
];

const TEAM = STAFF.filter((s) => !s.pending).map((s) => ({ id: s.id, name: s.name, role: s.role }));

// ---- Periods --------------------------------------------------------------

export const PERIODS: Period[] = [
  { id: "p1", week_start: WEEK, status: "generated" },
  { id: "p0", week_start: mondayISO(-1), status: "confirmed" },
  { id: "p2", week_start: NEXT_WEEK, status: "collecting" },
];

// ---- Assignments (drive the draft rota grid) ------------------------------

type Assign = {
  id: string;
  staff_id: string | null;
  day_index: number;
  shift_id: string;
  manually_assigned: boolean;
  required_role: string | null;
  start_time: string;
  end_time: string;
  drop_status: null;
  claim_staff_id: null;
  target_staff_id: null;
};

let aid = 0;
function A(staff_id: string | null, day: number, shift: string, required_role: string | null = null): Assign {
  return {
    id: `a${++aid}`,
    staff_id,
    day_index: day,
    shift_id: shift,
    manually_assigned: false,
    required_role,
    ...timesFor(shift, day),
    drop_status: null,
    claim_staff_id: null,
    target_staff_id: null,
  };
}

export const ASSIGNMENTS: Assign[] = [
  // Tue
  A("s1", 1, "day"), A("s2", 1, "eve"), A("s4", 1, "eve"),
  // Wed (Priya on leave)
  A("s2", 2, "day"), A("s1", 2, "eve"), A("s5", 2, "eve"),
  // Thu (Priya on leave)
  A("s1", 3, "day"), A("s2", 3, "eve"), A("s5", 3, "eve"),
  // Fri — evening under-covered (needs 2, has 1)
  A("s2", 4, "day"), A("s1", 4, "eve"),
  // Sat — evening under-covered (needs 2, has 1)
  A("s1", 5, "day"), A("s2", 5, "eve"),
  // Sun — day covered, evening uncovered (open post)
  A("s2", 6, "day"),
  A(null, 6, "eve", "Bar"),
];

export const ROTA_SUMMARY: RotaSummary = {
  period_id: "p1",
  status: "generated",
  assignments: ASSIGNMENTS,
  total_hours: 108,
  conflicts: 0,
  uncovered: [{ day_index: 6, shift_id: "eve" }],
  under_covered: [
    { day_index: 4, shift_id: "eve", assigned: 1, required: 2 },
    { day_index: 5, shift_id: "eve", assigned: 1, required: 2 },
  ],
  open_drops: [
    { assignment_id: "a15", day_index: 6, shift_id: "eve", dropped_by_name: null, required_role: "Bar" },
  ],
  leave: { s3: [2, 3] },
  warnings: ["Amara Okafor (under 18) can't be scheduled on the Friday evening — it runs past 10pm."],
  info: ["Jordan Blake hasn't sent availability yet."],
};

// ---- Venue ----------------------------------------------------------------

export const VENUE: Venue = {
  id: "v-demo",
  name: "The Anchor Demo",
  manager_email: "manager@demo.test",
  link_token: TOKEN,
  slug: TOKEN,
  created_at: "2026-01-01T00:00:00",
  is_active: true,
  join_pin: "3097",
  setup_state: { completed: true },
  current_week_start: WEEK,
  current_week_deadline: "Fri, 5am",
  needs_shift_recapture: false,
  subscription_status: "active",
  subscription_started_at: "2026-01-01T00:00:00",
  subscription_ends_at: null,
};

export const RULES: SchedulingRules = {
  max_hours_per_week: 40,
  min_rest_hours: 11,
  avail_opens_at: null,
  avail_reminder_at: null,
  avail_closes_at: null,
  avail_opens_day: "Monday",
  avail_closes_day: "Friday",
  avail_closes_time: "5:00am",
  review_email_day: "Sunday",
  review_email_time: "6:00pm",
};

export const SCHEDULER: SchedulerConfig = {
  open_offset_hours: 168,
  reminder_offset_hours: 96,
  notice_buffer_hours: 12,
  legal_notice_hours: 72,
  earliest_shift_label: "Tue 11:00am",
  has_shifts: true,
  require_day_off: true,
  status: "saved",
  weeks: [0, 1, 2, 3].map((off) => {
    const ws = mondayISO(off);
    return {
      week_start: ws,
      week_label: `w/c ${ws}`,
      opens_at: `${mondayISO(off - 1)}T09:00:00`,
      reminder_at: `${mondayISO(off - 1)}T09:00:00`,
      closes_at: `${mondayISO(off - 1)}T05:00:00`,
      earliest_shift_at: `${ws}T11:00:00`,
      notice_hours: 78,
      is_override: false,
    };
  }),
};

export const LEAVE_SETTINGS: VenueLeaveSettings = {
  leave_year_start_month: 1,
  full_time_leave_days: 28,
};

// ---- Leave requests (manager queue + staff view) --------------------------

export const LEAVE_REQUESTS: LeaveRequest[] = [
  {
    id: "l1",
    staff_id: "s3",
    staff_name: "Priya Nair",
    start_date: addDays(WEEK, 2),
    end_date: addDays(WEEK, 3),
    status: "approved",
    reason: "Family visit",
    manager_note: null,
    created_at: `${mondayISO(-1)}T10:00:00`,
    decided_at: `${mondayISO(-1)}T12:00:00`,
    conflicting_assignments: 0,
    days: 2,
    remaining_days: 15,
    overlapping: [],
  },
  {
    id: "l2",
    staff_id: "s2",
    staff_name: "Tom Reilly",
    start_date: addDays(NEXT_WEEK, 0),
    end_date: addDays(NEXT_WEEK, 4),
    status: "pending",
    reason: "Holiday",
    manager_note: null,
    created_at: `${WEEK}T08:00:00`,
    decided_at: null,
    conflicting_assignments: 3,
    days: 5,
    remaining_days: 23,
    overlapping: [
      { staff_id: "s3", staff_name: "Priya Nair", start_date: addDays(NEXT_WEEK, 1), end_date: addDays(NEXT_WEEK, 2), status: "approved" },
    ],
  },
  {
    id: "l3",
    staff_id: "s1",
    staff_name: "Maya Chen",
    start_date: addDays(NEXT_WEEK, 5),
    end_date: addDays(NEXT_WEEK, 6),
    status: "pending",
    reason: null,
    manager_note: null,
    created_at: `${WEEK}T09:30:00`,
    decided_at: null,
    conflicting_assignments: 1,
    days: 2,
    remaining_days: 20,
    overlapping: [],
  },
];

// ---- Activity feed --------------------------------------------------------

export const ACTIVITY: Activity[] = [
  { id: "ac1", staff_id: "s2", staff_name: "Tom Reilly", action: "availability_submitted", detail: "Tom Reilly submitted availability for next week", created_at: `${WEEK}T08:05:00` },
  { id: "ac2", staff_id: "s4", staff_name: "Amara Okafor", action: "shift_dropped", detail: "Amara Okafor dropped the Sunday evening shift", created_at: `${WEEK}T09:20:00` },
  { id: "ac3", staff_id: null, staff_name: null, action: "rota_generated", detail: "Rota generated for this week", created_at: `${WEEK}T07:40:00` },
  { id: "ac4", staff_id: "s3", staff_name: "Priya Nair", action: "leave_approved", detail: "Priya Nair's leave was approved", created_at: `${mondayISO(-1)}T12:00:00` },
];

// ---- Staff-side payloads (authenticated as Maya, s1) ----------------------

const MAYA = STAFF[0];

const MAYA_SUBMISSIONS = [1, 2, 3, 4, 5].flatMap((d) =>
  SHIFTS.filter((s) => SHIFT_SCHEDULES[s.id].days[d].open).map((s) => ({
    day_index: d,
    shift_id: s.id,
    status: (s.id === "eve" ? 1 : 3) as 0 | 1 | 2 | 3,
    note: null,
  })),
);

export const PIN_AUTH: PinAuthData = {
  staff: { id: MAYA.id, name: MAYA.name, role: MAYA.role, auto_submit_availability: false, pending: false },
  venue_name: VENUE.name,
  period: { id: "p2", week_start: NEXT_WEEK, status: "collecting" },
  shifts: SHIFTS,
  submissions: MAYA_SUBMISSIONS,
  rules: { avail_closes_day: "Friday", avail_closes_time: "5:00am" },
  auto_submitted: false,
};

function weekShifts(): WeekShift[] {
  return SHIFTS.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    sort_order: s.sort_order,
    days: SHIFT_SCHEDULES[s.id].days
      .filter((d) => d.open)
      .map((d) => ({ day_index: d.day_index, start_time: d.start_time!, end_time: d.end_time!, restricted: false })),
  }));
}

export const WEEK_AVAILABILITY: WeekAvailability = {
  week_start: NEXT_WEEK,
  period: { id: "p2", week_start: NEXT_WEEK, status: "collecting" },
  editable: true,
  submissions: MAYA_SUBMISSIONS,
  shifts: weekShifts(),
  prefilled: true,
  auto_submitted: false,
  closes_at: `${WEEK}T05:00:00`,
  night_window_label: null,
};

export const STAFF_ROTA: StaffRota = {
  venue_name: VENUE.name,
  staff_id: MAYA.id,
  period: { id: "p1", week_start: WEEK, status: "generated" },
  shifts: SHIFTS,
  assignments: ASSIGNMENTS.map((a) => ({
    id: a.id,
    staff_id: a.staff_id,
    day_index: a.day_index,
    shift_id: a.shift_id,
    drop_status: a.drop_status,
    claim_staff_id: a.claim_staff_id,
    target_staff_id: a.target_staff_id,
    required_role: a.required_role,
    start_time: a.start_time,
    end_time: a.end_time,
  })),
  team: TEAM,
  venue_staff: TEAM,
  pending_swaps: [],
};

export const MY_LEAVE = {
  requests: [
    {
      id: "l1",
      staff_id: MAYA.id,
      staff_name: MAYA.name,
      start_date: addDays(NEXT_WEEK, 5),
      end_date: addDays(NEXT_WEEK, 6),
      status: "approved" as const,
      reason: "Weekend away",
      manager_note: null,
      created_at: `${WEEK}T09:30:00`,
      decided_at: `${WEEK}T10:00:00`,
      conflicting_assignments: 0,
      days: 2,
      remaining_days: null,
      overlapping: undefined,
    },
  ],
  allowance: {
    entitlement_days: 23,
    booked_days: 2,
    pending_days: 0,
    remaining_days: 21,
    working_days_per_week: 4,
    leave_year_start: "2026-01-01",
    leave_year_end: "2026-12-31",
  },
};

// ---- helpers --------------------------------------------------------------

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}
