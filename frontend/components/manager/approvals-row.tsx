"use client";

import type { Claim, Shift, Swap } from "@/lib/api";
import { DAY_LABELS } from "@/lib/utils";

// The approvals action-row (Dan's B2): a count-badged block above the grid
// surfacing pending claims + swaps, each with inline Approve / ✕. Someone is
// waiting on the manager; today they're buried under warning cards. The
// approve handlers are the page's existing ones — a rule-flagged approval
// still routes into the unified risk modal (B7) via `needs_confirm`.
type ApprovalsRowProps = {
  claims: Claim[];
  swaps: Swap[];
  shifts: Shift[];
  claimBusyId: string | null;
  swapBusyId: string | null;
  onApproveClaim: (assignmentId: string) => void;
  onRejectClaim: (assignmentId: string) => void;
  onApproveSwap: (swapId: string) => void;
  onRejectSwap: (swapId: string) => void;
};

function KindTag({ kind }: { kind: "claim" | "swap" }) {
  const styles =
    kind === "claim"
      ? "bg-accent-light text-accent"
      : "bg-[rgba(59,130,246,0.12)] text-[#2563eb]";
  return (
    <span
      className={`shrink-0 rounded-[5px] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] ${styles}`}
    >
      {kind}
    </span>
  );
}

export default function ApprovalsRow({
  claims,
  swaps,
  shifts,
  claimBusyId,
  swapBusyId,
  onApproveClaim,
  onRejectClaim,
  onApproveSwap,
  onRejectSwap,
}: ApprovalsRowProps) {
  const total = claims.length + swaps.length;
  if (total === 0) return null;

  const shiftsById = new Map(shifts.map((s) => [s.id, s]));

  const okBtn =
    "rounded-[7px] bg-accent px-2.5 py-1.5 text-[11.5px] font-medium text-white transition-[transform] active:scale-[0.96] disabled:opacity-50";
  const noBtn =
    "flex h-[30px] w-[30px] items-center justify-center rounded-[7px] border-[0.5px] border-hairline text-ink-muted transition-[transform] active:scale-[0.96] disabled:opacity-50";

  return (
    <div className="mb-3 rounded-[12px] border-[0.5px] border-accent-border bg-accent-light px-3.5 py-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-accent px-1.5 text-[12px] font-medium text-accent-on">
          {total}
        </span>
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-ink">Waiting on you</div>
          <div className="text-[11px] text-ink-muted">Staff have asked to change shifts</div>
        </div>
      </div>

      <div className="mt-2.5 flex flex-col gap-2">
        {claims.map((claim) => {
          const shift = shiftsById.get(claim.shift_id);
          const busy = claimBusyId === claim.assignment_id;
          return (
            <div
              key={`claim-${claim.assignment_id}`}
              className="flex items-center gap-2.5 rounded-[9px] border-[0.5px] border-hairline bg-surface-card px-2.5 py-2.5"
            >
              <KindTag kind="claim" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-medium text-ink">
                  {claim.claimant_staff_name} wants {DAY_LABELS[claim.day_index]} {shift?.name ?? "shift"}
                </div>
                <div className="truncate text-[11px] text-ink-muted">
                  {claim.reason ?? `from ${claim.original_staff_name}`}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button onClick={() => onApproveClaim(claim.assignment_id)} disabled={busy} className={okBtn}>
                  {busy ? "…" : "Approve"}
                </button>
                <button
                  onClick={() => onRejectClaim(claim.assignment_id)}
                  disabled={busy}
                  aria-label="Reject claim"
                  className={noBtn}
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}

        {swaps.map((swap) => {
          const busy = swapBusyId === swap.id;
          return (
            <div
              key={`swap-${swap.id}`}
              className="flex items-center gap-2.5 rounded-[9px] border-[0.5px] border-hairline bg-surface-card px-2.5 py-2.5"
            >
              <KindTag kind="swap" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-medium text-ink">
                  {swap.initiator_staff_name} ↔ {swap.recipient_staff_name}
                </div>
                <div className="truncate text-[11px] text-ink-muted">
                  {swap.initiator_staff_name}&apos;s {DAY_LABELS[swap.initiator_day_index]} for{" "}
                  {swap.recipient_staff_name}&apos;s {DAY_LABELS[swap.recipient_day_index]}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button onClick={() => onApproveSwap(swap.id)} disabled={busy} className={okBtn}>
                  {busy ? "…" : "Approve"}
                </button>
                <button
                  onClick={() => onRejectSwap(swap.id)}
                  disabled={busy}
                  aria-label="Reject swap"
                  className={noBtn}
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
