"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import Toast from "@/components/toast";
import { ApiError, authenticatePin, getVenueInfo } from "@/lib/api";
import { pinStorageKey } from "@/lib/utils";

function PinEntryContent({ venue_token }: { venue_token: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [venueName, setVenueName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    getVenueInfo(venue_token)
      .then((res) => setVenueName(res.venue_name))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [venue_token]);

  useEffect(() => {
    if (searchParams.get("expired")) {
      showToast("Please enter your PIN again");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function handleContinue() {
    if (!/^\d{4}$/.test(pin)) {
      showToast("Enter your 4-digit PIN");
      return;
    }
    setSubmitting(true);
    try {
      await authenticatePin(venue_token, pin);
      sessionStorage.setItem(pinStorageKey(venue_token), pin);
      router.push(`/v/${venue_token}/availability`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        showToast(err.message);
      } else if (err instanceof ApiError && err.status === 401) {
        showToast("Incorrect PIN");
      } else {
        showToast("Something went wrong");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <CenteredMessage>Loading…</CenteredMessage>;
  if (notFound) return <CenteredMessage>This link isn&apos;t valid.</CenteredMessage>;

  return (
    <div className="mx-auto max-w-[420px] py-4">
      <div className="mx-4 animate-fadeIn overflow-hidden rounded-card bg-surface shadow-card">
        <div className="flex min-h-[480px] flex-col items-center justify-center px-6 py-10">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-[18px] bg-accent-light">
            <span className="text-[28px] font-extrabold text-accent">{venueName?.[0] ?? "R"}</span>
          </div>
          <div className="mb-1.5 text-center text-2xl font-bold text-ink">{venueName}</div>
          <div className="mb-8 text-sm text-ink-faint">Enter your 4-digit PIN</div>

          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            onKeyDown={(e) => e.key === "Enter" && handleContinue()}
            inputMode="numeric"
            autoFocus
            maxLength={4}
            placeholder="••••"
            className="mb-6 w-full rounded-input border-2 border-unset-border bg-surface-card px-4 py-3.5 text-center text-2xl font-bold tracking-[0.5em] outline-none focus:border-accent"
          />

          <button
            onClick={handleContinue}
            disabled={submitting}
            className="w-full rounded-control bg-accent py-4 text-center text-base font-semibold text-white disabled:opacity-60"
          >
            {submitting ? "Checking…" : "Continue"}
          </button>

          <Link href={`/v/${venue_token}/forgot-pin`} className="mt-4 text-[13px] font-semibold text-accent">
            Forgot PIN?
          </Link>
        </div>
      </div>
      <Toast message={toast} />
    </div>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-[420px] items-center justify-center px-6 py-24 text-center text-sm text-ink-muted">
      {children}
    </div>
  );
}

export default function PinEntryPage({ params }: { params: { venue_token: string } }) {
  return (
    <Suspense fallback={<CenteredMessage>Loading…</CenteredMessage>}>
      <PinEntryContent venue_token={params.venue_token} />
    </Suspense>
  );
}
