# Rota page redesign — build plan

> **STATUS (2026-08-24): all seven batches B1–B7 BUILT, uncommitted.** Frontend
> only — no backend/migration. Typecheck + lint + `next build` clean; verified
> live at 375px via the throwaway `.cp-manager` preview-route (fetch-monkeypatch),
> now deleted. Not committed, not pushed. See the top Learnings entry in
> `CLAUDE.md` for the as-built detail and the two deliberate scope calls.

Grounded in Dan's operator review + Mark's `ROTA_REDESIGN_MOCKUPS.html`. This is
the plan the manager approved concept-first; **now built**. The
whole-week *mobile* concepts (`ROTA_WEEK_MOBILE_CONCEPTS.html`) were **rejected** —
the only whole-week view is the existing staff×day grid, kept as a **desktop
secondary**; there is no mobile whole-week surface.

## Principles (the spine of every batch)
1. **Coverage first.** One honest line answers "does my week hang together" before anything else.
2. **Day-view is the default** (mobile especially); the week grid is a desktop "see it all" secondary, never an equal toggle.
3. **Three volumes:** loud = uncovered / U18-legal (top, red) · amber = under-staffed / info (in the summary) · quiet = leave / status / all-covered.
4. **Glance vs tap:** first name + U18 flag + real per-day time on the face; colleagues / hours / actions on tap. No hours totals on the grid.
5. **Status vocabulary is load-bearing** and untouched: Draft (accent) → Provisional (amber, clock, "may still change") → Confirmed (green, tick). Never a final green "Published".

## Current state (what ships today)
`app/(manager)/rota/page.tsx` stacks, top→bottom: title + Auto-fill/Copy → week switcher → status/conflicts row → "N unfilled" banner → publish-result banner → **uncovered card** → **under-staffed card** → **U18 warnings card** → notes card → **ClaimsPanel** → **SwapsPanel** → **AvailabilityPanel** → equal-weight Review/Matrix toggle → grid → sticky publish bar. Up to nine stacked blocks before the rota. The two grid views already exist and are good raw material: `components/manager/rota-review.tsx` (day-first — becomes primary) and `components/manager/rota-matrix.tsx` (staff×day — becomes the desktop secondary). `rota-day-view.tsx` appears legacy (not rendered) — **confirm with John before touching**.

Data already available (no backend change needed for most of this):
- `RotaSummary` carries coverage, `leave`, and per-shift/day counts (`uncoveredByShift`, `underCoveredByShift`, `gapsTotal` are computed in the page today — they just render as three cards).
- Assignments already carry the **real per-day** `start_time`/`end_time` (Batch 4 of the shift model) — read `assignment.start_time ?? shift.start_time`.
- Claims / swaps / drops come from `getClaims` / `getSwaps` + the drop pool already on the page.

## Sequenced batches (each independently shippable + verifiable)

### B1 — Coverage summary line (highest impact, lowest risk)
Collapse the uncovered card + under-staffed card + sticky-bar tally into **one** component at the very top: red "N gaps: Fri eve, Sat eve, Sun day" / green "All covered", tap to expand a per-slot breakdown (red = uncovered, amber = short). New `components/manager/coverage-summary.tsx` fed by the summary the page already computes. Remove the three separate cards. *Verify:* the same gap counts as today, one surface; quiet green state on a covered week.

### B2 — Approvals action-row
A count-badged row **above the grid** listing pending claims / swaps / drops, each with inline **Approve / ✕** for the safe like-for-like case; rule-flagged ones route to the unified modal (B7). Pull `ClaimsPanel`/`SwapsPanel` content up; keep their existing approve/reject calls. *Verify:* a pending claim resolves in one tap; a rule-breaking one opens the modal.

### B3 — Day-view default, matrix demoted
Make `rota-review.tsx` the primary surface. Replace the equal-weight Review/Matrix toggle with a secondary **"See the whole week"** link that opens the matrix (desktop framing / full-width). Keep the day-strip (today/tonight) as the primary navigation. *Verify:* mobile lands on the day-view; the grid is one tap away and clearly secondary.

### B4 — Three volumes + the U18 legal block
Re-rank by severity, not one flat wall: uncovered = red at top; under-staffed = amber, folded into the summary + a "needs N more" chip in the day card; leave = quiet dashed row at the bottom; status = one calm pill. **U18 legal blocks get their own distinct treatment** — lock icon, red left-rule, a "Legal" tag, "the law blocked this — you can't override it" copy — visually separate from a soft amber "couldn't fit". (Solver already distinguishes a hard U18 block from a soft miss.) *Verify:* a U18-blocked evening reads as law, not preference; a covered week shows no red at all.

### B5 — Demote to "More"
Move availability panel, solver notes, export (PDF/Excel/image), orientation toggle, and Auto-fill/Copy (on an already-built week) behind a quiet **More ⋯** sheet. Keep Auto-fill/Copy prominent only on an *empty* week (the code already hides Copy when assignments exist — extend to Auto-fill). *Verify:* a built week shows just coverage → approvals → day-view → publish; the tools are one tap away.

### B6 — Per-assignment glance/tap
Chips: first name + U18 flag + **real per-day time** (`assignment.start_time ?? shift.start_time` — a Fri 1am close must show, not the 11pm representative); role by shift colour on mobile. On tap: colleagues / who-else-is-on, exact hours + weekly running total, remove / swap / post-as-open. No hours totals on the face. *Verify:* a divergent-hours shift shows the true time on the chip.

### B7 — Unify the three risk modals
The add / claim / swap risk modals (`rota/page.tsx` ~978–1068) become **one** component; the title **names the rule that fired** (rest-gap / day-off-in-7 / max-hours) instead of the generic "breaks a rest rule". Backend already knows which rule triggered (`check_manual_assignment` severity/reason). *Verify:* each of the three reasons shows its own title + tag.

## Backend / data notes
- Mostly **frontend-only** — the summary, claims, swaps, per-day assignment times, and U18 block signal already exist.
- One likely small backend touch: `check_manual_assignment` should return **which** rule fired (a `reason` enum) so B7's title can name it — confirm whether it already does before adding.
- Keep the `_build_summary` coverage source as-is; B1 only re-renders what it already returns.

## Risks & sequencing
- **Ship B1 first** — it's the biggest felt win and de-risks the rest (once coverage is one line, the three cards come out cleanly).
- B2 touches approve/reject write paths — regression-test claim/swap/drop end-to-end (these are the load-bearing staff-facing flows).
- B3 changes the default surface — keep the matrix reachable at all times so nothing is lost.
- Confirm `rota-day-view.tsx` is dead before deleting (John).
- The manager app is OTP-gated in this environment; each batch verifies via typecheck/lint/build + the throwaway `.cp-manager` preview-route trick (fetch-monkeypatch, per CLAUDE.md), then a real manager session on deploy.

## Out of scope (explicitly)
- No mobile whole-week overview (concepts rejected).
- No new solver/role-per-shift work — grouping stays by the staff `role` string (matches current data).
- No change to the status state machine or the publish/confirm flow.
