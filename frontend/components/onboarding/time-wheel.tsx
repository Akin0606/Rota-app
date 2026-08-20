"use client";

import { useEffect, useRef, useState } from "react";

import OIcon from "@/components/onboarding/icon";

// Custom Refined-Dark time picker — replaces the native OS clock popup so the
// onboarding stays in-language. Wheel columns on native scroll-snap momentum +
// pub presets. Value is "HH:MM" (24h); the wheels present 12h + AM/PM.

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
const MINS = Array.from({ length: 12 }, (_, i) => i * 5); // 0,5,..55
const PERIODS = ["AM", "PM"] as const;
const ITEM = 44; // must match .ob-wit height in globals.css

const PRESETS = [
  { label: "9:00 am", h: 9, m: 0, p: "AM" },
  { label: "11:00 am", h: 11, m: 0, p: "AM" },
  { label: "12:00 pm", h: 12, m: 0, p: "PM" },
  { label: "5:00 pm", h: 5, m: 0, p: "PM" },
  { label: "11:00 pm", h: 11, m: 0, p: "PM" },
  { label: "12:00 am", h: 12, m: 0, p: "AM" },
  { label: "1:00 am", h: 1, m: 0, p: "AM" },
  { label: "2:00 am", h: 2, m: 0, p: "AM" },
] as const;

type Sel = { h: number; m: number; p: string };

function parse(hhmm: string): Sel {
  const [H, M] = (hhmm || "11:00").split(":").map(Number);
  const p = H < 12 ? "AM" : "PM";
  const h = H % 12 || 12;
  const m = (Math.round((M || 0) / 5) * 5) % 60;
  return { h, m, p };
}
function toHHMM({ h, m, p }: Sel): string {
  const H = p === "AM" ? (h === 12 ? 0 : h) : h === 12 ? 12 : h + 12;
  return `${String(H).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default function TimeWheel({
  open,
  value,
  label,
  onSet,
  onClose,
}: {
  open: boolean;
  value: string;
  label: string;
  onSet: (v: string) => void;
  onClose: () => void;
}) {
  const hRef = useRef<HTMLDivElement>(null);
  const mRef = useRef<HTMLDivElement>(null);
  const pRef = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<Sel>(() => parse(value));

  useEffect(() => {
    if (!open) return;
    const start = parse(value);
    setSel(start);
    const pos = () => {
      if (hRef.current) hRef.current.scrollTop = HOURS.indexOf(start.h) * ITEM;
      if (mRef.current) mRef.current.scrollTop = MINS.indexOf(start.m) * ITEM;
      if (pRef.current) pRef.current.scrollTop = PERIODS.indexOf(start.p as (typeof PERIODS)[number]) * ITEM;
    };
    requestAnimationFrame(pos);
    const t = setTimeout(pos, 60); // fallback if rAF is throttled
    return () => clearTimeout(t);
  }, [open, value]);

  function readCol(ref: React.RefObject<HTMLDivElement>, arr: readonly (number | string)[], fallback: number | string) {
    const idx = Math.round((ref.current?.scrollTop || 0) / ITEM);
    return arr[Math.max(0, Math.min(arr.length - 1, idx))] ?? fallback;
  }
  function onScroll() {
    setSel({
      h: readCol(hRef, HOURS, sel.h) as number,
      m: readCol(mRef, MINS, sel.m) as number,
      p: readCol(pRef, PERIODS, sel.p) as string,
    });
  }
  function applyPreset(pr: (typeof PRESETS)[number]) {
    hRef.current?.scrollTo({ top: HOURS.indexOf(pr.h) * ITEM, behavior: "smooth" });
    mRef.current?.scrollTo({ top: MINS.indexOf(pr.m) * ITEM, behavior: "smooth" });
    pRef.current?.scrollTo({ top: PERIODS.indexOf(pr.p) * ITEM, behavior: "smooth" });
    setSel({ h: pr.h, m: pr.m, p: pr.p });
  }

  const column = (
    ref: React.RefObject<HTMLDivElement>,
    values: readonly (number | string)[],
    selVal: number | string,
    fmt: (v: number | string) => string,
    wide = false,
  ) => (
    <div className={`ob-wcol ${wide ? "wide" : "narrow"}`} ref={ref} onScroll={onScroll}>
      {values.map((v, i) => {
        const selIdx = values.indexOf(selVal);
        return (
          <div key={i} className={`ob-wit ${i === selIdx ? "sel" : Math.abs(i - selIdx) === 1 ? "near" : ""}`}>
            {fmt(v)}
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      <div className={`ob-vscrim ob-vscrim-tw ${open ? "open" : ""}`} onClick={onClose} />
      <div className={`ob-tw ${open ? "open" : ""}`} role="dialog" aria-label={label}>
        <div className="ob-grab" />
        <div className="ob-twhead">
          <div className="lbl">{label}</div>
          <div className="readout">
            {sel.h}:{String(sel.m).padStart(2, "0")}
            <span className="ap">{sel.p.toLowerCase()}</span>
          </div>
        </div>
        <div className="ob-presets">
          {PRESETS.map((pr) => {
            const on = pr.h === sel.h && pr.m === sel.m && pr.p === sel.p;
            return (
              <button key={pr.label} className={`ob-preset ${on ? "on" : ""}`} onClick={() => applyPreset(pr)}>
                {pr.label}
              </button>
            );
          })}
        </div>
        <div className="ob-wheels">
          <div className="ob-wband" />
          {column(hRef, HOURS, sel.h, (v) => String(v))}
          <div className="ob-wcolon">:</div>
          {column(mRef, MINS, sel.m, (v) => String(v).padStart(2, "0"))}
          {column(pRef, PERIODS, sel.p, (v) => String(v), true)}
        </div>
        <div className="ob-twfoot">
          <button className="ob-btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="ob-btn" onClick={() => onSet(toHHMM(sel))}>
            <OIcon name="check" size={16} /> Set time
          </button>
        </div>
      </div>
    </>
  );
}
