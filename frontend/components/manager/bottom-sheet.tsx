"use client";

import type { ReactNode } from "react";

import { usePresence } from "@/lib/use-presence";

import ManagerIcon from "./icon";

// The reference's bottom-sheet pattern (grab handle + sticky header + scroll
// body + sticky footer), shared by Add role / Add member / Edit member. Not a
// portal — renders in place, so callers inside `.cp-manager` inherit the
// manager palette automatically (same reasoning as the staff-side Modal).
type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  avatarLabel?: string;
  footer: ReactNode;
  children: ReactNode;
};

export default function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  avatarLabel,
  footer,
  children,
}: BottomSheetProps) {
  const { render, state } = usePresence(open, 320);
  if (!render) return null;

  return (
    <div
      data-state={state}
      className="cp-overlay fixed inset-0 z-[100] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="cp-sheet-card flex max-h-[88vh] w-full max-w-[460px] flex-col rounded-t-cp-card border-t-[0.5px] border-hairline bg-surface-card sm:rounded-cp-card sm:border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pb-1 pt-2.5 sm:hidden">
          <span className="h-1 w-9 rounded-full bg-cp-track" />
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 pb-4 pt-1">
          {avatarLabel ? (
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-light text-sm font-medium text-accent">
                {avatarLabel}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[17px] font-medium text-ink">{title}</div>
                {subtitle && <div className="mt-0.5 text-xs text-ink-muted">{subtitle}</div>}
              </div>
            </div>
          ) : (
            <div className="text-lg font-medium text-ink">{title}</div>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-cp-icon text-ink-muted"
          >
            <ManagerIcon name="x" size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {/* pb includes env(safe-area-inset-bottom) so the opaque sheet fills the
            iOS home-indicator zone — otherwise the dark backdrop composites
            behind the buttons under Safari's translucent toolbar as a shadow. */}
        <div className="flex gap-2.5 border-t border-hairline px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {footer}
        </div>
      </div>
    </div>
  );
}
