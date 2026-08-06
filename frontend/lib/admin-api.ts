const API_URL = process.env.NEXT_PUBLIC_API_URL!;
const STORAGE_KEY = "rota_admin_secret";

export class AdminApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getAdminSecret(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(STORAGE_KEY);
}

export function setAdminSecret(secret: string): void {
  sessionStorage.setItem(STORAGE_KEY, secret);
}

export function clearAdminSecret(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const secret = getAdminSecret();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "X-Admin-Secret": secret } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new AdminApiError(res.status, body.detail || `Request failed (${res.status})`);
  }

  return res.json();
}

export type AdminVenue = {
  id: string;
  name: string;
  manager_email: string;
  created_at: string;
  staff_count: number;
  period_status: string | null;
  pending: boolean;
  is_active: boolean;
  last_active_at: string | null;
};

export type AdminManager = {
  email: string;
  status: string;
  login_url: string;
};

export type AdminStaff = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  pin: string;
  is_active: boolean;
  submitted: boolean | null;
};

export type AdminVenueDetail = {
  id: string;
  name: string;
  manager_email: string;
  created_at: string;
  link_token: string;
  is_active: boolean;
  staff: AdminStaff[];
  period: { id: string; week_start: string; status: string } | null;
};

export type AdminActivity = {
  id: string;
  venue_id: string;
  venue_name: string;
  staff_id: string | null;
  staff_name: string | null;
  action: string;
  detail: string | null;
  created_at: string;
};

export function listAdminVenues(): Promise<AdminVenue[]> {
  return adminRequest("/api/admin/venues");
}

export function addAdminManager(email: string): Promise<AdminManager> {
  return adminRequest("/api/admin/managers", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export type WaitlistEntry = {
  id: string;
  venue_name: string;
  email: string;
  status: string;
  created_at: string;
};

export function listWaitlist(): Promise<WaitlistEntry[]> {
  return adminRequest("/api/admin/waitlist");
}

export function inviteWaitlistEntry(id: string): Promise<AdminManager> {
  return adminRequest(`/api/admin/waitlist/${id}/invite`, { method: "POST" });
}

export function getAdminVenueDetail(id: string): Promise<AdminVenueDetail> {
  return adminRequest(`/api/admin/venues/${id}`);
}

export function setVenueActive(id: string, isActive: boolean): Promise<AdminVenueDetail> {
  return adminRequest(`/api/admin/venues/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ is_active: isActive }),
  });
}

export type AdminShift = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  color: string;
  sort_order: number;
  min_staff: number;
  max_staff: number;
};

export type AdminRotaAssignment = {
  staff_id: string;
  day_index: number;
  shift_id: string | null;
};

export type AdminVenueRota = {
  venue_name: string;
  period: { id: string; week_start: string; status: string } | null;
  shifts: AdminShift[];
  staff: { id: string; name: string; role: string }[];
  summary: {
    assignments: AdminRotaAssignment[];
    total_hours: number;
    conflicts: number;
  } | null;
};

export function getAdminVenueRota(id: string): Promise<AdminVenueRota> {
  return adminRequest(`/api/admin/venues/${id}/rota`);
}

export function deleteAdminVenue(id: string): Promise<{ status: string; name: string }> {
  return adminRequest(`/api/admin/venues/${id}`, { method: "DELETE" });
}

export function listAdminActivity(limit = 50): Promise<AdminActivity[]> {
  return adminRequest(`/api/admin/activity?limit=${limit}`);
}

export function adminGenerateRota(venueId: string) {
  return adminRequest(`/api/admin/venues/${venueId}/generate`, { method: "POST" });
}

export function adminResetPin(staffId: string): Promise<AdminStaff> {
  return adminRequest(`/api/admin/staff/${staffId}/reset-pin`, { method: "POST" });
}
