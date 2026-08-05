"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import Wordmark from "@/components/wordmark";
import {
  AdminApiError,
  clearAdminSecret,
  getAdminSecret,
  listAdminVenues,
  setAdminSecret,
} from "@/lib/admin-api";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    const existing = getAdminSecret();
    if (!existing) {
      setChecked(true);
      return;
    }
    listAdminVenues()
      .then(() => setAuthed(true))
      .catch(() => clearAdminSecret())
      .finally(() => setChecked(true));
  }, []);

  async function handleLogin() {
    if (!input.trim()) return;
    setVerifying(true);
    setError(null);
    setAdminSecret(input.trim());
    try {
      await listAdminVenues();
      setAuthed(true);
    } catch (err) {
      clearAdminSecret();
      setError(err instanceof AdminApiError && err.status === 401 ? "Incorrect admin key" : "Could not reach the server");
    } finally {
      setVerifying(false);
    }
  }

  function handleLogout() {
    clearAdminSecret();
    setAuthed(false);
    setInput("");
  }

  if (!checked) {
    return <div className="p-10 text-center text-sm text-ink-muted">Loading…</div>;
  }

  if (!authed) {
    return (
      <div className="mx-auto flex min-h-screen max-w-[380px] flex-col items-center justify-center px-6">
        <div className="w-full rounded-card border border-hairline bg-surface-card p-8 shadow-card">
          <Wordmark className="text-lg" />
          <div className="mb-1.5 mt-3 font-display text-xl font-bold text-ink">Admin Console</div>
          <div className="mb-6 text-sm text-ink-faint">Enter the admin key to continue</div>
          <input
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            placeholder="Admin key"
            autoFocus
            className="mb-3 w-full rounded-input border-2 border-unset-border px-4 py-3 text-sm outline-none focus:border-accent"
          />
          {error && <div className="mb-3 text-[13px] text-unavail-text">{error}</div>}
          <button
            onClick={handleLogin}
            disabled={verifying}
            className="w-full rounded-control bg-accent py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {verifying ? "Checking…" : "Enter"}
          </button>
        </div>
      </div>
    );
  }

  const venuesActive = pathname === "/admin" || pathname?.startsWith("/admin/venues");
  const waitlistActive = pathname === "/admin/waitlist";
  const activityActive = pathname === "/admin/activity";

  return (
    <div className="min-h-screen bg-surface-page">
      <div className="border-b border-hairline bg-surface-card px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-baseline gap-1.5">
              <Wordmark className="text-[15px]" />
              <span className="text-sm font-medium text-ink-faint">admin</span>
            </div>
            <Link
              href="/admin"
              className={`text-[13px] font-medium ${venuesActive ? "text-accent" : "text-ink-muted"}`}
            >
              Venues
            </Link>
            <Link
              href="/admin/waitlist"
              className={`text-[13px] font-medium ${waitlistActive ? "text-accent" : "text-ink-muted"}`}
            >
              Waitlist
            </Link>
            <Link
              href="/admin/activity"
              className={`text-[13px] font-medium ${activityActive ? "text-accent" : "text-ink-muted"}`}
            >
              Activity
            </Link>
          </div>
          <button onClick={handleLogout} className="text-[13px] font-medium text-ink-faint">
            Log out
          </button>
        </div>
      </div>
      <div className="mx-auto max-w-5xl px-6 py-8">{children}</div>
    </div>
  );
}
