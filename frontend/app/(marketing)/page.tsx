"use client";

import { useEffect, useRef, useState } from "react";

import { ApiError, joinWaitlist } from "@/lib/api";

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
      const res = await joinWaitlist(venueName.trim(), email.trim());
      setDone(true);
      setVenueName("");
      setEmail("");
      // Match the original: revert the button after a moment.
      setTimeout(() => setDone(false), 2500);
      if (res.already_joined) {
        // Still a success state — they're on the list either way.
      }
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
        <button type="submit" disabled={submitting || done}>
          {done ? "You're on the list" : submitting ? "Joining…" : "Join the waitlist"}
        </button>
      </form>
      {error ? (
        <p className="hero-note" style={{ color: "#FF9A5C" }}>
          {error}
        </p>
      ) : (
        <p className="hero-note">Free while we&apos;re in pilot. No card, no commitment.</p>
      )}
    </>
  );
}

export default function CrewplanLanding() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add("visible");
        });
      },
      { threshold: 0.15 },
    );
    const els = rootRef.current?.querySelectorAll(".fade-in") ?? [];
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={rootRef}>
      <nav>
        <div className="nav-inner">
          <div className="logo">
            crewplan<span className="dot">.</span>
          </div>
          <div className="nav-links">
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#roadmap">Roadmap</a>
          </div>
          <a href="#waitlist" className="nav-cta">
            Join waitlist
          </a>
        </div>
      </nav>

      <header className="hero">
        <div className="badge">
          <span className="pulse"></span>Now taking pilot venues
        </div>
        <h1 className="display">
          Rotas that build
          <br />
          themselves<span className="accent">.</span>
        </h1>
        <p className="hero-sub">
          Your team sends in when they&apos;re free. Crewplan builds the week&apos;s rota. You check
          it once on Saturday morning, and it&apos;s out to everyone.
        </p>

        <WaitlistForm />

        <div className="mockup-shell fade-in">
          <div className="mockup-topbar">
            <span className="mockup-title">The Anchor — week of 11 Aug</span>
            <span className="mockup-status">Ready to review</span>
          </div>
          <div className="rota-grid">
            <div className="rota-cell head"></div>
            <div className="rota-cell head">Mon</div>
            <div className="rota-cell head">Tue</div>
            <div className="rota-cell head">Wed</div>
            <div className="rota-cell head">Thu</div>
            <div className="rota-cell head">Fri</div>
            <div className="rota-cell head">Sat</div>
            <div className="rota-cell head">Sun</div>

            <div className="rota-cell name">Sarah</div>
            <div className="rota-cell filled">Eve</div>
            <div className="rota-cell"></div>
            <div className="rota-cell filled">Eve</div>
            <div className="rota-cell filled">Eve</div>
            <div className="rota-cell"></div>
            <div className="rota-cell filled">Day</div>
            <div className="rota-cell filled">Day</div>

            <div className="rota-cell name">Marcus</div>
            <div className="rota-cell filled">Day</div>
            <div className="rota-cell filled">Day</div>
            <div className="rota-cell"></div>
            <div className="rota-cell"></div>
            <div className="rota-cell filled">Eve</div>
            <div className="rota-cell filled">Eve</div>
            <div className="rota-cell"></div>

            <div className="rota-cell name">Priya</div>
            <div className="rota-cell"></div>
            <div className="rota-cell filled">Eve</div>
            <div className="rota-cell filled">Eve</div>
            <div className="rota-cell"></div>
            <div className="rota-cell filled">Day</div>
            <div className="rota-cell filled">Day</div>
            <div className="rota-cell filled">Eve</div>
          </div>
        </div>
      </header>

      <section id="how">
        <div className="section-inner">
          <div className="eyebrow">The loop</div>
          <h2 className="display">Three steps. Every week. On its own.</h2>
          <p className="section-sub">
            No app to install, no chasing people on WhatsApp for the third time.
          </p>

          <div className="steps">
            <div className="step fade-in">
              <div className="step-num display">01</div>
              <h3 className="display">Send one link</h3>
              <p>
                Drop your venue&apos;s link in the group chat once. It never changes — everyone taps
                in with their own PIN.
              </p>
            </div>
            <div className="step fade-in">
              <div className="step-num display">02</div>
              <h3 className="display">Team fills it in</h3>
              <p>
                Staff mark their week — available, unavailable, or preferred — in under a minute,
                right from their phone.
              </p>
            </div>
            <div className="step fade-in">
              <div className="step-num display">03</div>
              <h3 className="display">You get a rota</h3>
              <p>
                Saturday morning, review it, tweak anything that&apos;s off, hit confirm. It&apos;s
                out to the team in seconds.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="features">
        <div className="section-inner">
          <div className="eyebrow">Built for the bar, not the boardroom</div>
          <h2 className="display">Everything you need. Nothing you don&apos;t.</h2>
          <p className="section-sub">
            Most rota software is built for chains with a scheduling manager. Crewplan is built for
            the one person doing everything.
          </p>

          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">✓</div>
              <h3 className="display">No staff accounts</h3>
              <p>
                No app downloads, no passwords to reset. A link and a 4-digit PIN is the whole login.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">⚡</div>
              <h3 className="display">Conflicts caught early</h3>
              <p>
                If a shift can&apos;t be covered, you&apos;ll know before the week starts — not when
                someone doesn&apos;t show up.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">◐</div>
              <h3 className="display">Fair by default</h3>
              <p>
                Hours spread evenly across your team automatically, so nobody&apos;s quietly carrying
                the rota.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">✉</div>
              <h3 className="display">Reminders, handled</h3>
              <p>Crewplan chases the two people who always forget, so you don&apos;t have to.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">◫</div>
              <h3 className="display">One Saturday check-in</h3>
              <p>
                An email lands with the week ready to go. Approve as-is, or adjust in a couple of
                taps.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">▤</div>
              <h3 className="display">Calendar-ready</h3>
              <p>
                Staff add their shifts straight to their phone calendar the moment the rota&apos;s
                confirmed.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="quote-section">
        <div className="section-inner">
          <p className="quote display">
            Built for the pub with eight staff and one manager<span className="accent">.</span> Not
            the chain with a scheduling department.
          </p>
          <p className="quote-attrib">— why we&apos;re building Crewplan</p>
        </div>
      </section>

      <section id="roadmap">
        <div className="section-inner">
          <div className="eyebrow">What&apos;s next</div>
          <h2 className="display">Where Crewplan is heading.</h2>
          <p className="section-sub">
            The core loop comes first. These land as we hear from real venues.
          </p>

          <div className="roadmap-list">
            <div className="roadmap-item">
              <div className="roadmap-item-text">
                <h4 className="display">Square integration</h4>
                <p>
                  Pull footfall and sales data in, so the rota accounts for your busiest hours
                  automatically.
                </p>
              </div>
              <span className="roadmap-tag next">In progress</span>
            </div>
            <div className="roadmap-item">
              <div className="roadmap-item-text">
                <h4 className="display">Xero payroll export</h4>
                <p>
                  Confirmed hours flow straight into payroll — no re-typing a week&apos;s shifts by
                  hand.
                </p>
              </div>
              <span className="roadmap-tag next">In progress</span>
            </div>
            <div className="roadmap-item">
              <div className="roadmap-item-text">
                <h4 className="display">Shift swaps</h4>
                <p>
                  Staff arrange swaps between themselves, with the manager only stepping in to
                  approve.
                </p>
              </div>
              <span className="roadmap-tag later">Planned</span>
            </div>
            <div className="roadmap-item">
              <div className="roadmap-item-text">
                <h4 className="display">Multi-site view</h4>
                <p>Running more than one venue? See every rota in one place.</p>
              </div>
              <span className="roadmap-tag later">Planned</span>
            </div>
          </div>
        </div>
      </section>

      <section className="final-cta" id="waitlist">
        <div className="section-inner">
          <div className="eyebrow" style={{ justifyContent: "center" }}>
            Get started
          </div>
          <h2 className="display" style={{ textAlign: "center" }}>
            Be one of the first venues on Crewplan.
          </h2>
          <p className="section-sub" style={{ textAlign: "center" }}>
            We&apos;re onboarding pilot venues by hand right now, so we can get it right before
            opening up.
          </p>
          <WaitlistForm />
        </div>
      </section>

      <footer>
        <div className="footer-inner">
          <div className="logo" style={{ fontSize: "16px" }}>
            crewplan<span className="dot">.</span>
          </div>
          <div className="footer-links">
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#roadmap">Roadmap</a>
          </div>
          <div className="footer-copy">© 2026 Crewplan. Made for pubs.</div>
        </div>
      </footer>
    </div>
  );
}
