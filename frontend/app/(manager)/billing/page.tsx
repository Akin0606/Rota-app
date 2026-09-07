"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";

import { createCheckoutSession, createPortalSession, getBillingStatus, type BillingStatus } from "@/lib/api";
import LoadingScreen from "@/components/loading-screen";
import Waiting from "@/components/waiting";

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

function StatusPill({ status }: { status: string }) {
  const config: Record<string, { label: string; cls: string }> = {
    active: { label: "Active", cls: "bg-cp-green-soft text-cp-green" },
    trialing: { label: "Trial", cls: "bg-cp-amber-soft text-cp-amber" },
    expired: { label: "Expired", cls: "bg-cp-red-soft text-cp-red" },
    past_due: { label: "Past due", cls: "bg-cp-red-soft text-cp-red" },
    cancelled: { label: "Cancelled", cls: "bg-cp-red-soft text-cp-red" },
  };
  const c = config[status] ?? { label: status, cls: "bg-surface-card text-ink-muted" };
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${c.cls}`}>
      {c.label}
    </span>
  );
}

function daysUntil(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const end = new Date(isoDate);
  const now = new Date();
  return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function BillingPage() {
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCheckout, setShowCheckout] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const data = await getBillingStatus();
      setBilling(data);
      return data;
    } catch {
      setError("Couldn’t load billing info");
      return null;
    }
  }, []);

  useEffect(() => {
    loadStatus().finally(() => setLoading(false));
  }, [loadStatus]);

  // After a successful checkout, Stripe redirects with ?session_id=... but
  // the webhook may not have fired yet. Poll until the status flips to active.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.get("session_id")) return;

    let attempts = 0;
    const maxAttempts = 8;

    const poll = async () => {
      attempts++;
      const data = await loadStatus();
      if (data?.subscription_status === "active" || attempts >= maxAttempts) {
        // Clean the URL
        window.history.replaceState({}, "", "/billing");
        return;
      }
      pollRef.current = setTimeout(poll, 1500);
    };

    // Start polling after a short initial delay (give webhook time)
    pollRef.current = setTimeout(poll, 2000);

    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [loadStatus]);

  const fetchClientSecret = useCallback(async () => {
    try {
      const { client_secret } = await createCheckoutSession();
      return client_secret;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Checkout failed — please try again";
      setError(msg);
      setShowCheckout(false);
      throw e;
    }
  }, []);

  const handleManage = async () => {
    setPortalLoading(true);
    try {
      const { url } = await createPortalSession();
      window.location.href = url;
    } catch {
      setError("Couldn’t open billing portal");
      setPortalLoading(false);
    }
  };

  if (loading) return <LoadingScreen base="Loading billing…" />;

  if (error && !billing) {
    return (
      <div className="px-5 py-8 md:px-8">
        <div className="rounded-card border border-hairline bg-surface-card p-6 text-center">
          <p className="text-sm text-ink-muted">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-accent-on"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const status = billing?.subscription_status ?? "trialing";
  const isActive = status === "active";
  const isTrial = status === "trialing";
  const isExpired = status === "expired";
  const trialDaysLeft = isTrial ? daysUntil(billing?.subscription_ends_at ?? null) : null;
  const needsSubscription = !isActive && (isExpired || status === "cancelled");
  const showManage = isActive || status === "past_due";

  // Post-checkout: session_id in URL means we're waiting for webhook confirmation
  const isPolling = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("session_id");

  if (isPolling && status !== "active") {
    return (
      <div className="px-5 py-8 md:px-8">
        <div className="rounded-card border border-hairline bg-surface-card p-8 text-center">
          <LoadingScreen base="Confirming your subscription…" className="min-h-[30vh]" />
        </div>
      </div>
    );
  }

  if (showCheckout) {
    if (!stripePromise) {
      return (
        <div className="px-5 py-8 md:px-8">
          <div className="rounded-card border border-hairline bg-surface-card p-6 text-center">
            <p className="text-sm text-ink-muted">Billing is not configured yet — contact support.</p>
            <button
              onClick={() => setShowCheckout(false)}
              className="mt-4 rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-accent-on"
            >
              Back
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="px-5 py-8 md:px-8">
        <button
          onClick={() => setShowCheckout(false)}
          className="mb-6 text-sm text-ink-muted hover:text-ink"
        >
          ← Back to billing
        </button>
        <div className="overflow-hidden rounded-card border border-hairline">
          <EmbeddedCheckoutProvider stripe={stripePromise} options={{ fetchClientSecret }}>
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 py-8 md:px-8">
      <h1 className="mb-6 text-xl font-medium">Billing</h1>

      {error && (
        <div className="mb-4 rounded-xl border border-cp-red-soft bg-cp-red-soft p-3 text-sm text-cp-red">
          {error}
        </div>
      )}

      {/* Plan card */}
      <div className="mb-4 rounded-card border border-hairline bg-surface-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">
              Current plan
            </div>
            <div className="text-lg font-medium">Rotally Pro</div>
            <div className="mt-1 text-sm text-ink-muted">£49/month per venue</div>
          </div>
          <StatusPill status={status} />
        </div>

        {isTrial && (
          <div className="mt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-ink-muted">Trial ends</span>
              <span>{formatDate(billing?.subscription_ends_at ?? null)}</span>
            </div>
            {trialDaysLeft !== null && trialDaysLeft > 0 && (
              <div className="rounded-xl border border-cp-amber-soft bg-cp-amber-soft p-3 text-sm text-cp-amber">
                {trialDaysLeft} {trialDaysLeft === 1 ? "day" : "days"} left — subscribe to keep using Rotally.
              </div>
            )}
          </div>
        )}

        {isExpired && (
          <div className="mt-4 rounded-xl border border-cp-red-soft bg-cp-red-soft p-3 text-sm text-cp-red">
            Your trial has ended. Subscribe to regain full access.
          </div>
        )}

        {status === "past_due" && (
          <div className="mt-4 rounded-xl border border-cp-red-soft bg-cp-red-soft p-3 text-sm text-cp-red">
            Your last payment failed. Please update your payment method to avoid losing access.
          </div>
        )}

        {status === "cancelled" && (
          <div className="mt-4 rounded-xl border border-cp-red-soft bg-cp-red-soft p-3 text-sm text-cp-red">
            Your subscription has been cancelled. Subscribe again to restore access.
          </div>
        )}
      </div>

      {/* Billing details */}
      {(isActive || status === "past_due") && (
        <div className="mb-4 rounded-card border border-hairline bg-surface-card p-5">
          <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            Billing details
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-muted">Status</span>
              <span>{isActive ? "Active" : "Past due"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-muted">Current period started</span>
              <span>{formatDate(billing?.subscription_started_at ?? null)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-muted">Next billing date</span>
              <span>{formatDate(billing?.subscription_ends_at ?? null)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        {(needsSubscription || isTrial) && (
          <button
            onClick={() => {
              if (!stripePromise) {
                setError("Billing is not configured yet — contact support.");
                return;
              }
              setError(null);
              setShowCheckout(true);
            }}
            className="rounded-xl bg-accent px-5 py-3 text-sm font-medium text-accent-on transition-transform active:scale-[0.98]"
          >
            {needsSubscription ? "Subscribe — £49/mo" : "Subscribe now"}
          </button>
        )}

        {showManage && (
          <button
            onClick={handleManage}
            disabled={portalLoading}
            className="rounded-xl border border-hairline bg-surface-card px-5 py-3 text-sm font-medium text-ink transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {portalLoading ? <Waiting label="Opening portal" /> : "Manage subscription"}
          </button>
        )}
      </div>
    </div>
  );
}
