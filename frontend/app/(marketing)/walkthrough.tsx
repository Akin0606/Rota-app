"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  Step1Manager,
  Step1Staff,
  Step2Manager,
  Step2Staff,
  Step3Manager,
  Step3Staff,
  Step4Manager,
  Step4Staff,
  Step5Manager,
  Step5Staff,
} from "./walkthrough-frames";

type Role = "manager" | "staff";
type Device = "laptop" | "phone";

type FrameProps = { device: Device };

type StepDef = {
  id: string;
  label: string;
  headline: string;
  dwell: number;
  manager: { line: string; summary: string; Frame: (p: FrameProps) => JSX.Element };
  staff: { line: string; summary: string; Frame: (p: FrameProps) => JSX.Element };
};

const STEPS: StepDef[] = [
  {
    id: "link",
    label: "Send the link",
    headline: "One link. No app, no accounts.",
    dwell: 4500,
    manager: {
      line: "Drop the link in the group chat once. It never changes.",
      summary:
        "Manager view: the team screen shows the venue join link, a join code, the roster with masked PINs, and one request from someone asking to join.",
      Frame: Step1Manager,
    },
    staff: {
      line: "Tap it, type four digits, you're in.",
      summary:
        "Staff view: the entry screen asks for a four-digit PIN, with a link to register for the first time.",
      Frame: Step1Staff,
    },
  },
  {
    id: "availability",
    label: "Team fills it in",
    headline: "Your team marks their week.",
    dwell: 4500,
    manager: {
      line: "You watch a counter. That's your whole job this step.",
      summary:
        "Manager view: five of seven staff have submitted their availability; two have had an email reminder sent.",
      Frame: Step2Manager,
    },
    staff: {
      line: "Four taps a day, under a minute, on the bus.",
      summary:
        "Staff view: the availability screen for the week, with each shift marked available, if needed, can't work, or not answered yet. Sunday is still unanswered.",
      Frame: Step2Staff,
    },
  },
  {
    id: "build",
    label: "Crewplan builds it",
    headline: "Crewplan builds the rota.",
    dwell: 5500,
    manager: {
      line: "Availability, holidays and the law, solved in a few seconds.",
      summary:
        "Manager view: the rota is built — 34 shifts placed, holidays respected, everyone under their weekly cap, hours spread evenly, with one cell still uncovered.",
      Frame: Step3Manager,
    },
    staff: {
      line: "Nothing. Deliberately nothing — we'll email when it's out.",
      summary:
        "Staff view: a near-empty screen confirming their availability was sent and there is nothing else to do.",
      Frame: Step3Staff,
    },
  },
  {
    id: "review",
    label: "You review",
    headline: "You review what needs you.",
    dwell: 4500,
    manager: {
      line: "One gap, one approval, one legal block. Not 34 rows to read.",
      summary:
        "Manager view: the rota review screen shows one uncovered Saturday evening shift, two approvals waiting, and a legal block for a 17-year-old that cannot be overridden.",
      Frame: Step4Manager,
    },
    staff: {
      line: "Still nothing — it's provisional until you say so.",
      summary:
        "Staff view: a quiet card saying the week is still provisional, with the timeline shown faded.",
      Frame: Step4Staff,
    },
  },
  {
    id: "publish",
    label: "Everyone knows",
    headline: "Everyone knows. And when life happens, they sort it.",
    dwell: 4500,
    manager: {
      line: "Published, emailed, and on the wall as a PDF if you want it.",
      summary:
        "Manager view: the week is published and emailed to seven staff, with PDF, Excel and image export, and a swap that approved itself because it was like-for-like.",
      Frame: Step5Manager,
    },
    staff: {
      line: "Their shifts, their colleagues, and a swap that sorted itself.",
      summary:
        "Staff view: the my-shifts timeline with shift times, colleagues and durations, and a sheet offering drop, give, swap and add-to-calendar.",
      Frame: Step5Staff,
    },
  },
];

