"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import Toast from "@/components/toast";
import {
  AdminApiError,
  AdminVenueDetail,
  adminGenerateRota,
  adminResetPin,
  getAdminVenueDetail,
} from "@/lib/admin-api";
import { formatWeekRange } from "@/lib/utils";

export default function AdminVenueDetailPage() {
  const params = useParams<{ id: string }>();
  const venueId = params.id;

  const [venue, setVenue] = useState<AdminVenueDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

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
      setReloadToken((n) => n + 1);
    } catch (err) {
      showToast(err instanceof AdminApiError ? err.message : "Could not trigger solver");
    } finally {
      setGenerating(false);
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
      <div className="mb-1 text-2xl font-bold text-ink">{venue.name}</div>
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
      </div>

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

      <Toast message={toast} />
    </div>
  );
}
