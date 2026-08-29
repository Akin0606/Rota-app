"use client";

import { useState } from "react";

import type { Claim, Shift } from "@/lib/api";
import { DAY_LABELS } from "@/lib/utils";

type ClaimsPanelProps = {
  claims: Claim[];
  shifts: Shift[];
  busyId: string | null;
  onApprove: (assignmentId: string) => void;
  onReject: (assignmentId: string) => void;
};

export default function ClaimsPanel({ claims, shifts, busyId, onApprove, onReject }: ClaimsPanelProps) {
  const [open, setOpen] = useState(true);

  if (claims.length === 0) return null;

  const shiftsById = new Map(shifts.map((s) => [s.id, s]));

  return (
    <div className="mb-5 rounded-panel border border-warn-dot bg-warn-bg">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
      >
        <span className="text-[13px] font-semibold text-warn-text">
          Shift claims awaiting approval
          <span className="ml-2 font-normal opacity-80">{claims.length}</span>
        </span>
        <span className={`shrink-0 text-warn-text transition-transform ${open ? "rotate-180" : ""}`}>⌄</span>
      </button>

      {open && (
        <div className="flex flex-col gap-2.5 border-t border-warn-dot px-4 pb-4 pt-3.5">
          {claims.map((claim) => {
            const shift = shiftsById.get(claim.shift_id);
            const busy = busyId === claim.assignment_id;
            return (
              <div
                key={claim.assignment_id}
                className="rounded-lg border border-hairline bg-surface-card p-3.5"
              >
                <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
                  <span className="font-semibold text-ink-label">
                    {DAY_LABELS[claim.day_index]} · {shift?.name ?? "Shift"}
                  </span>
                  <span className="text-ink-faint">
                    {claim.original_staff_name} → {claim.claimant_staff_name}
                  </span>
                </div>
                {claim.reason && <div className="mb-2.5 text-[12px] text-ink-muted">{claim.reason}</div>}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onApprove(claim.assignment_id)}
                    disabled={busy}
                    className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-accent-on disabled:opacity-50"
                  >
                    {busy ? "Working…" : "Approve"}
                  </button>
                  <button
                    onClick={() => onReject(claim.assignment_id)}
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
