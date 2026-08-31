"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import Modal from "@/components/modal";
import StatusBanner from "@/components/status-banner";
import Toast from "@/components/toast";
import {
  AdminApiError,
  AdminStats,
  AdminVenue,
  addAdminManager,
  getAdminStats,
  listAdminVenues,
  resendPendingManagerLoginLink,
} from "@/lib/admin-api";
import Mark from "@/components/mark";
import Waiting from "@/components/waiting";

// A live venue with no activity in the last 14 days is worth a nudge.
const STALE_DAYS = 14;
function isStale(lastActiveAt: string | null): boolean {
  if (!lastActiveAt) return false;
  const last = new Date(lastActiveAt).getTime();
  return Date.now() - last > STALE_DAYS * 24 * 60 * 60 * 1000;
}

type StatusFilter = "all" | "active" | "inactive" | "stale" | "pending";

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "inactive", label: "Inactive" },
  { key: "stale", label: "Stale" },
  { key: "pending", label: "Pending" },
];

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function AdminVenuesPage() {
  const [venues, setVenues] = useState<AdminVenue[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [resendingFor, setResendingFor] = useState<string | null>(null);
  const [loginLink, setLoginLink] = useState<{ email: string; url: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    listAdminVenues()
      .then((res) => {
        if (!cancelled) setVenues(res);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    // Stats are best-effort — a failure here shouldn't blank the whole page.
    getAdminStats()
      .then((res) => {
        if (!cancelled) setStats(res);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  function openModal() {
    setEmail("");
    setFormError(null);
    setResult(null);
    setModalOpen(true);
  }

  async function handleCreate() {
    if (!email.includes("@")) {
      setFormError("Enter a valid email address.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await addAdminManager(email.trim());
      setResult(
        `Account created for ${res.email}. Ask them to sign in at ${res.login_url} with this email — no password needed.`,
      );
      showToast("Manager account created");
      setReloadToken((n) => n + 1);
    } catch (err) {
      setFormError(err instanceof AdminApiError ? err.message : "Could not create the account.");
    } finally {
      setSaving(false);
    }
  }

  async function handleResendLink(email: string) {
    setResendingFor(email);
    try {
      const res = await resendPendingManagerLoginLink(email);
      setLoginLink({ email, url: res.login_url });
    } catch (err) {
      showToast(err instanceof AdminApiError ? err.message : "Could not create login link");
    } finally {
      setResendingFor(null);
    }
  }

  const query = search.trim().toLowerCase();
  const filteredVenues = venues.filter((v) => {
    if (query) {
      const haystack = `${v.pending ? "" : v.name} ${v.manager_email}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    switch (statusFilter) {
      case "active":
        return !v.pending && v.is_active;
      case "inactive":
        return !v.pending && !v.is_active;
      case "stale":
        return !v.pending && isStale(v.last_active_at);
      case "pending":
        return v.pending;
      default:
        return true;
    }
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <Mark spinning className="h-6 w-6 text-ink-faint" />
        <div className="text-sm text-ink-muted">Loading venues…</div>
      </div>
    );
  }

  if (error) {
    return <div className="p-10 text-center text-sm text-ink-muted">Could not load venues.</div>;
  }

  return (
    <div className="animate-fadeIn">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[13px] font-medium text-ink-faint">Every pub, one place</div>
          <div className="font-display text-[26px] font-bold text-ink md:text-[28px]">Venues</div>
        </div>
        <button
          onClick={openModal}
          className="rounded-[10px] bg-accent px-4 py-2.5 text-[13px] font-semibold text-accent-on transition hover:bg-accent-hover"
        >
          + Add manager
        </button>
      </div>

      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <Stat label="Venues" value={stats.total_venues} />
          <Stat label="Active" value={stats.active_venues} />
          <Stat label="Inactive" value={stats.inactive_venues} tone={stats.inactive_venues > 0 ? "warn" : undefined} />
          <Stat label="Stale" value={stats.stale_venues} tone={stats.stale_venues > 0 ? "warn" : undefined} />
          <Stat label="Staff" value={stats.total_staff} />
          <Stat label="Open weeks" value={stats.open_periods} />
          <Stat label="Published" value={stats.published_rotas} />
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="min-w-[220px] flex-1 rounded-[10px] border-[1.5px] border-unset-border bg-surface-card px-3.5 py-2 text-sm outline-none focus:border-accent"
        />
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${
                statusFilter === f.key
                  ? "bg-accent text-accent-on"
                  : "border border-hairline bg-surface-card text-ink-muted hover:bg-surface-subtle"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-panel border border-hairline bg-surface-card">
        {venues.length === 0 ? (
          <div className="p-10 text-center text-sm text-ink-faint">No venues yet.</div>
        ) : filteredVenues.length === 0 ? (
          <div className="p-10 text-center text-sm text-ink-faint">No venues match your search.</div>
        ) : (
          filteredVenues.map((v, i) => {
            const border = i < filteredVenues.length - 1 ? "border-b border-surface-page" : "";
            const inner = (
              <>
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-[11px] font-bold ${
                    v.pending ? "bg-warn-bg text-warn-text" : "bg-accent-light text-accent"
                  }`}
                >
                  {initials(v.pending ? v.manager_email : v.name)}
                </div>
                <div className="min-w-[180px] flex-1">
                  <div className="text-sm font-semibold text-ink">
                    {v.pending ? v.manager_email : v.name}
                  </div>
                  <div className="text-xs text-ink-faint">{v.manager_email}</div>
                </div>
                <div className="w-32 text-xs text-ink-muted">
                  {new Date(v.created_at).toLocaleDateString()}
                </div>
                <div className="w-20 text-xs text-ink-muted">{v.staff_count} staff</div>
                <div className="flex w-44 flex-wrap items-center gap-1.5">
                  {!v.pending && !v.is_active && (
                    <span className="inline-block rounded-full bg-unavail-bg px-2.5 py-1 text-[11px] font-semibold text-unavail-text">
                      Inactive
                    </span>
                  )}
                  {v.pending ? (
                    <span className="inline-block rounded-full bg-warn-bg px-2.5 py-1 text-[11px] font-semibold text-warn-text">
                      Awaiting onboarding
                    </span>
                  ) : v.period_status ? (
                    <StatusBanner status={v.period_status} />
                  ) : (
                    <span className="text-xs text-ink-faint">No period</span>
                  )}
                  {!v.pending && isStale(v.last_active_at) && (
                    <span className="inline-block rounded-full bg-surface-page px-2.5 py-1 text-[11px] font-semibold text-ink-faint">
                      Stale
                    </span>
                  )}
                </div>
              </>
            );

            // Pending managers have no venue to drill into yet — render a
            // non-clickable row until they finish onboarding.
            return v.pending ? (
              <div key={v.id} className={`flex flex-wrap items-center gap-3 px-5 py-4 ${border}`}>
                {inner}
                <button
                  onClick={() => handleResendLink(v.manager_email)}
                  disabled={resendingFor === v.manager_email}
                  className="rounded-lg border border-hairline bg-surface-card px-3 py-1.5 text-xs font-medium text-ink-muted disabled:opacity-50"
                >
                  {resendingFor === v.manager_email ? "Creating…" : "Resend login link"}
                </button>
              </div>
            ) : (
              <Link
                key={v.id}
                href={`/admin/venues/${v.id}`}
                className={`flex flex-wrap items-center gap-3 px-5 py-4 transition hover:bg-surface-subtle ${border} ${
                  v.is_active ? "" : "opacity-60"
                }`}
              >
                {inner}
              </Link>
            );
          })
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add manager">
        {result ? (
          <div>
            <div className="mb-5 rounded-input border border-avail-border bg-avail-bg px-3.5 py-3 text-[13px] text-avail-text">
              {result}
            </div>
            <button
              onClick={() => setModalOpen(false)}
              className="w-full rounded-xl bg-accent py-3.5 text-center text-sm font-semibold text-accent-on"
            >
              Done
            </button>
          </div>
        ) : (
          <div>
            <div className="mb-3 text-[13px] text-ink-muted">
              Creates a confirmed account so this manager can sign in with a login code and run
              onboarding. No public signup needed.
            </div>
            <div className="mb-1 text-xs font-semibold text-ink-label">Manager email</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="manager@theirpub.co.uk"
              type="email"
              autoFocus
              className="mb-3 w-full rounded-[10px] border-[1.5px] border-unset-border px-3.5 py-2.5 text-sm outline-none focus:border-accent"
            />
            {formError && <div className="mb-3 text-[13px] text-unavail-text">{formError}</div>}
            <div className="flex gap-2.5">
              <button
                onClick={() => setModalOpen(false)}
                className="flex-1 rounded-xl bg-unset-bg py-3.5 text-center text-sm font-semibold text-ink-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="flex-1 rounded-xl bg-accent py-3.5 text-center text-sm font-semibold text-accent-on disabled:opacity-60"
              >
                {saving ? <Waiting label="Creating…" /> : "Create account"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!loginLink} onClose={() => setLoginLink(null)} title="Invite sent">
        <div className="mb-4 flex flex-col items-center text-center">
          <div className="cp-pop-in mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-avail-bg text-avail-text">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <div className="text-[15px] font-semibold text-ink">Onboarding link emailed</div>
          <div className="mt-1 text-[13px] text-ink-muted">
            We sent a one-time sign-in link to{" "}
            <span className="font-semibold text-ink">{loginLink?.email}</span>. It works for 7 days.
          </div>
        </div>
        <div className="mb-3 rounded-[10px] border border-hairline bg-surface-subtle px-3.5 py-2.5 text-[12px] text-ink-muted">
          Not received? Emails only deliver reliably once the Resend domain is verified. You can copy
          the link below and send it to them directly — don&apos;t share it anywhere public.
        </div>
        <div className="mb-4 break-all rounded-[10px] border border-hairline bg-surface-subtle px-3.5 py-2.5 text-[12px] text-ink-label">
          {loginLink?.url}
        </div>
        <button
          onClick={() => {
            if (loginLink) navigator.clipboard.writeText(loginLink.url);
            showToast("Link copied");
          }}
          className="w-full rounded-xl border border-hairline py-3 text-center text-sm font-semibold text-ink"
        >
          Copy link instead
        </button>
      </Modal>

      <Toast message={toast} />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <div className="rounded-panel border border-hairline bg-surface-card p-4 transition hover:border-accent-border">
      <div className={`text-2xl font-bold md:text-[26px] ${tone === "warn" ? "text-warn-text" : "text-ink"}`}>
        {value}
      </div>
      <div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-ink-faint">{label}</div>
    </div>
  );
}
