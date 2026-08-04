"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import Toast from "@/components/toast";
import { ApiError, requestMagicLink } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
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
      await requestMagicLink(email);
      router.push(`/login/check-email?email=${encodeURIComponent(email)}`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not send link, please try again");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto max-w-[420px] py-4">
      <div className="mx-4 animate-fadeIn overflow-hidden rounded-card bg-surface shadow-card">
        <div className="flex min-h-[500px] flex-col items-center justify-center px-6 py-10">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-[18px] bg-accent-light">
            <span className="text-[28px] font-extrabold text-accent">R</span>
          </div>
          <div className="mb-1.5 text-2xl font-bold text-ink">Welcome back</div>
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

          <button
            onClick={handleSend}
            disabled={sending}
            className="w-full rounded-control bg-accent py-4 text-center text-base font-semibold text-white disabled:opacity-60"
          >
            {sending ? "Sending…" : "Send login link"}
          </button>
          <div className="mt-4 text-center text-[13px] text-ink-faint">
            We&apos;ll email you a magic link — no password needed
          </div>
        </div>
      </div>
      <Toast message={toast} />
    </div>
  );
}
