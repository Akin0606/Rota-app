"use client";

import { useEffect, useState } from "react";

import LoadingScreen from "@/components/loading-screen";
import Toast from "@/components/toast";
import { ApiError, LeaveRequest, approveLeave, listLeaveRequests, rejectLeave } from "@/lib/api";
import { parseISODate } from "@/lib/utils";

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

export default function LeavePage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    listLeaveRequests()
      .then((res) => {
        if (!cancelled) setRequests(res.requests);
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
  }, [reloadToken]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function handleApprove(r: LeaveRequest) {
    setBusyId(r.id);
    try {
      const updated = await approveLeave(r.id, notes[r.id]?.trim() || undefined);
      setRequests((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      showToast(`Approved ${r.staff_name}'s leave`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not approve this request");
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(r: LeaveRequest) {
    setBusyId(r.id);
    try {
      const updated = await rejectLeave(r.id, notes[r.id]?.trim() || undefined);
      setRequests((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      showToast(`Rejected ${r.staff_name}'s leave`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not reject this request");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <LoadingScreen base="Loading leave requests…" />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 p-10 text-center text-sm text-ink-muted">
        Something went wrong loading leave requests.
        <button
          onClick={() => setReloadToken((n) => n + 1)}
          className="rounded-[10px] bg-accent px-4 py-2 text-[13px] font-semibold text-accent-on"
        >
          Try again
        </button>
      </div>
    );
  }

  const pending = requests
    .filter((r) => r.status === "pending")
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const history = requests
    .filter((r) => r.status !== "pending")
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <div className="animate-fadeIn px-5 py-6 pb-24 md:px-10 md:py-8 md:pb-8">
      <div className="mb-6 text-[26px] font-bold text-ink md:text-[28px]">Leave</div>

      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">
        Pending requests{pending.length > 0 ? ` (${pending.length})` : ""}
      </div>
      {pending.length === 0 ? (
        <div className="mb-8 rounded-panel border border-hairline bg-surface-card p-6 text-center text-sm text-ink-faint">
          Nothing waiting on you.
        </div>
      ) : (
        <div className="mb-8 flex flex-col gap-2.5">
          {pending.map((r) => {
            const busy = busyId === r.id;
            return (
              <div key={r.id} className="rounded-panel border border-warn-dot bg-warn-bg p-4">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-ink">{r.staff_name}</span>
                  <span className="text-[13px] font-medium text-ink-label">
                    {formatDateRange(r.start_date, r.end_date)}
                  </span>
                </div>
                {r.reason && <div className="mb-2 text-[13px] text-ink-muted">{r.reason}</div>}
                {r.conflicting_assignments > 0 && (
                  <div className="mb-2.5 rounded-lg bg-unavail-bg px-3 py-2 text-[12px] font-medium text-unavail-text">
                    {r.staff_name} already has {r.conflicting_assignments} shift
                    {r.conflicting_assignments === 1 ? "" : "s"} assigned in this range — approving won&apos;t
                    remove them.
                  </div>
                )}
                <input
                  value={notes[r.id] ?? ""}
                  onChange={(e) => setNotes((prev) => ({ ...prev, [r.id]: e.target.value }))}
                  placeholder="Add a note (optional)"
                  className="mb-2.5 w-full rounded-lg border border-unset-border bg-surface-card px-3 py-2 text-[13px] text-ink outline-none placeholder:text-ink-faint"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleApprove(r)}
                    disabled={busy}
                    className="rounded-lg bg-accent px-3.5 py-1.5 text-[12px] font-semibold text-accent-on disabled:opacity-50"
                  >
                    {busy ? "Working…" : "Approve"}
                  </button>
                  <button
                    onClick={() => handleReject(r)}
                    disabled={busy}
                    className="rounded-lg bg-surface-subtle px-3.5 py-1.5 text-[12px] font-medium text-unavail-text disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">History</div>
      {history.length === 0 ? (
        <div className="rounded-panel border border-hairline bg-surface-card p-6 text-center text-sm text-ink-faint">
          No decided requests yet.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {history.map((r) => {
            const status = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.pending;
            return (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-panel border border-hairline bg-surface-card p-3.5"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-ink">{r.staff_name}</div>
                  <div className="text-[12px] text-ink-faint">{formatDateRange(r.start_date, r.end_date)}</div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${status.bg} ${status.text}`}
                >
                  {status.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <Toast message={toast} />
    </div>
  );
}
