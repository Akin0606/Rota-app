// Device Lab fetch stub.
//
// Monkeypatches window.fetch so every /api/... call the app makes resolves
// against the canned dataset in ./data — no backend, no auth. Idempotent and
// dev+browser-guarded, so importing it in production or on the server is inert.
//
// It also plants the demo staff PIN in sessionStorage, so the real /v/demo/*
// staff pages authenticate without the PIN-entry screen.

import { pinStorageKey } from "@/lib/utils";

import * as D from "./data";

let installed = false;

export function installStub() {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV === "production") return;

  // Plant the PIN every call (cheap, idempotent) so a page that mounts before
  // the fetch patch still authenticates.
  try {
    sessionStorage.setItem(pinStorageKey(D.TOKEN), D.PIN);
  } catch {
    /* private mode — ignore */
  }

  if (installed) return;
  installed = true;

  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method || (input instanceof Request ? input.method : "GET") || "GET").toUpperCase();

    const apiMatch = url.match(/\/api\/[^?]*/);
    const isHealth = /\/health(\?|$)/.test(url);

    if (!apiMatch && !isHealth) return real(input, init);

    const path = apiMatch ? apiMatch[0] : "/health";
    let body: Record<string, unknown> = {};
    try {
      const raw = init?.body ?? (input instanceof Request ? null : null);
      if (typeof raw === "string") body = JSON.parse(raw);
    } catch {
      /* non-JSON body — ignore */
    }

    const result = route(path, method, body);
    if (result === PASSTHROUGH) return real(input, init);
    if (result instanceof Response) return result;
    return json(result);
  };
}

const PASSTHROUGH = Symbol("passthrough");

