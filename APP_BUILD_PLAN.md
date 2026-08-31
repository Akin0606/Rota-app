# App build plan — Rotally refresh, sectioned by audience (Staff · Manager)

> **PLAN ONLY — not built.** Covers the pending design/build work across the app,
> grounded in the *actual current* Rotally design system (verified in
> `globals.css`, not the stale CLAUDE.md "Design language" bullets). The detailed
> manager Home + Rota batch specs live in `HOME_ROTA_BUILD_PLAN.md`; this doc is
> the top-level, audience-sectioned view.

---

## The latest design look — build to THIS (not the mockups' colours)
Verified in `frontend/app/globals.css`. The Rotally rebrand changed the system
fundamentally from old-crewplan:

- **Accent is NEUTRAL, not orange.** `--c-accent` = `#f4f4f2` on dark / `#0c0c0d`
  on light; text on it = `--c-accent-on` (the inverse). **Primary buttons are
  high-contrast black/white, never orange.**
- **Orange (`--c-mark` `#ff6b00` dark / `#b04d0b` light) is the WORDMARK ONLY.**
  "Colour in the UI means coverage" — nothing else is coloured for emphasis.
- **Coverage colours are the only meaningful colour:** green `#2ecc71` covered ·
  amber `#e5c100` short · red `#e5484d` uncovered (`--cp-green/amber/red`, defined
  in both `.cp-staff` and `.cp-manager`).
- **Scopes:** `.cp-staff` (PWA), `.cp-manager` (manager app), `.cp-onboarding`,
  bare `:root` (admin + marketing). All share the neutral-accent + orange-mark
  system. Dark-first; light via `data-theme` + the pre-paint script.
- **Type:** Space Grotesk display, IBM Plex body, **Archivo wordmark**
  (`--font-mark`). Two weights only (400/500), sentence case, no ALL-CAPS beyond
  micro-labels.
- **Surfaces:** cards `#141414` dark / `#fff` light, **0.5px** hairlines
  (`.cp-hairline`), radius tokens, flat (no gradients/drop-shadows), generous
  whitespace.
- **Motion:** reuse the shared tokens `--ease-out` / `--ease-in-out` /
  `--ease-drawer` / `--ease-pop` (already in `:root`). **The spinning wheel
  (`Waiting` / `Mark`) is every wait** — no generic spinners.

> ⚠️ **The Home/Rota mockups were drawn in the OLD crewplan orange palette.**
> Translate their *intent* onto these tokens — orange CTAs become the neutral
> accent, status stays on the coverage colours. Do not reproduce their orange.
>
> ⚠️ **CLAUDE.md's "Design language" section is stale** (still says
> `#0D0D0D` / `#FF4D00` accent-everywhere). Update it to the above as part of
> Phase 0 so the doc stops misleading the next session.

---

## Phase 0 — brand currency (SHARED, do first)
Small, mechanical, unblocks everything on-brand. The rebrand swept most of the
app; this clears the residue the sweep missed.
- ✅ **DONE (commit `66ca716`)** — migrate residual `bg-accent text-white` →
  `text-accent-on`. Worse than the AA miss this bullet described: on the **dark**
  theme `--c-accent` is `#f4f4f2`, so `text-white` was white on near-white —
  invisible, including the manager top nav's active tab.
  - The real hit list was **11 sites across 10 files**, not the 10 claimed here,
    and both this doc's and `HOME_ROTA`'s lists were wrong in both directions.
    `scheduler` / `settings` / `team` had none; `theme-toggle` and the two
    **admin** files (`admin/page`, `admin/suggestions`) had hits nobody listed;
    `availability` had two; `drop`'s was split across lines so a same-line grep
    missed it.
  - `text-white` on `bg-cp-red` / `bg-unavail-text` / `bg-avail-text` is correct
    and theme-stable — deliberately untouched (10 sites).
  - Dead files deleted rather than migrated: `components/rota-day-view.tsx` (the
    last hit, zero importers) and `components/sidebar.tsx`.
- ~~Sweep leftover `crewplan-` localStorage keys~~ — **struck. There is nothing
  to sweep, and doing it would lose real data.** The hours screen's `legacyKey`
  is a deliberate one-time forward migration of a staff member's typed hourly
  rate and weekly target; deleting it wipes the pay rate of anyone who hasn't
  opened that screen since the rebrand. The remaining `crewplan` strings are
  doc-comments citing the old reference HTML filenames — accurate history.
  (Also: do **not** rename `theme-toggle`'s `rotally_theme` key — the pre-paint
  script in `app/layout.tsx` reads that exact string.)
- ✅ **DONE** — update CLAUDE.md Design language to the current system.
- *Verify:* AA contrast on primary buttons in both themes; typecheck + lint +
  `next build`.

---

## MANAGER
The bulk of the requested new work. Full batch specs + data notes in
`HOME_ROTA_BUILD_PLAN.md`; summarised here.

