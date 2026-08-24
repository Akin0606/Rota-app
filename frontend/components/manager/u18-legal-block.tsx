"use client";

import ManagerIcon from "./icon";

// The under-18 legal block gets its own distinct treatment (B4) — a lock icon,
// a red left-rule, and a "Legal" tag — so it reads as "the law stopped this,"
// categorically different from a soft amber "couldn't fit". Fed by the solver's
// `warnings` (the hard U18 constraints it couldn't satisfy). These are not a
// manager's preference and can't be overridden, and the copy says so.
export default function U18LegalBlock({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;

  return (
    <div className="mb-3 rounded-[11px] border-[0.5px] border-l-[3px] border-cp-red/40 border-l-cp-red bg-cp-red-soft px-3.5 py-3">
      <div className="flex items-center gap-2">
        <span className="text-cp-red">
          <ManagerIcon name="lock" size={15} />
        </span>
        <span className="text-[12.5px] font-medium text-cp-red">
          The law blocked {warnings.length === 1 ? "an assignment" : "these assignments"}
        </span>
        <span className="ml-auto rounded-[5px] border-[0.5px] border-cp-red/40 px-1.5 py-px text-[9px] font-semibold uppercase tracking-[0.06em] text-cp-red">
          Legal
        </span>
      </div>
      <ul className="mt-1.5 flex flex-col gap-1 pl-[23px]">
        {warnings.map((w, i) => (
          <li key={i} className="text-[11.5px] leading-relaxed text-ink-muted">
            {w}
          </li>
        ))}
      </ul>
      <div className="mt-1.5 pl-[23px] text-[11px] text-ink-faint">
        Not a preference — under-18 hours are set by law and can&apos;t be overridden.
      </div>
    </div>
  );
}
