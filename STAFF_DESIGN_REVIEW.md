# CrewPlan staff PWA — UI/UX design review

Reviewed by Designer Mark, using the `ui-ux-pro-max` design intelligence skill and CrewPlan's own design language (`CLAUDE.md`). Scope: the staff-facing app only (`frontend/app/v/[venue_token]/*` + `frontend/components/staff/*` + shared primitives).

**Companion mockups:** side-by-side before/after renders of the visual changes below are in `STAFF_DESIGN_MOCKUPS.html` (open in a browser) — covering P0·1 contrast, P0·2 entry screen, P0·3 availability states, plus P1 touch targets and the ✕→SVG swap.

**Method & limits.** This is a static read of source + tokens against WCAG 2.1 AA, the ui-ux-pro-max Quick Reference (touch, contrast, motion, forms, navigation), and CrewPlan's stated design language (dark-first `#0D0D0D`/`#FF4D00`, Space Grotesk + IBM Plex Sans, sentence case, two weights only, flat surfaces, minimal 0.5px borders, subtle motion). I could not run the app or observe rendered motion/compositing, and I could not measure real contrast on a live render — contrast figures below are computed from the hex/rgba tokens in `globals.css` and should be verified with a contrast tool on a real build. Where a finding depends on runtime behaviour I say so.

---

## 1. Overall assessment

This is a genuinely well-built staff app. The six "spoke" screens (hub, rota, availability, hours, drop, leave) share a coherent, disciplined visual language, the motion system (`lib/use-presence.ts` + `.cp-overlay*`) is thoughtfully engineered and reduced-motion safe, and the microcopy is unusually humane ("you're still on this shift until someone picks it up", the availability blank-day guard). The team has clearly internalised the "radical simplicity" brief. The four-state availability model and the drop/give/swap progressive disclosure are the strongest pieces of interaction design in the product.

The biggest opportunities cluster in three places:

