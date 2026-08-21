# CrewPlan staff PWA — navigation & mobile-first structure review

Reviewed by Designer Mark. Scope: whether the staff app should move from its current **hub-and-spoke + BackButton** model to a **persistent bottom tab bar** like the manager app, plus other **mobile-first structural/layout** improvements. This is a design/structure review — motion is out of scope here (see `STAFF_LIFE_REVIEW.md` for that, set aside per the user).

**Companion mockups:** `STAFF_NAV_MOCKUPS.html` — before (hub-and-spoke) vs after (bottom tab bar), rendered at ~375px mobile width across the key screens, plus a tab-bar spec.

**Method & limits.** Static read of the manager nav (`components/manager/nav.tsx`), the manager layout (`app/(manager)/layout.tsx`), the staff screens, and the staff icon set. I could not run the app. Everything here is designed mobile-first at ~375px; desktop is treated as secondary.

---

## 1. Recommendation up front

**Yes — move the staff app to a persistent bottom tab bar, matching the manager pattern.** It is the right call for a phone-first PWA whose core loop has users bouncing between *submit availability* and *check my shifts* every week, and it brings the two halves of the product into one navigation language. But it should come with a **reframing of the hub from a launcher into a glance-able home**, because once a tab bar exists the hub's grid of navigation tiles is redundant.

This does reverse a deliberate earlier decision (the staff rebuild removed the old bottom nav in favour of hub-and-spoke, per CLAUDE.md Learnings). That decision was reasonable *at the time* — but it was made when the hub was the only way to reach anything. The honest trade-off is below; on balance the tab bar wins for this product.

---

## 2. The trade-off, stated honestly

**Current hub-and-spoke (`hub/page.tsx` launcher grid + `BackButton` on every spoke):**
- *Pros:* one focused home; no permanent chrome eating vertical space; simple mental model; each spoke is a clean full-height surface.
- *Cons:* **every task is two taps** (hub → spoke), and switching *between* spokes (e.g. from Availability to My shifts) is a three-tap round-trip through the hub. There is **no persistent wayfinding** — a user deep in a spoke only knows where they are from the title, and can only go *back*, not *sideways*. It also diverges from the manager app, which already uses a bottom nav, so the product speaks two navigation languages.

**Proposed bottom tab bar (staff equivalent of `components/manager/nav.tsx:57–80`):**
- *Pros:* **one-tap** movement between the core tasks; persistent orientation (you always see where you are and what else exists); native-app familiarity that a PWA benefits from; **consistency with the manager app**; and it frees the hub to become a real home (status/glance) instead of a menu.
- *Cons:* a permanent ~56–64px band of vertical space (precious at 375px); forces choosing **≤5 destinations**, so one screen (Hours, and arguably Drop/Swap) gets demoted off the bar; and it reverses a prior decision, so the hub must be redesigned, not just wrapped.

**Verdict:** the weekly availability↔shifts switching cost and the product-consistency win outweigh the vertical-space cost. Adopt the tab bar.

---

## 3. The proposed staff tab bar

### Tab set — 5 tabs (the `bottom-nav-limit ≤5` ceiling)

| # | Tab label | Route | Icon (from `components/staff/icon.tsx`) | Why it's top-level |
|---|-----------|-------|------------------------------------------|--------------------|
| 1 | **Home** | `/v/[t]/hub` | `home` *(new — see note)* | Glance dashboard: next shift, pending give/swap, status |
| 2 | **Shifts** | `/v/[t]/rota` | `calendar-week` | The most-checked screen: my published rota |
| 3 | **Availability** | `/v/[t]/availability` | `calendar-plus` | The core weekly loop — the reason the app exists |
| 4 | **Swap** | `/v/[t]/drop` | `arrows-exchange` | Time-sensitive task ("I can't make a shift") |
| 5 | **Time off** | `/v/[t]/leave` | `beach` | A distinct destination staff seek out |

