import { createClient } from "./supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

export type Shift = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  color: string;
  sort_order: number;
};

export type AvailabilityEntry = {
  day_index: number;
  shift_id: string | null;
  status: 0 | 1 | 2 | 3;
  note: string | null;
};

export type VenueInfo = {
  venue_name: string;
  shifts: Shift[];
};

export type PinAuthData = {
  staff: { id: string; name: string; role: string };
  venue_name: string;
  period: { id: string; week_start: string; status: string } | null;
  shifts: Shift[];
  submissions: AvailabilityEntry[];
  rules: { avail_closes_day: string; avail_closes_time: string };
};

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.detail || `Request failed (${res.status})`);
  }

  return res.json();
}

async function authedRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  return request<T>(path, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
}

export function getVenueInfo(venueToken: string): Promise<VenueInfo> {
  return request(`/api/availability/${venueToken}`);
}

export function authenticatePin(venueToken: string, pin: string): Promise<PinAuthData> {
  return request(`/api/availability/${venueToken}/auth`, {
    method: "POST",
    body: JSON.stringify({ pin }),
  });
}

export function submitAvailability(
  venueToken: string,
  pin: string,
  submissions: AvailabilityEntry[],
): Promise<{ status: string }> {
  return request(`/api/availability/${venueToken}/submit`, {
    method: "POST",
    body: JSON.stringify({ pin, submissions }),
  });
}

export function forgotPin(venueToken: string, email: string): Promise<{ status: string }> {
  return request(`/api/availability/${venueToken}/forgot-pin`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export type StaffRotaAssignment = {
  id: string;
  staff_id: string;
  day_index: number;
  shift_id: string | null;
};

export type StaffRotaTeamMember = {
  id: string;
  name: string;
  role: string;
};

export type StaffRota = {
  venue_name: string;
  staff_id: string;
  period: { id: string; week_start: string; status: string } | null;
  shifts: Shift[];
  assignments: StaffRotaAssignment[];
  team: StaffRotaTeamMember[];
};

export function getStaffRota(venueToken: string, pin: string): Promise<StaffRota> {
  return request(`/api/availability/${venueToken}/rota?pin=${pin}`);
}

export async function requestMagicLink(email: string): Promise<{ status: string }> {
  // Triggered client-side (not via the backend) so the PKCE code verifier
  // Supabase generates for this sign-in is stored in this browser's own
  // storage — it has to be, since only this browser will later complete the
  // exchange in /auth/callback. A server-initiated OTP request has nowhere
  // to put a verifier the browser could ever retrieve.
  const supabase = createClient();
  console.log("[debug] cookies BEFORE signInWithOtp:", document.cookie);
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
  });
  console.log("[debug] signInWithOtp error:", error);
  console.log("[debug] cookies AFTER signInWithOtp:", document.cookie);

  if (error) {
    throw new ApiError(400, error.message);
  }
  return { status: "sent" };
}

export type Venue = {
  id: string;
  name: string;
  manager_email: string;
  link_token: string;
  created_at: string;
};

export type Period = {
  id: string;
  week_start: string;
  status: string;
};

export type StaffManager = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  pin: string;
  is_active: boolean;
  submitted: boolean | null;
};

export type Activity = {
  id: string;
  staff_id: string | null;
  staff_name: string | null;
  action: string;
  detail: string | null;
  created_at: string;
};

export type SchedulingRules = {
  max_hours_per_week: number;
  min_rest_hours: number;
  avail_opens_day: string;
  avail_closes_day: string;
  avail_closes_time: string;
  review_email_day: string;
  review_email_time: string;
};

export function getVenue(): Promise<Venue> {
  return authedRequest(`/api/venue`);
}

