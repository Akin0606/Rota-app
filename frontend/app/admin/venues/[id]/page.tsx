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
  CompReason,
  adminGenerateRota,
  adminUnpublishRota,
  adminResetPin,
  createSupportLoginLink,
  deleteAdminVenue,
  exportAdminVenue,
  getAdminVenueDetail,
  getAdminVenueRota,
  setVenueActive,
  setVenueComp,
  setVenueNotes,
  setVenueTrialEnd,
} from "@/lib/admin-api";
import { formatWeekRange } from "@/lib/utils";
import Mark from "@/components/mark";
import Waiting from "@/components/waiting";

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const COMP_REASONS: { value: CompReason; label: string }[] = [
  { value: "pilot", label: "Pilot venue" },
  { value: "friends_family", label: "Friends & family" },
  { value: "goodwill", label: "Goodwill / write-off" },
  { value: "other", label: "Other" },
];

const STATUS_LABELS: Record<string, string> = {
  trialing: "On trial",
  active: "Paying",
  past_due: "Past due",
  cancelled: "Cancelled",
  expired: "Expired",
};

// Tone by billing status: green = healthy/paying, amber = attention (trial/past
// due), red = lapsed. Matches the coverage-colour discipline used elsewhere.
function statusChipClass(status: string): string {
  if (status === "active") return "bg-avail-bg text-avail-text";
  if (status === "trialing" || status === "past_due") return "bg-warn-bg text-warn-text";
  return "bg-unavail-bg text-unavail-text";
}

function reasonLabel(reason: string | null): string {
  return COMP_REASONS.find((r) => r.value === reason)?.label ?? reason ?? "—";
}

