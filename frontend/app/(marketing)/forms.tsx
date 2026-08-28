"use client";

import { useEffect, useRef, useState } from "react";

import { ApiError, joinWaitlist, sendSuggestion } from "@/lib/api";

/* Waitlist + suggestion box. Both are public, unauthenticated writes. */

export function WaitlistForm({ id }: { id?: string }) {
  const [venueName, setVenueName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || done) return;
    setError(null);
    setSubmitting(true);
    try {
      await joinWaitlist(venueName.trim(), email.trim());
      setDone(true);
      setVenueName("");
      setEmail("");
      setTimeout(() => setDone(false), 3000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <form className="hero-form" onSubmit={handleSubmit} id={id}>
        <label className="sr" htmlFor={`${id ?? "wl"}-venue`}>
          Venue name
        </label>
        <input
          id={`${id ?? "wl"}-venue`}
          className="field"
          type="text"
          placeholder="Your venue's name"
          value={venueName}
          onChange={(e) => setVenueName(e.target.value)}
          required
        />
        <label className="sr" htmlFor={`${id ?? "wl"}-email`}>
          Email address
        </label>
        <input
          id={`${id ?? "wl"}-email`}
          className="field"
          type="email"
          placeholder="Your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button type="submit" className="btn btn-primary" disabled={submitting || done}>
          {done ? "Place requested ✓" : submitting ? "Sending…" : "Claim a pilot place"}
        </button>
      </form>
      {error ? (
        <p className="hero-note form-error" role="alert">
          {error}
        </p>
      ) : (
        <p className="hero-note">Free while we&apos;re in pilot. No card, no contract, no sales call.</p>
      )}
    </>
  );
}

export function SuggestionBox() {
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const doneRef = useRef<HTMLDivElement>(null);

  // Move focus to the confirmation so a screen-reader user knows it landed —
  // the form it replaces is gone, so focus would otherwise fall to the body.
  useEffect(() => {
    if (done) doneRef.current?.focus();
  }, [done]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await sendSuggestion(message.trim(), email.trim() || undefined);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send that — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="suggest">
        <div className="suggest-done" ref={doneRef} tabIndex={-1} role="status">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M4 10.5 8 14l8-8.5"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Got it — thank you. A person reads every one of these.
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ alignSelf: "flex-start", paddingInline: 0 }}
          onClick={() => {
            setDone(false);
            setMessage("");
            setEmail("");
          }}
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <form className="suggest" onSubmit={handleSubmit}>
      <label className="sr" htmlFor="suggest-msg">
        Your suggestion
      </label>
      <textarea
        id="suggest-msg"
        className="field"
        placeholder="What would make this genuinely useful for your place? Or what we've got wrong."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={2000}
        required
      />
      <div className="suggest-row">
        <label className="sr" htmlFor="suggest-email">
          Email address, optional
        </label>
        <input
          id="suggest-email"
          className="field"
          type="email"
          placeholder="Email, only if you'd like a reply"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? "Sending…" : "Send it"}
        </button>
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : (
        <p className="small">No email needed. Anonymous is fine.</p>
      )}
    </form>
  );
}
