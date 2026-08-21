# CrewPlan staff PWA — life, information & interaction review

Reviewed by Designer Mark. Focus: (1) information presentation, (2) icons / navigation / buttons, and — the priority — (3) bringing the app to life. Reference philosophy: Apple HIG motion & materials (feedback within ~100ms, motion expresses cause-and-effect and spatial continuity, spring-like and interruptible, deference to content, reduced-motion parity), translated for web and kept strictly inside CrewPlan's dark, flat, minimal language. Paired with ui-ux-pro-max animation guidance.

**Companion mockups:** `STAFF_LIFE_MOCKUPS.html` — before/after pairs, with the motion recommendations rendered as **live CSS demos you can trigger in the browser** (press/tap/replay), not descriptions.

**Method & limits.** Static read of source + the existing motion system. The `apple-design` skill is not present in this environment, so Apple guidance here is applied from HIG principle, not a skill lookup. I could not run the app or observe rendered motion; timings/easings below reuse the tokens already defined in `globals.css` (`--ease-out`, `--ease-in-out`, `--ease-drawer`, `--ease-pop`). Per the coordinator, the 5 P0/P1 fixes from `STAFF_DESIGN_REVIEW.md` are being implemented separately and are **not** re-litigated here — this builds on top.

---

## 1. Overall assessment

CrewPlan's staff app has an unusually good *motion foundation already sitting mostly idle*. `lib/use-presence.ts` is a proper presence engine (double-rAF entry, backgrounded-tab fallback, exit kept mounted), the four easing tokens are well-chosen and semantically named, and the overlay/sheet/toast choreography is genuinely refined. The problem is that **almost all of this life is spent on overlays**, while the surfaces users touch a hundred times a week — the hub tiles, the shift rows, the availability grid, the primary buttons, and every screen-to-screen navigation — are static: they appear instantly, respond to press with little or nothing, and swap without spatial continuity.

So the single biggest opportunity is not *more* motion — it's **moving the existing motion vocabulary onto the daily-touch surfaces**, and adding the two or three "earned" beats the language explicitly permits (submit availability, claim a shift) that are currently silent. Done right this makes the app feel tactile and alive while staying inside "subtle only, nothing decorative."

Three headline themes:

- **The app opens dead.** Every screen's content teleports in after the fetch resolves (`loading ? <CenteredMessage>Loading…</CenteredMessage> : <content>`). There is no entrance — no settle, no stagger — on the very first thing a user sees each session. This is the highest-leverage "bring it to life" win.
- **Touch has no physicality.** Hub tiles animate on `hover` (desktop-only) but give a touch user almost nothing on press; the primary CTAs (`Submit availability`, `Request time off`, `Claim this shift`) have only `transition-opacity`. Apple's first rule of tactility — visible feedback within 100ms of touch — is mostly unmet on the surfaces that matter.
- **The key moments don't land.** Submitting availability just `router.push`es to `/submitted`; claiming/dropping/giving/swapping fire a text toast. These are the emotional peaks of the product and they pass without a beat. The delight primitives (`cp-pop-in`, `cp-pop-pop`, `--ease-pop`) already exist and are used on onboarding/first-run — they should also mark these recurring wins, once.

Information presentation and the icon/button system are in good shape; the notes below are targeted refinements, not rebuilds.

---

## 2. Focus area 1 — information presentation

Generally strong: clear per-screen hierarchy, honest badges, good empty states. Refinements, prioritised by daily value:

- **Hub buries the single most useful fact: your next shift.** The hub (`hub/page.tsx:369–414`) leads with the availability tile and reduces "My shifts" to a `3 shifts` badge (`hub/page.tsx:379`). The one thing a staffer opens the app to check — *when am I next in?* — is not surfaced anywhere on the home screen; they must tap through to My shifts. Recommendation: add a slim **"Next: Thu 28 · Evening 5pm–close"** glance line directly under the venue strip (one line, `font-medium` time + muted meta), above the tile grid. This is the highest-value information change on the app. (Mockup pair 1.)
- **The availability primary tile competes with the hub greeting for "most prominent".** Both the `Hi, {name}` hero and the accent-filled `PrimaryHubTile` are top-weight. Once a next-shift glance exists, the availability tile can stay primary but the hierarchy reads: greeting → next shift → what needs doing (availability) → the rest. Currently it's greeting → (nothing) → availability.
- **My shifts "Day off" rows carry the same visual weight as worked days.** On the timeline (`rota/page.tsx:236–239`) an off day is a full-height row with a bordered node. Consider dimming the node (not just the text) so the eye tracks the worked days down the column faster — scannability. Low priority; the accent tint on active nodes already helps.
- **Hours "Shift breakdown" renders all 7 days including 4–5 "Day off — —" rows** (`hours/page.tsx:226–241`). For a part-timer working 2 days that's 5 empty rows dominating the list. Consider collapsing consecutive days off into a single muted "Mon–Wed · off" row, or listing only worked days with a footer count. Improves signal-to-noise on the screen that's mostly noise for the part-timers who are the majority here.
- **Drop/give/swap page stacks four sections vertically** (your shifts → actions → pending swaps → open shifts, `drop/page.tsx:286–474`). The information *order* is right (act on your own first), but the "Open shifts" claim pool at the bottom is easy to miss below the fold. A count on the section label ("Open shifts · 2") would surface it. Minor.
- **Leave allowance strip is exemplary** — three `MetricCard`s with the accent on "remaining" is the right emphasis. No change.
- **Positive across the board:** honest `+`/minimum handling of unmeasurable shifts, and consequence-first copy. Keep.