**What happens to Hours (`/hours`)?** Demote it off the bar — it's passive, glance-only information, not a task. Surface it two ways instead: (a) a card on the Home tab ("This week · 28+ hrs · £320+"), and (b) a link/segment from the **Shifts** screen (Hours and Shifts describe the same week). This keeps 5 clean tabs and puts Hours exactly where the question arises.

**Icon gap to flag:** the staff icon set (`components/staff/icon.tsx:6–26`) has **no `home` glyph**. The manager set already defines one (`components/manager/icon.tsx:213–217`) — port those three SVG paths into the staff `IconName`/`PATHS`. Every other tab icon already exists in the staff set (`calendar-week`, `calendar-plus`, `arrows-exchange`, `beach`). *(One P1-batch item touches this file already, so it's a natural place to add `home`.)*

**Label length:** "Availability" is the longest label; at 375px / 5 tabs ≈ 75px per column, 10px text fits on one line (the manager bar carries "Dashboard"/"Scheduler" at the same size). Keep it single-line, `white-space: nowrap`; if it ever crowds, the icon carries recognition and the label can drop to 9px — do **not** wrap it.

### States (match the manager treatment exactly for consistency)
- **Active:** `text-accent` (#FF4D00), icon `strokeWidth={2}`, plus `aria-current="page"`.
- **Inactive:** icon + label in a muted tone, `strokeWidth={1.75}`. The manager bar uses `text-ink-faint`; on the staff palette `--c-ink-faint` (#4a4a47) is failing-contrast (and is being raised in the P0 batch) — use **`text-ink-muted`** for inactive staff tabs so they stay legible, not the faint token.
- **No background pill** on the bar (unlike the manager top-bar tabs) — colour + stroke weight only, keeping it flat and quiet per the design language.
- Structure: `fixed inset-x-0 bottom-0`, `border-t border-hairline`, `bg-surface-page`, `z-30`, `max-w-[440px]` centred (the staff column width), five equal `flex-1` columns, `py-2`, icon 22px + 10px label — a direct staff analogue of `nav.tsx:58–80`.

### Safe area & content clearance
- The bar itself pads for the home indicator: `paddingBottom: env(safe-area-inset-bottom)` (same as `nav.tsx:60`).
- Every screen must reserve clearance so the last row/CTA isn't hidden behind the bar. Replace `StaffScreen`'s current `pb-[env(safe-area-inset-bottom,26px)]` (`components/staff/screen.tsx:9`) with `pb-[calc(64px+env(safe-area-inset-bottom))]` — the staff mirror of the manager pages' `pb-24 md:pb-8`.

### Where the bar lives (implementation shape)
The manager bar is hosted in a **route-group layout** (`app/(manager)/layout.tsx:66`) so it's shared across all authed pages. The staff pages have **no shared layout** and the `[venue_token]` root also holds the **unauthenticated entry/PIN/join screen** (`page.tsx`) — which must **not** show the tab bar. So render the bar **inside `StaffScreen`** (which the entry page deliberately doesn't use), or add a layout only over the authed sub-routes. Either way, the entry/PIN/join/reveal flow stays nav-free — correct, since there's no session yet.

---

## 4. Chrome changes the tab bar drives

- **BackButton largely goes away** (`components/staff/back-button.tsx`). With a persistent bar providing wayfinding and sideways movement, the per-spoke `‹ Back` in `StaffTopBar` is redundant on tab destinations. Keep the top bar's **title + ModeToggle**, drop the back slot.
  - *One exception:* the **Swap** screen is deep-linked from a shift tap (`/drop?assignment=…`, `rota/page.tsx:243`). Arriving that way, a contextual "‹ My shifts" link is still worth keeping so the deep-link has an obvious return — but it's contextual, not the default chrome.
- **The hub stops being a launcher and becomes a home** (biggest structural change). Today the hub is a 2×2 grid of navigation tiles (`hub/page.tsx:369–414`) — those tiles *are* the navigation, which the tab bar now owns. Re-cast Home as a **glance dashboard**: (1) next shift, (2) any pending give/swap action banners (already there, `hub/page.tsx:349–367` — keep, these are actionable), (3) availability status for the open week, (4) this-week hours + pay. Actionable summaries, not menu tiles. The nav navigates; Home informs. *(This also finally surfaces "when am I next in?", which the launcher hub buries — see `STAFF_DESIGN_REVIEW`/`STAFF_LIFE_REVIEW` §2.)*
- **Modals/sub-flows are unaffected** — request-time-off, the note editor, confirm dialogs are overlays and sit above the bar.

---

## 5. Other mobile-first structural improvements (design/layout only)

Prioritised, thumb-first, at 375px:

1. **P0 — Sticky primary CTA on Availability.** The "Submit availability" button sits at the very bottom of a long scroll (7 day cards + bulk action + notes + auto-submit toggle, `availability/page.tsx:583–595`). On a phone the user fills the grid at the top, then must scroll past everything to submit — and the submit target competes with the auto-submit toggle right beside it. Pin the submit action to a **sticky bottom bar** (above the tab bar, with its own hairline top), so the primary action is always thumb-reachable. The progress "X of 7 days" belongs in that same sticky bar so completion and submit read together. *(This is the single biggest ergonomics win after the nav itself.)*
2. **P1 — Home as glance, not menu** (covered in §4) — the structural payoff of the nav move.
3. **P1 — Collapse "Day off" noise in Hours.** The breakdown renders all 7 days including 4–5 "Day off — —" rows (`hours/page.tsx:226–241`); for the part-timers who are most of the roster that's a list dominated by blanks. Show worked days, collapse runs of days off into one muted "Mon–Wed · off" row. Improves scannability on a small screen.
4. **P1 — Compact the Availability day rows.** Seven full cards (day header + "All day" + shift buttons, `availability/page.tsx:427–487`) make a long scroll. Consider a tighter row per day (day label left, shift chips right on one line) so the whole week is closer to one screen — less scrolling to see and edit the week. Medium effort; high daily value.
5. **P2 — Persistent compact title on scroll.** With a bottom bar owning navigation, a slim sticky top title (screen name only) keeps context when the content scrolls under it. Optional; the tab bar already anchors orientation.
6. **P2 — Keep ModeToggle but reconsider its prime real estate.** It occupies top-right on every screen (`StaffTopBar` right slot) — a once-a-session control in the most reachable-for-glance corner. With a Home tab it could live on Home (or a small settings affordance) and free the top-right elsewhere. Low priority.
7. **Deep-linking preserved** — each tab is already a real route, so notification/share deep links keep working; the bar just adds a persistent way back to the top level (`deep-linking`, `back-stack-integrity`).

---

## 6. Prioritised summary

**P0**
1. Adopt the **5-tab bottom bar** (Home · Shifts · Availability · Swap · Time off), staff analogue of `nav.tsx:57–80`; add the `home` glyph to the staff icon set; demote Hours to Home + Shifts.
2. **Sticky submit CTA** on Availability (with progress), thumb-reachable.

**P1**
3. **Reframe the hub as a glance home** (next shift / pending actions / availability status / hours), not a launcher grid.
4. Remove `BackButton` from tab destinations; keep a contextual return only on the deep-linked Swap entry.
5. **Collapse Hours day-off rows**; **compact Availability day rows**.
6. Inactive-tab colour = `ink-muted` (not the failing `ink-faint`); active = accent + heavier stroke, `aria-current`.

**P2**
7. Optional sticky compact title on scroll; reconsider ModeToggle placement.

---

## 7. What to keep
- The manager nav pattern as the template — build the staff bar to match (icons + label, accent active, safe-area padding, centred max-width) so the product reads as one app.
- The pending give/swap **action banners** on Home (`hub/page.tsx:349–367`) — they're actionable status, exactly what a glance home should carry.
- The entry/PIN/join/reveal flow staying **nav-free** (no session yet).
- Deep links into Swap from a shift tap.
- The dark, flat, hairline-bordered language — the bar is flat, bordered-top, colour-only active state; no shadow, no pill, no gradient.
