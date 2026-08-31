"use client";

import { useState } from "react";

import type { RotaOrientation } from "@/components/rota-grid";
import { ApiError, EmailDelivery, emailRota, fetchRotaExport } from "@/lib/api";

type PublishPanelProps = {
  open: boolean;
  onClose: () => void;
  periodId: string | null;
  orientation: RotaOrientation;
  weekLabel: string;
  // Delivery result from the publish itself (staff emails sent on publish).
  publishResult: EmailDelivery | null;
  onViewImage: () => void;
};

type ActionState = { status: "idle" | "loading" | "done" | "error"; message?: string };

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function PublishPanel({
  open,
  onClose,
  periodId,
  orientation,
  weekLabel,
  publishResult,
  onViewImage,
}: PublishPanelProps) {
  const [pdf, setPdf] = useState<ActionState>({ status: "idle" });
  const [xlsx, setXlsx] = useState<ActionState>({ status: "idle" });
  const [staffEmail, setStaffEmail] = useState<ActionState>({ status: "idle" });
  const [managerEmail, setManagerEmail] = useState<ActionState>({ status: "idle" });

  async function download(format: "pdf" | "xlsx", set: (s: ActionState) => void) {
    if (!periodId) return;
    set({ status: "loading" });
    try {
      const { blob, filename } = await fetchRotaExport(periodId, format, orientation);
      triggerDownload(blob, filename);
      set({ status: "done", message: "Downloaded" });
    } catch (err) {
      set({ status: "error", message: err instanceof ApiError ? err.message : "Download failed" });
    }
  }

  async function email(target: "staff" | "manager", set: (s: ActionState) => void) {
    if (!periodId) return;
    set({ status: "loading" });
    try {
      const res = await emailRota(periodId, { target, orientation });
      if (res.failed > 0 && res.sent === 0) {
        set({
          status: "error",
          message: res.errors[0] ?? `${res.failed} failed`,
        });
      } else {
        const parts: string[] = [];
        if (res.sent > 0) parts.push(`${res.sent} sent`);
        if (res.failed > 0) parts.push(`${res.failed} failed`);
        if (res.skipped_no_email > 0) parts.push(`${res.skipped_no_email} no email`);
        set({ status: "done", message: parts.join(" · ") || "Sent" });
      }
    } catch (err) {
      set({ status: "error", message: err instanceof ApiError ? err.message : "Email failed" });
    }
  }

  const actions = [
    {
      key: "pdf",
      title: "Download as PDF",
      sub: `Branded, ${orientation === "day-rows" ? "days × staff" : "staff × days"} layout`,
      state: pdf,
      onClick: () => download("pdf", setPdf),
      cta: "Download",
    },
    {
      key: "xlsx",
      title: "Download as Excel",
      sub: "Editable .xlsx spreadsheet",
      state: xlsx,
      onClick: () => download("xlsx", setXlsx),
      cta: "Download",
    },
    {
      key: "staff",
      title: "Email all staff",
      sub: "Each person's shifts, with the PDF attached",
      state: staffEmail,
      onClick: () => email("staff", setStaffEmail),
      cta: "Send",
    },
    {
      key: "manager",
      title: "Email manager",
      sub: "Full rota to your inbox, PDF attached",
      state: managerEmail,
      onClick: () => email("manager", setManagerEmail),
      cta: "Send",
    },
  ];

  return (
    // overflow-hidden matters: the panel is parked off-screen at translate-x-full
    // while closed, and a transform doesn't take an element out of the scroll
    // area — so without this the document scrolls sideways into 375px of blank
    // space on a phone, on every screen that mounts this. `invisible` when
    // closed also keeps its whole control set (export, email, image) out of the
    // tab order rather than leaving a hidden focus trap beside the page.
    <div
      className={`fixed inset-0 z-50 overflow-hidden ${
        open ? "" : "invisible pointer-events-none"
      }`}
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/30 transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      {/* Panel */}
      <div
        className={`absolute right-0 top-0 flex h-full w-full max-w-[400px] flex-col bg-surface-page shadow-2xl transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-label="Publish options"
      >
        <div className="flex items-start justify-between border-b border-hairline p-5">
          <div>
            <div className="flex items-center gap-2 text-[15px] font-bold text-ink">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-avail-bg text-avail-text">
                ✓
              </span>
              Rota published
            </div>
            <div className="mt-1 text-[13px] text-ink-muted">{weekLabel}</div>
            {publishResult && (
              <div className="mt-2 text-[12px] text-ink-faint">
                {publishResult.sent > 0 && `${publishResult.sent} staff emailed on publish. `}
                {publishResult.failed > 0 && `${publishResult.failed} failed. `}
                {publishResult.skipped_no_email > 0 &&
                  `${publishResult.skipped_no_email} without email.`}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-1 text-ink-faint hover:bg-surface-card hover:text-ink"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-3 overflow-y-auto p-5">
          <div className="rounded-panel border border-hairline bg-surface-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[14px] font-semibold text-ink">View as Image</div>
                <div className="truncate text-[12px] text-ink-muted">Clean layout — screenshot to share</div>
              </div>
              <button
                onClick={() => {
                  onViewImage();
                  onClose();
                }}
                className="shrink-0 rounded-[10px] bg-accent px-3.5 py-2 text-[13px] font-semibold text-accent-on"
              >
                View
              </button>
            </div>
          </div>
          {actions.map((a) => (
            <div key={a.key} className="rounded-panel border border-hairline bg-surface-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold text-ink">{a.title}</div>
                  <div className="truncate text-[12px] text-ink-muted">{a.sub}</div>
                </div>
                <button
                  onClick={a.onClick}
                  disabled={a.state.status === "loading"}
                  className="shrink-0 rounded-[10px] bg-accent px-3.5 py-2 text-[13px] font-semibold text-accent-on disabled:opacity-50"
                >
                  {a.state.status === "loading" ? "…" : a.cta}
                </button>
              </div>
              {a.state.message && (
                <div
                  className={`mt-2 text-[12px] ${
                    a.state.status === "error" ? "text-unavail-text" : "text-avail-text"
                  }`}
                >
                  {a.state.message}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
