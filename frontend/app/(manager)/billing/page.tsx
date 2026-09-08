"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadStripe, type Appearance } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";

import { createCheckoutSession, createPortalSession, getBillingStatus, type BillingStatus } from "@/lib/api";
import LoadingScreen from "@/components/loading-screen";
import Waiting from "@/components/waiting";

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

const stripeAppearance: Appearance = {
  theme: "night",
  variables: {
    colorPrimary: "#f4f4f2",
    colorBackground: "#1a1a1a",
    colorText: "#f4f4f2",
    colorTextSecondary: "#8f8f8a",
    colorTextPlaceholder: "#5a5a57",
    colorDanger: "#e5484d",
    borderRadius: "8px",
    fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
    fontSizeBase: "14px",
  },
  rules: {
    ".Input": {
      backgroundColor: "#1a1a1a",
      border: "0.5px solid rgba(244,244,242,0.08)",
      padding: "12px 14px",
    },
    ".Input:focus": {
      borderColor: "rgba(244,244,242,0.25)",
      boxShadow: "none",
    },
    ".Label": {
      color: "#8f8f8a",
      fontSize: "13px",
      fontWeight: "400",
    },
    ".Tab": {
      backgroundColor: "#141414",
      border: "0.5px solid rgba(244,244,242,0.08)",
      color: "#8f8f8a",
    },
    ".Tab--selected": {
      backgroundColor: "#1a1a1a",
      borderColor: "rgba(244,244,242,0.25)",
      color: "#f4f4f2",
    },
    ".Tab:hover": {
      backgroundColor: "#1a1a1a",
    },
  },
};

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

function CheckoutForm({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    setPayError(null);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/billing?redirect_status=succeeded`,
      },
      redirect: "if_required",
    });

    if (error) {
      setPayError(error.message ?? "Payment failed — please try again");
      setProcessing(false);
    } else {
      onSuccess();
    }
  };

  if (processing) {
    return (
      <div className="rounded-card border border-hairline bg-surface-card p-8 text-center">
        <Waiting label="Setting up your subscription" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      {payError && (
        <div className="mb-4 rounded-xl border border-cp-red-soft bg-cp-red-soft p-3 text-sm text-cp-red">
          {payError}
        </div>
      )}

      <div className="mb-4 rounded-card border border-hairline bg-surface-card p-5">
        <div className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-muted">
          Your plan
        </div>
        <div className="flex items-center justify-between">
          <span className="text-lg font-medium">Rotally Pro</span>
          <span className="text-xl font-medium">
            £29<span className="text-sm font-normal text-ink-muted">/mo</span>
          </span>
        </div>
        <div className="mt-1 text-sm text-ink-muted">Per venue · cancel any time</div>
        <div className="my-4 border-t border-hairline" />
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-ink-muted">Rotally Pro × 1 venue</span>
            <span>£29.00</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-muted">VAT</span>
            <span>£0.00</span>
          </div>
        </div>
        <div className="mt-3 flex justify-between border-t border-hairline pt-3 text-sm font-medium">
          <span>Due today</span>
          <span>£29.00</span>
        </div>
      </div>

      <div className="mb-4 rounded-card border border-hairline bg-surface-card p-5">
        <div className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-muted">
          Payment
        </div>
        <PaymentElement />
      </div>

      <button
        type="submit"
        disabled={!stripe || !elements}
        className="w-full rounded-xl bg-accent px-5 py-3.5 text-sm font-medium text-accent-on transition-transform active:scale-[0.98] disabled:opacity-50"
      >
        Subscribe — £29/mo
      </button>
    </form>
  );
}

export default function BillingPage() {
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutSecret, setCheckoutSecret] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const data = await getBillingStatus();
      setBilling(data);
      return data;
    } catch {
      setError("Couldn't load billing info");
      return null;
    }
  }, []);

  useEffect(() => {
    loadStatus().finally(() => setLoading(false));
  }, [loadStatus]);

  // After a 3DS redirect or inline success, poll until the webhook flips status to active.
  const startPolling = useCallback(() => {
    setConfirming(true);
    let attempts = 0;
    const maxAttempts = 10;

    const poll = async () => {
      attempts++;
      const data = await loadStatus();
      if (data?.subscription_status === "active" || attempts >= maxAttempts) {
        setConfirming(false);
        window.history.replaceState({}, "", "/billing");
        return;
      }
      pollRef.current = setTimeout(poll, 1500);
    };

    pollRef.current = setTimeout(poll, 2000);
  }, [loadStatus]);

  // Handle 3DS redirect return
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("redirect_status") === "succeeded") {
      startPolling();
    }
    // Legacy: handle old session_id param too
    if (params.get("session_id")) {
      startPolling();
    }
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [startPolling]);

  const handleSubscribe = async () => {
    if (!stripePromise) {
      setError("Billing is not configured yet — contact support.");
      return;
    }
    setCheckoutLoading(true);
    setError(null);
    try {
      const { client_secret } = await createCheckoutSession();
      setCheckoutSecret(client_secret);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Checkout failed — please try again";
      setError(msg);
    } finally {
      setCheckoutLoading(false);
    }
  };

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

  const handlePaymentSuccess = () => {
    setCheckoutSecret(null);
    startPolling();
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

  // Confirming: post-payment, waiting for webhook
  if (confirming && status !== "active") {
    return (
      <div className="px-5 py-8 md:px-8">
        <div className="rounded-card border border-hairline bg-surface-card p-8 text-center">
          <Waiting label="Confirming your subscription" />
        </div>
      </div>
    );
  }

  // Checkout form
  if (checkoutSecret && stripePromise) {
    return (
      <div className="px-5 py-8 md:px-8">
        <button
          onClick={() => setCheckoutSecret(null)}
          className="mb-6 text-sm text-ink-muted hover:text-ink"
        >
          ← Back to billing
        </button>
        <h2 className="mb-6 text-xl font-medium">Subscribe</h2>

        <Elements
          stripe={stripePromise}
          options={{ clientSecret: checkoutSecret, appearance: stripeAppearance }}
        >
          <CheckoutForm onSuccess={handlePaymentSuccess} />
        </Elements>
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
            onClick={handleSubscribe}
            disabled={checkoutLoading}
            className="rounded-xl bg-accent px-5 py-3 text-sm font-medium text-accent-on transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {checkoutLoading ? (
              <Waiting label={needsSubscription ? "Subscribe" : "Subscribe now"} />
            ) : needsSubscription ? (
              "Subscribe — £29/mo"
            ) : (
              "Subscribe now"
            )}
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
