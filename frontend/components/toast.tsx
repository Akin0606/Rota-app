"use client";

import { useEffect, useRef } from "react";

import { usePresence } from "@/lib/use-presence";

type ToastProps = {
  message: string | null;
  /** "success" adds a check-mark that pops in — the earned beat when an action
   *  actually lands (a claim/swap approved), vs a calm toast for pending. */
  tone?: "success";
};

export default function Toast({ message, tone }: ToastProps) {
  const { render, state } = usePresence(!!message, 220);
  // Hold the last non-null message + tone so both stay put through the exit fade
  // instead of blanking the instant `message` clears.
  const lastMessage = useRef<string | null>(message);
  const lastTone = useRef<ToastProps["tone"]>(tone);
  useEffect(() => {
    if (message) {
      lastMessage.current = message;
      lastTone.current = tone;
    }
  }, [message, tone]);

  const shownTone = message ? tone : lastTone.current;

  return (
    <>
      {/* Persistent polite live region — always mounted, so a screen reader
          announces each toast on change even though the visual toast itself
          mounts and unmounts around the exit animation. */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {message ?? ""}
      </div>
      {render && (
        <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          {/* aria-hidden: the live region above owns the announcement, so the
              visual copy must not be read a second time. */}
          <div
            aria-hidden="true"
            data-state={state}
            className="cp-toast flex items-center gap-2 rounded-xl border border-hairline bg-surface-subtle px-4 py-3 text-sm font-medium text-ink shadow-card"
          >
            {shownTone === "success" && (
              <span className="cp-pop-in inline-flex shrink-0 text-cp-green">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12l5 5l10 -10" />
                </svg>
              </span>
            )}
            <span>{message ?? lastMessage.current}</span>
          </div>
        </div>
      )}
    </>
  );
}
