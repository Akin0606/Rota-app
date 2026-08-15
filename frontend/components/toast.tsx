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

  if (!render) return null;

  return (
    <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div
        data-state={state}
        className="cp-toast rounded-xl border border-hairline bg-surface-subtle px-4 py-3 text-sm font-medium text-ink shadow-card"
      >
        {message ?? lastMessage.current}
      </div>
    </div>
  );
}
