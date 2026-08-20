"use client";

import { useState } from "react";

import TimeWheel, { hhmmToLabel, labelToHHMM } from "@/components/onboarding/time-wheel";

// A time input that opens the same Refined-Dark wheel used in onboarding,
// instead of a native <select>/OS clock — so setting shift hours feels the same
// everywhere. Value in / out is the app's display label ("5:00pm", "2:30am");
// the wheel speaks 24h internally and the adapters bridge it.
export default function TimeField({
  value,
  onChange,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (label: string) => void;
  ariaLabel: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={() => setOpen(true)}
        className={
          className ??
          "min-w-0 flex-1 rounded-lg border-[1.5px] border-accent-border bg-surface-subtle px-2 py-2 text-left text-[13px] text-ink outline-none transition-colors focus-visible:border-accent"
        }
      >
        {value}
      </button>
      <TimeWheel
        open={open}
        value={labelToHHMM(value)}
        label={ariaLabel}
        onSet={(v) => {
          onChange(hhmmToLabel(v));
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
