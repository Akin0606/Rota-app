"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

import Toast from "@/components/toast";
import { ApiError, requestLoginCode, verifyLoginCode } from "@/lib/api";

function VerifyCodeContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";

  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function handleVerify() {
    // Supabase's OTP length is a project setting (this project currently issues
    // 8-digit codes; the default is 6). Accept any 6–10 digit code rather than
    // hard-coding one length, so a change to that setting can't silently break
    // login.
    if (!/^\d{6,10}$/.test(code)) {
      setError("Enter the numeric code from your email.");
      return;
    }
    setVerifying(true);
    setError(null);
    try {
      await verifyLoginCode(email, code);
      // Hard navigation so the server components (root redirect + manager
      // layout) re-read the freshly-set session cookie.
      window.location.assign("/dashboard");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "That code is incorrect or has expired. Request a new one.",
      );
      setVerifying(false);
    }
  }

  async function handleResend() {
    if (!email) return;
    setResending(true);
    setError(null);
    try {
      await requestLoginCode(email);
      setCode("");
      showToast("New code sent!");
    } catch {
      showToast("Could not resend, please try again");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="mx-auto max-w-[420px] py-4">
      <div className="mx-4 animate-fadeIn overflow-hidden rounded-card bg-surface shadow-card">
        <div className="flex min-h-[500px] flex-col items-center justify-center px-6 py-10">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-avail-bg text-[28px]">
            ✉️
          </div>
          <div className="mb-1.5 text-2xl font-bold text-ink">Enter your code</div>
          <div className="mb-8 text-center text-sm leading-relaxed text-ink-muted">
            Enter the code we sent to
            <br />
            <span className="font-semibold text-ink">{email || "your email address"}</span>
          </div>

          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
            onKeyDown={(e) => e.key === "Enter" && handleVerify()}
            inputMode="numeric"
            autoFocus
            maxLength={10}
            placeholder="••••••"
            className="mb-3 w-full rounded-input border-2 border-unset-border bg-surface-card px-4 py-3.5 text-center text-2xl font-bold tracking-[0.3em] outline-none focus:border-accent"
          />

          {error && <div className="mb-3 w-full text-center text-[13px] text-unavail-text">{error}</div>}

          <button
            onClick={handleVerify}
            disabled={verifying}
            className="w-full rounded-control bg-accent py-4 text-center text-base font-semibold text-white disabled:opacity-60"
          >
            {verifying ? "Verifying…" : "Verify & sign in"}
          </button>

          <div className="mt-4 text-center text-[13px] text-ink-faint">
            Didn&apos;t get it?{" "}
            <button onClick={handleResend} disabled={resending} className="font-semibold text-accent">
              Resend code
            </button>
          </div>
        </div>
      </div>
      <Toast message={toast} />
    </div>
  );
}

export default function VerifyCodePage() {
  return (
    <Suspense fallback={null}>
      <VerifyCodeContent />
    </Suspense>
  );
}
