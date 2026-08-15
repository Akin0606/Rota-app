"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { RotaSummary, Shift } from "@/lib/api";
import { usePresence } from "@/lib/use-presence";
import { DAY_LABELS } from "@/lib/utils";

import ManagerIcon from "./icon";

// The reference's "Generate" screen: a stepped solving animation that resolves
// to an honest result. The phases mirror the real solver's objective order
// (coverage → preferences → compliance), minus fairness (omitted — the solver
// balances hours as a fixed tie-break, not a tunable phase). Shared by the rota
// page's Auto-fill and the Scheduler's Generate bar so there's one definition of
// "what generating looks like".
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

const PHASES = [
  "Reading availability & leave",
  "Matching coverage & roles",
  "Checking compliance & under-18s",
];

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export default function GenerateOverlay({
  open,
  result,
  error,
  shifts,
  onAdjustRules,
  onReviewRota,
  onClose,
}: GenerateOverlayProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [step, setStep] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const running = open && !result && !error;

  // Advance the phase label while the solver runs. Purely cosmetic — the real
  // request is a single await; this just paces the reassurance. Skipped under
  // reduced motion, which shows a single static line instead.
  useEffect(() => {
    if (!running || reducedMotion) return;
    setStep(0);
    timer.current = setInterval(() => {
      setStep((s) => (s < PHASES.length - 1 ? s + 1 : s));
    }, 850);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [running, reducedMotion]);

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
          <RunningState step={step} reducedMotion={reducedMotion} />
        )}
      </div>
    </div>
  );
}

function RunningState({ step, reducedMotion }: { step: number; reducedMotion: boolean }) {
  return (
    <div className="flex flex-col items-center py-2">
      <div
        className={`mb-6 flex h-16 w-16 items-center justify-center rounded-[18px] bg-accent-light text-accent ${
          reducedMotion ? "" : "animate-pulse"
        }`}
      >
        <ManagerIcon name="sparkles" size={30} />
      </div>
      <div className="mb-1 text-[19px] font-medium tracking-[-0.4px] text-ink">Building your rota</div>
      {reducedMotion ? (
        <div className="text-[13px] text-ink-muted">Solving — this takes a few seconds.</div>
      ) : (
        <div className="flex w-full flex-col gap-2 pt-4">
          {PHASES.map((label, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <div key={label} className="flex items-center gap-2.5 text-left">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${
                    done
                      ? "bg-cp-green-soft text-cp-green"
                      : active
                        ? "bg-accent-light text-accent"
                        : "bg-cp-icon text-ink-faint"
                  }`}
                >
                  {done ? <ManagerIcon name="check" size={12} /> : <span>{i + 1}</span>}
                </span>
                <span
                  className={`text-[13px] ${
                    active ? "font-medium text-ink" : done ? "text-ink-muted" : "text-ink-faint"
                  }`}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      )}
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
          className="flex flex-1 items-center justify-center gap-1.5 rounded-cp-control bg-accent py-3 text-[13px] font-medium text-white"
        >
          <ManagerIcon name="eye" size={14} /> Review rota
        </button>
      </div>
    </div>
  );
}
