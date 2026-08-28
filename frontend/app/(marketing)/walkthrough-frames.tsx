/* Walkthrough frames — static DOM portraits of the product, built from the
   token vocabulary in crewplan-manager-reference.html / -staff-reference.html.
   NOT interactive: every control-looking element is a <div>/<span>, so nothing
   enters the tab order. The whole frame is aria-hidden (walkthrough.tsx wraps
   each in one visually-hidden sentence summary instead). */

import { Fragment } from "react";

type Device = "laptop" | "phone";
type FrameProps = { device: Device };

/* --- tiny inline icon set (no CDN webfont) --- */
const Ic = {
  check: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M4 10.5 8 14l8-8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  tick: (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M3 8.5 6.5 12l7-7.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  x: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  lock: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
};

function Bezel({ device, children }: { device: Device; children: React.ReactNode }) {
  return (
    <div
      className={`bezel ${device === "laptop" ? "bezel-laptop" : "bezel-phone"}`}
      aria-hidden="true"
    >
      <div className="f-scroll">{children}</div>
    </div>
  );
}

function StaffBody({ children }: { children: React.ReactNode }) {
  return <div className="f-staff-body">{children}</div>;
}

/* ===================== STEP 1 ===================== */

export function Step1Manager({ device }: FrameProps) {
  return (
    <Bezel device={device}>
      <div className="f-topbar">
        <span className="f-wordmark">
          crewplan<span>.</span>
        </span>
        <span className="f-sub" style={{ marginTop: 0 }}>
          The Anchor
        </span>
      </div>
      <div className="f-tabs">
        <span className="f-tab">Rota</span>
        <span className="f-tab">Scheduler</span>
        <span className="f-tab active">Team</span>
        <span className="f-tab">Settings</span>
      </div>
      <div className="f-pad">
        <div className="f-card" style={{ marginBottom: 12 }}>
          <div className="f-label" style={{ marginBottom: 8 }}>
            Staff join link
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ color: "var(--text-secondary)", fontSize: 11.5 }}>
              crewplan.app/v/the-anchor
            </span>
            <span className="f-chip-btn accent">Copied</span>
            <span className="f-chip-btn">Join code 4821</span>
            <span className="f-x" style={{ fontSize: 10.5 }}>
              Reset · Turn off
            </span>
          </div>
        </div>
        <div className="f-card">
          <div className="f-row join">
            <span className="f-av">J</span>
            <span>
              <strong style={{ fontWeight: 500 }}>Jess</strong> wants to join · Bar
            </span>
            <span className="f-right">
              <span className="f-chip-btn accent">Approve</span>
              <span className="f-chip-btn">Decline</span>
            </span>
          </div>
          <div className="f-row">
            <span className="f-av">S</span>Sarah
            <span className="f-right">Bar · ••••</span>
          </div>
          <div className="f-row">
            <span className="f-av">M</span>Marcus
            <span className="f-right">Floor · ••••</span>
          </div>
          <div className="f-row">
            <span className="f-av">P</span>Priya
            <span className="f-right">Bar · ••••</span>
          </div>
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
        <span className="f-wordmark" style={{ fontSize: 18 }}>
          crewplan<span>.</span>
        </span>
        <div>
          <div style={{ fontWeight: 500, fontSize: 13 }}>The Anchor</div>
          <div className="f-x" style={{ fontSize: 11 }}>
            Southampton
          </div>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 4 }}>
          Enter your PIN
        </div>
        <div className="f-pin-boxes">
          <span className="f-pin-box filled">•</span>
          <span className="f-pin-box filled">•</span>
          <span className="f-pin-box caret" />
          <span className="f-pin-box" />
        </div>
        <span className="f-link">First time? Register</span>
      </div>
    </Bezel>
  );
}

/* ===================== STEP 2 ===================== */

