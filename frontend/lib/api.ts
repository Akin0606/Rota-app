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
  staff: { id: string; name: string; role: string; auto_submit_availability: boolean; pending?: boolean };
  venue_name: string;
  period: { id: string; week_start: string; status: string } | null;
  shifts: Shift[];
  submissions: AvailabilityEntry[];
  rules: { avail_closes_day: string; avail_closes_time: string };
  // The cron auto-submitted the current week (§6b) — drives a hub banner.
  auto_submitted?: boolean;
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

  invalidateStaffCacheFor(path);
  return res.json();
}

/* ---------------------------------------------------------------------------
   Staff screen cache

   Every staff screen fetches /auth and/or /rota on mount, so a
   hub -> screen -> hub round trip asked the backend for the same payload three
   times and showed a blank "Loading…" on each hop. This keeps the last
   response per (path, venue, pin) in module memory — which survives soft
   navigation between screens and dies with the document, exactly the lifetime
   we want — and serves it immediately while refreshing behind the screen, so a
   hop paints instantly and is never stale by more than one round trip.

   The four read endpoints every screen shares are cached: /auth, /rota,
   /activity and /leave/mine. /week is deliberately not — it is the grid the
   user is actively editing on the availability screen.
--------------------------------------------------------------------------- */

// Serve from cache below this age; above it, fetch normally.
const CACHE_MAX_AGE_MS = 60_000;
// Below this age, don't even revalidate — stops the hub's two simultaneous
// mounts (and React StrictMode's doubled effects in dev) from stampeding.
const CACHE_DEDUPE_MS = 3_000;

type CacheEntry<T> = { data?: T; at: number; inFlight?: Promise<T> };

const staffCache = new Map<string, CacheEntry<unknown>>();

// POST is used for reads on the staff side too — the PIN travels in the body
// rather than the URL — so "is this a write?" cannot be inferred from the
// method. These are the staff endpoints that only read; anything else under
// /api/availability/{token} or /api/leave/{token} is treated as a write and
// drops that venue's cached entries. Defaulting the unknown case to "write"
// means a staff endpoint added later can only ever be too cautious, never
// silently serve stale data.
const STAFF_READ_TAILS = new Set(["", "auth", "rota", "week", "activity", "mine"]);

function invalidateStaffCacheFor(path: string) {
  const m = path.match(/^\/api\/(?:availability|leave)\/([^/?]+)\/?([^?]*)/);
  if (!m) return;
  const [, venueToken, tail] = m;
  if (STAFF_READ_TAILS.has(tail)) return;
  const stale: string[] = [];
  staffCache.forEach((_, key) => {
    if (key.includes(`|${venueToken}|`)) stale.push(key);
  });
  stale.forEach((key) => staffCache.delete(key));
}

function runCached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const promise = fetcher().then(
    (data) => {
      staffCache.set(key, { data, at: Date.now() });
      return data;
    },
    (err) => {
      const current = staffCache.get(key) as CacheEntry<T> | undefined;
      if (current?.data !== undefined) {
        // A background refresh failed. Keep the last good copy — on pub wifi a
        // dropped request must not cost the user a screen they already have —
        // but clear `inFlight` so the next hop can retry, and leave `at`
        // untouched so the entry still ages out of the serve window on time.
        staffCache.set(key, { data: current.data, at: current.at });
      } else {
        // A first load failed: cache nothing, or the stale connection pool
        // would pin an error in place for a full minute.
        staffCache.delete(key);
      }
      throw err;
    },
  );
  const existing = staffCache.get(key) as CacheEntry<T> | undefined;
  staffCache.set(key, { ...existing, at: existing?.at ?? 0, inFlight: promise });
  return promise;
}

