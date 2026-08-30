"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import ModeToggle from "@/components/staff/mode-toggle";
import Toast from "@/components/toast";
import { ApiError, authenticatePin, getVenueInfo, joinTeam } from "@/lib/api";
import { deviceKey, pinStorageKey } from "@/lib/utils";
import Waiting from "@/components/waiting";

type Mode = "choice" | "pin" | "join" | "reveal";

function PinEntryContent({ venue_token }: { venue_token: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [venueName, setVenueName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [inactiveMsg, setInactiveMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Unknown device lands on a register-vs-PIN choice. A recognised device never
  // sees this — the effect below redirects it straight into the app (Case C).
  const [mode, setMode] = useState<Mode>("choice");

  // PIN entry
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Inline, persistent field error — a wrong PIN/code shouldn't just flash a
  // toast that vanishes in 2.5s with no lasting hint next to the field.
  const [pinError, setPinError] = useState<string | null>(null);

  // Join flow
  const [joinCode, setJoinCode] = useState("");
  const [joinName, setJoinName] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [revealPin, setRevealPin] = useState<string | null>(null);
  const [revealName, setRevealName] = useState<string>("");
  const [copied, setCopied] = useState(false);

  // Device "remember me" (§3): a returning staffer on this phone skips PIN
  // entry. On ?expired (a 401 elsewhere) the stored token is stale — clear it
  // and fall back to PIN rather than looping straight back into a failed auth.
  useEffect(() => {
    const expired = searchParams.get("expired");
    if (expired) {
      localStorage.removeItem(deviceKey(venue_token));
      // They had a session, so they already have a PIN — send them to PIN entry
      // rather than the first-time choice screen.
      setMode("pin");
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
      setPinError("Enter your 4-digit PIN");
      return;
    }
    setSubmitting(true);
    setPinError(null);
    try {
      await authenticatePin(venue_token, pin);
      // Remember this device so the PIN becomes recovery-only next time.
      rememberDevice(pin);
      router.push(`/v/${venue_token}/hub`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setPinError(err.message);
      } else if (err instanceof ApiError && err.status === 401) {
        setPinError("That PIN didn't match. Try again.");
      } else {
        setPinError("Something went wrong. Try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoin() {
    if (!/^\d{4}$/.test(joinCode)) {
      setJoinError("Enter the 4-digit join code");
      return;
    }
    if (!joinName.trim()) {
      setJoinError("Enter your name");
      return;
    }
    setJoining(true);
    setJoinError(null);
    try {
      const res = await joinTeam(venue_token, joinCode, joinName.trim());
      rememberDevice(res.pin);
      setRevealName(res.name);
      setRevealPin(res.pin);
      setMode("reveal");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setJoinError("That join code didn't match. Check with your manager.");
      } else if (err instanceof ApiError && (err.status === 429 || err.status === 403)) {
        setJoinError(err.message);
      } else {
        setJoinError("Something went wrong. Try again.");
      }
    } finally {
      setJoining(false);
    }
  }

  async function copyPin() {
    if (!revealPin) return;
    try {
      await navigator.clipboard.writeText(revealPin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure context / permissions) — the PIN is still
      // on screen to read, so this is a soft failure, not worth an error.
    }
  }

  if (loading) return <CenteredMessage>Loading…</CenteredMessage>;
  if (inactiveMsg) return <CenteredMessage>{inactiveMsg}</CenteredMessage>;
  if (notFound) return <CenteredMessage>This link isn&apos;t valid.</CenteredMessage>;

  return (
    // On the staff palette (.cp-staff) so the venue's light/dark theme applies
    // and every token resolves to the same values the rest of the app uses —
    // this is the first screen every staffer sees, it must look like the app.
    <div className="cp-staff min-h-screen bg-surface-page text-ink">
      <div className="mx-auto max-w-[440px] px-[22px] pt-6 pb-[env(safe-area-inset-bottom,26px)]">
        <div className="flex justify-end">
          <ModeToggle venueToken={venue_token} />
        </div>
        <div className="cp-hairline mt-3 animate-fadeIn overflow-hidden rounded-cp-card bg-surface-card">
          <div className="flex min-h-[480px] flex-col items-center justify-center px-6 py-10">
            {mode === "choice" && (
              <>
                <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-[18px] bg-accent-light">
                  <span className="text-[28px] font-medium text-accent">{venueName?.[0] ?? "R"}</span>
                </div>
                <div className="mb-1.5 text-center text-2xl font-medium text-ink">{venueName}</div>
                <div className="mb-8 max-w-[280px] text-center text-sm text-ink-muted">
                  Your team&apos;s shifts and availability, in one place.
                </div>

                <button
                  onClick={() => {
                    setMode("join");
                    setJoinCode("");
                    setJoinName("");
                  }}
                  className="w-full rounded-cp-control bg-accent py-4 text-center text-base font-medium text-accent-on transition-transform duration-150 active:scale-[0.98]"
                >
                  First time? Register
                </button>
                <button
                  onClick={() => {
                    setMode("pin");
                    setPin("");
                  }}
                  className="cp-hairline mt-3 w-full rounded-cp-control py-4 text-center text-base font-medium text-ink-muted transition-transform duration-150 active:scale-[0.98]"
                >
                  I already have a PIN
                </button>
              </>
            )}

            {mode === "pin" && (
              <>
                <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-[18px] bg-accent-light">
                  <span className="text-[28px] font-medium text-accent">{venueName?.[0] ?? "R"}</span>
                </div>
                <div className="mb-1.5 text-center text-2xl font-medium text-ink">{venueName}</div>
                <div className="mb-8 text-sm text-ink-muted">Enter your 4-digit PIN</div>

                <div className="mb-6 w-full">
                  <input
                    value={pin}
                    onChange={(e) => {
                      setPin(e.target.value.replace(/\D/g, "").slice(0, 4));
                      if (pinError) setPinError(null);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleContinue()}
                    inputMode="numeric"
                    autoFocus
                    maxLength={4}
                    placeholder="••••"
                    aria-invalid={pinError ? true : undefined}
                    className={`w-full rounded-cp-control bg-surface-subtle px-4 py-3.5 text-center text-2xl font-medium tracking-[0.5em] text-ink outline-none ${
                      pinError
                        ? "border-[0.5px] border-cp-red"
                        : "cp-hairline focus:border-accent"
                    }`}
                  />
                  {pinError && (
                    <div role="alert" className="mt-2 text-center text-[13px] text-cp-red">
                      {pinError}
                    </div>
                  )}
                </div>

                <button
                  onClick={handleContinue}
                  disabled={submitting}
                  className="w-full rounded-cp-control bg-accent py-4 text-center text-base font-medium text-accent-on transition-transform duration-150 active:scale-[0.98] disabled:opacity-60"
                >
                  {submitting ? <Waiting label="Checking…" /> : "Continue"}
                </button>

                <Link href={`/v/${venue_token}/forgot-pin`} className="mt-4 text-[13px] font-medium text-accent">
                  Forgot PIN?
                </Link>

                <button
                  onClick={() => setMode("choice")}
                  className="cp-hairline mt-8 w-full border-x-0 border-b-0 pt-6 text-center text-[13px] text-ink-muted"
                >
                  New here? <span className="font-medium text-accent">Register instead</span>
                </button>
              </>
            )}

            {mode === "join" && (
              <>
                <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-[18px] bg-accent-light">
                  <span className="text-[28px] font-medium text-accent">{venueName?.[0] ?? "R"}</span>
                </div>
                <div className="mb-1.5 text-center text-2xl font-medium text-ink">Join {venueName}</div>
                <div className="mb-8 max-w-[280px] text-center text-sm text-ink-muted">
                  Enter the join code your manager gave you, and your name.
                </div>

                <input
                  value={joinCode}
                  onChange={(e) => {
                    setJoinCode(e.target.value.replace(/\D/g, "").slice(0, 4));
                    if (joinError) setJoinError(null);
                  }}
                  inputMode="numeric"
                  autoFocus
                  maxLength={4}
                  placeholder="Join code"
                  className="cp-hairline mb-3 w-full rounded-cp-control bg-surface-subtle px-4 py-3.5 text-center text-xl font-medium tracking-[0.4em] text-ink outline-none focus:border-accent"
                />
                <div className="mb-6 w-full">
                  <input
                    value={joinName}
                    onChange={(e) => {
                      setJoinName(e.target.value);
                      if (joinError) setJoinError(null);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                    maxLength={80}
                    placeholder="Your name"
                    className="cp-hairline w-full rounded-cp-control bg-surface-subtle px-4 py-3.5 text-center text-lg font-medium text-ink outline-none focus:border-accent"
                  />
                  {joinError && (
                    <div role="alert" className="mt-2 text-center text-[13px] text-cp-red">
                      {joinError}
                    </div>
                  )}
                </div>

                <button
                  onClick={handleJoin}
                  disabled={joining}
                  className="w-full rounded-cp-control bg-accent py-4 text-center text-base font-medium text-accent-on transition-transform duration-150 active:scale-[0.98] disabled:opacity-60"
                >
                  {joining ? <Waiting label="Joining…" /> : "Join the team"}
                </button>

                <button onClick={() => setMode("pin")} className="mt-4 text-[13px] font-medium text-ink-muted">
                  I already have a PIN
                </button>
              </>
            )}

            {mode === "reveal" && revealPin && (
              <div className="cp-pop-pop flex flex-col items-center">
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-cp-green-soft text-cp-green">
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12l5 5l10 -10" />
                  </svg>
                </div>
                <div className="mb-1.5 text-center text-2xl font-medium text-ink">You&apos;re in{revealName ? `, ${revealName.split(" ")[0]}` : ""}.</div>
                <div className="mb-7 max-w-[290px] text-center text-sm text-ink-muted">
                  Here&apos;s your PIN. This is the only time we&apos;ll show it — add this page to your home
                  screen so you never need it again.
                </div>

                <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
                  Your PIN
                </div>
                <div className="mb-4 rounded-cp-card bg-accent-light px-8 py-5 text-[40px] font-medium tracking-[0.32em] text-accent">
                  {revealPin}
                </div>

                <button
                  onClick={copyPin}
                  className="mb-7 inline-flex items-center gap-1.5 text-[13px] font-medium text-accent transition-transform duration-150 active:scale-[0.97]"
                >
                  {copied ? (
                    <>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12l5 5l10 -10" />
                      </svg>
                      Copied
                    </>
                  ) : (
                    "Copy PIN"
                  )}
                </button>

                <button
                  onClick={() => router.push(`/v/${venue_token}/availability`)}
                  className="w-full rounded-cp-control bg-accent py-4 text-center text-base font-medium text-accent-on transition-transform duration-150 active:scale-[0.98]"
                >
                  Continue to availability
                </button>
                <div className="mt-4 max-w-[280px] text-center text-[12px] leading-[1.5] text-ink-muted">
                  You can submit availability now — your manager will confirm your role shortly.
                </div>
              </div>
            )}
          </div>
        </div>
        <Toast message={toast} />
      </div>
    </div>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="cp-staff min-h-screen bg-surface-page text-ink">
      <div className="mx-auto flex max-w-[440px] items-center justify-center px-6 py-24 text-center text-sm text-ink-muted">
        {children}
      </div>
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