function useMediaQuery(query: string, fallback: boolean): boolean {
  const [match, setMatch] = useState(fallback);
  useEffect(() => {
    const mq = window.matchMedia(query);
    setMatch(mq.matches);
    const onChange = () => setMatch(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return match;
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d={dir === "left" ? "M10 3 5 8l5 5" : "M6 3l5 5-5 5"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Walkthrough() {
  const isDesktop = useMediaQuery("(min-width: 900px)", false);
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)", false);

  const [step, setStep] = useState(0);
  const [role, setRole] = useState<Role>("manager");
  const [deviceRaw, setDeviceRaw] = useState<Device>("laptop");
  const [autoplay, setAutoplay] = useState(true);
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  // "step" = slide+fade; "lens" = crossfade only (role/device is a lens change)
  const [lastChange, setLastChange] = useState<"step" | "lens">("step");

  // Below 900px the walkthrough is phone-only (see brief §3.7).
  const device: Device = isDesktop ? deviceRaw : "phone";

  const rootRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const baseId = useId();

  const stopAutoplay = useCallback(() => setAutoplay(false), []);

  const goTo = useCallback(
    (next: number, opts?: { keepAutoplay?: boolean }) => {
      setDir((d) => (next > step ? "fwd" : next < step ? "back" : d));
      setLastChange("step");
      setStep(Math.max(0, Math.min(STEPS.length - 1, next)));
      if (!opts?.keepAutoplay) stopAutoplay();
    },
    [step, stopAutoplay],
  );

  const setRoleAndStop = (r: Role) => {
    setLastChange("lens");
    setRole(r);
    stopAutoplay();
  };
  const setDeviceAndStop = (d: Device) => {
    setLastChange("lens");
    setDeviceRaw(d);
    stopAutoplay();
  };

  // Autoplay: one guided pass once ≥60% in view, then hand over permanently.
  useEffect(() => {
    if (!autoplay || reduceMotion) return;
    const el = rootRef.current;
    if (!el) return;
    let armed = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) armed = true;
      },
      { threshold: [0, 0.6] },
    );
    io.observe(el);
    const tick = () => {
      if (!armed) return;
      if (step >= STEPS.length - 1) {
        setAutoplay(false);
        return;
      }
      goTo(step + 1, { keepAutoplay: true });
    };
    const t = window.setTimeout(tick, STEPS[step].dwell);
    return () => {
      window.clearTimeout(t);
      io.disconnect();
    };
  }, [autoplay, reduceMotion, step, goTo]);

  const onRailKey = (e: React.KeyboardEvent) => {
    let next = step;
    if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = step - 1;
    else if (e.key === "ArrowDown" || e.key === "ArrowRight") next = step + 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = STEPS.length - 1;
    else return;
    e.preventDefault();
    next = Math.max(0, Math.min(STEPS.length - 1, next));
    goTo(next);
    const item = railRef.current?.querySelectorAll<HTMLElement>(".rail-item")[next];
    item?.focus();
  };

  const s = STEPS[step];
  const roleData = s[role];
  const Frame = roleData.Frame;

  const segStyle = (idx: number, count: number) =>
    ({ transform: `translateX(${idx * 100}%)`, width: `calc((100% - 6px) / ${count})` }) as React.CSSProperties;

  return (
    <div className="wt" ref={rootRef} onKeyDownCapture={() => autoplay && stopAutoplay()}>
      {/* Toggle row */}
      <div className="wt-toggles">
        <div className="seg" role="radiogroup" aria-label="View as">
          <span className="seg-pill" style={segStyle(role === "manager" ? 0 : 1, 2)} />
          {(["manager", "staff"] as Role[]).map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={role === r}
              tabIndex={role === r ? 0 : -1}
              onClick={() => setRoleAndStop(r)}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                  e.preventDefault();
                  setRoleAndStop(r === "manager" ? "staff" : "manager");
                }
              }}
            >
              {r === "manager" ? "Manager" : "Staff"}
            </button>
          ))}
        </div>

        {isDesktop && (
          <div className="seg" role="radiogroup" aria-label="Device">
            <span className="seg-pill" style={segStyle(deviceRaw === "laptop" ? 0 : 1, 2)} />
            {(["laptop", "phone"] as Device[]).map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={deviceRaw === d}
                tabIndex={deviceRaw === d ? 0 : -1}
                onClick={() => setDeviceAndStop(d)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                    e.preventDefault();
                    setDeviceAndStop(d === "laptop" ? "phone" : "laptop");
                  }
                }}
              >
                {d === "laptop" ? "Laptop" : "Phone"}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="wt-body">
        {/* Rail (desktop tablist) */}
        <div
          className="wt-rail"
          role="tablist"
          aria-orientation="vertical"
          aria-label="Walkthrough steps"
          ref={railRef}
          onKeyDown={onRailKey}
        >
          {STEPS.map((st, i) => (
            <button
              key={st.id}
              type="button"
              role="tab"
              id={`${baseId}-tab-${i}`}
              aria-selected={i === step}
              aria-controls={`${baseId}-panel`}
              tabIndex={i === step ? 0 : -1}
              className={`rail-item${autoplay && !reduceMotion ? " is-autoplaying" : ""}`}
              style={{ ["--dwell" as string]: `${st.dwell}ms` }}
              onClick={() => goTo(i)}
            >
              <span className="rail-bar" aria-hidden="true" />
              <span className="rail-num">{String(i + 1).padStart(2, "0")}</span>
              {st.label}
            </button>
          ))}
        </div>

        {/* Stage */}
        <div className="wt-stage-wrap">
          <div
            className="wt-stage"
            id={`${baseId}-panel`}
            role="tabpanel"
            aria-labelledby={`${baseId}-tab-${step}`}
            data-change={lastChange}
            data-dir={dir}
          >
            <div key={`${step}-${role}-${device}`} className="wt-frame">
              <p className="wt-sr">{roleData.summary}</p>
              <Frame device={device} />
            </div>
          </div>

          {/* Caption */}
          <div className="wt-caption">
            <div>
              <div className="cap-headline t-display-m">{s.headline}</div>
              <div className="cap-line">{roleData.line}</div>
            </div>
            <div className="wt-nav">
              <button
                type="button"
                aria-label="Previous step"
                disabled={step === 0}
                onClick={() => goTo(step - 1)}
              >
                <Chevron dir="left" />
              </button>
              <button
                type="button"
                aria-label="Next step"
                disabled={step === STEPS.length - 1}
                onClick={() => goTo(step + 1)}
              >
                <Chevron dir="right" />
              </button>
            </div>
          </div>

          {/* Mobile step strip */}
          <div className="wt-strip" role="tablist" aria-label="Walkthrough steps">
            {STEPS.map((st, i) => (
              <button
                key={st.id}
                type="button"
                role="tab"
                aria-selected={i === step}
                aria-current={i === step}
                aria-label={`Step ${i + 1}: ${st.label}`}
                className="dot"
                onClick={() => goTo(i)}
              />
            ))}
            <span className="strip-label">{s.label}</span>
          </div>
        </div>
      </div>

      <p className="wt-sr" aria-live={autoplay ? "off" : "polite"}>
        {`Step ${step + 1} of ${STEPS.length} — ${s.headline}`}
      </p>
    </div>
  );
}