function cached<T>(key: string, fetcher: () => Promise<T>, onRevalidate?: (fresh: T) => void): Promise<T> {
  const entry = staffCache.get(key) as CacheEntry<T> | undefined;
  const age = entry ? Date.now() - entry.at : Infinity;

  if (entry?.data !== undefined && age < CACHE_MAX_AGE_MS) {
    if (age > CACHE_DEDUPE_MS && !entry.inFlight) {
      // Refresh behind the screen. A failure here is deliberately swallowed:
      // the caller already has usable data, and on pub wifi a background
      // failure should never turn a rendered screen into an error.
      void runCached(key, fetcher)
        .then((fresh) => onRevalidate?.(fresh))
        .catch(() => {});
    }
    return Promise.resolve(entry.data);
  }

  // Nothing usable cached: join a request already in flight rather than
  // starting a second one.
  if (entry?.inFlight) return entry.inFlight;
  return runCached(key, fetcher);
}

export type CacheOpts<T> = { onRevalidate?: (fresh: T) => void };

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

export function authenticatePin(
  venueToken: string,
  pin: string,
  opts?: CacheOpts<PinAuthData>,
): Promise<PinAuthData> {
  return cached(
    `auth|${venueToken}|${pin}`,
    () =>
      request<PinAuthData>(`/api/availability/${venueToken}/auth`, {
        method: "POST",
        body: JSON.stringify({ pin }),
      }),
    opts?.onRevalidate,
  );
}

export type JoinResult = {
  staff_id: string;
  name: string;
  pin: string;
  venue_name: string;
};

