import type { Metadata } from "next";

import { SiteFooter, SiteNav } from "../site-chrome";

export const metadata: Metadata = {
  title: "Terms of Service — Rotally",
  description: "The terms that govern your use of Rotally.",
};

// NOTE: This is a structured SHELL, not finalised legal copy. The headings map
// the sections a UK B2B SaaS Terms of Service normally carries; the body text is
// placeholder. Replace each section's copy with your solicitor-reviewed wording
// before go-live (and set the real "Last updated" date). Do not ship the
// placeholder text to customers.

const SECTIONS: { h: string; body: string }[] = [
  {
    h: "1. Who we are",
    body: "Rotally is a rota-scheduling service for small independent UK pubs and restaurants, operated by [legal entity name and registered address]. These terms govern your use of the service.",
  },
  {
    h: "2. Your account",
    body: "Access is by invitation during the pilot. You are responsible for keeping your login secure and for the staff you add to your venue.",
  },
  {
    h: "3. Acceptable use",
    body: "[What customers may and may not do with the service.]",
  },
  {
    h: "4. Staff data",
    body: "You are the data controller for your staff's personal data; Rotally processes it on your behalf. See our Privacy Policy for how we handle it.",
  },
  {
    h: "5. Availability & changes",
    body: "[Service availability expectations, and how and when these terms or the service may change.]",
  },
  {
    h: "6. Fees",
    body: "[Subscription pricing, billing, trials, and cancellation — align with the Billing section of the app.]",
  },
  {
    h: "7. Liability",
    body: "[Limitation of liability and disclaimers.]",
  },
  {
    h: "8. Contact",
    body: "Questions about these terms: [contact email].",
  },
];

export default function TermsPage() {
  return (
    <>
      <SiteNav />

      <main>
        <section className="section-tight">
          <div className="wrap">
            <div className="section-head rise" style={{ maxWidth: "42rem" }}>
              <div className="eyebrow" style={{ marginBottom: "0.875rem" }}>
                Legal
              </div>
              <h1 className="d2" style={{ marginBottom: "0.875rem" }}>
                Terms of Service
              </h1>
              <p className="lede">Last updated: [date]</p>
            </div>
          </div>
        </section>

        <section style={{ paddingBottom: "clamp(4rem, 8vw, 7rem)" }}>
          <div className="wrap">
            <div style={{ maxWidth: "42rem" }}>
              <div
                className="plate"
                style={{ padding: "1rem 1.25rem", marginBottom: "2rem" }}
              >
                <p className="small">
                  Placeholder — this document has not been finalised. Replace with
                  your reviewed legal copy before go-live.
                </p>
              </div>

              {SECTIONS.map((s) => (
                <div key={s.h} style={{ marginBottom: "1.75rem" }}>
                  <h2
                    style={{
                      fontSize: "1.05rem",
                      fontWeight: 500,
                      marginBottom: "0.5rem",
                    }}
                  >
                    {s.h}
                  </h2>
                  <p style={{ lineHeight: 1.7, color: "var(--ink-2, inherit)" }}>
                    {s.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
