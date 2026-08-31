"use client";

import { useState } from "react";

import type { Shift, Swap } from "@/lib/api";
import { DAY_LABELS } from "@/lib/utils";
import Waiting from "@/components/waiting";

type SwapsPanelProps = {
  swaps: Swap[];
  shifts: Shift[];
  busyId: string | null;
  onApprove: (swapId: string) => void;
  onReject: (swapId: string) => void;
};

export default function SwapsPanel({ swaps, shifts, busyId, onApprove, onReject }: SwapsPanelProps) {
  const [open, setOpen] = useState(true);

  if (swaps.length === 0) return null;

  const shiftsById = new Map(shifts.map((s) => [s.id, s]));

  return (
    <div className="mb-5 rounded-panel border border-warn-dot bg-warn-bg">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
      >
        <span className="text-[13px] font-medium text-warn-text">
          Shift swaps awaiting approval
          <span className="ml-2 font-normal opacity-80">{swaps.length}</span>
        </span>
        <span className={`shrink-0 text-warn-text transition-transform ${open ? "rotate-180" : ""}`}>⌄</span>
      </button>

      {open && (
        <div className="flex flex-col gap-2.5 border-t border-warn-dot px-4 pb-4 pt-3.5">
          {swaps.map((swap) => {
            const initiatorShift = shiftsById.get(swap.initiator_shift_id);
            const recipientShift = shiftsById.get(swap.recipient_shift_id);
            const busy = busyId === swap.id;
            return (
              <div key={swap.id} className="rounded-lg border border-hairline bg-surface-card p-3.5">
                <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
                  <span className="font-medium text-ink-label">
                    {swap.initiator_staff_name}&apos;s {DAY_LABELS[swap.initiator_day_index]}{" "}
                    {initiatorShift?.name ?? "shift"}
                  </span>
                  <span className="text-ink-faint">↔</span>
                  <span className="font-medium text-ink-label">
                    {swap.recipient_staff_name}&apos;s {DAY_LABELS[swap.recipient_day_index]}{" "}
                    {recipientShift?.name ?? "shift"}
                  </span>
                </div>
                {swap.reason && <div className="mb-2.5 text-[12px] text-ink-muted">{swap.reason}</div>}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onApprove(swap.id)}
                    disabled={busy}
                    className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-accent-on disabled:opacity-50"
                  >
                    {busy ? <Waiting label="Working…" /> : "Approve"}
                  </button>
                  <button
                    onClick={() => onReject(swap.id)}
                    disabled={busy}
                    className="rounded-lg bg-surface-subtle px-3 py-1.5 text-[12px] font-medium text-unavail-text disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
