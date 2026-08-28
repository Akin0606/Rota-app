"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { SuggestionBox, WaitlistForm } from "./forms";
import { SiteFooter, SiteNav } from "./site-chrome";
import { StillManagerReview, StillStaffShifts } from "./walkthrough-frames";

function useReveal(root: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const els = root.current?.querySelectorAll(".reveal") ?? [];
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -6% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [root]);
}

const MARKS: Record<string, JSX.Element> = {
  grid: (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <rect x="2.5" y="2.5" width="6" height="6" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
      <rect x="11.5" y="2.5" width="6" height="6" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
      <rect x="2.5" y="11.5" width="6" height="6" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
      <rect x="11.5" y="11.5" width="6" height="6" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
  clock: (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 5.8V10l2.8 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  solve: (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path
        d="M3 10.5 7 14l10-9"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  shield: (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path
        d="M10 2.5 16 5v5c0 3.6-2.5 6.3-6 7.5-3.5-1.2-6-3.9-6-7.5V5l6-2.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  ),
  swap: (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path
        d="M3 7h11l-3-3M17 13H6l3 3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  flag: (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path
        d="M5 17V3.5h10L12.5 7 15 10.5H5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  ),
};

const FEATURES: [string, string, string][] = [
  [
    "grid",
    "Nobody downloads anything",
    "A link and four digits is the whole login. No accounts to make, no passwords to reset — which is why your team actually uses it.",
  ],
  [
    "clock",
    "It chases them, not you",
    "Availability opens, closes, and the two who always forget get chased — on a timetable, whether you're behind the bar or not.",
  ],
  [
    "solve",
    "It solves, it doesn't guess",
    "Worked out against real availability, approved holidays and the working-time rules. You get the best fit your week allows, not the first thing that fits.",
  ],
  [
    "shield",
    "It won't let you break the law",
    "Rest gaps, weekly hours, a day off in seven. Under-18 night and hours limits are hard blocks — checked when it's built and on every change after.",
  ],
  [
    "swap",
    "They sort their own cover",
    "Drop, give or swap. A like-for-like swap approves itself and you never hear about it; anything riskier comes to you with the reason attached.",
  ],
  [
    "flag",
    "You review what's wrong",
    "Gaps and approvals ranked at the top. The thirty shifts that are fine stay out of your way — that's the difference between checking a rota and writing one.",
  ],
];

const INDEX: [string, string][] = [
  ["Availability from one shared link", "no accounts"],
  ["Four honest answers per shift", "including “not yet”"],
  ["Rotas solved, not templated", "constraint solver"],
  ["Drop a shift to the team", "anyone eligible claims"],
  ["Give a shift to one person", "a 1:1 offer"],
  ["Two-sided swaps", "worse case governs"],
  ["Like-for-like approves itself", "you never see it"],
  ["Holiday requests", "the rota respects them"],
  ["Staff register themselves", "you approve"],
  ["Per-day shift times", "Friday can run to 1am"],
  ["Post-midnight closes", "counted properly"],
  ["Coverage gaps flagged early", "before the week starts"],
  ["Under-18 hard blocks", "cannot be overridden"],
  ["Rest gaps and weekly hours", "checked on every change"],
  ["Hours spread evenly", "nobody quietly carries it"],
  ["Availability chased by email", "automatically"],
  ["Rota emailed on publish", "to everyone on it"],
  ["PDF export", "for the staff-room wall"],
  ["Excel export", "for whoever does payroll"],
  ["Shareable image", "for the group chat"],
  ["Straight into their calendar", "when it's confirmed"],
  ["Light and dark", "beer garden or cellar"],
  ["Manager app", "phone or laptop"],
  ["Set up in about three minutes", "nothing to import"],
];

const ROADMAP: [string, string, "next" | "exploring"][] = [
  [
    "Holiday that accrues by the hour",
    "12.07% of hours worked — the statutory model for irregular-hours staff. The days-based allowance works today; hours-based is next.",
    "next",
  ],
  [
    "Notifications for claims and cover",
    "Today a claim waits in the app until someone opens it. Email and push are the next thing we build.",
    "next",
  ],
  [
    "Cover finder — for when someone calls in sick",
    "One tap on the shift that's gone missing. Crewplan ranks who could legally and realistically take it, asks the top few, and the first to accept gets it.",
    "exploring",
  ],
  [
    "Publishing on a schedule",
    "A clean week goes out on its own, at the time you choose. If there's a hole or a legal block it doesn't go — and you're told exactly what's stopping it.",
    "exploring",
  ],
  [
    "Wage cost that steers the rota",
    "Not a report you read afterwards. A weekly labour budget the solver works inside, so the rota you're handed is already within it.",
    "exploring",
  ],
];

const FAQ: [string, string][] = [
  [
    "My team won't use it. They never use anything.",
    "That's the objection we built the whole thing around. There is no app, no account and no password — a link in the group chat and four digits. If they can open a WhatsApp message they can send their week.",
  ],
  [
    "What if someone doesn't send theirs in?",
    "They're chased by email automatically, so you're not the one nagging. If they still don't answer, a blank week counts as can't-work and the rota says so plainly, rather than quietly assuming they're free.",
  ],
  [
    "Can I overrule it?",
    "Yes — move anything you like, and it tells you what that breaks before you commit. The only exceptions are the under-18 legal limits, which are hard stops by design.",
  ],
  [
    "Do I have to move my spreadsheet across?",
    "No. There's nothing to import and nothing to tidy up first. Answer eight short questions about your hours and your team and you're looking at a real week in about three minutes.",
  ],
  [
    "What does it cost?",
    "Nothing during the pilot, and there's no card on file to forget about. When that changes you'll hear it from us first — not from a bill.",
  ],
  [
    "What if it doesn't suit how we run?",
    "Then tell us and we'll either fix it or say plainly that we won't. You can stop using it whenever you like; there's no contract and nothing to cancel. We'd rather lose a venue than pretend it fits.",
  ],
];

const VERSUS_NOW: string[] = [
  "Eleven unread messages, none of them in one place",
  "A paper diary, or a spreadsheet only you understand",
  "You chase the same two people every single week",
  "Rest gaps and under-18 hours checked in your head, if at all",
  "Someone can't work Friday and it becomes your problem",
  "You find out about a clash after the rota has gone out",
];

const VERSUS_NEW: string[] = [
  "One link. Everyone answers in the same place",
  "Availability opens and closes on a schedule you set",
  "The two who forget get chased automatically, by email",
  "The law is checked when it's built and on every change after",
  "They drop, give or swap it between themselves",
  "Gaps are ranked at the top before the week starts",
];

const TRUST: [string, string][] = [
  [
    "Built against a real week",
    "Every rule in here was written against a working pub's actual roster — real staff, real availability, real published weeks. Not a demo dataset.",
  ],
  [
    "Set up by hand, a few at a time",
    "We onboard pilot venues personally rather than pointing you at a signup form. That's the only reason it ends up fitting how your place actually runs.",
  ],
  [
    "We tell you what isn't built",
    "The roadmap below lists what's missing as plainly as what's coming. You'll never discover a gap after you've committed to us.",
  ],
];

export default function Home() {
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);

  return (
    <div ref={root}>
      <SiteNav />

      <main>
        {/* ---------------- Hero ---------------- */}
        <header className="hero">
          <div className="wrap">
            <div className="pill rise" style={{ ["--i" as string]: 0 }}>
              <span className="pulse" aria-hidden="true" />
              Taking pilot venues now — a few at a time
            </div>
            <h1 className="d1 rise" style={{ ["--i" as string]: 1 }}>
              Rotas that write themselves<span className="accent">.</span>
            </h1>
            <p className="lede rise" style={{ ["--i" as string]: 2 }}>
              Right now it&apos;s a group chat, a paper diary and your Sunday night. Crewplan takes
              that off you — your team sends their week from one link, and a finished rota comes
              back with availability, holidays and the law already worked out.
            </p>
            <div className="rise" style={{ ["--i" as string]: 3 }}>
              <WaitlistForm id="hero" />
            </div>
            <div className="proof rise" style={{ ["--i" as string]: 4 }}>
              <div>Nothing for your team to install</div>
              <div>Under-18 limits are hard blocks</div>
              <div>First rota in about 3 minutes</div>
              <div>Free for pilot venues</div>
            </div>
          </div>
        </header>

        {/* ------------- The problem -------------
            The hero states the transformation; this names the discomfort it
            transforms. Without this beat a reader has a destination and no
            reason to leave where they are. */}
        <section className="section">
          <div className="wrap">
            <div className="section-head reveal">
              <div className="eyebrow">The Sunday night problem</div>
              <h2 className="d2">Nobody took on a pub to do admin.</h2>
              <p className="lede">
                You know the evening. Half the team have sent their week, three haven&apos;t, one
                has changed theirs twice, and you&apos;re working out whether a sixteen-year-old can
                legally close on Friday. It takes an hour you don&apos;t have — and next Sunday you
                do the whole thing again.
              </p>
            </div>

            <div className="versus reveal">
              <div className="versus-col is-now">
                <div className="versus-head">How next week gets written now</div>
                <ul>
                  {VERSUS_NOW.map((line) => (
                    <li key={line}>
                      <svg
                        className="versus-mark"
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M4 8h8"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                        />
                      </svg>
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="versus-col is-new">
                <div className="versus-head">How it gets written with Crewplan</div>
                <ul>
                  {VERSUS_NEW.map((line) => (
                    <li key={line}>
                      <svg
                        className="versus-mark"
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M3 8.5 6.5 12 13 4.5"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ------------- Walkthrough teaser ------------- */}
        <section className="section-tight">
          <div className="wrap">
            <div className="plate reveal" style={{ padding: "clamp(1.75rem, 4vw, 3rem)" }}>
              <div className="teaser">
                <div>
                  <div className="eyebrow" style={{ marginBottom: "0.875rem" }}>
                    See it work
                  </div>
                  <h2 className="d2" style={{ marginBottom: "0.875rem" }}>
                    A week, start to finish.
                  </h2>
                  <p className="body" style={{ marginBottom: "1.75rem", maxWidth: "30rem" }}>
                    Five steps, side by side: what you do, what your team does, and the parts
                    that happen without either of you. Switch between the two views — the gap
                    between them is how much of your week this gives back.
                  </p>
                  <Link href="/walkthrough" className="btn btn-primary">
                    See a week, start to finish
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path
                        d="M6 3l5 5-5 5"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </Link>
                </div>
                <div className="teaser-media">
                  <StillManagerReview />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ------------- What happens on its own ------------- */}
        <section className="section">
          <div className="wrap">
            <div className="compliance reveal">
              <div className="eyebrow" style={{ marginBottom: "0.875rem" }}>
                What happens on its own
              </div>
              <h2 className="d2">
                The week runs to a schedule whether you&apos;re behind the bar or not.
              </h2>
              <p>
                Availability opens on the day you set and closes on the day you set. The two who
                always forget get chased in between. On your morning there&apos;s a finished rota
                waiting — <span className="ink">something to look at, not a job to do.</span>
              </p>
            </div>
          </div>
        </section>

        {/* ------------- For your team ------------- */}
        <section className="section-tight">
          <div className="wrap">
            <div className="split reveal">
              <div>
                <div className="eyebrow" style={{ marginBottom: "0.875rem" }}>
                  For your team
                </div>
                <h2 className="d2" style={{ marginBottom: "0.875rem" }}>
                  A minute a week, on the bus.
                </h2>
                <p className="body">
                  The reason rota software fails in a pub is that half the team never signs in.
                  There is nothing here to sign in to.
                </p>
                <div className="split-list">
                  <div>
                    <div className="d4">A link and a PIN</div>
                    <p className="body">No account, no password, nothing from an app store.</p>
                  </div>
                  <div>
                    <div className="d4">Four honest answers</div>
                    <p className="body">
                      Available, if needed, can&apos;t work — and &ldquo;not answered yet&rdquo;,
                      which is treated as its own thing instead of quietly assuming they&apos;re
                      free.
                    </p>
                  </div>
                  <div>
                    <div className="d4">They sort their own cover</div>
                    <p className="body">
                      Drop it to the team, give it to one person, or swap. Like-for-like goes
                      through on its own.
                    </p>
                  </div>
                  <div>
                    <div className="d4">Time off, asked for properly</div>
                    <p className="body">
                      Holiday goes through the same place, and the rota never schedules over one
                      that&apos;s approved.
                    </p>
                  </div>
                </div>
              </div>
              <div className="split-media">
                <StillStaffShifts />
              </div>
            </div>
          </div>
        </section>

        {/* ------------- For you ------------- */}
        <section className="section-tight">
          <div className="wrap">
            <div className="split mirror reveal">
              <div>
                <div className="eyebrow" style={{ marginBottom: "0.875rem" }}>
                  For you
                </div>
                <h2 className="d2" style={{ marginBottom: "0.875rem" }}>
                  Check what&apos;s wrong, not what&apos;s right.
                </h2>
                <p className="body">
                  A finished rota is thirty-odd decisions and twenty-nine of them are fine. Crewplan
                  shows you the ones that aren&apos;t, then gets out of the way.
                </p>
                <div className="split-list">
                  <div>
                    <div className="d4">Gaps, before the week starts</div>
                    <p className="body">
                      Uncovered and short-staffed slots ranked by how wrong they are — not buried
                      somewhere in a grid.
                    </p>
                  </div>
                  <div>
                    <div className="d4">Everything waiting on you, in one row</div>
                    <p className="body">
                      Claims and swaps, with approve or decline in place and the reason attached.
                    </p>
                  </div>
                  <div>
                    <div className="d4">Real times, day by day</div>
                    <p className="body">
                      A Friday that runs to 1am is eight hours, and the rota counts it as eight.
                    </p>
                  </div>
                  <div>
                    <div className="d4">Out however you need it</div>
                    <p className="body">
                      Emailed on publish, plus a PDF, a spreadsheet or an image whenever you want
                      one.
                    </p>
                  </div>
                </div>
              </div>
              <div className="split-media">
                <StillManagerReview />
              </div>
            </div>
          </div>
        </section>

        {/* ------------- Compliance ------------- */}
        <section className="section" id="compliance">
          <div className="wrap">
            <div
              className="plate-sunken reveal"
              style={{ padding: "clamp(2.5rem, 6vw, 4.5rem) clamp(1.5rem, 4vw, 3rem)" }}
            >
              <div className="compliance">
                <div className="eyebrow" style={{ marginBottom: "0.875rem" }}>
                  Compliance
                </div>
                <h2 className="d2">The law is in the solver, not in your head.</h2>
                <p>
                  Rest gaps between shifts, maximum weekly hours, a day off in every seven, and the
                  under-18 night and hours limits — checked when the rota is built, and again every
                  time anyone adds, claims or swaps a shift. The under-18 blocks{" "}
                  <span className="ink">cannot be overridden</span>, by you or by anyone.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ------------- Features ------------- */}
        <section className="section" id="features">
          <div className="wrap">
            <div className="section-head reveal">
              <div className="eyebrow">What it does</div>
              <h2 className="d2">Built for the person doing everything.</h2>
              <p className="lede">
                Not for a chain with a scheduling department. Every one of these exists because a
                job was quietly taking an operator an hour a week.
              </p>
            </div>

            <div className="features">
              {FEATURES.map(([mark, title, copy], i) => (
                <div className="feature reveal" style={{ ["--i" as string]: i }} key={title}>
                  <div className="feature-mark">{MARKS[mark]}</div>
                  <div className="d4">{title}</div>
                  <p className="body">{copy}</p>
                </div>
              ))}
            </div>

            <div className="index">
              {INDEX.map(([name, note], i) => (
                <div className="index-row reveal" style={{ ["--i" as string]: i }} key={name}>
                  <span>{name}</span>
                  <span>{note}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ------------- Quote ------------- */}
        <section className="section-tight">
          <div className="wrap">
            <div className="quote reveal">
              <p>
                Built for the pub with eight staff and one manager<span className="accent">.</span>{" "}
                Not the chain with a scheduling department.
              </p>
              <p className="attrib">— why we&apos;re building Crewplan</p>
            </div>
          </div>
        </section>

        {/* ------------- Trust -------------
            We have no logos, no customer count and no testimonials, and inventing
            any of them would be the fastest way to lose the one audience we want.
            So this slot carries what is actually true instead. */}
        <section className="section-tight">
          <div className="wrap">
            <div className="section-head reveal">
              <div className="eyebrow">Why you can believe any of this</div>
              <h2 className="d2">We&apos;re early, and we&apos;d rather say so.</h2>
              <p className="lede">
                No logos to show you and no customer count worth quoting yet. Here&apos;s what we
                can honestly put behind it instead.
              </p>
            </div>
            <div className="trust">
              {TRUST.map(([title, copy], i) => (
                <div className="trust-item reveal" style={{ ["--i" as string]: i }} key={title}>
                  <div className="d4">{title}</div>
                  <p className="body">{copy}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ------------- Pricing -------------
            The price is the strongest single argument on the page right now, so
            it gets a section and display-scale type rather than one FAQ row. */}
        <section className="section" id="pricing">
          <div className="wrap">
            <div className="plate-sunken reveal">
              <div className="price">
                <div className="eyebrow" style={{ marginBottom: "1.25rem" }}>
                  Pricing
                </div>
                <div className="price-fig">
                  £0 <i>while we&apos;re in pilot</i>
                </div>
                <p className="lede" style={{ maxWidth: "34rem", margin: "0 auto" }}>
                  No card, no trial clock, nothing to cancel. When we do start charging, pilot
                  venues hear it from us first and get a say in what&apos;s fair — nobody wakes up
                  to a bill.
                </p>
                <div className="price-list">
                  <span>Every feature, no tiers</span>
                  <span>Unlimited staff</span>
                  <span>No card required</span>
                  <span>No contract</span>
                  <span>Stop whenever you like</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ------------- Roadmap ------------- */}
        <section className="section" id="roadmap">
          <div className="wrap">
            <div className="section-head reveal">
              <div className="eyebrow">What&apos;s next</div>
              <h2 className="d2">Where Crewplan is heading.</h2>
              <p className="lede">
                Everything below either takes a job off you or does it better than a person guessing
                at eleven at night. That&apos;s the whole filter.
              </p>
            </div>
            <div className="road">
              {ROADMAP.map(([title, copy, tag], i) => (
                <div className="road-item reveal" style={{ ["--i" as string]: i }} key={title}>
                  <div>
                    <div className="d4">{title}</div>
                    <p className="body">{copy}</p>
                  </div>
                  <span className={`tag tag-${tag}`}>{tag === "next" ? "Next" : "Exploring"}</span>
                </div>
              ))}
            </div>
            <p className="road-close reveal">
              That&apos;s the list. We&apos;d rather ship a few things properly than promise ten.
            </p>
          </div>
        </section>

        {/* ------------- FAQ ------------- */}
        <section className="section-tight">
          <div className="wrap">
            <div className="section-head reveal">
              <div className="eyebrow">Questions</div>
              <h2 className="d2">The things an operator actually asks.</h2>
            </div>
            <div className="faq">
              {FAQ.map(([q, a], i) => (
                <div className="faq-row reveal" style={{ ["--i" as string]: i }} key={q}>
                  <div className="d4">{q}</div>
                  <p className="body">{a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ------------- Suggestion box ------------- */}
        <section className="section-tight" id="suggest">
          <div className="wrap">
            <div className="plate reveal" style={{ padding: "clamp(1.75rem, 4vw, 3rem)" }}>
              <div className="section-head">
                <div className="eyebrow" style={{ marginBottom: "0.875rem" }}>
                  Tell us something
                </div>
                <h2 className="d2" style={{ marginBottom: "0.875rem" }}>
                  What would make this genuinely useful?
                </h2>
                <p className="body">
                  We&apos;re building this with a handful of venues, by hand, on purpose. If
                  something here is wrong for how your place actually runs, that&apos;s the most
                  useful thing you could tell us.
                </p>
              </div>
              <SuggestionBox />
            </div>
          </div>
        </section>

        {/* ------------- CTA ------------- */}
        <section className="section" id="waitlist">
          <div className="wrap cta">
            <div className="reveal">
              <div className="eyebrow" style={{ marginBottom: "0.875rem" }}>
                Your turn
              </div>
              <h2 className="d2">Make this the last rota you write by hand.</h2>
              <p className="lede">
                Tell us your venue and we&apos;ll come back to you to set it up. Opening hours, your
                team, and you&apos;re looking at a real rota for a real week — about three minutes
                of actual work.
              </p>
              <WaitlistForm id="cta" />
              <div className="arc" style={{ justifyContent: "center", marginTop: "2.5rem" }}>
                <span>Your venue</span>
                <i aria-hidden="true">→</i>
                <span>Roles</span>
                <i aria-hidden="true">→</i>
                <span>Opening hours</span>
                <i aria-hidden="true">→</i>
                <span>Your team</span>
                <i aria-hidden="true">→</i>
                <span>First rota</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
