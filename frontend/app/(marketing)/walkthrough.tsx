"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  Device,
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

type Side = {
  /** Rail label — deliberately different per role. The manager and the staff
   *  member are not doing the same thing at the same moment, and labelling both
   *  columns "Send the link" hid the most interesting thing about the product. */
  label: string;
  headline: string;
  line: string;
  summary: string;
  Frame: (p: { device: Device }) => JSX.Element;
};

type StepDef = { id: string; manager: Side; staff: Side };

const STEPS: StepDef[] = [
  {
    id: "link",
    manager: {
      label: "Send one link",
      headline: "One link, sent once.",
      line: "It goes in the group chat and never changes. New starters register themselves — you just approve them.",
      summary:
        "Manager view: the team screen shows the venue join link, a join code, the roster with masked PINs, and one person asking to join.",
      Frame: Step1Manager,
    },
    staff: {
      label: "Tap in",
      headline: "Four digits. No app.",
      line: "No account, no password, nothing to download. Tap the link, type your PIN, you're in.",
      summary:
        "Staff view: the entry screen asks for a four-digit PIN, with a link to register for the first time.",
      Frame: Step1Staff,
    },
  },
  {
    id: "availability",
    manager: {
      label: "Watch the counter",
      headline: "It chases them, not you.",
      line: "Availability opens and closes on a schedule. The two who always forget get an email. You watch a number go up.",
      summary:
        "Manager view: five of seven staff are in; the other two have had a reminder emailed automatically.",
      Frame: Step2Manager,
    },
    staff: {
      label: "Mark your week",
      headline: "A minute, on the bus.",
      line: "Available, if needed, can't work — or nothing yet, which we treat differently rather than guessing.",
      summary:
        "Staff view: the availability screen for the week, each shift marked available, if needed, can't work, or not answered yet. Sunday is still unanswered.",
      Frame: Step2Staff,
    },
  },
  {
    id: "solve",
    manager: {
      label: "It solves the week",
      headline: "Solved, not guessed.",
      line: "Availability, holidays and the working-time rules, worked out in seconds. You get the best fit — not the first thing that works.",
      summary:
        "Manager view: the rota is solved — 34 shifts placed, holidays worked around, everyone inside their weekly hours, hours spread evenly, one cell still uncovered.",
      Frame: Step3Manager,
    },
    staff: {
      label: "Do nothing",
      headline: "Nothing. Deliberately.",
      line: "This is the whole point. Your part is finished, and you'll get an email when the week is out.",
      summary:
        "Staff view: a near-empty screen confirming availability was sent and there is nothing else to do.",
      Frame: Step3Staff,
    },
  },
  {
    id: "review",
    manager: {
      label: "Check what needs you",
      headline: "One gap. Not 34 rows.",
      line: "What's wrong is ranked at the top: a gap, two approvals, one legal block you can't override. The 30 shifts that are fine stay quiet.",
      summary:
        "Manager view: the review screen shows one uncovered Saturday evening, two approvals waiting, and an under-18 legal block that cannot be overridden.",
      Frame: Step4Manager,
    },
    staff: {
      label: "Still nothing",
      headline: "Marked provisional.",
      line: "You can see it forming, and it says plainly that it isn't final yet. No one has to ask in the group chat.",
      summary:
        "Staff view: a quiet card saying the week is still provisional, with the timeline shown faded.",
      Frame: Step4Staff,
    },
  },
  {
    id: "publish",
    manager: {
      label: "It goes out",
      headline: "Out, and it stays sorted.",
      line: "Emailed to everyone, exportable for the wall. When two of them swap like for like, it approves itself and you never hear about it.",
      summary:
        "Manager view: the week is published and emailed to seven staff, with PDF, Excel and image export, and a swap that approved itself because it was like for like.",
      Frame: Step5Manager,
    },
    staff: {
      label: "Know your week",
      headline: "Yours, and swappable.",
      line: "Your shifts, who you're on with, straight into your phone calendar. Can't make one? Drop, give or swap it yourself.",
      summary:
        "Staff view: the my-shifts timeline with times, colleagues and durations, and a sheet offering drop, give, swap and add to calendar.",
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
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d={dir === "left" ? "M10 3 5 8l5 5" : "M6 3l5 5-5 5"}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Apple's momentum projection (Designing Fluid Interfaces). Not the textbook
 *  v²/2a — this is the exponential-decay form iOS actually ships, so a flick
 *  lands where the gesture was *going*, not where the finger left off. */
function project(velocity: number, decelerationRate = 0.998) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

export default function Walkthrough() {
  const isWide = useMediaQuery("(min-width: 60rem)", false);
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)", false);

  const [step, setStep] = useState(0);
  const [role, setRole] = useState<Role>("manager");
  const [device, setDevice] = useState<Device>("laptop");
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const [kind, setKind] = useState<"step" | "lens">("step");

  const railRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const baseId = useId();

  const goTo = useCallback((next: number) => {
    setStep((cur) => {
      const clamped = Math.max(0, Math.min(STEPS.length - 1, next));
      if (clamped !== cur) setDir(clamped > cur ? "fwd" : "back");
      return clamped;
    });
    setKind("step");
  }, []);

  const setLens = useCallback(<T,>(setter: (v: T) => void, value: T) => {
    setKind("lens");
    setter(value);
  }, []);

  /* --- Swipe. 1:1 with the finger, then project the flick and snap. --------
     Only where a pointer can actually do this — on a fine pointer the rail and
     the arrows are better, and hijacking drag there fights text selection. */
  useEffect(() => {
    const el = stageRef.current;
    if (!el || isWide) return;

    // Hysteresis: don't commit to a drag until the finger has actually moved.
    // Without it an incidental few pixels during a tap reads as a swipe.
    const ENGAGE = 10;

    let down = false;
    let engaged = false;
    let startX = 0;
    let lastX = 0;
    let lastT = 0;
    let velocity = 0;
    const inner = () => el.querySelector<HTMLElement>(".wt-frame");

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      down = true;
      engaged = false;
      startX = lastX = e.clientX;
      lastT = e.timeStamp;
      velocity = 0;
      el.setPointerCapture(e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const dt = e.timeStamp - lastT;
      if (dt > 0) velocity = ((e.clientX - lastX) / dt) * 1000;
      lastX = e.clientX;
      lastT = e.timeStamp;

      const dx = e.clientX - startX;
      if (!engaged) {
        if (Math.abs(dx) < ENGAGE) return;
        engaged = true;
        const f = inner();
        if (f) f.style.transition = "none";
      }
      const f = inner();
      // Rubber-band at the ends: resist rather than hard-stop, so an edge reads
      // as "nothing more here" instead of "frozen".
      const atEdge = (dx > 0 && step === 0) || (dx < 0 && step === STEPS.length - 1);
      const shown = atEdge ? dx * 0.32 : dx;
      if (f && !reduce) f.style.transform = `translate3d(${shown}px,0,0)`;
    };

    const finish = (e: PointerEvent) => {
      if (!down) return;
      down = false;
      const f = inner();
      if (f) {
        f.style.transition = "";
        f.style.transform = "";
      }
      if (!engaged) return;

      const dx = e.clientX - startX;
      // Decide from the projected landing point, not the release point — that
      // is what lets a short, fast flick still count as a swipe.
      const projected = dx + project(velocity) * 0.35;
      const threshold = el.clientWidth * 0.22;
      if (projected < -threshold) goTo(step + 1);
      else if (projected > threshold) goTo(step - 1);
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", finish);
    el.addEventListener("pointercancel", finish);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", finish);
      el.removeEventListener("pointercancel", finish);
    };
  }, [isWide, step, goTo, reduce]);

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
    railRef.current?.querySelectorAll<HTMLElement>(".rail-item")[next]?.focus();
  };

  const side = STEPS[step][role];
  const Frame = side.Frame;
  const pill = (i: number) =>
    ({ transform: `translateX(${i * 100}%)`, width: "calc((100% - 6px) / 2)" }) as React.CSSProperties;

  return (
    <div className="wt">
      <div className="wt-controls">
        <div className="seg" role="radiogroup" aria-label="View as">
          <span className="seg-pill" style={pill(role === "manager" ? 0 : 1)} />
          {(["manager", "staff"] as Role[]).map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={role === r}
              tabIndex={role === r ? 0 : -1}
              onClick={() => setLens(setRole, r)}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                  e.preventDefault();
                  setLens(setRole, r === "manager" ? "staff" : "manager");
                }
              }}
            >
              {r === "manager" ? "You" : "Your team"}
            </button>
          ))}
        </div>

        {isWide && (
          <div className="seg" role="radiogroup" aria-label="Device">
            <span className="seg-pill" style={pill(device === "laptop" ? 0 : 1)} />
            {(["laptop", "phone"] as Device[]).map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={device === d}
                tabIndex={device === d ? 0 : -1}
                onClick={() => setLens(setDevice, d)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                    e.preventDefault();
                    setLens(setDevice, d === "laptop" ? "phone" : "laptop");
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
              id={`${baseId}-t${i}`}
              aria-selected={i === step}
              aria-controls={`${baseId}-p`}
              tabIndex={i === step ? 0 : -1}
              className="rail-item"
              onClick={() => goTo(i)}
            >
              <span className="rail-bar" aria-hidden="true" />
              <span className="rail-n">Step {i + 1}</span>
              {st[role].label}
            </button>
          ))}
        </div>

        <div>
          <div
            className="wt-stage"
            ref={stageRef}
            id={`${baseId}-p`}
            role="tabpanel"
            aria-labelledby={`${baseId}-t${step}`}
            data-kind={kind}
            data-dir={dir}
          >
            <div key={`${step}-${role}-${device}`} className="wt-frame">
              <p className="sr">{side.summary}</p>
              <Frame device={isWide ? device : "phone"} />
            </div>
          </div>

          <div className="wt-caption">
            <div>
              <div className="d3">{side.headline}</div>
              <p className="body">{side.line}</p>
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

          <div className="wt-dots" role="tablist" aria-label="Walkthrough steps">
            {STEPS.map((st, i) => (
              <button
                key={st.id}
                type="button"
                role="tab"
                aria-selected={i === step}
                aria-label={`Step ${i + 1}: ${st[role].label}`}
                onClick={() => goTo(i)}
              />
            ))}
          </div>
        </div>
      </div>

      <p className="sr" aria-live="polite">
        {`Step ${step + 1} of ${STEPS.length}, ${role === "manager" ? "your view" : "your team's view"} — ${side.headline}`}
      </p>
    </div>
  );
}
