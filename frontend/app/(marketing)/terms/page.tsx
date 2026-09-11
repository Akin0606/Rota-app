import type { Metadata } from "next";

import { SiteFooter, SiteNav } from "../site-chrome";

export const metadata: Metadata = {
  title: "Terms of Service — Rotally",
  description: "The terms that govern your use of Rotally.",
};

const LAST_UPDATED = "10 September 2026";

// One place to change the operator's legal identity. Rotally is the trading
// name; fill in the registered company name and office (or sole-trader details)
// before this is relied on commercially.
const OPERATOR = "Pycroft Solutions (Oluwaseun Akinshilo), Friars Croft, Pine Walk Road, Chilworth, Southampton SO16 7HN, United Kingdom";
const CONTACT = "support@rotally.co.uk";

type Section = { h: string; body?: string | string[]; bullets?: string[] };

const SECTIONS: Section[] = [
  {
    h: "1. About these terms",
    body: [
      `Rotally is a rota-scheduling service for small independent pubs and restaurants in the United Kingdom, operated by ${OPERATOR} ("we", "us", "Rotally"). Staff submit their availability, the service builds a draft rota, and the manager reviews and publishes it.`,
      `These terms are the agreement between you — the business that signs up for a venue — and us. By creating a venue or using the service you agree to them. If you are agreeing on behalf of a business, you confirm you are authorised to do so. If you do not agree, do not use the service.`,
    ],
  },
  {
    h: "2. The pilot",
    body: `Rotally is currently an invite-only pilot. Access is granted by us and may be limited, changed, or withdrawn while the service is in this phase. Features may be added, altered, or removed as we develop the product, and we may contact you for feedback. We will give you reasonable notice of any change that materially reduces the service you rely on.`,
  },
  {
    h: "3. Your account",
    body: [
      "A venue is set up by a manager, who signs in with a one-time code sent to their email address. Staff you add to the venue sign in with a 4-digit PIN. You are responsible for:",
    ],
    bullets: [
      "keeping manager sign-in access secure and only sharing it with people entitled to manage the rota;",
      "the staff members you add, the accuracy of the information you enter about them, and distributing their PINs and venue link responsibly;",
      "all activity that happens under your venue.",
    ],
  },
  {
    h: "4. Your staff and their data",
    body: `You are the data controller for the personal data of the staff you add to your venue; we process that data on your behalf and on your instructions, as your processor. This includes staff names, contact emails, whether a person is under 18, their availability, shifts, and leave. You are responsible for having a lawful basis to enter that data and for telling your staff how it is used. How we handle personal data is set out in our Privacy Policy, which forms part of these terms.`,
  },
  {
    h: "5. Working-time compliance",
    body: `Rotally applies UK working-time rules for young workers when it builds a draft rota — for example, it will not schedule an under-18 outside their permitted hours. These checks are a tool to help you, not a substitute for your own legal responsibilities as an employer. You remain responsible for compliance with employment, working-time, and other applicable law. You must not rely on Rotally as legal advice.`,
  },
  {
    h: "6. Acceptable use",
    body: "You agree not to:",
    bullets: [
      "use the service unlawfully, or to enter data you have no right to process;",
      "attempt to access another venue's data, probe or interfere with the security of the service, or disrupt its operation;",
      "reverse-engineer, resell, or copy the service except as the law allows;",
      "upload anything malicious or use the service to send unsolicited messages.",
    ],
  },
  {
    h: "7. Fees",
    body: `Rotally is free to use during the pilot. If we introduce paid plans, we will tell you in advance and you will be able to choose whether to continue on a paid basis — we will not start charging you without your agreement. Where paid plans apply, billing terms shown at sign-up or in the app will govern them.`,
  },
  {
    h: "8. Availability of the service",
    body: `We work to keep Rotally available and reliable, but we do not guarantee it will be uninterrupted or error-free, and it is provided "as is" during the pilot. We may carry out maintenance, and occasionally the service may be unavailable. Rotas, availability, and reminders depend on data you and your staff enter and on third-party email delivery, which we cannot guarantee.`,
  },
  {
    h: "9. Our intellectual property",
    body: `The Rotally service, its software, design, and branding belong to us. Using the service does not transfer any of those rights to you. The data you and your staff enter remains yours; you grant us permission to process it only to provide and improve the service.`,
  },
  {
    h: "10. Liability",
    body: [
      "Nothing in these terms limits liability that cannot be limited by law — including liability for death or personal injury caused by negligence, or for fraud.",
      "Subject to that, we are not liable for indirect or consequential loss, for loss of profit, business, or goodwill, or for loss arising from your reliance on a rota, a compliance check, or an email that did or did not send. Rotally is a scheduling aid; final decisions about who works when, and about legal compliance, are yours. Because the pilot is provided free of charge, our total liability to you is limited to the greatest extent permitted by law.",
    ],
  },
  {
    h: "11. Suspension and termination",
    body: `You can stop using the service and ask us to close your venue at any time. We may suspend or end your access if you breach these terms, or if we discontinue the pilot, giving you reasonable notice where we can. When a venue is closed, we handle any remaining personal data as described in the Privacy Policy.`,
  },
  {
    h: "12. Changes to these terms",
    body: `We may update these terms as the service develops. When we make a material change we will update the date at the top and, where appropriate, let you know. Continuing to use the service after a change means you accept the updated terms.`,
  },
  {
    h: "13. Governing law",
    body: `These terms are governed by the law of England and Wales, and the courts of England and Wales have jurisdiction over any dispute, unless the law of another UK nation applies to you and cannot be excluded.`,
  },
  {
    h: "14. Contact",
    body: `Questions about these terms: ${CONTACT}.`,
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
              <p className="lede">Last updated: {LAST_UPDATED}</p>
            </div>
          </div>
        </section>

        <section style={{ paddingBottom: "clamp(4rem, 8vw, 7rem)" }}>
          <div className="wrap">
            <div style={{ maxWidth: "42rem" }}>
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
                  {(Array.isArray(s.body) ? s.body : s.body ? [s.body] : []).map(
                    (p, i) => (
                      <p
                        key={i}
                        style={{
                          lineHeight: 1.7,
                          color: "var(--ink-2, inherit)",
                          marginBottom: "0.75rem",
                        }}
                      >
                        {p}
                      </p>
                    ),
                  )}
                  {s.bullets && (
                    <ul
                      style={{
                        lineHeight: 1.7,
                        color: "var(--ink-2, inherit)",
                        paddingLeft: "1.25rem",
                        margin: 0,
                      }}
                    >
                      {s.bullets.map((b, i) => (
                        <li key={i} style={{ marginBottom: "0.35rem" }}>
                          {b}
                        </li>
                      ))}
                    </ul>
                  )}
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