// Self-registration (§3). Gated by the venue's join code; returns the new PIN
// once. A wrong code is a 401, a rate-limited caller a 429 (same as PIN auth),
// and a venue with joining disabled a 403 — all surfaced by the caller.
export function joinTeam(venueToken: string, joinPin: string, name: string): Promise<JoinResult> {
  return request(`/api/availability/${venueToken}/join`, {
    method: "POST",
    body: JSON.stringify({ join_pin: joinPin, name }),
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
  prefilled: boolean;
  // The cron auto-copied this week's pattern (§6b); drives a heads-up banner.
  auto_submitted: boolean;
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

export function setAutoSubmit(
  venueToken: string,
  pin: string,
  enabled: boolean,
): Promise<{ auto_submit_availability: boolean }> {
  return request(`/api/availability/${venueToken}/auto-submit`, {
    method: "PUT",
    body: JSON.stringify({ pin, enabled }),
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
  staff_id: string | null;
  day_index: number;
  shift_id: string | null;
  drop_status: "pending_pickup" | "pending_approval" | null;
  claim_staff_id: string | null;
  target_staff_id: string | null;
  required_role: string | null;
  // Real per-day hours for this assignment's day (via shift_days); prefer over
  // the shift-level time so a per-day shift shows the right time.
  start_time?: string | null;
  end_time?: string | null;
};

export type StaffRotaTeamMember = {
  id: string;
  name: string;
  role: string;
};

export type SwapSide = {
  assignment_id: string;
  day_index: number;
  shift_id: string;
};

export type SwapForStaff = {
  id: string;
  role: "initiator" | "recipient";
  status: "pending_response" | "pending_approval";
  counterpart_id: string;
  counterpart_name: string;
  my_shift: SwapSide;
  their_shift: SwapSide;
};

export type StaffRota = {
  venue_name: string;
  staff_id: string;
  period: { id: string; week_start: string; status: string } | null;
  shifts: Shift[];
  assignments: StaffRotaAssignment[];
  team: StaffRotaTeamMember[];
  venue_staff: StaffRotaTeamMember[];
  pending_swaps: SwapForStaff[];
};

export function getStaffRota(
  venueToken: string,
  pin: string,
  opts?: CacheOpts<StaffRota>,
): Promise<StaffRota> {
  return cached(
    `rota|${venueToken}|${pin}`,
    // POST so the PIN is in the body, not the URL. The cache keys off the path
    // tail ("rota"), which is in STAFF_READ_TAILS, so this stays a cached read.
    () =>
      request<StaffRota>(`/api/availability/${venueToken}/rota`, {
        method: "POST",
        body: JSON.stringify({ pin }),
      }),
    opts?.onRevalidate,
  );
}

export function dropShift(venueToken: string, pin: string, assignmentId: string): Promise<StaffRota> {
  return request(`/api/availability/${venueToken}/rota/drop`, {
    method: "POST",
    body: JSON.stringify({ pin, assignment_id: assignmentId }),
  });
}

export type ClaimSubmitResult = {
  status: "approved" | "pending";
  reason?: string | null;
  rota?: StaffRota | null;
};

export function claimShift(
  venueToken: string,
  pin: string,
  assignmentId: string,
): Promise<ClaimSubmitResult> {
  return request(`/api/availability/${venueToken}/rota/claim`, {
    method: "POST",
    body: JSON.stringify({ pin, assignment_id: assignmentId }),
  });
}

export function giveShift(
  venueToken: string,
  pin: string,
  assignmentId: string,
  targetStaffId: string,
): Promise<StaffRota> {
  return request(`/api/availability/${venueToken}/rota/give`, {
    method: "POST",
    body: JSON.stringify({ pin, assignment_id: assignmentId, target_staff_id: targetStaffId }),
  });
}

export function acceptGive(
  venueToken: string,
  pin: string,
  assignmentId: string,
): Promise<ClaimSubmitResult> {
  return request(`/api/availability/${venueToken}/rota/give/accept`, {
    method: "POST",
    body: JSON.stringify({ pin, assignment_id: assignmentId }),
  });
}

export function declineGive(venueToken: string, pin: string, assignmentId: string): Promise<StaffRota> {
  return request(`/api/availability/${venueToken}/rota/give/decline`, {
    method: "POST",
    body: JSON.stringify({ pin, assignment_id: assignmentId }),
  });
}

export function proposeSwap(
  venueToken: string,
  pin: string,
  assignmentId: string,
  targetStaffId: string,
  targetAssignmentId: string,
): Promise<StaffRota> {
  return request(`/api/availability/${venueToken}/rota/swap/propose`, {
    method: "POST",
    body: JSON.stringify({
      pin,
      assignment_id: assignmentId,
      target_staff_id: targetStaffId,
      target_assignment_id: targetAssignmentId,
    }),
  });
}

export function acceptSwap(venueToken: string, pin: string, swapId: string): Promise<ClaimSubmitResult> {
  return request(`/api/availability/${venueToken}/rota/swap/accept`, {
    method: "POST",
    body: JSON.stringify({ pin, swap_id: swapId }),
  });
}

export function declineSwap(venueToken: string, pin: string, swapId: string): Promise<StaffRota> {
  return request(`/api/availability/${venueToken}/rota/swap/decline`, {
    method: "POST",
    body: JSON.stringify({ pin, swap_id: swapId }),
  });
}

export function getStaffActivity(
  venueToken: string,
  pin: string,
  limit = 20,
  opts?: CacheOpts<Activity[]>,
): Promise<Activity[]> {
  return cached(
    `activity|${venueToken}|${pin}|${limit}`,
    // POST so the PIN is in the body, not the URL; limit stays a query param
    // (not a credential). Path tail "activity" keeps it a cached read.
    () =>
      request<Activity[]>(`/api/availability/${venueToken}/activity?limit=${limit}`, {
        method: "POST",
        body: JSON.stringify({ pin }),
      }),
    opts?.onRevalidate,
  );
}

export type OnboardingSession = { access_token: string; refresh_token: string; email: string };

// Token-landing (§1). Validates + burns the one-time activation token and returns
// a server-minted Supabase session; a 410 means expired/used/unknown (resend wall).
export function activateOnboarding(token: string): Promise<OnboardingSession> {
  return request(`/api/onboarding/activate`, {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

// Persist wizard progress for save-and-resume (null = onboarding finished).
export function saveSetupState(setup_state: SetupState): Promise<Venue> {
  return authedRequest(`/api/venue/setup-state`, {
    method: "PUT",
    body: JSON.stringify({ setup_state }),
  });
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
  is_active: boolean;
  // Self-registration code (§3). null = joining disabled.
  join_pin: string | null;
  // Onboarding save-and-resume (§1). {step} while in-flight, {completed} when
  // done, null on a legacy/already-onboarded venue.
  setup_state: SetupState | null;
  // True for venues backfilled from a free-text 'close' — prompt the manager to
  // enter real per-day close times. Cleared when they save any per-day schedule.
  needs_shift_recapture?: boolean;
};

export type SetupState = { step?: number; completed?: boolean } | null;

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
  is_under_18: boolean;
  // Self-registered, awaiting approval (§3). Orthogonal to is_active.
  pending: boolean;
  submitted: boolean | null;
  working_days_per_week: number;
  // null means "prorate the venue's full-time figure by working_days_per_week".
  annual_leave_days: number | null;
  // Every role this person is eligible to work (staff_roles M2M). `role` above
  // is still the primary/display role.
  role_ids: string[];
};

// A venue-configurable role (migration 022). `staff_ids` is the "who can work
// this role" membership.
export type Role = {
  id: string;
  name: string;
  icon: string;
  sort_order: number;
  staff_ids: string[];
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
  // Real datetimes for the availability window (naive local wall-clock,
  // "YYYY-MM-DDTHH:MM[:SS]").
  avail_opens_at: string | null;
  avail_reminder_at: string | null;
  avail_closes_at: string | null;
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
  is_under_18?: boolean;
  role_ids?: string[];
}): Promise<StaffManager> {
  return authedRequest(`/api/staff`, {
    method: "POST",
    body: JSON.stringify(staff),
  });
}

// --- Roles (venue-configurable, migration 022) ------------------------------

export function listRoles(): Promise<Role[]> {
  return authedRequest(`/api/roles`);
}

export function createRole(role: {
  name: string;
  icon: string;
  staff_ids: string[];
}): Promise<Role> {
  return authedRequest(`/api/roles`, {
    method: "POST",
    body: JSON.stringify(role),
  });
}

export function updateRole(
  id: string,
  role: Partial<{ name: string; icon: string; staff_ids: string[] }>,
): Promise<Role> {
  return authedRequest(`/api/roles/${id}`, {
    method: "PUT",
    body: JSON.stringify(role),
  });
}

export function deleteRole(id: string): Promise<void> {
  return authedRequest(`/api/roles/${id}`, { method: "DELETE" });
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

// --- Scheduler (automated 72-hour notice window) ----------------------------

export type SchedulerWeek = {
  week_start: string;
  week_label: string;
  opens_at: string;
  reminder_at: string;
  closes_at: string;
  earliest_shift_at: string;
  notice_hours: number;
  is_override: boolean;
};

export type SchedulerConfig = {
  open_offset_hours: number;
  reminder_offset_hours: number;
  notice_buffer_hours: number;
  legal_notice_hours: number;
  earliest_shift_label: string | null;
  has_shifts: boolean;
  weeks: SchedulerWeek[];
  require_day_off: boolean;
  status: "saved" | "needs_confirm";
};

export type SchedulerOverrideResponse = {
  status: "saved" | "needs_confirm";
  notice_hours: number | null;
  legal_notice_hours: number;
  config: SchedulerConfig | null;
};

export function getScheduler(): Promise<SchedulerConfig> {
  return authedRequest(`/api/scheduler`);
}

export function updateScheduler(
  changes: Partial<
    Pick<SchedulerConfig, "open_offset_hours" | "reminder_offset_hours" | "notice_buffer_hours" | "require_day_off">
  > & { confirm?: boolean },
): Promise<SchedulerConfig> {
  return authedRequest(`/api/scheduler`, {
    method: "PUT",
    body: JSON.stringify(changes),
  });
}

export function setScheduleOverride(
  weekStart: string,
  closeAt: string,
  confirm = false,
): Promise<SchedulerOverrideResponse> {
  return authedRequest(`/api/scheduler/override`, {
    method: "POST",
    body: JSON.stringify({ week_start: weekStart, close_at: closeAt, confirm }),
  });
}

export function clearScheduleOverride(weekStart: string): Promise<SchedulerConfig> {
  return authedRequest(`/api/scheduler/override?week_start=${encodeURIComponent(weekStart)}`, {
    method: "DELETE",
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

export type ShiftDay = {
  day_index: number;
  open: boolean;
  start_time: string | null;
  end_time: string | null;
  min_staff: number;
  max_staff: number;
};

export type ShiftSchedule = { shift_id: string; days: ShiftDay[] };

export function getShiftSchedule(id: string): Promise<ShiftSchedule> {
  return authedRequest(`/api/shifts/${id}/days`);
}

// Only OPEN days are sent; any day 0-6 omitted is a closed day for the shift.
export function setShiftSchedule(
  id: string,
  days: {
    day_index: number;
    start_time: string;
    end_time: string;
    min_staff: number;
    max_staff: number;
  }[],
): Promise<ShiftSchedule> {
  return authedRequest(`/api/shifts/${id}/days`, {
    method: "PUT",
    body: JSON.stringify({ days }),
  });
}

export function updateStaff(
  id: string,
  staff: Partial<{
    name: string;
    email: string | null;
    phone: string | null;
    role: string;
    is_active: boolean;
    is_under_18: boolean;
    working_days_per_week: number;
    annual_leave_days: number | null;
    role_ids: string[];
  }>,
): Promise<StaffManager> {
  return authedRequest(`/api/staff/${id}`, {
    method: "PUT",
    body: JSON.stringify(staff),
  });
}

export function deleteStaff(id: string): Promise<{ status: string }> {
  return authedRequest(`/api/staff/${id}`, { method: "DELETE" });
}

// Right-to-erasure: irreversibly anonymise a staff member's personal data.
// Distinct from deleteStaff (reversible deactivation).
export function eraseStaff(id: string): Promise<{ status: string }> {
  return authedRequest(`/api/staff/${id}/erase`, { method: "POST" });
}

export function resetStaffPin(id: string): Promise<StaffManager> {
  return authedRequest(`/api/staff/${id}/reset-pin`, { method: "POST" });
}

// Approve a pending self-registration — sets role + U18 and activates (§3).
export function approveStaff(
  id: string,
  body: { role: string; is_under_18: boolean; role_ids: string[] },
): Promise<StaffManager> {
  return authedRequest(`/api/staff/${id}/approve`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function rejectStaff(id: string): Promise<{ status: string }> {
  return authedRequest(`/api/staff/${id}/reject`, { method: "POST" });
}

// Generate/reset the venue's self-registration code. POST enables or rotates it;
// DELETE turns joining off.
export function rotateJoinCode(): Promise<{ join_pin: string | null }> {
  return authedRequest(`/api/venue/join-code`, { method: "POST" });
}

export function disableJoinCode(): Promise<{ join_pin: string | null }> {
  return authedRequest(`/api/venue/join-code`, { method: "DELETE" });
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
  staff_id: string | null;
  day_index: number;
  shift_id: string | null;
  manually_assigned: boolean;
  required_role: string | null;
  // Real per-day hours for this assignment's day (via shift_days); prefer over
  // the shift-level time so a per-day shift shows the right time.
  start_time?: string | null;
  end_time?: string | null;
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
  // Approved leave overlapping this week: { staff_id: [day_index, ...] }.
  leave: Record<string, number[]>;
  warnings: string[];
  info: string[];
  // Present only on the publish response.
  email?: EmailDelivery | null;
};

export function getRota(periodId: string): Promise<RotaSummary> {
  return authedRequest(`/api/rota/${periodId}`);
}

export function generateRota(periodId: string): Promise<RotaSummary> {
  return authedRequest(`/api/rota/${periodId}/generate`, { method: "POST" });
}

export function copyPreviousRota(periodId: string): Promise<RotaSummary> {
  return authedRequest(`/api/rota/${periodId}/copy-previous`, { method: "POST" });
}

export function postOpenShift(
  periodId: string,
  dayIndex: number,
  shiftId: string,
  requiredRole: string | null,
): Promise<RotaSummary> {
  return authedRequest(`/api/rota/${periodId}/assignments/open`, {
    method: "POST",
    body: JSON.stringify({ day_index: dayIndex, shift_id: shiftId, required_role: requiredRole }),
  });
}

export function cancelOpenShift(periodId: string, assignmentId: string): Promise<RotaSummary> {
  return authedRequest(`/api/rota/${periodId}/assignments/open/${assignmentId}`, {
    method: "DELETE",
  });
}

export type AssignmentEditResult = {
  status: "saved" | "needs_confirm";
  reason?: string | null;
  summary?: RotaSummary | null;
};

export function editAssignment(
  periodId: string,
  edit: {
    staff_id: string;
    day_index: number;
    shift_id: string;
    action: "add" | "remove";
    confirm?: boolean;
  },
): Promise<AssignmentEditResult> {
  return authedRequest(`/api/rota/${periodId}/assignments`, {
    method: "PUT",
    body: JSON.stringify(edit),
  });
}

export function publishRota(periodId: string): Promise<RotaSummary> {
  return authedRequest(`/api/rota/${periodId}/publish`, { method: "POST" });
}

export function unpublishRota(periodId: string): Promise<RotaSummary> {
  return authedRequest(`/api/rota/${periodId}/unpublish`, { method: "POST" });
}

// Returns a solved-but-unpublished ("generated") week to "collecting" so staff
// can submit availability again — the in-app path that replaces hand-run SQL.
export function reopenAvailability(periodId: string): Promise<RotaSummary> {
  return authedRequest(`/api/rota/${periodId}/reopen`, { method: "POST" });
}

export type SubmissionEntry = {
  staff_id: string;
  staff_name: string;
  day_index: number;
  shift_id: string | null;
  status: 0 | 1 | 2 | 3;
  note: string | null;
};

export type PeriodSubmissions = {
  period_id: string;
  submissions: SubmissionEntry[];
};

export function getPeriodSubmissions(periodId: string): Promise<PeriodSubmissions> {
  return authedRequest(`/api/rota/${periodId}/submissions`);
}

export function clearSubmission(periodId: string, staffId: string): Promise<RotaSummary> {
  return authedRequest(`/api/rota/${periodId}/submissions/${staffId}`, { method: "DELETE" });
}

export type Claim = {
  assignment_id: string;
  day_index: number;
  shift_id: string;
  original_staff_id: string;
  original_staff_name: string;
  claimant_staff_id: string;
  claimant_staff_name: string;
  reason: string | null;
};

export type PeriodClaims = {
  period_id: string;
  claims: Claim[];
};

export type ClaimActionResult = {
  status: "approved" | "needs_confirm" | "rejected";
  reason?: string | null;
  summary?: RotaSummary | null;
  claims: Claim[];
};

export function getClaims(periodId: string): Promise<PeriodClaims> {
  return authedRequest(`/api/rota/${periodId}/claims`);
}

export function approveClaim(
  periodId: string,
  assignmentId: string,
  confirm = false,
): Promise<ClaimActionResult> {
  return authedRequest(`/api/rota/${periodId}/claims/${assignmentId}/approve`, {
    method: "POST",
    body: JSON.stringify({ confirm }),
  });
}

export function rejectClaim(periodId: string, assignmentId: string): Promise<ClaimActionResult> {
  return authedRequest(`/api/rota/${periodId}/claims/${assignmentId}/reject`, { method: "POST" });
}

export type Swap = {
  id: string;
  initiator_staff_id: string;
  initiator_staff_name: string;
  initiator_day_index: number;
  initiator_shift_id: string;
  recipient_staff_id: string;
  recipient_staff_name: string;
  recipient_day_index: number;
  recipient_shift_id: string;
  reason: string | null;
};

export type PeriodSwaps = {
  period_id: string;
  swaps: Swap[];
};

export type SwapActionResult = {
  status: "approved" | "needs_confirm" | "rejected";
  reason?: string | null;
  summary?: RotaSummary | null;
  swaps: Swap[];
};

export function getSwaps(periodId: string): Promise<PeriodSwaps> {
  return authedRequest(`/api/rota/${periodId}/swaps`);
}

export function approveSwap(periodId: string, swapId: string, confirm = false): Promise<SwapActionResult> {
  return authedRequest(`/api/rota/${periodId}/swaps/${swapId}/approve`, {
    method: "POST",
    body: JSON.stringify({ confirm }),
  });
}

export function rejectSwap(periodId: string, swapId: string): Promise<SwapActionResult> {
  return authedRequest(`/api/rota/${periodId}/swaps/${swapId}/reject`, { method: "POST" });
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

// --- Holiday / annual leave requests ----------------------------------------

export type LeaveRequest = {
  id: string;
  staff_id: string;
  staff_name: string;
  start_date: string;
  end_date: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  reason: string | null;
  manager_note: string | null;
  created_at: string;
  decided_at: string | null;
  // Manager view only: existing rota assignments that fall inside the range.
  conflicting_assignments: number;
  // What this range costs the requester in working days, computed server-side
  // so both sides of the app quote the same number.
  days: number;
};

export type LeaveAllowance = {
  entitlement_days: number;
  booked_days: number;
  pending_days: number;
  remaining_days: number;
  working_days_per_week: number;
  leave_year_start: string;
  leave_year_end: string;
};

export function requestLeave(
  venueToken: string,
  pin: string,
  startDate: string,
  endDate: string,
  reason: string | null,
): Promise<LeaveRequest> {
  return request(`/api/leave/${venueToken}/request`, {
    method: "POST",
    body: JSON.stringify({ pin, start_date: startDate, end_date: endDate, reason }),
  });
}

export type MyLeaveResponse = { requests: LeaveRequest[]; allowance: LeaveAllowance | null };

export function myLeaveRequests(
  venueToken: string,
  pin: string,
  opts?: CacheOpts<MyLeaveResponse>,
): Promise<MyLeaveResponse> {
  return cached(
    `leave-mine|${venueToken}|${pin}`,
    () =>
      request<MyLeaveResponse>(`/api/leave/${venueToken}/mine`, {
        method: "POST",
        body: JSON.stringify({ pin }),
      }),
    opts?.onRevalidate,
  );
}

export type VenueLeaveSettings = {
  leave_year_start_month: number;
  full_time_leave_days: number;
};

export function getVenueLeaveSettings(): Promise<VenueLeaveSettings> {
  return authedRequest(`/api/venue/leave-settings`);
}

export function updateVenueLeaveSettings(
  payload: Partial<VenueLeaveSettings>,
): Promise<VenueLeaveSettings> {
  return authedRequest(`/api/venue/leave-settings`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function cancelLeaveRequest(venueToken: string, pin: string, requestId: string): Promise<LeaveRequest> {
  return request(`/api/leave/${venueToken}/cancel`, {
    method: "POST",
    body: JSON.stringify({ pin, request_id: requestId }),
  });
}

export function listLeaveRequests(status?: string): Promise<{ requests: LeaveRequest[] }> {
  const query = status ? `?status=${status}` : "";
  return authedRequest(`/api/leave${query}`);
}

export function approveLeave(requestId: string, managerNote?: string): Promise<LeaveRequest> {
  return authedRequest(`/api/leave/${requestId}/approve`, {
    method: "POST",
    body: JSON.stringify({ manager_note: managerNote ?? null }),
  });
}

export function rejectLeave(requestId: string, managerNote?: string): Promise<LeaveRequest> {
  return authedRequest(`/api/leave/${requestId}/reject`, {
    method: "POST",
    body: JSON.stringify({ manager_note: managerNote ?? null }),
  });
}

export { ApiError };
