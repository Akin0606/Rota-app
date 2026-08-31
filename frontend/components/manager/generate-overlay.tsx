"use client";

import { useMemo } from "react";

import Mark from "@/components/mark";
import type { RotaSummary, Shift } from "@/lib/api";
import { usePresence } from "@/lib/use-presence";
import { DAY_LABELS } from "@/lib/utils";

import ManagerIcon from "./icon";

// The generate overlay: a stepped solving animation that resolves to an honest
// result. Shared by the rota page and the Scheduler's Generate bar, so there is
// one definition of what generating looks like.
//
// The animation and the ending are deliberately decoupled. Every moving part is
// a CSS keyframe (see .cp-gen-* in globals.css) running on the compositor, and
// NOTHING here decides when the wait is over — this state is replaced the moment
// `result || error` lands. A scripted timeline that "completed" while a cold
// Render instance was still solving would be worse than an honest indeterminate
// wheel, which is why the rail never reaches 100%.
type GenerateOverlayProps = {
  open: boolean;
  // null while the solver is running; set when it resolves.
  result: RotaSummary | null;
  error: string | null;
  shifts: Shift[];
  onAdjustRules: () => void;
  onReviewRota: () => void;
  onClose: () => void;
};

// Four beats, in the order the solver genuinely works: it reads availability,
// balances hours as a tie-break, hard-blocks on compliance, then places. Naming
// them is the justification for a wait longer than 300ms — the manager learns
// what the app is doing for them, which is the whole pitch.
const PHASES = [
  "Reading everyone's availability",
  "Balancing hours fairly",
  "Checking rest gaps & under-18 rules",
  "Placing the shifts",
];

// Reduced motion is handled entirely in CSS (see .cp-gen-* in globals.css), so
// there is no matchMedia hook here any more. That also removes the only reason
// this component re-rendered while a solve was in flight.

export default function GenerateOverlay({
  open,
  result,
  error,
  shifts,
  onAdjustRules,
  onReviewRota,
  onClose,
}: GenerateOverlayProps) {
  const shiftsById = useMemo(() => new Map(shifts.map((s) => [s.id, s])), [shifts]);

  const { render, state } = usePresence(open, 260);
  if (!render) return null;

  return (
    <div
      data-state={state}
      className="cp-overlay fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-6"
    >
      <div className="cp-overlay-card cp-manager w-full max-w-[380px] rounded-cp-card border-[0.5px] border-hairline bg-surface-card p-8 text-center">
        {error ? (
          <ErrorState message={error} onClose={onClose} />
        ) : result ? (
          <ResultState
            result={result}
            shiftsById={shiftsById}
            onAdjustRules={onAdjustRules}
            onReviewRota={onReviewRota}
          />
        ) : (
          <RunningState />
        )}
      </div>
    </div>
  );
}

