import type { Metadata } from "next";

import { SiteFooter, SiteNav } from "../site-chrome";

export const metadata: Metadata = {
  title: "Privacy Policy — Rotally",
  description: "How Rotally collects, uses, and protects personal data.",
};

const LAST_UPDATED = "10 September 2026";

const OPERATOR = "Pycroft Solutions (Oluwaseun Akinshilo), Friars Croft, Pine Walk Road, Chilworth, Southampton SO16 7HN, United Kingdom";
const CONTACT = "privacy@rotally.co.uk";

type Section = { h: string; body?: string | string[]; bullets?: string[] };

const SECTIONS: Section[] = [
  {
    h: "1. Who this policy is from",
    body: [
      `This policy explains how Rotally, operated by ${OPERATOR} ("we", "us", "Rotally"), handles personal data. Rotally is a rota-scheduling service for small independent pubs and restaurants in the United Kingdom.`,
      "Two roles matter here. For the personal data of staff that a venue adds, the venue (the business) is the data controller and Rotally is the processor, acting on the venue's instructions. For the manager's own account details and any billing data, Rotally is the controller. If you are a staff member with a question about your data, contact your venue first, as they control it.",
    ],
  },
  {
    h: "2. What we collect",
    body: "We keep the data that a rota service needs and no more:",
    bullets: [
      "Manager account: email address (used to sign in via a one-time code) and basic venue details you enter, such as the venue name, opening hours, roles, and shifts.",
      "Staff: name, contact email, a 4-digit PIN for signing in, whether the person is under 18, and their availability, assigned shifts, and leave requests.",
      "Usage: an activity log of key actions in your venue (for example, a shift being published or a swap approved), and standard technical data such as IP address and request logs kept by our hosting providers to run and secure the service.",
    ],
  },
  {
    h: "3. What we do not collect",
    body: `We do not collect payment card details directly — if paid plans are introduced, card data is handled by our payment processor and never touches our servers. We do not use advertising or third-party tracking cookies, and we do not build marketing profiles. The service stores small amounts of data in your browser (for example, your theme choice and a remembered venue on a shared device) to make it work; this stays on your device.`,
  },
  {
    h: "4. Why we use it (lawful basis)",
    body: "We rely on the following lawful bases under UK GDPR:",
    bullets: [
      "Contract — to provide the service to the venue: creating rotas, collecting availability, sending reminders and published rotas.",
      "Legitimate interests — to keep the service secure, prevent abuse, maintain an activity log, and improve how it works, balanced against your rights.",
      "Legal obligation — recording whether a staff member is under 18 so the rota can respect UK working-time rules for young workers.",
      "Consent — where we ever ask for it specifically; you can withdraw it at any time.",
    ],
  },
  {
    h: "5. Under-18 data",
    body: `We record only whether a staff member is under 18 — a simple yes/no — and we use it for one purpose: to apply UK working-time limits for young workers when a rota is generated, so they are not scheduled outside their permitted hours. We do not collect dates of birth or other special-category data for this. The venue is responsible for confirming this status accurately and for having the right to record it.`,
  },
  {
    h: "6. How long we keep it",
    body: `We keep personal data while a venue is active and using the service. If a staff member is removed, their personal data is deactivated and no longer used to build rotas; if a venue is closed, we delete or anonymise its personal data within a reasonable period, except where we must keep limited records to meet a legal obligation or to resolve a dispute. Activity-log entries are kept as a historical record of what happened in the venue.`,
  },
  {
    h: "7. Who we share it with",
    body: [
      "We do not sell personal data. We share it only with service providers (sub-processors) that help us run Rotally, each processing data solely for their part of the service and under a contract with us:",
    ],
    bullets: [
      "Supabase — database and manager sign-in.",
      "Render — backend hosting.",
      "Vercel — frontend hosting.",
      "Resend — sending transactional emails (sign-in codes, availability reminders, published rotas).",
      "Stripe — payment processing, if and when paid plans apply.",
    ],
  },
  {
    h: "8. Where data is processed",
    body: `We aim to have data processed in the UK or the European Economic Area. Some of our providers may process data outside the UK. Where they do, we rely on the safeguards required by UK data protection law — such as UK adequacy regulations or the International Data Transfer Agreement (or equivalent clauses) — so your data keeps a similar level of protection.`,
  },
  {
    h: "9. Your rights",
    body: [
      "You have the right to access your personal data, to have it corrected or erased, to restrict or object to how it is used, and to data portability, subject to the limits in the law.",
      "Because a venue is the controller of its staff's data, staff should make requests to their venue in the first instance, and we will help the venue respond. For account and billing data that we control, contact us directly using the details below.",
    ],
  },
  {
    h: "10. Security",
    body: `We take reasonable measures to protect personal data: it is encrypted in transit, access is restricted, and each venue's data is kept separated from every other venue's so one business cannot see another's. PIN sign-in is rate-limited to resist guessing. No system is perfectly secure, but we work to reduce risk and to respond quickly if something goes wrong.`,
  },
  {
    h: "11. Changes to this policy",
    body: `We may update this policy as the service develops. When we make a material change we will update the date at the top, and where appropriate we will let you know. Please check back from time to time.`,
  },
  {
    h: "12. Contact and complaints",
    body: `Privacy questions or requests: ${CONTACT}. If you are in the UK and are not satisfied with how we have handled your data, you can complain to the Information Commissioner's Office (ICO) at ico.org.uk, though we would appreciate the chance to put things right first.`,
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
