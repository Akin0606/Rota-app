"use client";

import { useCallback, useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";

import { createCheckoutSession, createPortalSession, getBillingStatus, type BillingStatus } from "@/lib/api";
import LoadingScreen from "@/components/loading-screen";

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

function StatusPill({ status }: { status: string }) {
  const config: Record<string, { label: string; cls: string }> = {
    active: { label: "Active", cls: "bg-cp-green-soft text-cp-green" },
    trialing: { label: "Trial", cls: "bg-cp-amber-soft text-cp-amber" },
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

  useEffect(() => {
    getBillingStatus()
      .then(setBilling)
      .catch(() => setError("Couldn't load billing info"))
      .finally(() => setLoading(false));
  }, []);

  const fetchClientSecret = useCallback(async () => {
    const { client_secret } = await createCheckoutSession();
    return client_secret;
  }, []);

  const handleManage = async () => {
    setPortalLoading(true);
    try {
      const { url } = await createPortalSession();
      window.location.href = url;
    } catch {
      setError("Couldn't open billing portal");
      setPortalLoading(false);
    }
  };

  if (loading) return <LoadingScreen />;

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
  const trialDaysLeft = isTrial ? daysUntil(billing?.subscription_ends_at ?? null) : null;
  const trialExpired = isTrial && trialDaysLeft !== null && trialDaysLeft <= 0;
  const needsSubscription = !isActive && (trialExpired || status === "cancelled");
  const showManage = isActive || status === "past_due";

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
            <div className="mt-1 text-sm text-ink-muted">£29/month per venue</div>
          </div>
          <StatusPill status={status} />
        </div>

        {isTrial && !trialExpired && (
          <div className="mt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-ink-muted">Trial ends</span>
              <span>{formatDate(billing?.subscription_ends_at ?? null)}</span>
            </div>
            {trialDaysLeft !== null && (
              <div className="rounded-xl border border-cp-amber-soft bg-cp-amber-soft p-3 text-sm text-cp-amber">
                {trialDaysLeft} {trialDaysLeft === 1 ? "day" : "days"} left — subscribe to keep using Rotally.
              </div>
            )}
          </div>
        )}

        {trialExpired && (
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
        {(needsSubscription || (isTrial && !trialExpired)) && (
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
            {needsSubscription ? "Subscribe — £29/mo" : "Subscribe now"}
          </button>
        )}

        {showManage && (
          <button
            onClick={handleManage}
            disabled={portalLoading}
            className="rounded-xl border border-hairline bg-surface-card px-5 py-3 text-sm font-medium text-ink transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {portalLoading ? "Opening…" : "Manage subscription"}
          </button>
        )}
      </div>
    </div>
  );
}