function RunningState() {
  return (
    <div className="flex flex-col items-center py-2">
      {/* The wheel does every wait. A rota is a wheel, and this is the longest
          wait in the app, so it is the one place that most has to look like
          Rotally rather than like a generic control. */}
      <div className="mb-5 flex items-center justify-center gap-2.5">
        <Mark spinning className="h-[26px] w-[26px] text-ink" />
        <span className="text-[19px] font-medium tracking-[-0.4px] text-ink">
          Building your rota
        </span>
      </div>

      <div className="cp-gen-rail mb-[18px] h-[5px] w-full max-w-[230px] overflow-hidden rounded-full bg-cp-track">
        <i />
      </div>

      {/* The steps are a live region so a screen reader hears the explanation
          too — the wheel itself is aria-hidden, as a decorative mark should be. */}
      <div className="flex w-full max-w-[250px] flex-col gap-0.5" aria-live="polite">
        {PHASES.map((label) => (
          <div key={label} className="cp-gen-step flex items-center gap-2.5 px-0.5 py-[5px] text-left">
            <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-cp-green-soft text-cp-green">
              <ManagerIcon name="check" size={11} strokeWidth={2.25} />
            </span>
            <span className="text-[12.5px] text-ink">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ErrorState({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center py-2">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-[18px] bg-cp-red-soft text-cp-red">
        <ManagerIcon name="alert-triangle" size={28} />
      </div>
      <div className="mb-1.5 text-[19px] font-medium tracking-[-0.4px] text-ink">Couldn&apos;t generate</div>
      <div className="mb-6 text-[13px] text-ink-muted">{message}</div>
      <button
        onClick={onClose}
        className="w-full rounded-cp-control border-[0.5px] border-hairline bg-surface-card py-3 text-[13px] font-medium text-ink"
      >
        Close
      </button>
    </div>
  );
}

function ResultState({
  result,
  shiftsById,
  onAdjustRules,
  onReviewRota,
}: {
  result: RotaSummary;
  shiftsById: Map<string, Shift>;
  onAdjustRules: () => void;
  onReviewRota: () => void;
}) {
  const filled = result.assignments.filter((a) => a.staff_id).length;
  const gaps =
    result.uncovered.length +
    result.under_covered.reduce((sum, u) => sum + Math.max(0, u.required - u.assigned), 0);
  const totalRequired = filled + gaps;
  const compliant = result.conflicts === 0;

  // Name the specific unfilled slots so a gap is never a silent number.
  const gapLabels: string[] = [];
  for (const u of result.under_covered) {
    const sh = shiftsById.get(u.shift_id);
    const short = Math.max(0, u.required - u.assigned);
    if (sh && short > 0) gapLabels.push(`${DAY_LABELS[u.day_index]} ${sh.name} (needs ${short} more)`);
  }
  for (const u of result.uncovered) {
    const sh = shiftsById.get(u.shift_id);
    if (sh) gapLabels.push(`${DAY_LABELS[u.day_index]} ${sh.name}`);
  }
  const shownGaps = gapLabels.slice(0, 3);
  const moreGaps = gapLabels.length - shownGaps.length;

  return (
    <div className="flex flex-col items-center">
      <div className="cp-pop-in mb-[18px] flex h-16 w-16 items-center justify-center rounded-[18px] bg-cp-green-soft text-cp-green">
        <ManagerIcon name="check" size={30} strokeWidth={2.25} />
      </div>
      <div className="mb-1.5 text-[21px] font-medium tracking-[-0.4px] text-ink">Rota generated</div>
      <div className="mb-6 text-[13px] text-ink-muted">
        {filled} of {totalRequired} shift{totalRequired === 1 ? "" : "s"} filled ·{" "}
        {compliant
          ? "all compliance rules met"
          : `${result.conflicts} to review`}
      </div>

      <div className="mb-3.5 flex w-full gap-2.5">
        <div className="flex-1 rounded-cp-panel border-[0.5px] border-hairline bg-surface-card p-3.5">
          <div className="text-[22px] font-medium text-cp-green">{filled}</div>
          <div className="mt-0.5 text-[11px] text-ink-muted">shifts filled</div>
        </div>
        <div className="flex-1 rounded-cp-panel border-[0.5px] border-hairline bg-surface-card p-3.5">
          <div className={`text-[22px] font-medium ${gaps > 0 ? "text-cp-amber" : "text-ink"}`}>{gaps}</div>
          <div className="mt-0.5 text-[11px] text-ink-muted">gap{gaps === 1 ? "" : "s"}</div>
        </div>
      </div>

      {gaps > 0 && (
        <div className="mb-[22px] flex w-full items-start gap-2.5 rounded-cp-control border-[0.5px] border-cp-amber/30 bg-cp-amber-soft px-3.5 py-3 text-left">
          <span className="mt-0.5 text-cp-amber">
            <ManagerIcon name="alert-triangle" size={16} />
          </span>
          <div className="text-[12px] leading-[1.45] text-ink">
            <strong className="font-semibold">
              {gaps} shift{gaps === 1 ? "" : "s"} couldn&apos;t be filled
            </strong>{" "}
            — {shownGaps.join(", ")}
            {moreGaps > 0 ? `, +${moreGaps} more` : ""}. No eligible staff free; review on the rota.
          </div>
        </div>
      )}
      {gaps === 0 && <div className="mb-[22px]" />}

      <div className="flex w-full gap-2.5">
        <button
          onClick={onAdjustRules}
          className="flex-1 rounded-cp-control border-[0.5px] border-hairline bg-surface-card py-3 text-[13px] font-medium text-ink"
        >
          Adjust rules
        </button>
        <button
          onClick={onReviewRota}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-cp-control bg-accent py-3 text-[13px] font-medium text-accent-on"
        >
          <ManagerIcon name="eye" size={14} /> Review rota
        </button>
      </div>
    </div>
  );
}