---

## 3. Focus area 2 — icons, navigation, buttons

### Icons
- **The inline-SVG set is disciplined and correct** (`components/staff/icon.tsx`) — single Tabler-style family, consistent 1.5–2px stroke, no icon-font request. This is a real strength; keep it as the single source.
- **Consistency gap already logged** (the literal "✕" note-remove glyph, `availability/page.tsx:519`) is in the P1 batch being implemented — skipping.
- **Icons are almost all decorative-beside-text or correctly labelled.** Good. One note: several meaningful standalone icons (the venue-strip status dot, the timeline chevrons) rely on colour/position; fine as-is.

### Navigation
- **Hub-and-spoke + consistent `BackButton` is the right model** for this app and is applied uniformly (`back-button.tsx`, every spoke's `StaffTopBar`). No bottom nav is the correct call for 6 destinations reached from one hub.
- **The gap is spatial continuity (Apple `continuity` / `navigation-direction`).** Every hub→spoke and spoke→hub transition is an instant document-less swap with no directional motion, so the app has no sense of "going deeper" and "coming back". Forward should ease in from the right/depth, back should ease out to the right — a short (~220ms) `--ease-out` slide, reduced-motion → cross-fade. This is the second-highest life win after the app-open entrance. (Mockup pair 5.)
- **`BackButton` has no press feedback** (`back-button.tsx:6–16`) — colour hover only. Add an active press-scale so the most-used control on every spoke feels tactile.
- **No focus-move on route change** (`focus-on-route-change`) — minor SR nicety.

### Buttons
- **Hierarchy is mostly right but inconsistently expressed.** Primary = accent fill (`Submit availability` `availability/page.tsx:584`, `Request time off` `leave/page.tsx:216`, `Claim this shift` `drop/page.tsx:447`); secondary = hairline card; destructive = red (`Drop shift`, `drop/page.tsx:495`). Good semantics. But:
  - **Feedback is uneven.** Primary CTAs use only `transition-opacity hover:opacity-90` (`availability/page.tsx:587`) — no press response. Some buttons have `active:scale-[0.98]`, some don't. The result is that identical-looking buttons feel different under the finger.
  - **Height varies around the 44px line** (`py-2.5` ≈ 38px on `ActionBanner`/claim vs `py-[15px]` on primary) — partly a touch-target item (in the P1 batch), partly a consistency-of-feel item.
  - **Recommendation:** define one button interaction contract — every tappable primitive gets `active:scale-[0.97]` + a material response (border brighten / bg lift) within 100ms, and `transition` lists that never include layout. Encode it once (a shared class or the existing components) so press feel is uniform. (Mockup pair 6.)
- **The drop action tiles are real `<button>`s with `disabled`** (`drop/page.tsx:360–376`) — correct affordance and state. Good.

---

## 4. Focus area 3 — bringing the app to life (priority)

CrewPlan's restraint is not the enemy of life — Apple's own motion is *restrained*. The principle to hold: **every animation expresses a cause-and-effect the user initiated**, nothing loops or decorates, and materials respond instead of ornamenting. Within a flat dark palette with no shadows, "material response" means: border brightening, a half-step background lift, a brief accent-tint bloom, and spring-scale — never a shadow or gradient.

Recommendations, ordered by impact:

### L1 — Give every screen an entrance (highest impact)
Today content teleports post-fetch. Add a **staggered settle** on first paint: the header, then each card/row fading up ~8px with a 30–50ms stagger (`stagger-sequence`), 260–320ms, `--ease-out`. The onboarding wizard already has exactly this vocabulary (`obInFwd`, `globals.css:520`); port it to the staff shell so the hub, rota timeline, availability days, and lists all *arrive* instead of appearing. This alone changes the felt quality of opening the app more than anything else. Reduced-motion → plain fade, no translate. (Mockup pair 2.)

### L2 — Make touch physical everywhere (Apple: feedback < 100ms)
One press contract on every tappable surface — hub tiles, shift rows, list items, all buttons, `BackButton`, week pills, day nodes: `active:scale-[0.97]` + a material response (border→accent-tint, bg→subtle lift) that starts within 100ms and settles ~150ms with `--ease-out`. Replace the desktop-only `hover:-translate-y-0.5` on tiles (`hub-tile.tsx:19`) with press-first feedback (keep hover as a bonus for pointer devices). This is what makes the whole app feel tactile. (Mockup pairs 3 & 6.)

### L3 — Land the key moments (the "earned" beats the language allows)
- **Submit availability** (`availability/page.tsx:303–344`): currently `router.push('/submitted')` with no confirmation beat. Before navigating (or on the `/submitted` screen), play the existing `cp-pop-in` success check once — the same overshoot the onboarding solve uses. A recurring but *earned* win. (Mockup pair 4.)
- **Claim / drop / give / swap** (`drop/page.tsx`) and **accept give/swap** (`hub/page.tsx`): today a text toast only. Add a check-mark pop *inside* the toast on `status === "approved"` (reuse `cp-pop-in` on the toast icon), so "You're on this shift!" physically lands. When it goes to manager approval, keep it calm (clock, no pop) — the beat should match the outcome.
- **Discipline:** these fire once per action, never loop, and collapse to a plain fade under reduced motion (the `cp-pop-in`/`cp-pop-pop` reduced-motion fallbacks already exist, `globals.css:468–474`).

### L4 — Spring the selection states
The moments where the user commits a choice should have a tiny spring, not a linear settle:
- Availability slot tap (`availability/page.tsx:472`) already has `active:scale-[0.97]` + a 180ms colour settle — good; add a subtle `--ease-pop` on the *chosen* state's fill so committing an answer feels like it snaps into place (the onboarding `.ob-card.sel` pop, `globals.css:550`, is the exact reference).
- Drop selection tick circle (`drop/page.tsx:340`) fills on select — give the tick a `cp-pop-in` micro-pop so picking a shift feels decisive. (Mockup pair 3.)

### L5 — Motion that carries meaning, cheaply
- **Progress bar** already animates width with `--ease-out` (`progress-bar.tsx:24`) — good; this is a model of "motion conveys change." Consider a brief count/settle on the `answeredDays / 7` label so the number and bar move together.
- **The venue-strip status dot** has a static glow. Leave it — a *pulsing* dot would be exactly the decorative loop the language forbids.
- **Do NOT add:** parallax, looping shimmer, count-up on the pay figure (too playful for a money number), page-load skeletons that themselves animate elaborately. Restraint is the brand.

### Interruptibility & correctness
Every one of these must be **interruptible** (`interruptible`, `cancellable-state-transitions`) — a user tapping through fast must never be blocked by an animation, and the final state must be set explicitly, not depend on an animation-end event. `usePresence` already models this; new micro-interactions should follow it.

---

## 5. Prioritised recommendations

### P0 — the life wins (do first)
1. **Screen entrance / staggered settle** on every staff screen (L1). Port the onboarding `obInFwd` vocabulary to `StaffScreen`. *Biggest felt-quality change; reduced-motion → fade.*
2. **Universal press contract** — `active:scale-[0.97]` + material response on every tappable surface within 100ms (L2). *Makes the app tactile.*
3. **Land submit + claim** — `cp-pop-in` success beat on availability submit and on approved claim/drop/give/swap (L3). *The peaks finally register.*

### P1 — spatial & selection polish
4. **Directional route transitions** — forward slides in from right, back slides out right, ~220ms `--ease-out`, reduced-motion → crossfade (§3 nav). *Adds depth to hub-and-spoke.*
5. **Spring the commit states** — `--ease-pop` on chosen availability slot fill and a `cp-pop-in` on the drop selection tick (L4).
6. **`BackButton` press feedback** (§3) and one uniform button interaction spec (§3 buttons).

### P2 — information & refinement
7. **Next-shift glance line on the hub** (§2) — surface the most-asked question on the home screen.
8. **Collapse "Day off" noise** in Hours breakdown; add a count to "Open shifts" (§2).
9. **Progress label settle** with the bar (L5).

---

## 6. What to keep (do not regress)
- `usePresence` and the four semantic easing tokens — the whole life proposal is built on them, not a new library.
- Overlay/sheet/toast choreography and all reduced-motion fallbacks.
- The single inline-SVG icon set and the disciplined button semantics.
- Hub-and-spoke + `BackButton` navigation model.
- The restraint itself: no shadows, no gradients, no loops. Everything above is cause-and-effect motion and material response, nothing decorative.
