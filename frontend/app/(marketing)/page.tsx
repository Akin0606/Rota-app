"use client";

import { useEffect, useRef, useState } from "react";

import { ApiError, joinWaitlist } from "@/lib/api";

import Walkthrough from "./walkthrough";

/* Static "still" frame for the S4/S5 split sections. Batch 2 fills these with
   ported DOM; for now a labelled placeholder. Not interactive, aria-hidden. */
function StillFrame({ kind, label }: { kind: "still" | "phone"; label: string }) {
  return (
    <div className={`bezel ${kind === "phone" ? "bezel-phone" : "bezel-still"}`} aria-hidden="true">
      <div className="still-label">{label}</div>
    </div>
  );
}

/* WaitlistForm — behaviour unchanged from the previous landing page.
   Restyled via crewplan.css only. */
function WaitlistForm() {
  const [venueName, setVenueName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || done) return;
    setError(null);
    setSubmitting(true);
    try {
      await joinWaitlist(venueName.trim(), email.trim());
      setDone(true);
      setVenueName("");
      setEmail("");
      setTimeout(() => setDone(false), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <form className="waitlist-form" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Venue name"
          value={venueName}
          onChange={(e) => setVenueName(e.target.value)}
          required
        />
        <input
          type="email"
          placeholder="you@yourvenue.co.uk"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button type="submit" className="btn-accent" disabled={submitting || done}>
          {done ? "You're on the list" : submitting ? "Joining…" : "Join the waitlist"}
        </button>
      </form>
      {error ? (
        <p className="hero-note" style={{ color: "var(--accent-ink)" }}>
          {error}
        </p>
      ) : (
        <p className="hero-note">Free while we&apos;re in pilot. No card, no commitment.</p>
      )}
    </>
  );
}

function useReveal(rootRef: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const els = rootRef.current?.querySelectorAll(".reveal") ?? [];
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2, rootMargin: "0px 0px -8% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [rootRef]);
}

const INDEX_ROWS: [string, string][] = [
  ["Availability by one shared link", "no accounts"],
  ["Four-state availability", "yes / maybe / no / blank"],
  ["Auto-generated rotas", "from real availability"],
  ["Drop a shift to the pool", "anyone eligible claims"],
  ["Give a shift to one person", "1:1 offer"],
  ["Two-sided swaps", "worse case governs"],
  ["Holiday requests", "solver-aware"],
  ["Staff self-registration", "you approve"],
  ["Manager approval queue", "claims and swaps"],
  ["Per-day shift times", "Fri till 1am"],
  ["Post-midnight closes", "counted correctly"],
  ["Coverage warnings", "before the week"],
  ["Under-18 hard blocks", "can't be overridden"],
  ["Rest-gap and hours checks", "every write path"],
  ["Fair hours distribution", "spread evenly"],
  ["Email reminders", "chases the stragglers"],
  ["Rota emailed on publish", "to every staff member"],
  ["PDF export", "for the wall"],
  ["Excel export", "for payroll"],
  ["Shareable image", "for the group chat"],
  ["Add to phone calendar", "on confirm"],
  ["Light and dark themes", "beer garden to cellar"],
  ["Manager app", "phone or laptop"],
  ["Admin console", "multi-venue support"],
];

const FAQ: [string, string][] = [
  ["Do my staff need to download anything?", "No. A link and a four-digit PIN is the whole login — nothing to install, no passwords to reset."],
  [
    "What if someone doesn't submit?",
    "We chase them by email. If they still don't answer, a blank week counts as can't-work and the rota says so plainly.",
  ],
  [
    "Can I override the rota?",
    "Yes — move anything you like. The only exceptions are the under-18 legal blocks, which are hard stops by design.",
  ],
  ["What does it cost?", "Free during the pilot. We'll talk to you before that ever changes."],
  [
    "I already have a rota in a spreadsheet.",
    "Onboarding takes about three minutes and there's nothing to import — you answer eight short questions and you're looking at a real week.",
  ],
];

export default function CrewplanLanding() {
  const rootRef = useRef<HTMLDivElement>(null);
  useReveal(rootRef);

  return (
    <div ref={rootRef}>
      {/* S0 · Nav */}
      <nav>
        <div className="nav-inner">
          <div className="logo">
            crewplan<span className="dot">.</span>
          </div>
          <div className="nav-links">
            <a href="#walkthrough">Walkthrough</a>
            <a href="#features">Features</a>
            <a href="#compliance">Compliance</a>
            <a href="#roadmap">Roadmap</a>
          </div>
          <div className="nav-actions">
            <a href="/login" className="nav-login">
              Log in
            </a>
            <a href="#waitlist" className="btn-accent">
              Join waitlist
            </a>
          </div>
        </div>
      </nav>

      {/* S1 · Hero */}
      <header className="hero wrap">
        <div className="badge hero-in" style={{ ["--i" as string]: 0 }}>
          <span className="pulse" aria-hidden="true" />
          Now taking pilot venues
        </div>
        <h1 className="t-display-xl hero-in" style={{ ["--i" as string]: 1 }}>
          Rotas that build themselves<span className="accent">.</span>
        </h1>
        <p className="hero-sub hero-in" style={{ ["--i" as string]: 2 }}>
          Your team sends their week from a link — no app, no accounts. Crewplan builds the rota,
          flags what needs you, and emails it out.
        </p>

        <div className="hero-in" style={{ ["--i" as string]: 3 }}>
          <WaitlistForm />
        </div>

        <div className="proof-row hero-in" style={{ ["--i" as string]: 4 }}>
          <span>No staff app</span>
          <span>UK working-time rules built in</span>
          <span>Live in about 3 minutes</span>
          <span>Free in pilot</span>
        </div>
      </header>

      {/* S2 · Walkthrough */}
      <section className="stage" id="walkthrough">
        <div className="wrap">
          <div className="section-head reveal">
            <div className="eyebrow t-micro">The product</div>
            <h2 className="t-display-l">A week, start to finish.</h2>
            <p className="section-sub">Switch between what you see and what your team sees.</p>
          </div>
          <Walkthrough />
        </div>
      </section>

      {/* S3 · The loop */}
      <section className="wrap">
        <div className="section-head reveal">
          <div className="eyebrow t-micro">The loop</div>
          <h2 className="t-display-l">Three steps, every week, on its own.</h2>
          <p className="section-sub">
            No app to install, no chasing people on WhatsApp for the third time.
          </p>
        </div>

        <div className="loop">
          <div className="step reveal" style={{ ["--i" as string]: 0 }}>
            <div className="step-num t-micro">01</div>
            <h3 className="t-display-m">Send one link</h3>
            <p>
              One link, one four-digit PIN each, and it never changes. Staff can register themselves;
              you approve.
            </p>
          </div>
          <div className="step reveal" style={{ ["--i" as string]: 1 }}>
            <div className="step-num t-micro">02</div>
            <h3 className="t-display-m">Team fills it in</h3>
            <p>
              Four answers per shift — available, if needed, can&apos;t work, or not answered yet. We
              chase the stragglers by email.
            </p>
          </div>
          <div className="step reveal" style={{ ["--i" as string]: 2 }}>
            <div className="step-num t-micro">03</div>
            <h3 className="t-display-m">You get a rota</h3>
            <p>
              Built around real availability, holidays and the law. You review what&apos;s wrong, not
              what&apos;s right.
            </p>
          </div>
        </div>
      </section>

      {/* S4 · For your team */}
      <section className="wrap">
        <div className="split">
          <div className="split-body reveal">
            <div className="eyebrow t-micro">For your team</div>
            <h2 className="t-display-l">Nobody downloads anything.</h2>
            <p className="section-sub">
              Staff open a link, tap in a PIN, and mark their week. That&apos;s the entire ask.
            </p>
            <div className="split-list">
              <div className="item">
                <h3>A link and a PIN</h3>
                <p>No accounts, no passwords, no app store.</p>
              </div>
              <div className="item">
                <h3>Four honest answers</h3>
                <p>
                  &ldquo;If needed&rdquo; and &ldquo;haven&apos;t answered yet&rdquo; are different
                  things, and Crewplan treats them differently.
                </p>
              </div>
              <div className="item">
                <h3>Drop, give or swap</h3>
                <p>Like-for-like swaps approve themselves; anything riskier comes to you.</p>
              </div>
              <div className="item">
                <h3>Time off, requested properly</h3>
                <p>
                  Holiday requests go through the same system, and the rota never schedules over an
                  approved one.
                </p>
              </div>
            </div>
            <p className="split-close">Shifts add straight to their phone calendar.</p>
          </div>
          <div className="split-media reveal">
            <StillFrame kind="phone" label="Staff · My shifts timeline" />
          </div>
        </div>
      </section>

      {/* S5 · For you */}
      <section className="wrap">
        <div className="split mirror">
          <div className="split-body reveal">
            <div className="eyebrow t-micro">For you</div>
            <h2 className="t-display-l">Review what&apos;s wrong, not what&apos;s right.</h2>
            <p className="section-sub">
              The rota comes back sorted by what needs a decision. The 34 shifts that are fine stay
              out of your way.
            </p>
            <div className="split-list">
              <div className="item">
                <h3>Coverage flagged before the week starts</h3>
                <p>Uncovered and under-staffed slots, ranked by severity, not buried in a grid.</p>
              </div>
              <div className="item">
                <h3>Waiting on you</h3>
                <p>Pending claims and swaps in one row, with approve or decline in place.</p>
              </div>
              <div className="item">
                <h3>Real shift times, per day</h3>
                <p>A Friday that runs till 1am is eight hours, and the rota knows it.</p>
              </div>
              <div className="item">
                <h3>Export however you need it</h3>
                <p>PDF, Excel or a shareable image for the staff-room wall.</p>
              </div>
            </div>
          </div>
          <div className="split-media reveal">
            <StillFrame kind="still" label="Manager · Rota review — coverage line + approvals" />
          </div>
        </div>
      </section>

      {/* S6 · Compliance band */}
      <section className="band" id="compliance">
        <div className="wrap compliance reveal">
          <h2 className="t-display-l">The law is in the solver, not in your head.</h2>
          <p>
            Rest gaps between shifts, maximum weekly hours, a day off in every seven, and hard blocks
            on under-18 night and hours rules that{" "}
            <span className="ink">cannot be overridden</span> — enforced when the rota is generated,
            and every time anyone adds, claims or swaps a shift.
          </p>
        </div>
      </section>

      {/* S7 · Setup */}
      <section className="wrap">
        <div className="section-head reveal">
          <div className="eyebrow t-micro">Getting started</div>
          <h2 className="t-display-l">Set up in about three minutes.</h2>
          <p className="section-sub">
            An activation link lands in your inbox, eight short questions, and you&apos;re looking at a
            real rota for a real week. No import spreadsheet, no implementation call.
          </p>
          <div className="setup-arc">
            <span>Your venue</span>
            <span>Roles</span>
            <span>Opening hours</span>
            <span>Your team</span>
            <span>First rota</span>
          </div>
        </div>
      </section>

      {/* S8 · Quote band */}
      <section className="band">
        <div className="wrap quote-band reveal">
          <p className="t-quote">
            Built for the pub with eight staff and one manager<span className="accent">.</span> Not
            the chain with a scheduling department.
          </p>
          <p className="attrib">— why we&apos;re building Crewplan</p>
        </div>
      </section>

      {/* S9 · Feature index */}
      <section className="wrap" id="features">
        <div className="section-head reveal">
          <div className="eyebrow t-micro">Everything that&apos;s in it</div>
          <h2 className="t-display-l">Everything you need. Nothing you don&apos;t.</h2>
          <p className="section-sub">
            Built for the one person doing everything — not for a chain with a scheduling manager.
          </p>
        </div>

        <div className="feature-cards">
          {[
            ["No staff accounts", "A link and a PIN is the whole login. No downloads, nothing to reset."],
            [
              "Conflicts caught early",
              "If a shift can't be covered you find out before the week, not on the night.",
            ],
            ["Fair by default", "Hours spread evenly, so nobody quietly carries the rota."],
            ["Reminders, handled", "Crewplan chases the two people who always forget, so you don't."],
          ].map(([t, d], i) => (
            <div className="feature-card reveal" style={{ ["--i" as string]: i }} key={t}>
              <h3 className="t-display-m">{t}</h3>
              <p>{d}</p>
            </div>
          ))}
        </div>

        <div className="feature-index">
          {INDEX_ROWS.map(([name, note], i) => (
            <div className="fi-row reveal" style={{ ["--i" as string]: i }} key={name}>
              <span className="fi-name">{name}</span>
              <span className="fi-note">{note}</span>
            </div>
          ))}
        </div>
      </section>

      {/* S10 · Roadmap */}
      <section className="wrap" id="roadmap">
        <div className="section-head reveal">
          <div className="eyebrow t-micro">What&apos;s next</div>
          <h2 className="t-display-l">Where Crewplan is heading.</h2>
          <p className="section-sub">The core loop is built. These two are what comes after it.</p>
        </div>

        <div className="roadmap-list">
          <div className="roadmap-item reveal">
            <div>
              <h3>Holiday that accrues by the hour</h3>
              <p>
                12.07% of hours worked — the UK statutory model for irregular-hours staff. A
                days-based allowance works today; hours-based is next.
              </p>
            </div>
            <span className="roadmap-tag">Next</span>
          </div>
          <div className="roadmap-item reveal">
            <div>
              <h3>Notifications for claims and approvals</h3>
              <p>
                Today a claim waits in the app until someone opens it. Email and push notifications
                are coming.
              </p>
            </div>
            <span className="roadmap-tag">Next</span>
          </div>
        </div>
        <p className="roadmap-close">
          That&apos;s the whole list. We&apos;d rather ship two things than promise ten.
        </p>
      </section>

      {/* S11 · FAQ */}
      <section className="wrap">
        <div className="section-head reveal">
          <div className="eyebrow t-micro">Questions</div>
          <h2 className="t-display-l">The things a landlord actually asks.</h2>
        </div>
        <div className="faq-list">
          {FAQ.map(([q, a], i) => (
            <div className="faq-row reveal" style={{ ["--i" as string]: i }} key={q}>
              <div className="q">{q}</div>
              <div className="a">{a}</div>
            </div>
          ))}
        </div>
      </section>

      {/* S12 · Final CTA */}
      <section className="wrap final-cta" id="waitlist">
        <div className="section-head reveal">
          <div className="eyebrow t-micro" style={{ display: "block" }}>
            Get started
          </div>
          <h2 className="t-display-l">Be one of the first venues on Crewplan.</h2>
          <p className="section-sub">
            We&apos;re onboarding pilot venues by hand right now, so we can get it right before opening
            up.
          </p>
        </div>
        <WaitlistForm />
      </section>

      {/* S13 · Footer */}
      <footer>
        <div className="footer-inner">
          <div className="logo" style={{ fontSize: 16 }}>
            crewplan<span className="dot">.</span>
          </div>
          <div className="footer-links">
            <a href="#walkthrough">Walkthrough</a>
            <a href="#features">Features</a>
            <a href="#compliance">Compliance</a>
            <a href="#roadmap">Roadmap</a>
          </div>
          <div className="footer-copy">© 2026 Crewplan. Made for pubs.</div>
        </div>
      </footer>
    </div>
  );
}
