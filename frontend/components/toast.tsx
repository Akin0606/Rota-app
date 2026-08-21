"use client";

import { useEffect, useRef } from "react";

import { usePresence } from "@/lib/use-presence";

type ToastProps = {
  message: string | null;
};

export default function Toast({ message }: ToastProps) {
  const { render, state } = usePresence(!!message, 220);
  // Hold the last non-null message so the text stays put through the exit fade
  // instead of blanking the instant `message` clears.
  const lastMessage = useRef<string | null>(message);
  useEffect(() => {
    if (message) lastMessage.current = message;
  }, [message]);

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
            className="cp-toast rounded-xl border border-hairline bg-surface-subtle px-4 py-3 text-sm font-medium text-ink shadow-card"
          >
            {message ?? lastMessage.current}
          </div>
        </div>
      )}
    </>
  );
}
