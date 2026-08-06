"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import AdminRotaView from "@/components/admin-rota-view";
import Modal from "@/components/modal";
import Toast from "@/components/toast";
import {
  AdminApiError,
  AdminVenueDetail,
  AdminVenueRota,
  adminGenerateRota,
  adminResetPin,
  createSupportLoginLink,
  deleteAdminVenue,
  getAdminVenueDetail,
  getAdminVenueRota,
  setVenueActive,
} from "@/lib/admin-api";
import { formatWeekRange } from "@/lib/utils";

export default function AdminVenueDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const venueId = params.id;

  const [venue, setVenue] = useState<AdminVenueDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [rota, setRota] = useState<AdminVenueRota | null>(null);
  const [rotaLoading, setRotaLoading] = useState(false);
  const [showRota, setShowRota] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [loginLink, setLoginLink] = useState<string | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    getAdminVenueDetail(venueId)
      .then((res) => {
        if (!cancelled) setVenue(res);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [venueId, reloadToken]);

  function copyLink() {
    if (!venue) return;
    navigator.clipboard.writeText(`${window.location.origin}/v/${venue.link_token}`);
    showToast("Link copied!");
  }

  async function handleGenerate() {
    if (!venue) return;
    setGenerating(true);
    try {
      await adminGenerateRota(venue.id);
      showToast("Solver triggered — rota regenerated");
      setRota(null); // cached view is now stale
      setReloadToken((n) => n + 1);
    } catch (err) {
      showToast(err instanceof AdminApiError ? err.message : "Could not trigger solver");
    } finally {
      setGenerating(false);
    }
  }

  async function handleViewRota() {
    if (showRota) {
      setShowRota(false);
      return;
    }
    setShowRota(true);
    if (rota) return;
    setRotaLoading(true);
    try {
      setRota(await getAdminVenueRota(venueId));
    } catch (err) {
      showToast(err instanceof AdminApiError ? err.message : "Could not load rota");
      setShowRota(false);
    } finally {
      setRotaLoading(false);
    }
  }

  async function handleToggleActive() {
    if (!venue) return;
    const next = !venue.is_active;
    if (!next && !confirm(`Disable ${venue.name}? Manager and staff access will be blocked immediately.`)) {
      return;
    }
    setTogglingActive(true);
    try {
      const updated = await setVenueActive(venue.id, next);
      setVenue(updated);
      showToast(next ? "Venue enabled" : "Venue disabled");
    } catch (err) {
      showToast(err instanceof AdminApiError ? err.message : "Could not update venue");
    } finally {
      setTogglingActive(false);
    }
  }

  async function handleSupportLogin() {
    if (!venue) return;
    setLinkLoading(true);
    try {
      const res = await createSupportLoginLink(venue.id);
      setLoginLink(res.login_url);
    } catch (err) {
      showToast(err instanceof AdminApiError ? err.message : "Could not create login link");
    } finally {
      setLinkLoading(false);
    }
  }

  async function handleDelete() {
    if (!venue || deleteConfirm !== venue.name) return;
    setDeleting(true);
    try {
      await deleteAdminVenue(venue.id);
      router.push("/admin");
    } catch (err) {
      showToast(err instanceof AdminApiError ? err.message : "Could not delete venue");
      setDeleting(false);
    }
  }

  async function handleResetPin(staffId: string, name: string) {
    try {
      const updated = await adminResetPin(staffId);
      setVenue((v) =>
        v ? { ...v, staff: v.staff.map((s) => (s.id === staffId ? { ...s, pin: updated.pin } : s)) } : v,
      );
      showToast(`New PIN for ${name.split(" ")[0]}: ${updated.pin}`);
    } catch {
      showToast("Could not reset PIN");
    }
  }

  if (loading) {
    return <div className="p-10 text-center text-sm text-ink-muted">Loading…</div>;
  }

  if (error || !venue) {
    return <div className="p-10 text-center text-sm text-ink-muted">Could not load venue.</div>;
  }

  return (
    <div>
      <Link href="/admin" className="mb-4 inline-block text-[13px] font-medium text-accent">
        ← Back to venues
      </Link>
      <div className="mb-1 flex flex-wrap items-center gap-2.5">
        <span className="text-2xl font-bold text-ink">{venue.name}</span>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            venue.is_active ? "bg-avail-bg text-avail-text" : "bg-unavail-bg text-unavail-text"
          }`}
        >
          {venue.is_active ? "Active" : "Inactive"}
        </span>
      </div>
      <div className="mb-6 text-sm text-ink-faint">
        {venue.manager_email} · created {new Date(venue.created_at).toLocaleDateString()}
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-panel border border-hairline bg-surface-card p-5">
        <div className="min-w-[220px] flex-1">
          <div className="mb-1 text-xs text-ink-faint">Venue link</div>
          <div className="truncate text-sm text-ink-label">
            {typeof window !== "undefined" ? `${window.location.origin}/v/${venue.link_token}` : venue.link_token}
          </div>
        </div>
        <button onClick={copyLink} className="rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-white">
          Copy
        </button>
        <button
          onClick={handleGenerate}
          disabled={generating || !venue.period}
          className="rounded-lg border border-hairline bg-surface-card px-3.5 py-2 text-xs font-semibold text-ink-muted disabled:opacity-50"
        >
          {generating ? "Running solver…" : "Trigger solver"}
        </button>
        <button
          onClick={handleViewRota}
          className="rounded-lg border border-hairline bg-surface-card px-3.5 py-2 text-xs font-semibold text-ink-muted"
        >
          {showRota ? "Hide rota" : "View rota"}
        </button>
        <button
          onClick={handleSupportLogin}
          disabled={linkLoading}
          className="rounded-lg border border-hairline bg-surface-card px-3.5 py-2 text-xs font-semibold text-ink-muted disabled:opacity-50"
        >
          {linkLoading ? "Creating…" : "Support login"}
        </button>
        <button
          onClick={handleToggleActive}
          disabled={togglingActive}
          className={`rounded-lg px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50 ${
            venue.is_active ? "bg-unavail-text" : "bg-avail-text"
          }`}
        >
          {togglingActive ? "Saving…" : venue.is_active ? "Disable venue" : "Enable venue"}
        </button>
      </div>

      {showRota && (
        <div className="mb-6 overflow-hidden rounded-panel border border-hairline bg-surface-card">
          <div className="flex items-center justify-between border-b border-surface-page px-5 py-3">
            <div className="text-sm font-bold text-ink">
              Current rota{rota?.period ? ` · ${formatWeekRange(rota.period.week_start)}` : ""}
            </div>
            {rota?.summary && rota.summary.conflicts > 0 && (
              <span className="rounded-full bg-unavail-bg px-2.5 py-1 text-[11px] font-semibold text-unavail-text">
                {rota.summary.conflicts} conflict{rota.summary.conflicts === 1 ? "" : "s"}
              </span>
            )}
          </div>
          {rotaLoading ? (
            <div className="p-6 text-center text-sm text-ink-muted">Loading rota…</div>
          ) : !rota?.period ? (
            <div className="p-6 text-center text-sm text-ink-faint">
              This venue has no rota period yet.
            </div>
          ) : (
            <div className="p-3">
              <AdminRotaView rota={rota} />
            </div>
          )}
        </div>
      )}

      {venue.period && (
        <div className="mb-6 text-sm text-ink-muted">
          Current period: {formatWeekRange(venue.period.week_start)} —{" "}
          <span className="font-semibold text-ink-label">{venue.period.status}</span>
        </div>
      )}

      <div className="mb-3 text-base font-bold text-ink">Staff ({venue.staff.length})</div>
      <div className="overflow-hidden rounded-panel border border-hairline bg-surface-card">
        {venue.staff.length === 0 ? (
          <div className="p-10 text-center text-sm text-ink-faint">No staff yet.</div>
        ) : (
          venue.staff.map((s, i) => (
            <div
              key={s.id}
              className={`flex flex-wrap items-center gap-3 px-5 py-3.5 ${
                i < venue.staff.length - 1 ? "border-b border-surface-page" : ""
              } ${s.is_active ? "" : "opacity-50"}`}
            >
              <div className="min-w-[160px] flex-1">
                <div className="text-sm font-semibold text-ink">{s.name}</div>
                <div className="text-xs text-ink-faint">
                  {s.email || "No email"} · {s.role}
                </div>
              </div>
              <div className="w-20 rounded-md bg-surface-page px-2 py-1 text-center text-[11px] font-bold tracking-wide text-ink-label">
                {s.pin}
              </div>
              {s.submitted !== null && (
                <div
                  className={`w-24 rounded-md px-2.5 py-1 text-center text-[11px] font-semibold ${
                    s.submitted ? "bg-avail-bg text-avail-text" : "bg-warn-bg text-warn-text"
                  }`}
                >
                  {s.submitted ? "Submitted" : "Pending"}
                </div>
              )}
              <button
                onClick={() => handleResetPin(s.id, s.name)}
                className="rounded-lg bg-surface-subtle px-3 py-1.5 text-xs font-medium text-ink-muted"
              >
                Reset PIN
              </button>
            </div>
          ))
        )}
      </div>

      <div className="mt-8 rounded-panel border border-unavail-border bg-unavail-bg p-5">
        <div className="mb-1 text-sm font-bold text-unavail-text">Danger zone</div>
        <div className="mb-3 text-[13px] text-unavail-text">
          Permanently delete this venue and all its data — staff, shifts, periods, availability,
          rota assignments and activity. This cannot be undone.
        </div>
        <button
          onClick={() => {
            setDeleteConfirm("");
            setDeleteOpen(true);
          }}
          className="rounded-lg bg-unavail-text px-3.5 py-2 text-xs font-semibold text-white"
        >
          Delete venue
        </button>
      </div>

      <Modal open={!!loginLink} onClose={() => setLoginLink(null)} title="Support login link">
        <div className="mb-3 text-[13px] text-ink-muted">
          One-time link that signs you in as{" "}
          <span className="font-semibold text-ink">{venue.manager_email}</span> for support. Open it
          in a private window and don&apos;t share it — it grants access to their account.
        </div>
        <div className="mb-4 break-all rounded-[10px] border border-hairline bg-surface-subtle px-3.5 py-2.5 text-[12px] text-ink-label">
          {loginLink}
        </div>
        <div className="flex gap-2.5">
          <button
            onClick={() => {
              if (loginLink) navigator.clipboard.writeText(loginLink);
              showToast("Link copied");
            }}
            className="flex-1 rounded-xl bg-accent py-3.5 text-center text-sm font-semibold text-white"
          >
            Copy link
          </button>
          <a
            href={loginLink ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="flex-1 rounded-xl bg-surface-subtle py-3.5 text-center text-sm font-semibold text-ink-muted"
          >
            Open
          </a>
        </div>
      </Modal>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete venue">
        <div className="mb-3 text-[13px] text-ink-muted">
          This permanently removes <span className="font-semibold text-ink">{venue.name}</span> and
          every record tied to it. To confirm, type the venue name below.
        </div>
        <input
          value={deleteConfirm}
          onChange={(e) => setDeleteConfirm(e.target.value)}
          placeholder={venue.name}
          autoFocus
          className="mb-4 w-full rounded-[10px] border-[1.5px] border-unset-border px-3.5 py-2.5 text-sm outline-none focus:border-accent"
        />
        <div className="flex gap-2.5">
          <button
            onClick={() => setDeleteOpen(false)}
            className="flex-1 rounded-xl bg-unset-bg py-3.5 text-center text-sm font-semibold text-ink-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting || deleteConfirm !== venue.name}
            className="flex-1 rounded-xl bg-unavail-text py-3.5 text-center text-sm font-semibold text-white disabled:opacity-40"
          >
            {deleting ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </Modal>

      <Toast message={toast} />
    </div>
  );
}
