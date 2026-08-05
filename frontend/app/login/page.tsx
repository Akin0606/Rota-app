"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import Wordmark from "@/components/wordmark";
import { ApiError, requestLoginCode } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    if (!email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      await requestLoginCode(email);
      router.push(`/login/check-email?email=${encodeURIComponent(email)}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send code, please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto max-w-[420px] py-4">
      <div className="mx-4 animate-fadeIn overflow-hidden rounded-card bg-surface shadow-card">
        <div className="flex min-h-[500px] flex-col items-center justify-center px-6 py-10">
          <Wordmark className="mb-6 text-[26px]" />
          <div className="mb-1.5 font-display text-2xl font-bold text-ink">Welcome back</div>
          <div className="mb-8 text-sm text-ink-faint">Sign in to manage your rota</div>

          <div className="mb-4 w-full">
            <div className="mb-1.5 text-[13px] font-semibold text-ink-label">Email address</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="james@roseandcrown.co.uk"
              type="email"
              className="w-full rounded-input border-2 border-unset-border bg-surface-card px-4 py-3.5 text-[15px] outline-none focus:border-accent"
            />
          </div>

          {error && (
            <div className="mb-3 w-full rounded-input border border-unavail-border bg-unavail-bg px-3.5 py-2.5 text-center text-[13px] font-medium text-unavail-text">
              {error}
            </div>
          )}

          <button
            onClick={handleSend}
            disabled={sending}
            className="w-full rounded-control bg-accent py-4 text-center text-base font-semibold text-white disabled:opacity-60"
          >
            {sending ? "Sending…" : "Send code"}
          </button>
          <div className="mt-4 text-center text-[13px] text-ink-faint">
            We&apos;ll email you a 6-digit code — no password needed
          </div>
        </div>
      </div>
    </div>
  );
}
