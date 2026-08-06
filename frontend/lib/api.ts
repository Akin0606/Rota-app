import { createClient } from "./supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

export type Shift = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  color: string;
  sort_order: number;
  min_staff: number;
  max_staff: number;
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

// Pings the backend so Render's free-tier instance is awake before we
// navigate to a page that server-renders against it. Best-effort — never
// throws.
export async function warmBackend(): Promise<void> {
  try {
    await fetch(`${API_URL}/health`, { cache: "no-store" });
  } catch {
    // ignore — the destination page will surface any real error
  }
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

export function joinWaitlist(
  venueName: string,
  email: string,
): Promise<{ status: string; already_joined: boolean }> {
  return request(`/api/waitlist`, {
    method: "POST",
    body: JSON.stringify({ venue_name: venueName, email }),
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
  weekStart?: string,
): Promise<{ status: string }> {
  return request(`/api/availability/${venueToken}/submit`, {
    method: "POST",
    body: JSON.stringify({ pin, submissions, week_start: weekStart }),
  });
}

export type WeekAvailability = {
  week_start: string;
  period: { id: string; week_start: string; status: string } | null;
  editable: boolean;
  submissions: AvailabilityEntry[];
};

export function getWeekAvailability(
  venueToken: string,
  pin: string,
  weekStart: string,
): Promise<WeekAvailability> {
  return request(`/api/availability/${venueToken}/week`, {
    method: "POST",
    body: JSON.stringify({ pin, week_start: weekStart }),
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

export async function requestLoginCode(email: string): Promise<{ status: string }> {
  // Sends a 6-digit OTP code rather than a clickable magic link. We
  // deliberately omit emailRedirectTo: with no redirect URL, Supabase's email
  // template renders the {{ .Token }} code instead of a link. This avoids the
  // mobile failure where tapping a magic link opens the mail app's in-app
  // browser, which loses the PKCE code verifier and breaks sign-in.
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithOtp({ email });
  if (error) {
    // Log the full error object so failures are never silent during debugging.
    console.error("[login] signInWithOtp failed:", error);

    const raw = (error.message || "").trim();
    const name = (error as { name?: string }).name;
    // AuthRetryableFetchError carries an empty ("{}") body — it's a transient
    // network / rate-limit failure, not something the user did wrong.
    const retryable = name === "AuthRetryableFetchError";
    const emptyMessage = !raw || raw === "{}" || raw === "[object Object]";
    // When "Allow new users to sign up" is off in Supabase Auth, requesting a
    // code for an email with no account returns "Signups not allowed for otp".
    const signupsDisabled =
      (error as { code?: string }).code === "otp_disabled" ||
      /signups?\s+not\s+allowed|not\s+allowed\s+for\s+otp/i.test(raw);

    let message: string;
    if (signupsDisabled) {
      message = "This email isn't registered — contact your Crewplan admin.";
    } else if (retryable) {
      message = "Couldn't reach the server — please try again in a moment.";
    } else if (emptyMessage) {
      message = "Could not send code, please try again.";
    } else {
      message = raw;
    }
    throw new ApiError((error as { status?: number }).status ?? 400, message);
  }
  return { status: "sent" };
}

export async function verifyLoginCode(email: string, code: string): Promise<void> {
  // verifyOtp establishes the session entirely on the device that entered the
  // code — no PKCE verifier handoff — so it works regardless of which browser
  // or in-app webview the email was opened in.
  const supabase = createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error) {
    throw new ApiError(400, error.message);
  }
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
  min_staff?: number;
  max_staff?: number;
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

export function createPeriod(weekStart: string): Promise<Period> {
  return authedRequest(`/api/periods`, {
    method: "POST",
    body: JSON.stringify({ week_start: weekStart }),
  });
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
  shift: Partial<{
    name: string;
    start_time: string;
    end_time: string;
    color: string;
    sort_order: number;
    min_staff: number;
    max_staff: number;
  }>,
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

export type EmailDelivery = {
  sent: number;
  failed: number;
  skipped_no_email: number;
  errors: string[];
};

export type RotaSummary = {
  period_id: string;
  status: string;
  assignments: AssignmentOut[];
  total_hours: number;
  conflicts: number;
  uncovered: { day_index: number; shift_id: string }[];
  under_covered: { day_index: number; shift_id: string; assigned: number; required: number }[];
  warnings: string[];
  // Present only on the publish response.
  email?: EmailDelivery | null;
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

// Fetches a rota export (PDF/Excel) with auth and hands back the blob plus the
// server-provided filename, so the caller can trigger a browser download.
export async function fetchRotaExport(
  periodId: string,
  format: "pdf" | "xlsx",
  orientation: string,
): Promise<{ blob: Blob; filename: string }> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(
    `${API_URL}/api/rota/${periodId}/export.${format}?orientation=${orientation}`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.detail || `Export failed (${res.status})`);
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") || "";
  const match = cd.match(/filename="?([^"]+)"?/);
  return { blob, filename: match?.[1] ?? `rota.${format}` };
}

export function emailRota(
  periodId: string,
  body: { target: "staff" | "manager"; orientation: string },
): Promise<EmailDelivery> {
  return authedRequest(`/api/rota/${periodId}/email`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export { ApiError };