export function Step2Manager({ device }: FrameProps) {
  const rows: [string, string, "in" | "wait"][] = [
    ["S", "Sarah", "in"],
    ["M", "Marcus", "in"],
    ["P", "Priya", "in"],
    ["T", "Tom", "in"],
    ["L", "Leah", "in"],
    ["A", "Aday", "wait"],
    ["K", "Kim", "wait"],
  ];
  return (
    <Bezel device={device}>
      <div className="f-topbar">
        <span className="f-wordmark">
          crewplan<span>.</span>
        </span>
        <span className="f-pill amber">Closes Thursday 6pm</span>
      </div>
      <div className="f-pad">
        <div className="f-label">Waiting on availability</div>
        <div className="f-title" style={{ margin: "6px 0 2px" }}>
          5 of 7 submitted
        </div>
        <div className="f-sub" style={{ marginBottom: 14 }}>
          Week of 18–24 Aug
        </div>
        <div className="f-card">
          {rows.map(([av, name, state]) => (
            <div className="f-row" key={name} style={state === "wait" ? { opacity: 0.55 } : undefined}>
              <span className="f-av">{av}</span>
              {name}
              <span className="f-right">
                {state === "in" ? (
                  <span className="f-tick">{Ic.tick}</span>
                ) : (
                  <span className="f-pill amber">Reminder sent Thu 6pm</span>
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
      <StaffBody>
        <div className="f-pad" style={{ paddingBottom: 60 }}>
          <div className="f-title">Your availability</div>
          <div className="f-sub" style={{ marginBottom: 12 }}>
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
          {days.map(([dow, num, d, e]) => (
            <div className="f-avday" key={num}>
              <div className="f-avday-head">
                {dow} <span className="date">{num} Aug</span>
              </div>
              <div className="f-avslots">
                <span className={`f-avslot ${d}`}>Day</span>
                <span className={`f-avslot ${e}`}>Evening</span>
              </div>
            </div>
          ))}
        </div>
        <div className="f-sticky">
          <div className="f-progress">
            <div className="track">
              <div className="fill" style={{ width: "86%" }} />
            </div>
            <span>6 of 7 days</span>
          </div>
          <span className="f-cta">Submit</span>
        </div>
      </StaffBody>
    </Bezel>
  );
}

/* ===================== STEP 3 ===================== */

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
      <div className="f-topbar">
        <span className="f-wordmark">
          crewplan<span>.</span>
        </span>
        <span className="f-sub" style={{ marginTop: 0 }}>
          The Anchor
        </span>
      </div>
      <div className="f-pad">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span className="f-check f-pop" style={{ width: 40, height: 40, marginBottom: 0, borderRadius: 12 }}>
            {Ic.check}
          </span>
          <div>
            <div style={{ fontWeight: 500, fontSize: 14 }}>Rota built</div>
            <div className="f-x" style={{ fontSize: 11 }}>
              34 shifts placed
            </div>
          </div>
        </div>
        <div className="f-card" style={{ marginBottom: 12 }}>
          <div className="f-quiet-line">
            <span className="f-tick">{Ic.tick}</span>Respected 6 approved holidays
          </div>
          <div className="f-quiet-line">
            <span className="f-tick">{Ic.tick}</span>Everyone under their weekly cap
          </div>
          <div className="f-quiet-line">
            <span className="f-tick">{Ic.tick}</span>Hours spread evenly
          </div>
        </div>
        <div className="f-label" style={{ marginBottom: 8 }}>
          Draft
        </div>
        <div className="f-matrix">
          <span />
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <span className="f-mx-h" key={i}>
              {d}
            </span>
          ))}
          {grid.map((row, r) => (
            <Fragment key={r}>
              <span className="f-mx-name">{names[r]}</span>
              {row.map((c, i) => (
                <span
                  key={i}
                  className={`f-mx-cell ${c === "" ? "off" : c === "gap" ? "gap" : ""}`}
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
      <div className="f-center">
        <span className="f-check f-pop">{Ic.check}</span>
        <div style={{ fontWeight: 500, fontSize: 15 }}>Availability sent</div>
        <div className="f-x" style={{ fontSize: 12, maxWidth: 230 }}>
          Nothing else to do — we&apos;ll email you when the rota&apos;s out.
        </div>
      </div>
    </Bezel>
  );
}

/* ===================== STEP 4 ===================== */

export function Step4Manager({ device }: FrameProps) {
  return (
    <Bezel device={device}>
      <div className="f-topbar">
        <span className="f-wordmark">
          crewplan<span>.</span>
        </span>
        <span className="f-pill amber">Provisional</span>
      </div>
      <div className="f-pad" style={{ paddingBottom: 58, display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="f-coverage">
          <span style={{ color: "var(--red)", fontSize: 16, fontWeight: 500 }}>1</span>
          <div>
            <div className="n">1 gap to fill</div>
            <div className="t">Sat evening — nobody available</div>
          </div>
        </div>

        <div>
          <div className="f-label" style={{ marginBottom: 6, display: "flex", gap: 6, alignItems: "center" }}>
            Waiting on you <span className="f-pill amber" style={{ fontSize: 9 }}>2</span>
          </div>
          <div className="f-approval" style={{ marginBottom: 6 }}>
            <span className="f-av">M</span>
            <span style={{ flex: 1 }}>Marcus wants Fri evening</span>
            <span className="f-chip-btn accent">Approve</span>
            <span className="f-chip-btn f-x">{Ic.x}</span>
          </div>
          <div className="f-approval">
            <span className="f-av">P</span>
            <span style={{ flex: 1 }}>Priya ↔ Tom, Sat</span>
            <span className="f-chip-btn accent">Approve</span>
            <span className="f-chip-btn f-x">{Ic.x}</span>
          </div>
        </div>

        <div className="f-legal">
          <span className="lock">{Ic.lock}</span>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 500 }}>
              Tom is 17 — can&apos;t work past 10pm before a school day
            </div>
            <div className="f-x" style={{ fontSize: 10.5, marginTop: 2 }}>
              This one can&apos;t be overridden.
            </div>
          </div>
        </div>

        <div className="f-daystrip">
          {[
            ["Mon", "g"],
            ["Tue", "g"],
            ["Wed", "g"],
            ["Thu", "a"],
            ["Fri", "g"],
            ["Sat", "r"],
            ["Sun", "g"],
          ].map(([d, k]) => (
            <div className="d" key={d}>
              {d}
              <div className={`dot ${k}`} />
            </div>
          ))}
        </div>
      </div>
      <div className="f-sticky">
        <span>34 shifts · 4 staff</span>
        <span className="f-cta">Publish week</span>
      </div>
    </Bezel>
  );
}

export function Step4Staff({ device }: FrameProps) {
  return (
    <Bezel device={device}>
      <StaffBody>
        <div className="f-pad">
          <div className="f-card" style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
            <span className="f-pill amber">Provisional</span>
            <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
              Your manager&apos;s still finalising this week
            </span>
          </div>
          <div className="f-timeline f-faded">
            {[
              ["Mon", "18", null],
              ["Tue", "19", "6:00pm – 11:30pm"],
              ["Wed", "20", null],
              ["Thu", "21", null],
              ["Fri", "22", "2:00pm – 10:00pm"],
              ["Sat", "23", "12:00pm – 8:00pm"],
            ].map(([dow, num, time]) => (
              <div className={`f-tl-row ${time ? "working" : ""}`} key={num}>
                <div className="f-tl-node">
                  <span className="dow">{dow}</span>
                  <span className="num">{num}</span>
                </div>
                {time ? (
                  <div className="f-tl-shift">
                    <div className="body">
                      <div className="time">{time}</div>
                      <div className="role">Bar</div>
                    </div>
                  </div>
                ) : (
                  <div className="f-tl-off">Day off</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </StaffBody>
    </Bezel>
  );
}

/* ===================== STEP 5 ===================== */

export function Step5Manager({ device }: FrameProps) {
  return (
    <Bezel device={device}>
      <div className="f-topbar">
        <span className="f-wordmark">
          crewplan<span>.</span>
        </span>
        <span className="f-pill green">Published</span>
      </div>
      <div className="f-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="f-card" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="f-tick">{Ic.tick}</span>
          <span style={{ fontSize: 12.5, fontWeight: 500 }}>Published · emailed to 7 staff</span>
        </div>
        <div>
          <div className="f-label" style={{ marginBottom: 8 }}>
            Export
          </div>
          <div style={{ display: "flex", gap: 7 }}>
            <span className="f-chip-btn">PDF</span>
            <span className="f-chip-btn">Excel</span>
            <span className="f-chip-btn">Image</span>
          </div>
        </div>
        <div>
          <div className="f-label" style={{ marginBottom: 8 }}>
            Waiting on you
          </div>
          <div
            className="f-approval"
            style={{ color: "var(--green)", background: "var(--green-soft)", borderColor: "var(--green-line)" }}
          >
            <span className="f-tick">{Ic.tick}</span>
            <span>Swap approved automatically — like-for-like</span>
          </div>
        </div>
      </div>
    </Bezel>
  );
}

export function Step5Staff({ device }: FrameProps) {
  return (
    <Bezel device={device}>
      <StaffBody>
        <div className="f-pad" style={{ paddingBottom: 130 }}>
          <div className="f-title">My shifts</div>
          <div className="f-sub" style={{ marginBottom: 14 }}>
            Week of 18–24 Aug · The Anchor
          </div>
          <div className="f-timeline">
            {[
              ["Mon", "18", null, null, null],
              ["Tue", "19", "6:00pm – 11:30pm", "Bar · with P Priya", "5.5h"],
              ["Wed", "20", null, null, null],
              ["Fri", "22", "2:00pm – 10:00pm", "Floor · with T Tom", "8h"],
              ["Sat", "23", "12:00pm – 8:00pm", "Bar · with P Priya", "8h"],
            ].map(([dow, num, time, role, dur]) => (
              <div className={`f-tl-row ${time ? "working" : ""}`} key={num}>
                <div className="f-tl-node">
                  <span className="dow">{dow}</span>
                  <span className="num">{num}</span>
                </div>
                {time ? (
                  <div className="f-tl-shift">
                    <div className="body">
                      <div className="time">{time}</div>
                      <div className="role">{role}</div>
                    </div>
                    <span className="dur">{dur}</span>
                  </div>
                ) : (
                  <div className="f-tl-off">Day off</div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="f-sheet">
          <div className="grab" />
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 2 }}>Tue 19 · 6:00pm – 11:30pm</div>
          <div className="f-x" style={{ fontSize: 10.5, marginBottom: 10 }}>
            Bar · with Priya
          </div>
          <div className="f-sheet-actions">
            <span className="f-sheet-act">Drop</span>
            <span className="f-sheet-act">Give</span>
            <span className="f-sheet-act">Swap</span>
          </div>
          <div className="f-x" style={{ fontSize: 10.5, textAlign: "center" }}>
            Add to calendar
          </div>
        </div>
      </StaffBody>
    </Bezel>
  );
}