export default function AdminVenueDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const venueId = params.id;

  const [venue, setVenue] = useState<AdminVenueDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
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
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [compOpen, setCompOpen] = useState(false);
  const [compReason, setCompReason] = useState<CompReason>("pilot");
  const [compUntil, setCompUntil] = useState(""); // yyyy-mm-dd, "" = forever
  const [savingComp, setSavingComp] = useState(false);
  const [trialEdit, setTrialEdit] = useState(false);
  const [trialDraft, setTrialDraft] = useState(""); // yyyy-mm-dd
  const [savingTrial, setSavingTrial] = useState(false);
  const [exporting, setExporting] = useState(false);

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
        if (!cancelled) {
          setVenue(res);
          setNotesDraft(res.admin_notes ?? "");
        }
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

  const notesDirty = venue !== null && notesDraft !== (venue.admin_notes ?? "");

  async function handleSaveNotes() {
    if (!venue) return;
    setSavingNotes(true);
    try {
      const updated = await setVenueNotes(venue.id, notesDraft);
      setVenue(updated);
      setNotesDraft(updated.admin_notes ?? "");
      showToast("Notes saved");
    } catch (err) {
      showToast(err instanceof AdminApiError ? err.message : "Could not save notes");
    } finally {
      setSavingNotes(false);
    }
  }

  async function handleComp(exempt: boolean) {
    if (!venue) return;
    setSavingComp(true);
    try {
      const updated = exempt
        ? await setVenueComp(venue.id, {
            exempt: true,
            reason: compReason,
            // A date input gives a local yyyy-mm-dd; send it as end-of-day UTC so
            // "comp until the 30th" covers the whole 30th. "" = comped forever.
            until: compUntil ? `${compUntil}T23:59:59Z` : null,
          })
        : await setVenueComp(venue.id, { exempt: false });
      setVenue(updated);
      setCompOpen(false);
      showToast(exempt ? "Venue comped — free pass on" : "Comp removed");
    } catch (err) {
      showToast(err instanceof AdminApiError ? err.message : "Could not update comp");
    } finally {
      setSavingComp(false);
    }
  }

  async function handleSaveTrialEnd() {
    if (!venue || !trialDraft) return;
    setSavingTrial(true);
    try {
      const updated = await setVenueTrialEnd(venue.id, `${trialDraft}T23:59:59Z`);
      setVenue(updated);
      setTrialEdit(false);
      showToast("Trial end updated");
    } catch (err) {
      showToast(err instanceof AdminApiError ? err.message : "Could not update trial");
    } finally {
      setSavingTrial(false);
    }
  }

  async function handleExport() {
    if (!venue) return;
    setExporting(true);
    try {
      const data = await exportAdminVenue(venue.id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${venue.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-export.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast("Export downloaded");
    } catch (err) {
      showToast(err instanceof AdminApiError ? err.message : "Could not export venue");
    } finally {
      setExporting(false);
    }
  }

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

  // Without this the guard on solving is a dead end for support: once a manager
  // publishes their newest week — the steady state — Trigger solver 400s telling
  // the operator to unpublish first, and the console had no way to do it.
  async function handleUnpublish() {
    if (!venue) return;
    setUnpublishing(true);
    try {
      await adminUnpublishRota(venue.id);
      showToast("Rota unpublished — staff can no longer see it");
      setRota(null);
      setReloadToken((n) => n + 1);
    } catch (err) {
      showToast(err instanceof AdminApiError ? err.message : "Could not unpublish");
    } finally {
      setUnpublishing(false);
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
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <Mark spinning className="h-6 w-6 text-ink-faint" />
        <div className="text-sm text-ink-muted">Loading venue…</div>
      </div>
    );
  }

  if (error || !venue) {
    return <div className="p-10 text-center text-sm text-ink-muted">Could not load venue.</div>;
  }

  return (
    <div className="animate-fadeIn">
      <Link href="/admin" className="mb-4 inline-block text-[13px] font-medium text-accent">
        ← Back to venues
      </Link>
      <div className="mb-6 flex flex-wrap items-center gap-3.5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-accent-light text-sm font-bold text-accent">
          {initials(venue.name)}
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-display text-2xl font-bold text-ink">{venue.name}</span>
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                venue.is_active ? "bg-avail-bg text-avail-text" : "bg-unavail-bg text-unavail-text"
              }`}
            >
              {venue.is_active ? "Active" : "Inactive"}
            </span>
          </div>
          <div className="text-sm text-ink-faint">
            {venue.manager_email} · created {new Date(venue.created_at).toLocaleDateString()}
          </div>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-panel border border-hairline bg-surface-card p-5">
        <div className="min-w-[220px] flex-1">
          <div className="mb-1 text-xs text-ink-faint">Venue link</div>
          <div className="truncate text-sm text-ink-label">
            {typeof window !== "undefined" ? `${window.location.origin}/v/${venue.link_token}` : venue.link_token}
          </div>
        </div>
        <button onClick={copyLink} className="rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-accent-on">
          Copy
        </button>
        <button
          onClick={handleGenerate}
          disabled={generating || !venue.period}
          className="rounded-lg border border-hairline bg-surface-card px-3.5 py-2 text-xs font-semibold text-ink-muted disabled:opacity-50"
        >
          {generating ? <Waiting label="Running solver…" /> : "Trigger solver"}
        </button>
        <button
          onClick={handleUnpublish}
          disabled={unpublishing || !venue.period}
          className="rounded-lg border border-hairline bg-surface-card px-3.5 py-2 text-xs font-semibold text-ink-muted disabled:opacity-50"
        >
          {unpublishing ? <Waiting label="Unpublishing…" /> : "Unpublish"}
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
          {linkLoading ? <Waiting label="Creating…" /> : "Support login"}
        </button>
        <button
          onClick={handleToggleActive}
          disabled={togglingActive}
          className={`rounded-lg px-3.5 py-2 text-xs font-semibold text-status-on disabled:opacity-50 ${
            venue.is_active ? "bg-unavail-text" : "bg-avail-text"
          }`}
        >
          {togglingActive ? <Waiting label="Saving…" /> : venue.is_active ? "Disable venue" : "Enable venue"}
        </button>
      </div>

      <div className="mb-6 rounded-panel border border-hairline bg-surface-card p-5">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Admin notes
          </div>
          {notesDirty && (
            <button
              onClick={handleSaveNotes}
              disabled={savingNotes}
              className="rounded-lg bg-accent px-3 py-1.5 text-[11px] font-semibold text-accent-on disabled:opacity-60"
            >
              {savingNotes ? <Waiting label="Saving…" /> : "Save notes"}
            </button>
          )}
        </div>
        <textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          placeholder="Support context only you can see — e.g. refund requests, onboarding calls, quirks with this venue…"
          rows={3}
          className="w-full resize-y rounded-input border border-hairline bg-surface-subtle px-3.5 py-2.5 text-[13px] text-ink outline-none focus:border-accent"
        />
      </div>

      <div className="mb-6 rounded-panel border border-hairline bg-surface-card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Billing
          </div>
          <div className="flex items-center gap-2">
            {venue.billing_exempt ? (
              <span className="rounded-full bg-accent-light px-2.5 py-1 text-[11px] font-semibold text-accent">
                Comped
              </span>
            ) : (
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusChipClass(
                  venue.effective_status,
                )}`}
              >
                {STATUS_LABELS[venue.effective_status] ?? venue.effective_status}
              </span>
            )}
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                venue.entitled ? "bg-avail-bg text-avail-text" : "bg-unavail-bg text-unavail-text"
              }`}
            >
              {venue.entitled ? "Entitled" : "Locked out"}
            </span>
          </div>
        </div>

        {!venue.entitled && (
          <div className="mb-3 rounded-input border border-unavail-border bg-unavail-bg px-3 py-2 text-[12px] text-unavail-text">
            This venue can&apos;t generate or publish rotas, and its availability
            weeks won&apos;t auto-open. Comp it or fix billing to restore access.
          </div>
        )}

        <div className="mb-3 grid gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2">
          <div className="flex justify-between gap-2">
            <span className="text-ink-faint">Stripe status</span>
            <span className="font-medium text-ink-label">
              {STATUS_LABELS[venue.effective_status] ?? venue.effective_status}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-ink-faint">
              {venue.effective_status === "trialing" ? "Trial ends" : "Renews / ends"}
            </span>
            {trialEdit ? (
              <span className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={trialDraft}
                  onChange={(e) => setTrialDraft(e.target.value)}
                  className="rounded-input border border-hairline bg-surface-subtle px-2 py-1 text-[12px] text-ink outline-none focus:border-accent"
                />
                <button
                  onClick={handleSaveTrialEnd}
                  disabled={savingTrial || !trialDraft}
                  className="rounded-md bg-accent px-2 py-1 text-[11px] font-semibold text-accent-on disabled:opacity-50"
                >
                  {savingTrial ? "…" : "Save"}
                </button>
                <button
                  onClick={() => setTrialEdit(false)}
                  className="text-[11px] font-medium text-ink-faint"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <span className="font-medium text-ink-label">
                  {venue.subscription_ends_at
                    ? new Date(venue.subscription_ends_at).toLocaleDateString()
                    : "—"}
                </span>
                <button
                  onClick={() => {
                    setTrialDraft(
                      venue.subscription_ends_at
                        ? new Date(venue.subscription_ends_at).toISOString().slice(0, 10)
                        : "",
                    );
                    setTrialEdit(true);
                  }}
                  className="text-[11px] font-medium text-accent"
                >
                  Edit
                </button>
              </span>
            )}
          </div>
          {venue.billing_exempt && (
            <>
              <div className="flex justify-between gap-2">
                <span className="text-ink-faint">Comp reason</span>
                <span className="font-medium text-ink-label">
                  {reasonLabel(venue.billing_exempt_reason)}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-ink-faint">Comp until</span>
                <span className="font-medium text-ink-label">
                  {venue.billing_exempt_until
                    ? new Date(venue.billing_exempt_until).toLocaleDateString()
                    : "Forever"}
                </span>
              </div>
            </>
          )}
        </div>

        {venue.billing_exempt ? (
          <button
            onClick={() => handleComp(false)}
            disabled={savingComp}
            className="rounded-lg border border-hairline bg-surface-card px-3.5 py-2 text-xs font-semibold text-ink-muted disabled:opacity-50"
          >
            {savingComp ? <Waiting label="Saving…" /> : "Remove comp"}
          </button>
        ) : (
          <button
            onClick={() => {
              setCompReason("pilot");
              setCompUntil("");
              setCompOpen(true);
            }}
            className="rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-accent-on"
          >
            Give free pass
          </button>
        )}
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

      <div className="mb-3 font-display text-base font-bold text-ink">Staff ({venue.staff.length})</div>
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
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-surface-page text-[10px] font-bold text-ink-faint">
                {initials(s.name)}
              </div>
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
          rota assignments and activity. This cannot be undone. Export a copy first — a delete
          erases staff records with no other backup.
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="rounded-lg border border-unavail-border bg-surface-card px-3.5 py-2 text-xs font-semibold text-unavail-text disabled:opacity-50"
          >
            {exporting ? <Waiting label="Exporting…" /> : "Export data (JSON)"}
          </button>
          <button
            onClick={() => {
              setDeleteConfirm("");
              setDeleteOpen(true);
            }}
            className="rounded-lg bg-unavail-text px-3.5 py-2 text-xs font-semibold text-status-on"
          >
            Delete venue
          </button>
        </div>
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
            className="flex-1 rounded-xl bg-accent py-3.5 text-center text-sm font-semibold text-accent-on"
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

      <Modal open={compOpen} onClose={() => setCompOpen(false)} title="Give a free pass">
        <div className="mb-3 text-[13px] text-ink-muted">
          Comping <span className="font-semibold text-ink">{venue.name}</span> entitles it to the
          full product regardless of Stripe — trials and subscriptions are ignored while the comp
          is on. Stripe billing is never touched.
        </div>
        <label className="mb-1 block text-xs font-semibold text-ink-label">Reason</label>
        <select
          value={compReason}
          onChange={(e) => setCompReason(e.target.value as CompReason)}
          className="mb-3 w-full rounded-input border border-hairline bg-surface-subtle px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
        >
          {COMP_REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <label className="mb-1 block text-xs font-semibold text-ink-label">
          Until (optional — blank = forever)
        </label>
        <input
          type="date"
          value={compUntil}
          onChange={(e) => setCompUntil(e.target.value)}
          className="mb-4 w-full rounded-input border border-hairline bg-surface-subtle px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
        />
        <div className="flex gap-2.5">
          <button
            onClick={() => setCompOpen(false)}
            className="flex-1 rounded-xl bg-unset-bg py-3.5 text-center text-sm font-semibold text-ink-muted"
          >
            Cancel
          </button>
          <button
            onClick={() => handleComp(true)}
            disabled={savingComp}
            className="flex-1 rounded-xl bg-accent py-3.5 text-center text-sm font-semibold text-accent-on disabled:opacity-50"
          >
            {savingComp ? <Waiting label="Saving…" /> : "Comp this venue"}
          </button>
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
            className="flex-1 rounded-xl bg-unavail-text py-3.5 text-center text-sm font-semibold text-status-on disabled:opacity-40"
          >
            {deleting ? <Waiting label="Deleting…" /> : "Delete permanently"}
          </button>
        </div>
      </Modal>

      <Toast message={toast} />
    </div>
  );
}