1. **The entry screen (`page.tsx`) is off-language.** It is the *first* thing every staff member sees, and it is the one staff surface that does **not** use the `.cp-staff` palette, uses heavier font weights (extrabold/bold/semibold) than the two-weight rule allows, and carries a drop shadow the design language forbids. It looks like a different product than the app behind it.
2. **Muted and faint text fail contrast.** `--c-ink-muted` (#7a7a75) computes to roughly 4.0–4.3:1 on cards and `--c-ink-faint` (#4a4a47) to roughly 2:1 — and faint is used for real information (shift times in availability slots, dates, pay caveats, foot notes) at 10–11px. This is the single most widespread accessibility problem and it affects both themes.
3. **Small touch targets on secondary controls.** The mode toggle (28px tall), availability week pills (~32px), "All day", note-day chips, and the note remove "✕" all fall below the 44×44 minimum.

None of these are structural rewrites; they are a focused polish pass. Details and priorities follow.

---

## 2. Per-screen findings

### 2.1 Entry / choice / PIN / join — `app/v/[venue_token]/page.tsx`

This screen is the outlier. Everything else in the staff app renders inside `<StaffScreen>` which applies `.cp-staff` and swaps the whole colour system to the staff palette. The entry page does **not** — its root is a plain `mx-auto max-w-[420px]` (`page.tsx:142`) with no `.cp-staff` wrapper, so `bg-surface`, `text-ink`, `accent-light`, `unset-border`, `shadow-card` resolve to the *global* design system, not the staff one, and the venue's light/dark theme toggle (which the rest of the app respects via `crewplan-theme:{token}`) has no effect here.

- **Typography breaks the two-weight rule.** `font-extrabold` (800) on the venue initial and PIN (`page.tsx:148,180,275`), `font-bold` (700) on venue name/headings (`page.tsx:150,182,222,266`), `font-semibold` (600) on every button (`page.tsx:161,199,248`). The design language is explicit: "two weights only (400 body, 500 bold)". Every spoke screen obeys this with `font-medium`/`font-normal`; only entry violates it. This makes the first impression visibly heavier and more "templated" than the app.
- **Drop shadow violates "flat surfaces, no gradients or drop shadows".** The entry card uses `shadow-card` (`page.tsx:143`). The spoke screens are correctly flat with 0.5px hairlines.
- **`rounded-card` / `rounded-control` / `rounded-input` are the global radius tokens**, not the staff `rounded-cp-*` scale — another reason it reads as a different surface.
- **No back/exit affordance and no theme toggle** on any entry mode. Minor, since this is the root, but the join and PIN sub-modes are effectively modal states with only in-content links back.
- **Errors are toast-only** (`page.tsx:96–100,123–131`). A wrong PIN or wrong join code shows a transient toast rather than an inline message near the field (`error-placement`, `error-clarity`). For a 4-digit PIN this is tolerable, but "Incorrect PIN" vanishing in 2.5s with no persistent hint is thin.
- **PIN reveal has no copy button** (`page.tsx:275`). "This is the only time we'll show it" is good honest copy, but the single most useful action — copy the PIN, or an explicit "Add to home screen" affordance — isn't offered; the user must memorise 4 digits from a one-time screen. Consider a copy-to-clipboard control.
- **Positives:** the register-first `choice` mode is the right default for an unknown device; the `?expired` → clear-token → PIN path is correct; `inputMode="numeric"` + digit-stripping on both inputs is good mobile form hygiene; the "You're in" `cp-pop-pop` beat is an appropriate, earned delight moment.

### 2.2 Hub — `hub/page.tsx`

Strong screen. Clear hero greeting, a well-judged primary tile (`PrimaryHubTile`, col-span-2) vs. the 2×2 secondary grid, honest badges, and actionable amber banners for pending give/swap.

- **Hero heading uses `font-medium` at 26px** (`hub/page.tsx:310`) — correct and on-language. Good.
- **Venue strip has a glowing dot** (`boxShadow: "0 0 6px rgba(46,204,113,0.6)"`, `hub/page.tsx:327`). This is a soft glow/shadow — a small, defensible exception (it reads as a "live" status LED), but it is technically the kind of decorative shadow the language avoids. Low priority; flag for consistency.
- **`ActionBanner` accept/decline buttons** (`hub/page.tsx:503–516`) are `py-2.5` (~38px tall). Just under 44px. Bump to `py-3`.
- **Tile badges convey state by tone + text** — good, colour is not the only signal (the badge always has a text label). 
- **`transition-all duration-[350ms]`** on the venue strip and banners (`hub/page.tsx:324,340`) — `transition-all` can animate layout properties; here it's used for colour, but prefer an explicit property list (the spoke screens mostly do `transition-colors`/`transition-[...]`). Minor.
- **Two "still right?" prompts can co-occur.** The `auto_submitted` banner here (`hub/page.tsx:337`) and the same message on the availability screen are both good, but a user who auto-submitted sees the nudge on the hub, taps in, and sees essentially the same sentence again. Acceptable (reinforcement), just note the duplication.

### 2.3 My shifts — `rota/page.tsx`

The vertical timeline is elegant and the per-day resolved times are handled correctly. Status pill logic (tick only on confirmed, clock on provisional, `rota/page.tsx:184`) is a nice, honest detail.

- **Colleague avatars are 18px with 9px initials** (`rota/page.tsx:302`). Decorative/identity only, not interactive, so the 44px rule doesn't apply — but 9px text is at the extreme low end of legibility. It's a micro-label, acceptable under the language, but verify on a real device.
- **Timeline rule + nodes:** the 1.5px rule through 40px nodes reads well. `active` day tint (`calendar-block.tsx:28`) uses `rgba(255,77,0,0.3)` border + accent number — good, and it does not rely on colour alone because the shift row content differs from "Day off".
- **`duration`h badge** uses `bg-cp-icon text-ink-muted` (`rota/page.tsx:326`) — the muted-text contrast concern (see §3.2) applies.
- **"Add all shifts to calendar"** button is full-width `py-3.5` — good target. Disabled state uses `opacity-40` — acceptable.
- **Empty state** ("Nothing published yet" → link to submit availability, `rota/page.tsx:112–123`) is a good, action-oriented empty state.

### 2.4 Availability — `availability/page.tsx`

The most sophisticated screen and mostly excellent: the four-state model, the echo/solid prefill distinction, the blank-day submit guard, and the per-shift/day grid are all well-designed and well-commented. Two real accessibility issues plus some target sizing.

- **P0 — the three answered states differ by colour only.** `yes`/`maybe`/`no` render as green/amber/red fills of the same box with the same content (shift name + time); the only visual difference between "available", "if needed", and "can't work" is hue (`SLOT_STYLE`, `availability/page.tsx:82–103`). `unset` is distinguished structurally (dashed hollow), which is good — but the three *answered* states are not. A red/green-colourblind user cannot tell "available" from "can't work" at a glance. The `aria-label` carries the state (`availability/page.tsx:459`) so screen-reader users are fine, and the legend helps, but the cell itself violates `color-not-only`. Add a small state glyph or text token inside the selected cell (e.g. a check / dash / cross, or the word "Yes/Maybe/No") so the state is legible without colour.
- **Slot time text is 10px `text-ink-faint`** (`availability/page.tsx:477`) — both below the 12px floor *and* at ~2:1 contrast. This is real information (the shift's hours) rendered near-invisibly. Raise to at least `text-ink-muted` and 11px.
- **Week switcher pills** `px-3 py-2 text-[12px]` (`availability/page.tsx:392`) ≈ 32px tall — below 44px; they're the primary way to change week. Increase vertical padding.
- **"All day"** (`availability/page.tsx:442`, 11px text, small hit box) and the **note day-chips** `px-2 py-1 text-[11px]` (`availability/page.tsx:544`) are under target size.
- **Note remove control is a literal "✕" character** (`availability/page.tsx:519`). This is a text glyph used as an icon — inconsistent with the inline-SVG icon set used everywhere else (`no-emoji-icons` / icon-consistency), and a small tap target. Swap for `<Icon name="circle-x">` or a plus/x SVG in a 44px hit area.
- **Slot buttons themselves** (`py-2.5`, two lines) are adequately sized and have `active:scale-[0.97]` press feedback and a 180ms colour settle — good, on-language motion.
- **Legend + inline "Tap to cycle…" hint** (`availability/page.tsx:402,576`) are a good redundancy for the interaction model.
- **Positive:** the blank-day guard modal (`availability/page.tsx:625`) naming the exact blank days ("You haven't answered Tue, Wed & Thu") is exemplary forms UX — named consequence, explicit "Submit anyway".

### 2.5 My hours — `hours/page.tsx`

Clean hero, honest `+`/minimum handling for unmeasurable ("close") shifts, good progressive disclosure of the rate/target editor.

- **Hero pay + "est. at £{rate}/hr"** — the caveat line is 11px `text-ink-faint` (`hours/page.tsx:199`); contrast concern again on a money screen where the caveat matters.
- **Number legibility:** the 38px total and 26px pay figure are good; consider tabular figures (`number-tabular`) for the hours/pay so they don't shift width as values change — minor.
- **Day-off rows at `opacity-50`** (`hours/page.tsx:234`) — reads correctly as de-emphasised; fine.
- **Two foot notes stack** (`hours/page.tsx:275–281`) — both are 11px faint; the "can't measure" one is important and gets buried by the contrast issue.
- **The rate/target editor** is a good modal with real labels, `inputMode` set correctly, and honest "saved on this device only" copy. Good.

### 2.6 Drop / give / swap — `drop/page.tsx`

The progressive-disclosure flow (pick a shift → actions light up) is the best interaction on the app. Selection tick circle, dimmed-until-selected actions with a real `disabled` attribute, and in-flight badges that preserve state are all well done.

- **Actions dim via `opacity-40 pointer-events-none`** (`drop/page.tsx:356`) *and* `disabled` on the buttons — belt-and-braces, correct. But `opacity-40` on the action tiles pushes their label text contrast very low while dimmed; that's arguably intended (they're inert), acceptable.
- **Destructive "Drop shift" button** uses `bg-unavail-text` red (`drop/page.tsx:495`) — correct destructive emphasis and separation from Cancel. Good.
- **Multi-step swap modal** (colleague → their shift, with `← Back`) is a genuine multi-step flow inside a modal; it handles back navigation and has a clear title that changes per step (`drop/page.tsx:553`). Solid.
- **Open-shifts "Claim this shift"** buttons are well sized (`py-2.5` full width) — borderline 44px, consider `py-3`.
- **Selection tick circle is 22px** (`drop/page.tsx:340`) but the whole row is the tap target, so this is fine.
- **`hover:-translate-y-0.5` on action tiles** (`drop/page.tsx:366`) — a hover lift; harmless on desktop, no-op on touch. On-language (subtle).

### 2.7 Time off — `leave/page.tsx`

Good allowance strip (three `MetricCard`s), clear request modal with a live day-cost estimate, and honest foot notes about the counting rule.

- **`MetricCard` values are 22px `font-medium`** with dimmer suffix — on-language. The `MetricCard` "tappable card must be the button itself" note (`metric-card.tsx:9`) is a nicely-caught layout subtlety.
- **Request rows** — status icon tile 40px, `chevron-right` only when cancellable. The chevron (`leave/page.tsx:381`) is the only affordance that a row is tappable; on a row with no other visual button that's a subtle cue — acceptable but consider a faint "Tap to cancel" or making the affordance clearer.
- **Rejected/cancelled use neutral tone + `circle-x`** (`leave/page.tsx:43–44`) — a deliberate, defensible choice (no invented red token). The `manager_note` third line on a rejection is exactly right.
- **Date inputs** carry `min` bounds and the `min-w-0` overflow fix (`leave/page.tsx:252`) — good.
- **Empty state** ("No time off booked") is friendly and correct.
- **Foot-note contrast** — same 11px faint issue.

---

## 3. Cross-cutting themes

### 3.1 Consistency

- **Entry screen divergence (P0/P1)** — detailed in §2.1. This is the headline consistency issue: palette, type weights, radius scale, and a drop shadow all diverge from the rest of the staff app on the most-seen screen.
- **Icon discipline is otherwise excellent** — a single inline-SVG Tabler-style set (`icon.tsx`), no icon-font request, consistent 1.5–2px stroke. The lone exception is the literal "✕" note-remove glyph (`availability/page.tsx:519`).
- **Radius/border tokens** are consistent across spokes (`rounded-cp-*`, `cp-hairline` 0.5px). Good.

### 3.2 Accessibility (WCAG 2.1 AA)

- **Text contrast (P0).** Computed from tokens:
  - `--c-ink-muted` #7a7a75 on `--c-surface-card` #141414 ≈ **4.0–4.3:1** — at or just below the 4.5:1 AA floor for normal text. Used pervasively for descriptions, meta lines, times.
  - `--c-ink-faint` #4a4a47 on #0d0d0d/#141414 ≈ **~2:1** — well below AA, used for shift times in availability slots (10px), dates, pay caveats, foot notes, colleague names.
  - Light mode `--c-ink-faint` #a8a69e on #faf9f5 ≈ **~2.3:1** — also fails.
  - **Recommendation:** lift `ink-muted` to meet 4.5:1 (a lighter grey, e.g. around #8f8f8a dark / #6a6862 light — verify with a tool), and reserve `ink-faint` for genuinely decorative text only; anything carrying information (times, the "we can't measure" caveat, dates) should be `ink-muted` or above. This is one token change that improves every screen.
- **Colour-only state (P1)** — the three answered availability states (§2.4). Add a non-colour differentiator inside the cell.
- **Touch targets (P1)** — mode toggle 28px (`mode-toggle.tsx:34`), availability week pills ~32px, "All day", note chips, note-remove ✕, several `py-2.5` buttons at ~38px. Target ≥44×44 (the toggle can keep its visual size with an expanded hit area).
- **Modals lack dialog semantics (P1).** `Modal` (`modal.tsx`) has no `role="dialog"`, no `aria-modal="true"`, no `aria-labelledby` linking the title, no focus trap, no initial-focus move, and no `Escape`-to-close (only backdrop click + an in-content Cancel button). Screen-reader and keyboard users get a degraded experience. Add roles + `aria-labelledby` + Escape + focus management. (The same `Modal` is used by every spoke.)
- **Toast has no live region (P1).** `Toast` (`toast.tsx`) renders visually but has no `role="status"`/`aria-live="polite"`, so confirmations ("Drop requested…", "Swap offered…") are silent to screen readers (`toast-accessibility`, `aria-live`).
- **Progressbar naming (P2).** `ProgressBar` sets `role="progressbar"` + values but no `aria-label` (`progress-bar.tsx:16`); it announces a bare percentage with no name.
- **Focus-visible is present and correct** — `.cp-staff :focus-visible` gives a 2px accent outline with offset (`globals.css:235`). Good, though per CLAUDE.md this is untested with a real Tab press.
- **Reduced motion is handled** — `.cp-staff *` duration collapse (`globals.css:241`) plus per-animation reduced-motion fallbacks (`globals.css:454`). Strong.

### 3.3 Motion

Genuinely good and on-brief. `usePresence` (`lib/use-presence.ts`) is a careful presence primitive (double-rAF entry with an 80ms backgrounded-tab fallback, exit kept mounted for the duration). Overlays fade + scale-from-0.96, sheets slide from their edge, toast enters/exits the same edge symmetrically, and delight beats (`cp-pop-pop`, `cp-pop-in`) are reserved for first-run/earned moments. All transform/opacity, all reduced-motion safe.

- **Minor:** a few `transition-all` usages (hub venue strip/banners, `metric-card`, calendar-block) — prefer explicit property lists to avoid ever animating layout. Low risk as used.
- **Minor:** the pervasive `duration-[350ms]` colour transitions exist to ease the theme toggle; correct intent, just applied very broadly. No performance concern for colour.

### 3.4 Content & microcopy

Consistently excellent — sentence case throughout, honest about system limits ("a time we can't measure", "est."), consequence-first confirmations, and no ALL CAPS except the intended micro-labels (`SectionLabel`, calendar dow). The blank-day guard and the drop/give/swap "nothing changes until…" language are model examples. Keep this bar.

---

## 4. Prioritised recommendations

### P0 — do first (accessibility + first impression)

1. **Fix muted/faint text contrast globally.** In `globals.css`, raise `--c-ink-muted` to meet 4.5:1 on `--c-surface-card` in both themes, and stop using `--c-ink-faint` for information-bearing text. Concretely: re-point the availability slot time (`availability/page.tsx:477`), the hours pay caveat (`hours/page.tsx:199`), and all `FootNote` text (`screen.tsx:50`) from `text-ink-faint` to `text-ink-muted`. Verify final values with a contrast checker on a real build. *One token edit + a handful of class swaps; improves every screen.*
2. **Bring the entry screen onto the staff language** (`page.tsx`). Wrap the page in `.cp-staff` (or `<StaffScreen>`-equivalent), replace `font-extrabold`/`font-bold`/`font-semibold` with `font-medium`/`font-normal`, drop `shadow-card` for a flat `cp-hairline` surface, and switch `rounded-card`/`-control`/`-input` to the `rounded-cp-*` scale. Add the `ModeToggle` so the venue theme applies. *This is the first screen every staff member sees; it should look like the app.*
3. **Give the three answered availability states a non-colour differentiator** (`availability/page.tsx:82–103,455–481`). Add a small glyph or short text token inside the selected cell (check / dash / cross, or Yes/Maybe/No) so state is legible without hue. Legend + aria-label already exist; the cell itself is the gap.

### P1 — high value

4. **Raise sub-44px touch targets:** mode toggle hit area (`mode-toggle.tsx:34`, keep the 28px visual, expand the tappable box), availability week pills (`availability/page.tsx:392`, `py-2`→`py-2.5`+), "All day" (`:442`), note-day chips (`:544`), note-remove ✕ (`:519`, and make it an SVG icon), and the ~38px `py-2.5` action/accept buttons (hub `ActionBanner` `:503`, drop "Claim" `:447`) → `py-3`.
5. **Add dialog semantics to `Modal`** (`modal.tsx`): `role="dialog"`, `aria-modal="true"`, `aria-labelledby` on the title, move focus in on open, restore on close, trap Tab, and close on `Escape`. Fixes accessibility for all seven modals at once.
6. **Add `role="status" aria-live="polite"` to `Toast`** (`toast.tsx`) so confirmations are announced.
7. **Replace the literal "✕" note-remove glyph with an SVG icon** in a 44px hit area (`availability/page.tsx:519`) — icon-set consistency + target size.

### P2 — polish

8. **Name the progress bars** — add an `aria-label` prop to `ProgressBar` (`progress-bar.tsx`) and pass it on availability ("Days answered") and hours ("Hours toward weekly target").
9. **Inline error on wrong PIN/join code** (`page.tsx`) instead of toast-only — a persistent field-level message.
10. **Add a copy-to-clipboard button to the PIN reveal** (`page.tsx:275`) — the PIN is shown once; make it trivially saveable.
11. **Replace `transition-all` with explicit property lists** where it appears (hub venue strip/banners, `metric-card.tsx:27`, `calendar-block.tsx:27`) to guarantee no layout animation.
12. **Reconsider the venue-strip dot glow** (`hub/page.tsx:327`) for strict adherence to "no drop shadows" — or accept it as a deliberate status-LED exception and document it.
13. **Tabular figures** for the hours total/pay and the leave allowance numbers to prevent width shift as values change.

---

## 5. What to keep (do not regress)

- The `usePresence` motion system and its reduced-motion fallbacks.
- The four-state availability model, echo/solid prefill provenance, and the named-blank-day submit guard.
- The drop/give/swap progressive disclosure and the "nothing changes until…" microcopy.
- Hub-and-spoke navigation with a consistent `BackButton`, and the single inline-SVG icon set.
- The honest handling of unmeasurable ("close") shift durations across hub/rota/hours.
- Sentence-case, two-weight typography discipline on the spoke screens — the entry screen just needs to join it.
