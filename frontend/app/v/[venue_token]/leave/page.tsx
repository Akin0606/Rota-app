"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import Modal from "@/components/modal";
import Toast from "@/components/toast";
import {
  ApiError,
  LeaveRequest,
  authenticatePin,
  cancelLeaveRequest,
  myLeaveRequests,
  requestLeave,
} from "@/lib/api";
import { parseISODate, pinStorageKey } from "@/lib/utils";

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  pending: { label: "Pending", bg: "bg-warn-bg", text: "text-warn-text" },
  approved: { label: "Approved", bg: "bg-avail-bg", text: "text-avail-text" },
  rejected: { label: "Rejected", bg: "bg-unavail-bg", text: "text-unavail-text" },
  cancelled: { label: "Cancelled", bg: "bg-unset-bg", text: "text-unset-text" },
};

function formatDateRange(startIso: string, endIso: string): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const start = parseISODate(startIso);
  if (startIso === endIso) return fmt(start);
  return `${fmt(start)} – ${fmt(parseISODate(endIso))}`;
}

function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function LeavePage({ params }: { params: { venue_token: string } }) {
  const { venue_token } = params;
  const router = useRouter();

  const [pin, setPin] = useState<string | null>(null);
  const [venueName, setVenueName] = useState<string | null>(null);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [cancelTarget, setCancelTarget] = useState<LeaveRequest | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    const storedPin = sessionStorage.getItem(pinStorageKey(venue_token));
    if (!storedPin) {
      router.replace(`/v/${venue_token}`);
      return;
    }
    setPin(storedPin);

    Promise.all([authenticatePin(venue_token, storedPin), myLeaveRequests(venue_token, storedPin)])
      .then(([auth, mine]) => {
        setVenueName(auth.venue_name);
        setRequests(mine.requests);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          sessionStorage.removeItem(pinStorageKey(venue_token));
          router.replace(`/v/${venue_token}?expired=1`);
          return;
        }
        setError(err instanceof ApiError ? err.message : "Something went wrong");
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venue_token]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function submitRequest() {
    if (!pin || !startDate || !endDate) return;
    setSubmitting(true);
    try {
      const created = await requestLeave(venue_token, pin, startDate, endDate, reason.trim() || null);
      setRequests((prev) => [created, ...prev]);
      setStartDate("");
      setEndDate("");
      setReason("");
      showToast("Leave requested — your manager will review it");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not submit this request");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmCancel() {
    if (!pin || !cancelTarget) return;
    setCancelling(true);
    try {
      const updated = await cancelLeaveRequest(venue_token, pin, cancelTarget.id);
      setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setCancelTarget(null);
      showToast("Request cancelled");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not cancel this request");
    } finally {
      setCancelling(false);
    }
  }

  if (loading) return <CenteredMessage>Loading…</CenteredMessage>;
  if (error) return <CenteredMessage>{error}</CenteredMessage>;

  const today = todayISO();
  const canCancel = (r: LeaveRequest) =>
    r.status === "pending" || (r.status === "approved" && r.start_date >= today);

  return (
    <div className="mx-auto max-w-[420px] py-4">
      <div className="mx-4 animate-fadeIn overflow-hidden rounded-card bg-surface shadow-card">
        <div className="px-6 pb-7 pt-5">
          <Link href={`/v/${venue_token}/hub`} className="text-[13px] font-semibold text-accent">
            ← Hub
          </Link>
          <div className="py-2 pb-4 text-center">
            <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">{venueName}</div>
            <div className="mt-1 text-[22px] font-bold text-ink">Request Time Off</div>
          </div>

          <div className="mb-6 rounded-panel border border-hairline bg-surface-card p-4">
            <div className="mb-3 flex gap-3">
              <label className="flex-1 text-xs font-semibold text-ink-faint">
                From
                <input
                  type="date"
                  value={startDate}
                  min={today}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mt-1.5 w-full rounded-[10px] border border-unset-border bg-surface-page px-2.5 py-2 text-sm text-ink outline-none"
                />
              </label>
              <label className="flex-1 text-xs font-semibold text-ink-faint">
                To
                <input
                  type="date"
                  value={endDate}
                  min={startDate || today}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="mt-1.5 w-full rounded-[10px] border border-unset-border bg-surface-page px-2.5 py-2 text-sm text-ink outline-none"
                />
              </label>
            </div>
            <label className="mb-3 block text-xs font-semibold text-ink-faint">
              Reason (optional)
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="e.g. family holiday"
                className="mt-1.5 w-full resize-none rounded-[10px] border border-unset-border bg-surface-page px-2.5 py-2 text-sm text-ink outline-none placeholder:text-ink-faint"
              />
            </label>
            <button
              onClick={submitRequest}
              disabled={submitting || !startDate || !endDate}
              className="w-full rounded-control bg-accent py-2.5 text-center text-sm font-semibold text-white disabled:opacity-50"
            >
              {submitting ? "Sending…" : "Submit request"}
            </button>
          </div>

          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">Your requests</div>
          {requests.length === 0 ? (
            <div className="rounded-panel border border-hairline bg-surface-subtle p-4 text-center text-sm text-ink-muted">
              You haven&apos;t requested any time off yet.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {requests.map((r) => {
                const status = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.pending;
                return (
                  <div key={r.id} className="rounded-panel border border-hairline bg-surface-card p-3.5">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-ink">{formatDateRange(r.start_date, r.end_date)}</span>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${status.bg} ${status.text}`}>
                        {status.label}
                      </span>
                    </div>
                    {r.reason && <div className="mb-1 text-[13px] text-ink-muted">{r.reason}</div>}
                    {r.manager_note && (
                      <div className="mb-1 text-[12px] italic text-ink-faint">Manager note: {r.manager_note}</div>
                    )}
                    {canCancel(r) && (
                      <button
                        onClick={() => setCancelTarget(r)}
                        className="mt-1.5 rounded-lg border border-unavail-border bg-surface-card px-3 py-1.5 text-[12px] font-semibold text-unavail-text"
                      >
                        Cancel request
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Modal open={cancelTarget !== null} onClose={() => setCancelTarget(null)} title="Cancel this request?">
        {cancelTarget && (
          <>
            <div className="mb-5 text-sm leading-relaxed text-ink-muted">
              {formatDateRange(cancelTarget.start_date, cancelTarget.end_date)} will no longer be held as time off.
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setCancelTarget(null)}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-muted"
              >
                Keep it
              </button>
              <button
                onClick={confirmCancel}
                disabled={cancelling}
                className="rounded-xl bg-unavail-text px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {cancelling ? "Cancelling…" : "Cancel request"}
              </button>
            </div>
          </>
        )}
      </Modal>

      <Toast message={toast} />
    </div>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-[420px] items-center justify-center px-6 py-24 text-center text-sm text-ink-muted">
      {children}
    </div>
  );
}
