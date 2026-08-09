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

const NAV_ITEMS = [
  { key: "venues", label: "Venues", icon: "🏢", href: "/admin" },
  { key: "waitlist", label: "Waitlist", icon: "🎟️", href: "/admin/waitlist" },
  { key: "activity", label: "Activity", icon: "🕒", href: "/admin/activity" },
];

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
        <div className="w-full animate-fadeIn rounded-card border border-hairline bg-surface-card p-8 shadow-card">
          <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-[12px] bg-accent-light text-lg">
            🔒
          </div>
          <Wordmark className="text-lg" />
          <div className="mb-1.5 mt-3 font-display text-xl font-bold text-ink">Admin console</div>
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

  return (
    <div className="flex min-h-screen">
      <div className="hidden w-60 shrink-0 flex-col gap-1 border-r border-hairline bg-surface-card px-5 py-7 md:flex">
        <div className="mb-7 flex items-center gap-2.5">
          <div>
            <Wordmark className="text-[19px]" />
            <div className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Admin</div>
          </div>
        </div>

        {NAV_ITEMS.map((item) => {
          const active = item.href === "/admin" ? pathname === "/admin" || pathname?.startsWith("/admin/venues") : pathname === item.href;
          return (
            <Link
              key={item.key}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-[10px] px-3.5 py-2.5 text-sm transition ${
                active ? "bg-accent-light font-semibold text-accent" : "font-medium text-ink-muted hover:bg-surface-subtle"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}

        <div className="flex-1" />

        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 rounded-[10px] bg-surface-subtle px-3.5 py-3 text-left transition hover:bg-unset-bg"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-accent-light text-xs font-bold text-accent">
            A
          </div>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-ink">Founder access</div>
            <div className="text-[11px] text-ink-faint">Log out</div>
          </div>
        </button>
      </div>

      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-hairline bg-surface-card px-5 py-4 md:hidden">
          <div className="flex items-baseline gap-1.5">
            <Wordmark className="text-[15px]" />
            <span className="text-sm font-medium text-ink-faint">admin</span>
          </div>
          <button onClick={handleLogout} className="text-[13px] font-medium text-ink-faint">
            Log out
          </button>
        </div>
        <div className="flex gap-1 overflow-x-auto border-b border-hairline bg-surface-card px-5 py-2 md:hidden">
          {NAV_ITEMS.map((item) => {
            const active = item.href === "/admin" ? pathname === "/admin" || pathname?.startsWith("/admin/venues") : pathname === item.href;
            return (
              <Link
                key={item.key}
                href={item.href}
                className={`flex shrink-0 items-center gap-1.5 rounded-[10px] px-3 py-2 text-[13px] ${
                  active ? "bg-accent-light font-semibold text-accent" : "font-medium text-ink-muted"
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="mx-auto w-full max-w-5xl px-5 py-6 md:px-10 md:py-8">{children}</div>
      </div>
    </div>
  );
}
