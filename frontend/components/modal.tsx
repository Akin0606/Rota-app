"use client";

import type { ReactNode } from "react";

import { usePresence } from "@/lib/use-presence";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
};

export default function Modal({ open, onClose, title, children }: ModalProps) {
  const { render, state } = usePresence(open, 260);
  if (!render) return null;

  return (
    <div
      data-state={state}
      className="cp-overlay fixed inset-0 z-[100] flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="cp-overlay-card w-full max-w-[380px] rounded-[20px] border border-hairline bg-surface-card p-7 shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 text-lg font-bold text-ink">{title}</div>
        {children}
      </div>
    </div>
  );
}