export function createVenue(name: string): Promise<Venue> {
  return authedRequest(`/api/venue`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function updateVenue(name: string): Promise<Venue> {
  return authedRequest(`/api/venue`, {
    method: "PUT",
    body: JSON.stringify({ name }),
  });
}

export function listShifts(): Promise<Shift[]> {
  return authedRequest(`/api/shifts`);
}

export function createShift(shift: {
  name: string;
  start_time: string;
  end_time: string;
  color: string;
  sort_order: number;
}): Promise<Shift> {
  return authedRequest(`/api/shifts`, {
    method: "POST",
    body: JSON.stringify(shift),
  });
}

export function listStaff(periodId?: string): Promise<StaffManager[]> {
  const query = periodId ? `?period_id=${periodId}` : "";
  return authedRequest(`/api/staff${query}`);
}

export function createStaff(staff: {
  name: string;
  email?: string | null;
  phone?: string | null;
  role: string;
}): Promise<StaffManager> {
  return authedRequest(`/api/staff`, {
    method: "POST",
    body: JSON.stringify(staff),
  });
}

export function listPeriods(): Promise<Period[]> {
  return authedRequest(`/api/periods`);
}

export function listActivity(limit = 20): Promise<Activity[]> {
  return authedRequest(`/api/activity?limit=${limit}`);
}

export function getRules(): Promise<SchedulingRules> {
  return authedRequest(`/api/rules`);
}

export function updateRules(rules: Partial<SchedulingRules>): Promise<SchedulingRules> {
  return authedRequest(`/api/rules`, {
    method: "PUT",
    body: JSON.stringify(rules),
  });
}

export function updateShift(
  id: string,
  shift: Partial<{ name: string; start_time: string; end_time: string; color: string; sort_order: number }>,
): Promise<Shift> {
  return authedRequest(`/api/shifts/${id}`, {
    method: "PUT",
    body: JSON.stringify(shift),
  });
}

export function deleteShift(id: string): Promise<{ status: string }> {
  return authedRequest(`/api/shifts/${id}`, { method: "DELETE" });
}

export function updateStaff(
  id: string,
  staff: Partial<{ name: string; email: string | null; phone: string | null; role: string; is_active: boolean }>,
): Promise<StaffManager> {
  return authedRequest(`/api/staff/${id}`, {
    method: "PUT",
    body: JSON.stringify(staff),
  });
}

export function deleteStaff(id: string): Promise<{ status: string }> {
  return authedRequest(`/api/staff/${id}`, { method: "DELETE" });
}

export function resetStaffPin(id: string): Promise<StaffManager> {
  return authedRequest(`/api/staff/${id}/reset-pin`, { method: "POST" });
}

export function remindStaff(params: {
  periodId?: string;
  staffId?: string;
}): Promise<{ reminded: number; email_sent: boolean }> {
  return authedRequest(`/api/staff/remind`, {
    method: "POST",
    body: JSON.stringify({ period_id: params.periodId, staff_id: params.staffId }),
  });
}

export type AssignmentOut = {
  id: string;
  staff_id: string;
  day_index: number;
  shift_id: string | null;
  manually_assigned: boolean;
};

export type RotaSummary = {
  period_id: string;
  status: string;
  assignments: AssignmentOut[];
  total_hours: number;
  conflicts: number;
  uncovered: { day_index: number; shift_id: string }[];
  warnings: string[];
};

export function getRota(periodId: string): Promise<RotaSummary> {
  return authedRequest(`/api/rota/${periodId}`);
}

export function generateRota(periodId: string): Promise<RotaSummary> {
  return authedRequest(`/api/rota/${periodId}/generate`, { method: "POST" });
}

export function editAssignment(
  periodId: string,
  edit: { staff_id: string; day_index: number; shift_id: string; action: "add" | "remove" },
): Promise<RotaSummary> {
  return authedRequest(`/api/rota/${periodId}/assignments`, {
    method: "PUT",
    body: JSON.stringify(edit),
  });
}

export function publishRota(periodId: string): Promise<RotaSummary> {
  return authedRequest(`/api/rota/${periodId}/publish`, { method: "POST" });
}

export { ApiError };
