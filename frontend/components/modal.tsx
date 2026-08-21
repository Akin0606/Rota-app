"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

import { usePresence } from "@/lib/use-presence";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({ open, onClose, title, children }: ModalProps) {
  const { render, state } = usePresence(open, 260);
  const titleId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  // onClose is usually an inline arrow (new identity each render); keep it in a
  // ref so the focus/keydown effect only re-runs when `open` flips, not on every
  // parent render (which would otherwise yank focus back constantly).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    // Remember what had focus so we can restore it on close (keyboard/SR users
    // land back where they were), then move focus into the dialog. Done
    // synchronously — the effect already runs after the card is committed to the
    // DOM, so no rAF defer is needed (and rAF never fires in a hidden tab, which
    // would leave focus stranded on the trigger).
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const card = cardRef.current;
    const first = card?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? card)?.focus();

    function onKey(e: KeyboardEvent) {
      const card = cardRef.current;
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key === "Tab" && card) {
        const items = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (items.length === 0) {
          e.preventDefault();
          card.focus();
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !card.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!render) return null;

  return (
    <div
      data-state={state}
      className="cp-overlay fixed inset-0 z-[100] flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="cp-overlay-card w-full max-w-[380px] rounded-[20px] border border-hairline bg-surface-card p-7 shadow-[0_20px_60px_rgba(0,0,0,0.6)] focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div id={titleId} className="mb-5 text-lg font-bold text-ink">
          {title}
        </div>
        {children}
      </div>
    </div>
  );
}
