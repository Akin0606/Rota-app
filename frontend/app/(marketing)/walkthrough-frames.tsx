/* Static product depictions, built from the token vocabulary in
   crewplan-manager-reference.html / crewplan-staff-reference.html.

   Non-interactive by design: every control-looking element is a div/span, so
   nothing lands in the tab order as a fake "Approve" button. The whole frame is
   aria-hidden — the walkthrough wraps each in one visually-hidden sentence
   describing what it shows. */

import { Fragment } from "react";

export type Device = "laptop" | "phone";
type FrameProps = { device: Device };

const Ic = {
  check: (
    <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
      <path
        d="M4 10.5 8 14l8-8.5"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  tick: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 8.5 6.5 12l7-7.5"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  x: (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
  lock: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <rect x="3" y="7" width="10" height="7" rx="1.6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
};

export function Bezel({
  device,
  children,
  className = "",
}: {
  device: Device;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bezel ${device === "laptop" ? "bezel-laptop" : "bezel-phone"} ${className}`}
      aria-hidden="true"
    >
      <div className="f-app">{children}</div>
    </div>
  );
}

function Chrome({ right }: { right?: React.ReactNode }) {
  return (
    <div className="f-bar">
      <span className="f-mark">
        r<svg viewBox="55 55 402 402" aria-hidden="true"><g transform="rotate(-90 256 256)" fill="none"><circle cx="256" cy="256" r="170" stroke="currentColor" strokeOpacity="0.28" strokeWidth="62" strokeDasharray="112.59 40" /><circle cx="256" cy="256" r="170" stroke="var(--accent)" strokeWidth="62" strokeDasharray="112.59 955.55" strokeDashoffset="-610.37" /></g></svg>ta<span>lly</span>
      </span>
      {right ?? <span className="f-sub">The Anchor</span>}
    </div>
  );
}

/* ============================ STEP 1 ============================ */

export function Step1Manager({ device }: FrameProps) {
  return (
    <Bezel device={device}>
      <Chrome />
      <div className="f-tabs">
        <span className="f-tab">Rota</span>
        <span className="f-tab">Scheduler</span>
        <span className="f-tab on">Team</span>
        <span className="f-tab">Settings</span>
      </div>
      <div className="f-pad">
        <div className="f-card" style={{ marginBottom: "0.75rem" }}>
          <div className="f-label" style={{ marginBottom: "0.5rem" }}>
            Staff join link
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.6875rem", color: "var(--ink-2)" }}>
              rotally.co.uk/anchor
            </span>
            <span className="f-btn on">Copied</span>
            <span className="f-btn">Code 4821</span>
          </div>
        </div>
        <div className="f-card">
          <div className="f-row join">
            <span className="f-av">J</span>
            <span>
              <strong style={{ fontWeight: 600 }}>Jess</strong> asked to join · Bar
            </span>
            <span className="f-right">
              <span className="f-btn on">Approve</span>
              <span className="f-btn">Decline</span>
            </span>
          </div>
          {[
            ["S", "Sarah", "Bar"],
            ["M", "Marcus", "Floor"],
            ["P", "Priya", "Bar"],
          ].map(([a, n, r]) => (
            <div className="f-row" key={n}>
              <span className="f-av">{a}</span>
              {n}
              <span className="f-right">{r} · ••••</span>
            </div>
          ))}
          <div className="f-row">
            <span className="f-av">T</span>Tom <span className="f-u18">U18</span>
            <span className="f-right">Kitchen · ••••</span>
          </div>
        </div>
      </div>
    </Bezel>
  );
}

export function Step1Staff({ device }: FrameProps) {
  return (
    <Bezel device={device}>
      <div className="f-pin">
        <span className="f-mark" style={{ fontSize: "1.125rem" }}>
          r<svg viewBox="55 55 402 402" aria-hidden="true"><g transform="rotate(-90 256 256)" fill="none"><circle cx="256" cy="256" r="170" stroke="currentColor" strokeOpacity="0.28" strokeWidth="62" strokeDasharray="112.59 40" /><circle cx="256" cy="256" r="170" stroke="var(--accent)" strokeWidth="62" strokeDasharray="112.59 955.55" strokeDashoffset="-610.37" /></g></svg>ta<span>lly</span>
        </span>
        <div>
          <div style={{ fontWeight: 600, fontSize: "0.8125rem" }}>The Anchor</div>
          <div className="f-dim" style={{ fontSize: "0.6875rem" }}>
            Southampton
          </div>
        </div>
        <div style={{ fontSize: "0.75rem", color: "var(--ink-2)", marginTop: "0.25rem" }}>
          Enter your PIN
        </div>
        <div className="f-boxes">
          <span className="f-box fill">•</span>
          <span className="f-box fill">•</span>
          <span className="f-box car" />
          <span className="f-box" />
        </div>
        <span style={{ fontSize: "0.6875rem", color: "var(--accent)" }}>
          First time? Register
        </span>
      </div>
    </Bezel>
  );
}

/* ============================ STEP 2 ============================ */

export function Step2Manager({ device }: FrameProps) {
  const rows: [string, string, boolean][] = [
    ["S", "Sarah", true],
    ["M", "Marcus", true],
    ["P", "Priya", true],
    ["T", "Tom", true],
    ["L", "Leah", true],
    ["A", "Aday", false],
    ["K", "Kim", false],
  ];
  return (
    <Bezel device={device}>
      <Chrome right={<span className="f-pill a">Closes Thursday 6pm</span>} />
      <div className="f-pad">
        <div className="f-label">Availability</div>
        <div className="f-h" style={{ margin: "0.375rem 0 0.125rem" }}>
          5 of 7 in
        </div>
        <div className="f-sub" style={{ marginBottom: "0.875rem" }}>
          Week of 18–24 Aug · the other two have been chased
        </div>
        <div className="f-card">
          {rows.map(([a, n, done]) => (
            <div className="f-row" key={n} style={done ? undefined : { opacity: 0.6 }}>
              <span className="f-av">{a}</span>
              {n}
              <span className="f-right">
                {done ? (
                  <span className="f-tick">{Ic.tick}</span>
                ) : (
                  <span className="f-pill a">Reminder sent</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Bezel>
  );
}

export function Step2Staff({ device }: FrameProps) {
  const days: [string, string, string, string][] = [
    ["Mon", "18", "yes", "yes"],
    ["Tue", "19", "yes", "maybe"],
    ["Wed", "20", "no", "yes"],
    ["Thu", "21", "yes", "yes"],
    ["Fri", "22", "maybe", "yes"],
    ["Sat", "23", "yes", "yes"],
    ["Sun", "24", "unset", "unset"],
  ];
  return (
    <Bezel device={device}>
      <div className="f-phone-col">
        <div className="f-pad" style={{ paddingBottom: "3.5rem" }}>
          <div className="f-h">Your week</div>
          <div className="f-sub" style={{ marginBottom: "0.75rem" }}>
            18–24 Aug · closes Thursday 6pm
          </div>
          <div className="f-legend">
            <span>
              <span className="f-sw yes" />
              Available
            </span>
            <span>
              <span className="f-sw maybe" />
              If needed
            </span>
            <span>
              <span className="f-sw no" />
              Can&apos;t work
            </span>
            <span>
              <span className="f-sw unset" />
              Not answered
            </span>
          </div>
          {days.map(([dw, n, d, e]) => (
            <div className="f-day" key={n}>
              <div className="f-day-h">
                {dw}{" "}
                <span style={{ fontSize: "0.5625rem", color: "var(--ink-3)", fontWeight: 400 }}>
                  {n} Aug
                </span>
              </div>
              <div className="f-slots">
                <span className={`f-slot ${d}`}>Day</span>
                <span className={`f-slot ${e}`}>Evening</span>
              </div>
            </div>
          ))}
        </div>
        <div className="f-sticky">
          <div className="f-prog">
            <div className="f-track">
              <div className="f-fill" style={{ width: "86%" }} />
            </div>
            <span>6 of 7</span>
          </div>
          <span className="f-cta">Send</span>
        </div>
      </div>
    </Bezel>
  );
}

/* ============================ STEP 3 ============================ */

export function Step3Manager({ device }: FrameProps) {
  const names = ["Sarah", "Marcus", "Priya", "Tom"];
  const grid = [
    ["E", "", "E", "E", "", "D", "D"],
    ["D", "D", "", "", "E", "E", ""],
    ["", "E", "E", "", "D", "D", "E"],
    ["D", "", "E", "gap", "", "E", ""],
  ];
  return (
    <Bezel device={device}>
      <Chrome />
      <div className="f-pad">
        <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.75rem" }}>
          <span
            className="f-check"
            style={{ width: "2.25rem", height: "2.25rem", marginBottom: 0, borderRadius: "0.75rem" }}
          >
            {Ic.tick}
          </span>
          <div>
            <div style={{ fontWeight: 600, fontSize: "0.8125rem" }}>Rota solved</div>
            <div className="f-dim" style={{ fontSize: "0.625rem" }}>
              34 shifts placed in 1.2 seconds
            </div>
          </div>
        </div>
        <div className="f-card" style={{ marginBottom: "0.75rem" }}>
          <div className="f-line">
            <span className="f-tick">{Ic.tick}</span>Worked around 6 approved holidays
          </div>
          <div className="f-line">
            <span className="f-tick">{Ic.tick}</span>Everyone inside their weekly hours
          </div>
          <div className="f-line">
            <span className="f-tick">{Ic.tick}</span>Hours spread evenly across the team
          </div>
        </div>
        <div className="f-label" style={{ marginBottom: "0.5rem" }}>
          Draft
        </div>
        <div className="f-mx">
          <span />
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <span className="f-mx-h" key={i}>
              {d}
            </span>
          ))}
          {grid.map((row, r) => (
            <Fragment key={r}>
              <span className="f-mx-n">{names[r]}</span>
              {row.map((c, i) => (
                <span
                  key={i}
                  className={`f-mx-c ${c === "" ? "off" : c === "gap" ? "gap" : ""}`}
                >
                  {c === "gap" ? "—" : c || "·"}
                </span>
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    </Bezel>
  );
}

export function Step3Staff({ device }: FrameProps) {
  return (
    <Bezel device={device}>
      <div className="f-mid">
        <span className="f-check">{Ic.check}</span>
        <div style={{ fontWeight: 600, fontSize: "0.9375rem" }}>Sent</div>
        <div className="f-dim" style={{ fontSize: "0.75rem", maxWidth: "15rem" }}>
          Nothing else to do. We&apos;ll email you when the rota&apos;s out.
        </div>
      </div>
    </Bezel>
  );
}

/* ============================ STEP 4 ============================ */

export function Step4Manager({ device }: FrameProps) {
  return (
    <Bezel device={device}>
      <Chrome right={<span className="f-pill a">Provisional</span>} />
      <div
        className="f-pad"
        style={{ paddingBottom: "3.25rem", display: "flex", flexDirection: "column", gap: "0.625rem" }}
      >
        <div className="f-cov">
          <span style={{ color: "var(--red)", fontSize: "1.125rem", fontWeight: 700 }}>1</span>
          <div>
            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--red)" }}>
              1 gap to fill
            </div>
            <div style={{ fontSize: "0.625rem", color: "var(--ink-2)" }}>
              Sat evening — nobody available
            </div>
          </div>
        </div>

        <div>
          <div
            className="f-label"
            style={{ marginBottom: "0.4375rem", display: "flex", gap: "0.375rem", alignItems: "center" }}
          >
            Needs you <span className="f-pill a">2</span>
          </div>
          <div className="f-appr" style={{ marginBottom: "0.375rem" }}>
            <span className="f-av">M</span>
            <span style={{ flex: 1 }}>Marcus wants Fri evening</span>
            <span className="f-btn on">Approve</span>
            <span className="f-btn f-dim">{Ic.x}</span>
          </div>
          <div className="f-appr">
            <span className="f-av">P</span>
            <span style={{ flex: 1 }}>Priya ↔ Tom, Sat</span>
            <span className="f-btn on">Approve</span>
            <span className="f-btn f-dim">{Ic.x}</span>
          </div>
        </div>

        <div className="f-legal">
          <span style={{ color: "var(--red)", flexShrink: 0 }}>{Ic.lock}</span>
          <div>
            <div style={{ fontSize: "0.6875rem", fontWeight: 600 }}>
              Tom is 17 — can&apos;t work past 10pm before a school day
            </div>
            <div className="f-dim" style={{ fontSize: "0.625rem", marginTop: "0.125rem" }}>
              This one can&apos;t be overridden.
            </div>
          </div>
        </div>

        <div className="f-strip">
          {[
            ["Mon", "g"],
            ["Tue", "g"],
            ["Wed", "g"],
            ["Thu", "a"],
            ["Fri", "g"],
            ["Sat", "r"],
            ["Sun", "g"],
          ].map(([d, k]) => (
            <div key={d}>
              {d}
              <div className={`f-dot ${k}`} />
            </div>
          ))}
        </div>
      </div>
      <div className="f-sticky">
        <span>34 shifts · 4 on</span>
        <span className="f-cta">Publish week</span>
      </div>
    </Bezel>
  );
}

export function Step4Staff({ device }: FrameProps) {
  return (
    <Bezel device={device}>
      <div className="f-phone-col">
        <div className="f-pad">
          <div
            className="f-card"
            style={{ marginBottom: "0.875rem", display: "flex", alignItems: "center", gap: "0.5rem" }}
          >
            <span className="f-pill a">Provisional</span>
            <span style={{ fontSize: "0.6875rem", color: "var(--ink-2)" }}>
              Still being finalised
            </span>
          </div>
          <div className="f-tl f-faded">
            {[
              ["Mon", "18", null],
              ["Tue", "19", "6:00pm – 11:30pm"],
              ["Wed", "20", null],
              ["Thu", "21", null],
              ["Fri", "22", "2:00pm – 10:00pm"],
              ["Sat", "23", "12:00pm – 8:00pm"],
            ].map(([dw, n, t]) => (
              <div className={`f-tl-row ${t ? "on" : ""}`} key={n}>
                <div className="f-node">
                  <span className="dw">{dw}</span>
                  <span className="nm">{n}</span>
                </div>
                {t ? (
                  <div className="f-shift">
                    <div>
                      <div className="t">{t}</div>
                      <div className="r">Bar</div>
                    </div>
                  </div>
                ) : (
                  <div className="f-off">Day off</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Bezel>
  );
}

/* ============================ STEP 5 ============================ */

export function Step5Manager({ device }: FrameProps) {
  return (
    <Bezel device={device}>
      <Chrome right={<span className="f-pill g">Published</span>} />
      <div className="f-pad" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div className="f-card" style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
          <span className="f-tick">{Ic.tick}</span>
          <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>
            Out to 7 staff — 4 days notice
          </span>
        </div>
        <div>
          <div className="f-label" style={{ marginBottom: "0.5rem" }}>
            Export
          </div>
          <div style={{ display: "flex", gap: "0.4375rem" }}>
            <span className="f-btn">PDF</span>
            <span className="f-btn">Excel</span>
            <span className="f-btn">Image</span>
          </div>
        </div>
        <div>
          <div className="f-label" style={{ marginBottom: "0.5rem" }}>
            Since it went out
          </div>
          <div
            className="f-appr"
            style={{
              color: "var(--green)",
              background: "var(--green-wash)",
              borderColor: "var(--green-line)",
            }}
          >
            <span className="f-tick">{Ic.tick}</span>
            <span>Priya and Tom swapped Saturday — approved itself, like for like</span>
          </div>
        </div>
      </div>
    </Bezel>
  );
}

export function Step5Staff({ device }: FrameProps) {
  return (
    <Bezel device={device}>
      <div className="f-phone-col">
        <div className="f-pad" style={{ paddingBottom: "8.5rem" }}>
          <div className="f-h">My shifts</div>
          <div className="f-sub" style={{ marginBottom: "0.875rem" }}>
            18–24 Aug · The Anchor
          </div>
          <div className="f-tl">
            {[
              ["Mon", "18", null, null, null],
              ["Tue", "19", "6:00pm – 11:30pm", "Bar · with Priya", "5.5h"],
              ["Wed", "20", null, null, null],
              ["Fri", "22", "2:00pm – 10:00pm", "Floor · with Tom", "8h"],
              ["Sat", "23", "12:00pm – 8:00pm", "Bar · with Priya", "8h"],
            ].map(([dw, n, t, r, d]) => (
              <div className={`f-tl-row ${t ? "on" : ""}`} key={n}>
                <div className="f-node">
                  <span className="dw">{dw}</span>
                  <span className="nm">{n}</span>
                </div>
                {t ? (
                  <div className="f-shift">
                    <div>
                      <div className="t">{t}</div>
                      <div className="r">{r}</div>
                    </div>
                    <span className="f-dur">{d}</span>
                  </div>
                ) : (
                  <div className="f-off">Day off</div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="f-sheet">
          <div className="f-grab" />
          <div style={{ fontSize: "0.6875rem", fontWeight: 600, marginBottom: "0.125rem" }}>
            Tue 19 · 6:00pm – 11:30pm
          </div>
          <div className="f-dim" style={{ fontSize: "0.625rem", marginBottom: "0.625rem" }}>
            Bar · with Priya
          </div>
          <div className="f-acts">
            <span className="f-act">Drop</span>
            <span className="f-act">Give</span>
            <span className="f-act">Swap</span>
          </div>
          <div className="f-dim" style={{ fontSize: "0.625rem", textAlign: "center" }}>
            Add to calendar
          </div>
        </div>
      </div>
    </Bezel>
  );
}

/* ================= STILLS for the home-page split sections =================
   These were placeholder boxes in the previous build — they are real now. */

export function StillStaffShifts() {
  return (
    <div className="bezel bezel-phone" aria-hidden="true">
      <div className="f-app">
        <div className="f-pad">
          <div className="f-h">My shifts</div>
          <div className="f-sub" style={{ marginBottom: "0.875rem" }}>
            18–24 Aug · The Anchor
          </div>
          <div className="f-tl">
            {[
              ["Mon", "18", null, null, null],
              ["Tue", "19", "6:00pm – 11:30pm", "Bar · with Priya", "5.5h"],
              ["Wed", "20", null, null, null],
              ["Thu", "21", null, null, null],
              ["Fri", "22", "2:00pm – 10:00pm", "Floor · with Tom", "8h"],
              ["Sat", "23", "12:00pm – 8:00pm", "Bar · with Priya", "8h"],
              ["Sun", "24", "5:00pm – 12:00am", "Bar · with Jess", "7h"],
            ].map(([dw, n, t, r, d]) => (
              <div className={`f-tl-row ${t ? "on" : ""}`} key={n}>
                <div className="f-node">
                  <span className="dw">{dw}</span>
                  <span className="nm">{n}</span>
                </div>
                {t ? (
                  <div className="f-shift">
                    <div>
                      <div className="t">{t}</div>
                      <div className="r">{r}</div>
                    </div>
                    <span className="f-dur">{d}</span>
                  </div>
                ) : (
                  <div className="f-off">Day off</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function StillManagerReview() {
  return (
    <div className="bezel bezel-still" aria-hidden="true">
      <div className="f-app">
        <Chrome right={<span className="f-pill a">Provisional</span>} />
        <div
          className="f-pad"
          style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
        >
          <div className="f-cov">
            <span style={{ color: "var(--red)", fontSize: "1rem", fontWeight: 700 }}>1</span>
            <div>
              <div style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--red)" }}>
                1 gap to fill
              </div>
              <div style={{ fontSize: "0.5625rem", color: "var(--ink-2)" }}>
                Sat evening — nobody available
              </div>
            </div>
          </div>
          <div className="f-appr">
            <span className="f-av">M</span>
            <span style={{ flex: 1 }}>Marcus wants Fri evening</span>
            <span className="f-btn on">Approve</span>
          </div>
          <div className="f-legal">
            <span style={{ color: "var(--red)", flexShrink: 0 }}>{Ic.lock}</span>
            <div style={{ fontSize: "0.625rem", fontWeight: 600 }}>
              Tom is 17 — can&apos;t work past 10pm
            </div>
          </div>
          <div className="f-strip">
            {[
              ["Mon", "g"],
              ["Tue", "g"],
              ["Wed", "g"],
              ["Thu", "a"],
              ["Fri", "g"],
              ["Sat", "r"],
              ["Sun", "g"],
            ].map(([d, k]) => (
              <div key={d}>
                {d}
                <div className={`f-dot ${k}`} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
