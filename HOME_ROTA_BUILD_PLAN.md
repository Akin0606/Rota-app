# Home + Rota — build plan (Rotally brand)

> **PLAN ONLY — not built.** Grounds the approved v2 mockups
> (`ROTA_FLOW_MOCKUPS.html`, `HOME_MOCKUPS.html`) + Dan's
> `ROTA_DASHBOARD_REDESIGN_BRIEF.md` into a sequenced, verifiable build. Both
> screens are planned together because they share a brand-reconciliation
> prerequisite and several primitives.

## Grounding facts (checked against the tree, not assumed)
- **Branch:** build on `staging`. It is the unified working branch — it already
  contains the **Rotally rebrand**, the shipped **rota v1 redesign** (B1–B7:
  coverage line, day-view, matrix, More sheet, risk modal), and the **`Waiting`
  wheel-spinner** ("the wheel does every wait"). `main ⊆ staging`; tree clean.
- **Brand = Rotally.** The mockups were drawn in the *old* crewplan palette
  (`#FF4D00`, `crewplan.` wordmark). They are **design references, not literal
  colours** — the build uses `globals.css` semantic tokens.
  > ⚠️ **Corrected 2026-08-31 (John's review).** This bullet used to say the
  > accent is `#ff6b00` dark / `#b04d0b` light. **Those are `--c-mark`, the
  > wordmark orange.** `--c-accent` is **neutral** — `#f4f4f2` dark / `#0c0c0d`
  > light — with `--c-accent-on` (`#0c0c0d` / `#ffffff`) as its foreground.
  > Building to the old text would have made every new Home/Rota CTA orange and
  > re-created the AA failure the rebrand fixed. `APP_BUILD_PLAN.md`'s "latest
  > design look" block is the single source of truth for colour.

  Rule that holds everywhere: `bg-accent` always pairs with `text-accent-on`;
  orange appears only inside `<Mark>`. Coverage keeps its own colours — green
  `#2ecc71`, amber `#e5c100`, red `#e5484d`; `text-white` on those is correct.
  Archivo is `--font-mark`. Most redesign components already use
  CSS-variable-backed Tailwind tokens, so they inherit Rotally for free.
- **This builds ON rota v1** — the coverage-first day-view stays as the *body*
  of the draft/published rota. This work is the **controls + entry layer** and
  the new **Home**.
- **Data that already exists:** `listPeriods` (all past periods), `getRota`
  (any period's summary incl. `uncovered`/`under_covered`/`leave`),
  `listStaff(periodId)` (`.submitted` per member), `remindStaff` (email),
  `venue.created_at`, `Period.week_start`. **No new backend needed for most of
  it.** The one genuine gap is the pre-solve over-hours warning (see Decisions).

---

## Phase 0 — Brand reconciliation (do FIRST; unblocks both screens on-brand)
Small, mechanical, low-risk — but everything after it should be authored on the
Rotally tokens, so clear the pre-rebrand debt first.
- Migrate the redesign's remaining **`bg-accent text-white` → `text-accent-on`**
  (~3 spots across `approvals-row`, `rota/page.tsx`; the rebrand already did this
  app-wide — these were authored just before it and missed the sweep). White on
  the light-theme accent measured **3.3:1 = under AA** pre-rebrand; `accent-on`
  is the fix.
- Reconcile hardcoded hex: `rota-risk-modal` amber button `text-[#1a1815]` →
  `text-accent-on`; keep the swap-kind blue (brand-neutral) or tokenise it.
- Confirm the new Home/Rota surfaces use the **brand wheel** (`Waiting` / a
  spinning `Mark`) for every busy/loading state — no generic spinners.
- *Verify:* typecheck + lint + `next build`; measure accent-button contrast in
  both themes (must clear AA — the rebrand's own bar).

---

## Rota screen — batches

### R1 — Week scrubber (replaces the three pills)
Replace `WEEK_OPTIONS` (This/Next/In 2 weeks) with one bounded, snapping
week-strip. New `components/manager/week-scrubber.tsx`.
- **Range:** venue's first period (earliest `listPeriods` week; `venue.created_at`
  only as the fallback when there are no periods at all) → **+4 weeks**.
  > ⚠️ **Corrected 2026-08-31.** The plan said +2, on Dan's belief that "the
  > backend only lets you build this week, next week, or +2". It doesn't — that
  > was the *frontend's* three pills. `create_period`
  > (`backend/routers/periods.py:42`) accepts `this_monday .. this_monday+4w`
  > and rejects anything earlier with a 400. The strip matches the backend
  > exactly rather than inventing a stricter frontend rule that would drift.
  > No soft history cap either: `listPeriods` returns every period in one small
  > call, and pilot venues are weeks old.

  Hard-stop both ends (no invented history, no dead future). Short-history
  venues fill the row instead of scrolling.
- **Two distinct signals** (per founder): the week you're **viewing** gets the
  accent highlight/ring; the **actual current week** carries a persistent "now"
  marker that never moves. No "This week" reset button.
- **State dot per week:** filled = published/confirmed · half = draft/generated ·
  hollow = nothing yet. Derive from each week's period status (map `listPeriods`
  by `week_start`).
- **Past weeks are read-only** (view the historical rota); only current/+1/+2 are
  buildable (see Decision 4). Selecting a past week loads its `getRota`.
- *Verify:* scrub renders correct dots; viewing-vs-now split shows when scrubbed
  ahead; past week loads read-only; no horizontal overflow at 375px.

### R2 — Generate-gated entry (state machine)
The rota body no longer shows unconditionally. Gate on state (discriminators
`hasAssignments`, `isLive` already computed):
- **(i) fresh** (`!hasAssignments`): the **pre-gen front door** (R3), not an
  empty grid. `Auto-fill`/`Copy last week` stop floating in the header and become
  the two fill actions *inside* the front door; the hero is one word — "Generate
  rota".
- **(ii) draft** (has assignments, not live): show the v1 coverage-first
  day-view immediately — **no gate**. "Generate" demotes to "Regenerate" inside
  the existing More sheet (never re-nag a built week).
- **(iii) published/confirmed** (`isLive`): read-first — Share/Export primary,
  Generate buried behind a "replace the published rota" confirm.
- *Verify:* each state renders its intended entry; a built/published week is
  never re-gated; Regenerate reachable from More.

### R3 — Pre-generation readiness state (the highest-value new screen)
Shown in the fresh state before generating. Priority order:
1. **Readiness line** — "5 of 7 in for w/c 25 Aug".
2. **Non-submitters by name** with an inline **Remind** (per person) — from
   `listStaff(periodId).submitted`; `remindStaff({staffId})`.
3. **Over-hours risk**, worded as a **conditional risk, not a fact** (the solver
   hasn't run): "if they don't send availability, Jamie & Maya may cover long
   weeks." Fire **only** when ≥2 missing *and* coverage is thin (see Decision 1).
4. Actions: **"Remind everyone"** primary (`remindStaff({periodId})`, email) +
   **"Generate with who I've got"** secondary — nobody is forced to wait.
   An "everyone's in" collapsed variant when `submitted == total`.
- Reminder sheet is **email-only** (SMS deferred post-pilot); keep the honest
  Resend-sandbox caveat.
- *Verify:* non-submitters named correctly; remind fires (toast); over-hours line
  respects its gate; "generate with who I've got" proceeds.

### R4 — Generate animation (retime + rebrand)
Reuse/replace `GenerateOverlay`. Spec (reviewed against the `animate` skill):
- **~4s** total (was ~10). Explanation-tier, so >300ms is legitimate here.
- **CSS animation, transform/opacity only, off the main thread** so it stays
  smooth while the real solve request is in flight (no rAF timing).
- Progress rail fills `scaleX(0→1)` `transform-origin:left` **linear** ~3.6s;
  four step rows check in ~0.9s apart (`opacity` + `translateY(6px→0)`,
  `cubic-bezier(0.23,1,0.32,1)`), each landing a tick. Reveal < 300ms ease-out.
- **The spinner element is the brand wheel** (`Mark spinning`), per "the wheel
  does every wait" — reconcile with the stepper (Decision 3).
- Steps: "Reading everyone's availability" → "Balancing hours fairly" →
  "Checking rest gaps & under-18 rules" → "Placing the shifts."
- Ship the `prefers-reduced-motion` variant (drop rail scale + step translate;
  gentle label pulse; instant reveal).
- *Verify:* real-browser eyeball for feel (pane can't composite); reduced-motion
  path; the overlay never blocks the actual solve result.

---

## Home screen — batches

### H1 — Home shell + rename + status hero
- **Rename Dashboard → Home** (label + page title). Route decision 2.
- **Status hero** answering "is this week sorted, and if not what's blocking it?"
  — one status sentence folding in the availability count + deadline, and one
  contextual primary action. Three variants: collecting / draft-with-gaps /
  published. Derive from `period.status` + coverage (`uncovered`/`under_covered`).
- Bin the 4-stat vanity row (Total Hours / Conflicts=0 etc.).
- *Verify:* each variant's sentence + primary action is correct for the state.

### H2 — Today strip (present-first — the reframe)
- At the **very top**, above the hero: tonight's line-up from the **published**
  rota — who's on, per shift, real per-day times, U18 "off by 10" note.
- Compute today's `day_index` within the current published period; pull today's
  assignments from `getRota`. **Cover-tonight's-gap** (red) appears **only** on a
  genuine same-day hole (today's `uncovered`/`under_covered`) — same
  honesty-discipline as conflicts-when->0.
- **No clock-in/punch machinery** — Rotally has no time clock; "on tonight" is
  the roster, not a punch feed.
- Vertical priority: present (today) above planning (this-week hero), both above
  the fold on a phone. No "Today | This week" tabs.
- *Verify:* today's line-up matches the rota; gap state only on a real same-day
  hole; nothing shown when there's no published rota (fresh-venue-empty).

### H3 — Keep/rework the rest
- Keep **pending approvals** (self-registrants) and **Team Status** (the
  genuinely-used block).
- **Conflicts** surface only as a one-line red flag when `> 0`.
- **Recent Activity** demoted to the bottom.
- Desktop = the minimal widen only (founder: desktop is fine for now).
- *Verify:* pending/team/conflicts/activity render; vanity row gone; desktop
  widen doesn't add tiles.

---

## Data / backend summary
- **No new tables/migrations** for R1–R2, R4, H1–H3 — all client-side off
  existing endpoints.
- **R3 over-hours warning** is the one real computation gap (Decision 1).
- **Email-only reminders** (`remindStaff`) — **no `phone` field, no SMS** (post-
  pilot). The channel stays abstracted so SMS slots in later.
- Confirm the **`createPeriod` future cap** (this/+1/+2) before wiring the
  scrubber's "buildable" band (Decision 4).

## Open decisions (recommendations in brackets)
1. **Over-hours warning source.** (a) honest client-side heuristic —
   `missing ≥ 2` AND (submitted availability can't cover `Σ min_staff` without
   pushing someone over `max_hours`), naming the at-risk people; (b) Dan's safe
   **generic fallback** ("with 3 people still to send availability, some may end
   up on long weeks") — no names. *Recommend (b) for v1* (never fabricate a name
   we can't stand behind), upgrade to (a) if the pre-solve pressure calc proves
   clean. Needs a John check on derivability.
2. **`/dashboard` route.** Relabel to "Home" but *keep the `/dashboard` path*
   (+ optional `/home` redirect) to avoid touching the nav/deep-links/redirects,
   or fully rename. *Recommend relabel + keep path for v1.*
3. **Generate animation vs the wheel.** The mockup uses a stepper; the brand says
   "the wheel does every wait." *Recommend: the brand wheel is the spinner
   element beside the stepper copy* — the stepper explains, the wheel carries the
   wait — rather than wheel-only.
4. **Scrubber past-week depth.** Dan: a manager rarely looks back past a couple
   of months. *Recommend a soft cap (~8–12 weeks back) with the true left edge at
   the venue's first period* — confirm against `createPeriod`'s real constraints.

## Sequencing & verification
- **Phase 0 first** (on-brand foundation). Then **R1 → R2** (the entry
  restructure is the backbone) before **R3 → R4**; **H1 → H2** is the felt Home
  win, **H3** cleans up. R and H tracks are independent after Phase 0 and can
  interleave.
- Manager app is **OTP-gated** here — each batch verifies via typecheck + lint +
  `next build` + the throwaway `.cp-manager` preview-route (fetch-monkeypatch),
  then a real manager session on deploy. Animation *feel* needs a real browser.
- **One batch at a time, verified** (working rule). Reconcile CLAUDE.md's living
  sections + a Learnings entry per batch.

## Out of scope
- SMS / WhatsApp reminders (post-pilot).
- Desktop beyond the minimal widen.
- No solver / role-per-shift changes; no status/publish state-machine changes.
