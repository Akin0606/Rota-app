"use client";
import Waiting from "@/components/waiting";

// One risk modal for all three manager-side confirm paths (manual add / approve
// claim / approve swap) — B7. The title *names the rule that fired* instead of
// the old generic "breaks a rest rule". The backend returns a full-sentence
// `reason` (which already names the person and the numbers); we classify it into
// a short tag + title here so no backend/deploy change is needed and the strings
// stay in one place. Under-18 legal blocks never reach this modal — they are
// hard-blocked server-side and surface as an error toast, never a confirm.

type RiskKind = "add" | "claim" | "swap";

type RotaRiskModalProps = {
  open: boolean;
  kind: RiskKind;
  reason: string | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

// Map a reason sentence onto the rule it describes. Markers are stable because
// they come from solver.check_manual_assignment, which this repo owns.
function classify(reason: string | null): { tag: string; title: string } {
  const r = (reason ?? "").toLowerCase();
  if (r.includes("weekly limit")) {
    return { tag: "Max hours", title: "Over their weekly hours limit" };
  }
  if (r.includes("rest")) {
    return { tag: "Rest gap", title: "Not enough rest between shifts" };
  }
  if (r.includes("day off") || r.includes("days off") || r.includes("7 days")) {
    return { tag: "Day off", title: "This leaves no day off that week" };
  }
  if (r.includes("leave")) {
    return { tag: "On leave", title: "They have leave booked that day" };
  }
  return { tag: "Check", title: "This may break a scheduling rule" };
}

export default function RotaRiskModal({
  open,
  kind,
  reason,
  busy,
  onCancel,
  onConfirm,
}: RotaRiskModalProps) {
  if (!open) return null;

  const { tag, title } = classify(reason);
  const confirmLabel = kind === "add" ? "Assign anyway" : "Approve anyway";
  const action = kind === "add" ? "assign" : "approve";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
      <div className="w-full max-w-[440px] rounded-card border-[0.5px] border-warn-dot bg-surface-card p-[18px]">
        <span className="mb-2.5 inline-block rounded-[5px] bg-cp-amber-soft px-2 py-[3px] text-[9.5px] font-semibold uppercase tracking-[0.07em] text-cp-amber">
          {tag}
        </span>
        <div className="mb-1.5 font-display text-[16px] font-medium text-ink">{title}</div>
        <div className="mb-4 text-[12.5px] leading-relaxed text-ink-muted">
          {reason ?? "This falls short of the venue's rules."} Your call, not the law — {action} anyway
          only if you&apos;re sure.
        </div>
        <div className="flex items-center justify-end gap-2.5">
          <button
            onClick={onCancel}
            className="rounded-[10px] border-[0.5px] border-hairline px-4 py-2.5 text-[12.5px] font-medium text-ink-muted transition-[transform] active:scale-[0.97]"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="rounded-[10px] bg-cp-amber px-5 py-2.5 text-[12.5px] font-medium text-[#1a1815] transition-[transform] active:scale-[0.97] disabled:opacity-60"
          >
            {busy ? <Waiting label="Saving…" /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
