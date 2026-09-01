"use client";

import { useEffect, useRef, useState } from "react";

import ManagerIcon from "@/components/manager/icon";
import ModeToggle from "@/components/manager/mode-toggle";
import { ApiError, requestLoginCode, verifyLoginCode, warmBackend } from "@/lib/api";
import Wordmark from "@/components/wordmark";
import Mark from "@/components/mark";
import Waiting from "@/components/waiting";

// Supabase's OTP length is a per-project setting (Auth → Email → OTP length) and
// each environment has its own project, so this cannot be a single constant: a
// staging project left on Supabase's default 6 would render six digits into
// eight boxes and leave Verify permanently disabled. Set
// NEXT_PUBLIC_OTP_LENGTH per environment to match that project; 8 is what the
// production project issues, so it stays the default.
const OTP_LENGTH = Number(process.env.NEXT_PUBLIC_OTP_LENGTH) || 8;
const RESEND_SECONDS = 30;

type Step = "email" | "code";

export default function LoginPage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");

  return (
    <div className="cp-manager flex min-h-screen flex-col bg-surface-page text-ink">
      <div className="mx-auto flex w-full max-w-[460px] flex-1 flex-col px-2">
        <div className="flex justify-end px-5 pt-[18px]">
          <ModeToggle />
        </div>

        <div className="flex flex-1 flex-col justify-center px-7 pb-10">
          <div className="mb-10 text-center">
            <div className="mx-auto mb-[18px] flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-on">
              <ManagerIcon name="calendar-bolt" size={27} />
            </div>
            <Wordmark className="text-[26px]" />
            <div className="mt-1.5 text-[13px] text-ink-muted">Manager sign in</div>
          </div>

          {step === "email" ? (
            <EmailStep
              email={email}
              setEmail={setEmail}
              onSent={() => setStep("code")}
            />
          ) : (
            <CodeStep email={email} onBack={() => setStep("email")} />
          )}
        </div>

        <div className="px-7 pb-6 text-center text-[11px] text-ink-faint">
          By signing in you agree to our Terms and Privacy Policy
        </div>
      </div>
    </div>
  );
}

