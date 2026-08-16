"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import Toast from "@/components/toast";
import { ApiError, authenticatePin, getVenueInfo, joinTeam } from "@/lib/api";
import { deviceKey, pinStorageKey } from "@/lib/utils";

type Mode = "pin" | "join" | "reveal";

function PinEntryContent({ venue_token }: { venue_token: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [venueName, setVenueName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [inactiveMsg, setInactiveMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("pin");

  // PIN entry
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Join flow
  const [joinCode, setJoinCode] = useState("");
  const [joinName, setJoinName] = useState("");
  const [joining, setJoining] = useState(false);
  const [revealPin, setRevealPin] = useState<string | null>(null);
  const [revealName, setRevealName] = useState<string>("");

  // Device "remember me" (§3): a returning staffer on this phone skips PIN
  // entry. On ?expired (a 401 elsewhere) the stored token is stale — clear it
  // and fall back to PIN rather than looping straight back into a failed auth.
  useEffect(() => {
    const expired = searchParams.get("expired");
    if (expired) {
      localStorage.removeItem(deviceKey(venue_token));
      showToast("Please enter your PIN again");
      return;
    }
    const remembered = localStorage.getItem(deviceKey(venue_token));
    if (remembered) {
      sessionStorage.setItem(pinStorageKey(venue_token), remembered);
      router.replace(`/v/${venue_token}/hub`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    getVenueInfo(venue_token)
      .then((res) => setVenueName(res.venue_name))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) {
          setInactiveMsg(err.message);
        } else {
          setNotFound(true);
        }
      })
      .finally(() => setLoading(false));
  }, [venue_token]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  function rememberDevice(newPin: string) {
    localStorage.setItem(deviceKey(venue_token), newPin);
    sessionStorage.setItem(pinStorageKey(venue_token), newPin);
  }

  async function handleContinue() {
    if (!/^\d{4}$/.test(pin)) {
      showToast("Enter your 4-digit PIN");
      return;
    }
    setSubmitting(true);
    try {
      await authenticatePin(venue_token, pin);
      // Remember this device so the PIN becomes recovery-only next time.
      rememberDevice(pin);
      router.push(`/v/${venue_token}/hub`);
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

  async function handleJoin() {
    if (!/^\d{4}$/.test(joinCode)) {
      showToast("Enter the 4-digit join code");
      return;
    }
    if (!joinName.trim()) {
      showToast("Enter your name");
      return;
    }
    setJoining(true);
    try {
      const res = await joinTeam(venue_token, joinCode, joinName.trim());
      rememberDevice(res.pin);
      setRevealName(res.name);
      setRevealPin(res.pin);
      setMode("reveal");
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        showToast(err.message);
      } else if (err instanceof ApiError && err.status === 401) {
        showToast("Incorrect join code");
      } else if (err instanceof ApiError && err.status === 403) {
        showToast(err.message);
      } else {
        showToast("Something went wrong");
      }
    } finally {
      setJoining(false);
    }
  }

  if (loading) return <CenteredMessage>Loading…</CenteredMessage>;
  if (inactiveMsg) return <CenteredMessage>{inactiveMsg}</CenteredMessage>;
  if (notFound) return <CenteredMessage>This link isn&apos;t valid.</CenteredMessage>;

  return (
    <div className="mx-auto max-w-[420px] py-4">
      <div className="mx-4 animate-fadeIn overflow-hidden rounded-card bg-surface shadow-card">
        <div className="flex min-h-[480px] flex-col items-center justify-center px-6 py-10">
          {mode === "pin" && (
            <>
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
                className="w-full rounded-control bg-accent py-4 text-center text-base font-semibold text-white transition-transform duration-150 active:scale-[0.98] disabled:opacity-60"
              >
                {submitting ? "Checking…" : "Continue"}
              </button>

              <Link href={`/v/${venue_token}/forgot-pin`} className="mt-4 text-[13px] font-semibold text-accent">
                Forgot PIN?
              </Link>

              <div className="mt-8 w-full border-t border-hairline pt-6 text-center">
                <div className="text-[13px] text-ink-faint">New here?</div>
                <button
                  onClick={() => {
                    setMode("join");
                    setJoinCode("");
                    setJoinName("");
                  }}
                  className="mt-1 text-[15px] font-semibold text-accent"
                >
                  Join the team
                </button>
              </div>
            </>
          )}

          {mode === "join" && (
            <>
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-[18px] bg-accent-light">
                <span className="text-[28px] font-extrabold text-accent">{venueName?.[0] ?? "R"}</span>
              </div>
              <div className="mb-1.5 text-center text-2xl font-bold text-ink">Join {venueName}</div>
              <div className="mb-8 max-w-[280px] text-center text-sm text-ink-faint">
                Enter the join code your manager gave you, and your name.
              </div>

              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                inputMode="numeric"
                autoFocus
                maxLength={4}
                placeholder="Join code"
                className="mb-3 w-full rounded-input border-2 border-unset-border bg-surface-card px-4 py-3.5 text-center text-xl font-bold tracking-[0.4em] outline-none focus:border-accent"
              />
              <input
                value={joinName}
                onChange={(e) => setJoinName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                maxLength={80}
                placeholder="Your name"
                className="mb-6 w-full rounded-input border-2 border-unset-border bg-surface-card px-4 py-3.5 text-center text-lg font-medium text-ink outline-none focus:border-accent"
              />

              <button
                onClick={handleJoin}
                disabled={joining}
                className="w-full rounded-control bg-accent py-4 text-center text-base font-semibold text-white transition-transform duration-150 active:scale-[0.98] disabled:opacity-60"
              >
                {joining ? "Joining…" : "Join the team"}
              </button>

              <button onClick={() => setMode("pin")} className="mt-4 text-[13px] font-semibold text-ink-muted">
                I already have a PIN
              </button>
            </>
          )}

          {mode === "reveal" && revealPin && (
            <div className="cp-pop-pop flex flex-col items-center">
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-avail-bg text-avail-text">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12l5 5l10 -10" />
                </svg>
              </div>
              <div className="mb-1.5 text-center text-2xl font-bold text-ink">You&apos;re in{revealName ? `, ${revealName.split(" ")[0]}` : ""}.</div>
              <div className="mb-7 max-w-[290px] text-center text-sm text-ink-faint">
                Here&apos;s your PIN. This is the only time we&apos;ll show it — add this page to your home
                screen so you never need it again.
              </div>

              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                Your PIN
              </div>
              <div className="mb-7 rounded-card bg-accent-light px-8 py-5 text-[40px] font-extrabold tracking-[0.32em] text-accent">
                {revealPin}
              </div>

              <button
                onClick={() => router.push(`/v/${venue_token}/availability`)}
                className="w-full rounded-control bg-accent py-4 text-center text-base font-semibold text-white transition-transform duration-150 active:scale-[0.98]"
              >
                Continue to availability
              </button>
              <div className="mt-4 max-w-[280px] text-center text-[12px] leading-[1.5] text-ink-faint">
                You can submit availability now — your manager will confirm your role shortly.
              </div>
            </div>
          )}
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
