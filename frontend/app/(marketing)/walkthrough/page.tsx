import type { Metadata } from "next";
import Link from "next/link";

import { SiteFooter, SiteNav } from "../site-chrome";
import Walkthrough from "../walkthrough";

export const metadata: Metadata = {
  title: "Walkthrough — Crewplan",
  description:
    "A week, start to finish: what you do, what your team does, and what Crewplan does on its own.",
};

export default function WalkthroughPage() {
  return (
    <>
      <SiteNav />

      <main>
        <section className="section-tight">
          <div className="wrap">
            <div className="section-head rise">
              <div className="eyebrow" style={{ marginBottom: "0.875rem" }}>
                The walkthrough
              </div>
              <h1 className="d2" style={{ marginBottom: "0.875rem" }}>
                A week, start to finish.
              </h1>
              <p className="lede">
                Five steps. Switch between what you see and what your team sees — the point is how
                little they have to do, and how little you have to do once it&apos;s running.
              </p>
            </div>
          </div>
        </section>

        <section style={{ paddingBottom: "clamp(4rem, 8vw, 7rem)" }}>
          <div className="wrap">
            <Walkthrough />
          </div>
        </section>

        <section className="section-tight">
          <div className="wrap">
            <div className="plate" style={{ padding: "clamp(2rem, 5vw, 3.5rem)", textAlign: "center" }}>
              <h2 className="d2" style={{ marginBottom: "0.875rem" }}>
                That&apos;s the whole week.
              </h2>
              <p className="lede" style={{ maxWidth: "34rem", margin: "0 auto 2rem" }}>
                Give it your opening hours and your team, and you&apos;ll be looking at a real rota
                for a real week in about three minutes.
              </p>
              <div
                style={{
                  display: "flex",
                  gap: "0.625rem",
                  justifyContent: "center",
                  flexWrap: "wrap",
                }}
              >
                <Link href="/#waitlist" className="btn btn-primary">
                  Join the waitlist
                </Link>
                <Link href="/#features" className="btn btn-secondary">
                  See everything it does
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
