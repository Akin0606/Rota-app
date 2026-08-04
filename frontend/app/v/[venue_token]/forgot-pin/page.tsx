"use client";

import { useState } from "react";
import Link from "next/link";

import Toast from "@/components/toast";
import { forgotPin } from "@/lib/api";

export default function ForgotPinPage({ params }: { params: { venue_token: string } }) {
  const { venue_token } = params;
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function handleSend() {
    if (!email.includes("@")) {
      showToast("Please enter a valid email");
      return;
    }
    setSending(true);
    try {
      await forgotPin(venue_token, email);
      setSent(true);
    } catch {
      showToast("Something went wrong, please try again");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto max-w-[420px] py-4">
      <div className="mx-4 animate-fadeIn overflow-hidden rounded-card bg-surface shadow-card">
        <div className="flex min-h-[440px] flex-col items-center justify-center px-6 py-10 text-center">
          {sent ? (
            <>
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-avail-bg text-[28px]">
                ✉️
              </div>
              <div className="mb-2 text-2xl font-bold text-ink">Check your email</div>
              <div className="text-sm leading-relaxed text-ink-muted">
                If <span className="font-semibold text-ink">{email}</span> matches a staff member here,
                we&apos;ve sent your PIN.
              </div>
            </>
          ) : (
            <>
              <div className="mb-1.5 text-2xl font-bold text-ink">Forgot your PIN?</div>
              <div className="mb-8 text-sm text-ink-faint">
                Enter your email and we&apos;ll send it to you
              </div>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="you@example.com"
                type="email"
                className="mb-6 w-full rounded-input border-2 border-unset-border bg-surface-card px-4 py-3.5 text-[15px] outline-none focus:border-accent"
              />
              <button
                onClick={handleSend}
                disabled={sending}
                className="w-full rounded-control bg-accent py-4 text-center text-base font-semibold text-white disabled:opacity-60"
              >
                {sending ? "Sending…" : "Send my PIN"}
              </button>
            </>
          )}

          <Link href={`/v/${venue_token}`} className="mt-6 text-[13px] font-semibold text-accent">
            ← Back to PIN entry
          </Link>
        </div>
      </div>
      <Toast message={toast} />
    </div>
  );
}
