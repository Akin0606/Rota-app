"use client";

import { useEffect, useState } from "react";

import Toast from "@/components/toast";
import {
  AdminApiError,
  WaitlistEntry,
  inviteWaitlistEntry,
  listWaitlist,
} from "@/lib/admin-api";

export default function AdminWaitlistPage() {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listWaitlist()
      .then((res) => {
        if (!cancelled) setEntries(res);
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
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  async function handleInvite(entry: WaitlistEntry) {
    setInvitingId(entry.id);
    try {
      const res = await inviteWaitlistEntry(entry.id);
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, status: "invited" } : e)));
      showToast(`Account created for ${res.email}. They can sign in at ${res.login_url}.`);
    } catch (err) {
      showToast(err instanceof AdminApiError ? err.message : "Could not invite this signup.");
    } finally {
      setInvitingId(null);
    }
  }

  if (loading) {
    return <div className="p-10 text-center text-sm text-ink-muted">Loading…</div>;
  }

  if (error) {
    return <div className="p-10 text-center text-sm text-ink-muted">Could not load the waitlist.</div>;
  }

  return (
    <div>
      <div className="mb-6 text-2xl font-bold text-ink">Waitlist ({entries.length})</div>
      <div className="overflow-hidden rounded-panel border border-hairline bg-surface-card">
        {entries.length === 0 ? (
          <div className="p-10 text-center text-sm text-ink-faint">No signups yet.</div>
        ) : (
          entries.map((e, i) => (
            <div
              key={e.id}
              className={`flex flex-wrap items-center gap-3 px-5 py-4 ${
                i < entries.length - 1 ? "border-b border-surface-page" : ""
              }`}
            >
              <div className="min-w-[180px] flex-1">
                <div className="text-sm font-semibold text-ink">{e.venue_name}</div>
                <div className="text-xs text-ink-faint">{e.email}</div>
              </div>
              <div className="w-32 text-xs text-ink-muted">
                {new Date(e.created_at).toLocaleDateString()}
              </div>
              <div className="w-28">
                {e.status === "invited" ? (
                  <span className="inline-block rounded-full bg-avail-bg px-2.5 py-1 text-[11px] font-semibold text-avail-text">
                    Invited
                  </span>
                ) : (
                  <span className="inline-block rounded-full bg-warn-bg px-2.5 py-1 text-[11px] font-semibold text-warn-text">
                    Pending
                  </span>
                )}
              </div>
              <button
                onClick={() => handleInvite(e)}
                disabled={e.status === "invited" || invitingId === e.id}
                className="rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {e.status === "invited"
                  ? "Invited"
                  : invitingId === e.id
                    ? "Inviting…"
                    : "Invite"}
              </button>
            </div>
          ))
        )}
      </div>

      <Toast message={toast} />
    </div>
  );
}