function EmailStep({
  email,
  setEmail,
  onSent,
}: {
  email: string;
  setEmail: (v: string) => void;
  onSent: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    if (!email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      await requestLoginCode(email);
      onSent();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send code, please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <div className="mb-[9px] text-xs font-medium text-ink-muted">Work email</div>
      <div className="relative mb-4 flex items-center">
        <ManagerIcon name="mail" size={17} className="absolute left-[15px] text-ink-faint" />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          type="email"
          autoFocus
          placeholder="you@venue.com"
          className="cp-hairline w-full rounded-xl bg-surface-card py-[15px] pl-11 pr-[15px] text-[15px] font-medium text-ink outline-none focus:border-accent"
        />
      </div>

      {error && (
        <div className="mb-3 rounded-xl bg-cp-red-soft px-3.5 py-2.5 text-center text-[13px] font-medium text-cp-red">
          {error}
        </div>
      )}

      <button
        onClick={handleSend}
        disabled={sending}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-[15px] text-[15px] font-medium text-accent-on transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        <ManagerIcon name="arrow-right" size={17} />
        {sending ? <Waiting label="Sending…" /> : "Send login code"}
      </button>

      <div className="mt-4 text-center text-xs leading-relaxed text-ink-faint">
        We&apos;ll email you a sign-in code — {OTP_LENGTH} digits, no password to remember.
      </div>
      <div className="mt-2 text-center text-xs text-ink-muted">
        Staff member?{" "}
        <a href="/" className="font-medium text-accent">
          Use your venue link
        </a>
      </div>
    </div>
  );
}

function CodeStep({ email, onBack }: { email: string; onBack: () => void }) {
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [verifying, setVerifying] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(RESEND_SECONDS);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  // Resend countdown — ticks down to 0, then "Resend code" becomes tappable.
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const code = digits.join("");
  const complete = code.length === OTP_LENGTH;

  function setDigitAt(i: number, v: string) {
    setDigits((prev) => {
      const next = [...prev];
      next[i] = v;
      return next;
    });
  }

  function handleChange(i: number, raw: string) {
    const v = raw.replace(/\D/g, "");
    if (!v) {
      setDigitAt(i, "");
      return;
    }
    // A paste (or fast typing) can drop several digits into one box — spread
    // them across the following boxes rather than truncating to one.
    if (v.length > 1) {
      setDigits((prev) => {
        const next = [...prev];
        for (let k = 0; k < v.length && i + k < OTP_LENGTH; k++) next[i + k] = v[k];
        return next;
      });
      const landed = Math.min(i + v.length, OTP_LENGTH - 1);
      inputs.current[landed]?.focus();
      return;
    }
    setDigitAt(i, v);
    if (i < OTP_LENGTH - 1) inputs.current[i + 1]?.focus();
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    } else if (e.key === "Enter" && complete) {
      handleVerify();
    }
  }

  async function handleVerify() {
    if (!complete) {
      setError("Enter the code from your email.");
      return;
    }
    setVerifying(true);
    setError(null);
    try {
      await verifyLoginCode(email, code);
      // Show the honest cold-start loader and wake the backend before the hard
      // navigation, so the dashboard's server render isn't a blank 30–60s wait.
      setSigningIn(true);
      await warmBackend();
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
    if (countdown > 0 || resending) return;
    setResending(true);
    setError(null);
    try {
      await requestLoginCode(email);
      setDigits(Array(OTP_LENGTH).fill(""));
      setCountdown(RESEND_SECONDS);
      inputs.current[0]?.focus();
    } catch {
      setError("Could not resend, please try again.");
    } finally {
      setResending(false);
    }
  }

  if (signingIn) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <Mark spinning className="h-8 w-8 text-ink-faint" />
        <div className="text-sm text-ink-muted">Signing you in…</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-[11px] rounded-xl border-[0.5px] border-[rgba(46,204,113,0.25)] bg-cp-green-soft px-[15px] py-[13px]">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgba(46,204,113,0.2)] text-cp-green">
          <ManagerIcon name="mail-check" size={15} />
        </div>
        <div className="text-xs leading-snug">
          <span className="font-medium">Code sent</span>
          <br />
          <span className="text-ink-muted">Check {email || "your email"}</span>
        </div>
      </div>

      <div className="mb-[9px] text-center text-xs font-medium text-ink-muted">
        Enter your {OTP_LENGTH}-digit code
      </div>
      <div className="mb-5 flex justify-center gap-1.5">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              inputs.current[i] = el;
            }}
            value={d}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={OTP_LENGTH}
            autoFocus={i === 0}
            aria-label={`Digit ${i + 1}`}
            className={`h-14 min-w-0 flex-1 rounded-xl border-[0.5px] text-center text-[22px] font-medium outline-none transition-colors sm:max-w-[46px] ${
              d
                ? "border-accent bg-accent-light text-accent"
                : "border-hairline bg-surface-card text-ink focus:border-accent"
            }`}
          />
        ))}
      </div>

      {error && (
        <div className="mb-3 text-center text-[13px] font-medium text-cp-red">{error}</div>
      )}

      <button
        onClick={handleVerify}
        disabled={verifying || !complete}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-[15px] text-[15px] font-medium text-accent-on transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        <ManagerIcon name="lock-open" size={17} />
        {verifying ? <Waiting label="Verifying…" /> : "Verify & sign in"}
      </button>

      <div className="mt-[18px] text-center text-xs text-ink-muted">
        Didn&apos;t get it?{" "}
        <button
          onClick={handleResend}
          disabled={countdown > 0 || resending}
          className="font-medium text-accent disabled:text-ink-faint"
        >
          Resend code
        </button>
        {countdown > 0 && ` · in 0:${String(countdown).padStart(2, "0")}`}
      </div>

      <button
        onClick={onBack}
        className="mt-5 flex w-full items-center justify-center gap-1.5 text-[13px] text-ink-muted"
      >
        <ManagerIcon name="arrow-left" size={15} />
        Use a different email
      </button>
    </div>
  );
}