function json(bodyObj: unknown, status = 200): Response {
  return new Response(JSON.stringify(bodyObj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function seg(path: string): string[] {
  return path.split("/").filter(Boolean); // ["api", "rota", "p1", ...]
}

function route(path: string, method: string, body: Record<string, unknown>): unknown {
  if (path === "/health") return { ok: true };

  const s = seg(path); // s[0] === "api"

  // ---- Staff: /api/availability/demo/* -----------------------------------
  if (s[1] === "availability" && s[2] === D.TOKEN) {
    const tail = s.slice(3).join("/");
    switch (tail) {
      case "":
        return { venue_name: D.VENUE.name, shifts: D.SHIFTS };
      case "auth":
        return D.PIN_AUTH;
      case "week":
        return D.WEEK_AVAILABILITY;
      case "rota":
        return D.STAFF_ROTA;
      case "activity":
        return D.ACTIVITY;
      case "submit":
        return { status: "ok" };
      case "auto-submit":
        return { auto_submit_availability: Boolean(body.enabled) };
      case "forgot-pin":
        return { status: "sent" };
      case "join":
        return { staff_id: "s6", name: String(body.name ?? "New starter"), pin: "7788", venue_name: D.VENUE.name };
      case "rota/claim":
      case "rota/give/accept":
      case "rota/swap/accept":
        return { status: "approved", reason: null, rota: D.STAFF_ROTA };
      default:
        // drop / give / give/decline / swap/propose / swap/decline
        return D.STAFF_ROTA;
    }
  }

  // ---- Staff: /api/leave/demo/* ------------------------------------------
  if (s[1] === "leave" && s[2] === D.TOKEN) {
    const tail = s[3];
    if (tail === "mine") return D.MY_LEAVE;
    // request / cancel — echo a plausible request row
    return {
      id: "l-new",
      staff_id: "s1",
      staff_name: "Maya Chen",
      start_date: String(body.start_date ?? D.WEEK_AVAILABILITY.week_start),
      end_date: String(body.end_date ?? D.WEEK_AVAILABILITY.week_start),
      status: tail === "cancel" ? "cancelled" : "pending",
      reason: (body.reason as string) ?? null,
      manager_note: null,
      created_at: new Date().toISOString(),
      decided_at: null,
      conflicting_assignments: 0,
      days: 1,
    };
  }

  // ---- Manager: /api/venue* ----------------------------------------------
  if (s[1] === "venue") {
    if (s[2] === "leave-settings") return method === "PUT" ? { ...D.LEAVE_SETTINGS, ...body } : D.LEAVE_SETTINGS;
    if (s[2] === "join-code") return { join_pin: method === "DELETE" ? null : D.VENUE.join_pin };
    if (s[2] === "setup-state") return D.VENUE;
    if (!s[2]) {
      if (method === "PUT" || method === "POST") return { ...D.VENUE, name: String(body.name ?? D.VENUE.name) };
      return D.VENUE;
    }
    return D.VENUE;
  }

  // ---- Manager: /api/shifts* ---------------------------------------------
  if (s[1] === "shifts") {
    if (s[2] === "days") return D.SHIFTS_WITH_DAYS; // /api/shifts/days
    if (s[2] && s[3] === "days") {
      if (method === "PUT") return { shift_id: s[2], days: body.days ?? D.SHIFT_SCHEDULES[s[2]]?.days ?? [] };
      return D.SHIFT_SCHEDULES[s[2]] ?? D.SHIFT_SCHEDULES.eve;
    }
    if (s[2]) {
      if (method === "DELETE") return { status: "ok" };
      const base = D.SHIFTS.find((x) => x.id === s[2]) ?? D.SHIFTS[0];
      return { ...base, ...body };
    }
    if (method === "POST") return { ...D.SHIFTS[0], id: `new-${Date.now()}`, ...body };
    return D.SHIFTS;
  }

  // ---- Manager: /api/staff* ----------------------------------------------
  if (s[1] === "staff") {
    if (s[2] === "remind") return { reminded: 1, emailed: [{ id: "s5", name: "Jordan Blake" }], failed: [], skipped_no_email: [] };
    if (s[2]) {
      const found = D.STAFF.find((x) => x.id === s[2]) ?? D.STAFF[0];
      const action = s[3];
      if (action === "reject" || action === "erase") return { status: "ok" };
      if (action === "reset-pin") return { ...found, pin: "9999" };
      if (action === "approve") return { ...found, pending: false, ...body };
      if (method === "DELETE") return { status: "ok" };
      return { ...found, ...body };
    }
    if (method === "POST") return { ...D.STAFF[0], id: `new-${Date.now()}`, pending: false, submitted: false, ...body, role_ids: (body.role_ids as string[]) ?? [] };
    return D.STAFF;
  }

  // ---- Manager: /api/roles* ----------------------------------------------
  if (s[1] === "roles") {
    if (s[2]) {
      if (method === "DELETE") return { status: "ok" };
      const found = D.ROLES.find((x) => x.id === s[2]) ?? D.ROLES[0];
      return { ...found, ...body };
    }
    if (method === "POST") return { id: `r-new-${Date.now()}`, name: String(body.name ?? "Role"), icon: String(body.icon ?? "users"), sort_order: D.ROLES.length, staff_ids: (body.staff_ids as string[]) ?? [] };
    return D.ROLES;
  }

  // ---- Manager: /api/periods ---------------------------------------------
  if (s[1] === "periods") {
    if (method === "POST") return { id: `p-new-${Date.now()}`, week_start: String(body.week_start), status: "collecting" };
    return D.PERIODS;
  }

  if (s[1] === "activity") return D.ACTIVITY;

  // ---- Manager: /api/rules -----------------------------------------------
  if (s[1] === "rules") return method === "PUT" ? { ...D.RULES, ...body } : D.RULES;

  // ---- Manager: /api/scheduler* ------------------------------------------
  if (s[1] === "scheduler") {
    if (s[2] === "override") {
      if (method === "DELETE") return D.SCHEDULER;
      return { status: "saved", notice_hours: 78, legal_notice_hours: 72, config: D.SCHEDULER };
    }
    if (method === "PUT") return { ...D.SCHEDULER, ...body, status: "saved" };
    return D.SCHEDULER;
  }

  // ---- Manager: /api/rota/{id}/* -----------------------------------------
  if (s[1] === "rota" && s[2]) {
    const action = s[3];
    if (!action) return D.ROTA_SUMMARY; // GET /api/rota/{id}
    if (action === "generate" || action === "copy-previous") return D.ROTA_SUMMARY;
    if (action === "publish") return { ...D.ROTA_SUMMARY, status: "published", email: { sent: 5, failed: 0, skipped_no_email: 1, errors: [] } };
    if (action === "unpublish") return { ...D.ROTA_SUMMARY, status: "generated" };
    if (action === "reopen") return { ...D.ROTA_SUMMARY, status: "collecting" };
    if (action === "assignments") {
      if (s[4] === "open") return D.ROTA_SUMMARY; // POST or DELETE .../open[/id]
      return { status: "saved", reason: null, summary: D.ROTA_SUMMARY }; // PUT edit
    }
    if (action === "submissions") return s[4] ? D.ROTA_SUMMARY : { period_id: s[2], submissions: [] };
    if (action === "claims") return s[4] ? { status: "approved", reason: null, summary: D.ROTA_SUMMARY, claims: [] } : { period_id: s[2], claims: [] };
    if (action === "swaps") return s[4] ? { status: "approved", reason: null, summary: D.ROTA_SUMMARY, swaps: [] } : { period_id: s[2], swaps: [] };
    if (action === "email") return { sent: 5, failed: 0, skipped_no_email: 1, errors: [] };
    if (action === "export.pdf" || action === "export.xlsx") return json({ status: "unavailable in preview" }, 200);
    return D.ROTA_SUMMARY;
  }

  // ---- Manager: /api/leave (list) and /api/leave/{id}/decide -------------
  if (s[1] === "leave") {
    if (s[2]) {
      // /api/leave/{id}/approve|reject
      const found = D.LEAVE_REQUESTS.find((x) => x.id === s[2]) ?? D.LEAVE_REQUESTS[0];
      return { ...found, status: s[3] === "reject" ? "rejected" : "approved", manager_note: (body.manager_note as string) ?? null, decided_at: new Date().toISOString() };
    }
    return { requests: D.LEAVE_REQUESTS };
  }

  // Anything else under /api — empty success so nothing throws.
  return {};
}
