"use client";

import { useEffect, useState } from "react";

import Toast from "@/components/toast";
import {
  AdminApiError,
  WaitlistEntry,
  inviteWaitlistEntry,
  listWaitlist,
} from "@/lib/admin-api";

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

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
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-hairline border-t-accent" />
        <div className="text-sm text-ink-muted">Loading waitlist…</div>
      </div>
    );
  }

  if (error) {
    return <div className="p-10 text-center text-sm text-ink-muted">Could not load the waitlist.</div>;
  }

  return (
    <div className="animate-fadeIn">
      <div className="mb-6">
        <div className="text-[13px] font-medium text-ink-faint">Founders waiting to get started</div>
        <div className="font-display text-[26px] font-bold text-ink md:text-[28px]">
          Waitlist ({entries.length})
        </div>
      </div>
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
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-accent-light text-[11px] font-bold text-accent">
                {initials(e.venue_name)}
              </div>
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