### M-A · Home (renamed from Dashboard)
- **H1** Home shell + rename + 3-variant status hero ("is this week sorted?").
- **H2** **Today strip** — present-first: tonight's line-up from the published
  rota, red "cover tonight's gap" only on a real same-day hole, no fake clock-in.
- **H3** keep pending-approvals + Team Status, conflicts-only-when->0, demote
  activity, bin the vanity stat row.

### M-B · Rota (controls + generate-gated entry, layered on the shipped v1)
- **R1** week scrubber (venue-first-period → +2; viewing-highlight + persistent
  "now" marker; state dots; past = read-only).
- **R2** generate-gated entry state machine (fresh front-door / draft shows grid /
  published read-first).
- **R3** pre-generation readiness screen (non-submitters by name + email Remind +
  conditional over-hours warning + "generate with who I've got").
- **R4** the ~4s generate animation — **built on the brand wheel** (`Mark
  spinning`) + stepper copy, `--ease-out`, off-main-thread CSS, reduced-motion.

### M-C · Manager consistency pass
- The manager slice of Phase 0 (the 8 files above).
- Quick consistency check of `scheduler` / `settings` / `team` against the latest
  look while they're open (spacing, weights, wheel-waits, AA) — fix drift only,
  no redesign.

**Data/backend:** almost entirely client-side off existing endpoints
(`listPeriods`, `getRota`, `listStaff.submitted`, `remindStaff`,
`venue.created_at`). The one real gap is R3's pre-solve over-hours computation.
Reminders are **email-only** (SMS deferred post-pilot; no `phone` field).

---

## STAFF
The staff PWA was fully rebuilt (6-batch UI), UX-overhauled (a11y → bottom-nav →
shared-primitive a11y → motion) and rebranded recently, so it is **largely on the
latest look already**. Pending work is currency + consistency, not a rebuild.

### S-A · Staff brand currency
- The staff slice of Phase 0: `availability` + `drop` `bg-accent text-white` →
  `text-accent-on`; the hours screen's leftover `crewplan-` key.

### S-B · Staff consistency audit → fix drift
- Confirm across all authed staff screens (hub, rota, availability, hours, leave,
  drop, submitted, entry/PIN, forgot-pin): neutral-accent honoured (no
  orange-as-action; the availability grid's green/amber/red are *coverage/state*
  colours — correct and kept), the **wheel** carries every wait, `ink-muted` /
  `ink-faint` clear AA, motion uses the shared `--ease-*` tokens, 0.5px hairlines.
- Fix only the drift found — no screen redesign.

### S-C · Staff screen redesign — DECISION, none requested
No staff *screen* redesign has been asked for, and staff was just rebuilt.
**Recommendation: keep staff to currency + consistency (S-A/S-B), no from-scratch
redesign now.** If you want a specific staff screen reworked — e.g. echoing the
new Home's present-first framing on the staff hub, or applying the coverage-first
language to the staff rota — name it and it becomes its own batch here.

---

## Sequencing
1. **Phase 0** (shared brand currency + CLAUDE.md fix) — first, unblocks on-brand.
2. **Manager M-A + M-B** — the requested new work (the felt wins: Home Today-strip,
   Rota scrubber + readiness). `HOME_ROTA_BUILD_PLAN.md` orders the batches.
3. **Staff S-A + S-B** — currency + consistency; can run in parallel with, or
   after, the manager track (independent surfaces).
- **One batch at a time, verified.** Manager + staff tracks don't share files
  after Phase 0.

## Verification & branch
- Build on **`staging`** (has the rebrand + rota v1 + the `Waiting` wheel).
- Manager is **OTP-gated**, staff is **PIN-gated** — verify each batch via
  typecheck + lint + `next build` + the throwaway preview-route trick
  (fetch-monkeypatch, in the right `.cp-manager`/`.cp-staff` scope), then a real
  session on deploy. Animation *feel* needs a real browser.
- Reconcile CLAUDE.md's living sections + one Learnings entry per batch.

## Out of scope
- SMS / WhatsApp reminders (post-pilot).
- Desktop beyond the minimal widen.
- No solver / role-per-shift / status-machine changes.
- Admin console + marketing site (already rebranded; not in this refresh).

## Open decisions (carried from `HOME_ROTA_BUILD_PLAN.md` + this doc)
1. Over-hours warning source — generic line vs named at-risk staff *(lean generic
   for v1)*.
2. `/dashboard` route — relabel + keep path vs full rename *(lean relabel)*.
3. Generate animation — brand wheel beside the stepper vs wheel-only *(lean
   wheel-beside-stepper)*.
4. Scrubber history depth cap *(lean ~8–12 wks back, true edge at first period)*.
5. **Staff scope (S-C)** — currency + consistency only, or a named staff-screen
   redesign too *(lean currency + consistency; awaiting your steer)*.
