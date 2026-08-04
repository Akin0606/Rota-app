"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

import Toast from "@/components/toast";
import { requestMagicLink } from "@/lib/api";

function CheckEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const [toast, setToast] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function handleResend() {
    if (!email) return;
    setResending(true);
    try {
      await requestMagicLink(email);
      showToast("Link resent!");
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
          <div className="mb-1.5 text-2xl font-bold text-ink">Check your email</div>
          <div className="text-center text-sm leading-relaxed text-ink-muted">
            We sent a login link to
            <br />
            <span className="font-semibold text-ink">{email || "your email address"}</span>
          </div>
          <div className="mt-4 text-center text-[13px] text-ink-faint">
            Didn&apos;t get it?{" "}
            <button onClick={handleResend} disabled={resending} className="font-semibold text-accent">
              Resend link
            </button>
          </div>
        </div>
      </div>
      <Toast message={toast} />
    </div>
  );
}

export default function CheckEmailPage() {
  return (
    <Suspense fallback={null}>
      <CheckEmailContent />
    </Suspense>
  );
}
