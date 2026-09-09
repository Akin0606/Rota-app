import type { Metadata } from "next";

import { SiteFooter, SiteNav } from "../site-chrome";

export const metadata: Metadata = {
  title: "Privacy Policy — Rotally",
  description: "How Rotally collects, uses, and protects personal data.",
};

// NOTE: This is a structured SHELL, not finalised legal copy. Rotally stores
// staff personal data including under-18 status, so the Privacy Policy is a
// go-live/GDPR requirement. The headings below map the sections a UK privacy
// policy for this kind of service needs; the body is placeholder. Replace each
// with solicitor-reviewed wording (and set the real "Last updated" date) before
// go-live. Sub-processors listed are the actual stack — keep this list accurate.

const SECTIONS: { h: string; body: string }[] = [
  {
    h: "1. Controller and processor",
    body: "For staff data entered into a venue, the venue (your business) is the data controller and Rotally is the processor acting on your instructions. For account and billing data, Rotally is the controller. Operated by [legal entity name and registered address].",
  },
  {
    h: "2. What we collect",
    body: "Manager account: email. Staff: name, contact email, a 4-digit PIN, whether the person is under 18, availability, shifts, and leave. We do not collect payment card details directly — those go to our payment processor.",
  },
  {
    h: "3. Why we collect it (lawful basis)",
    body: "[Lawful basis for each category — e.g. contract performance for running the rota, legitimate interests, and legal obligation for under-18 working-time compliance.]",
  },
  {
    h: "4. Under-18 data",
    body: "We record whether a staff member is under 18 solely to enforce UK working-time rules for young workers when generating rotas. [Add any additional safeguards and retention specifics.]",
  },
  {
    h: "5. How long we keep it",
    body: "[Retention periods per category, and what happens when a venue or staff member is removed.]",
  },
  {
    h: "6. Who we share it with (sub-processors)",
    body: "We use: Supabase (database and authentication), Resend (transactional email), Vercel (frontend hosting), Render (backend hosting), and Stripe (payments). Each processes data only to provide their part of the service.",
  },
  {
    h: "7. Your rights",
    body: "[Access, rectification, erasure, portability, objection, and how to exercise them.] Staff should contact their venue in the first instance, as the venue is the controller of their data.",
  },
  {
    h: "8. Security",
    body: "[Security measures — encryption in transit, access controls, tenant isolation.]",
  },
  {
    h: "9. Contact",
    body: "Privacy questions or requests: [contact email].",
  },
];

export default function PrivacyPage() {
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
                Privacy Policy
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
