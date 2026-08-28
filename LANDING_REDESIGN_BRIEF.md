# Crewplan landing page — full redesign brief

**Author:** Designer Mark · **Date:** 27 Aug 2026
**Scope:** `frontend/app/(marketing)/page.tsx` + `frontend/app/(marketing)/crewplan.css` (full rewrite of both, same two files, same `.crewplan` scope)
**Status:** design direction — build straight from this.

---

## 0. The one-line diagnosis

The current page is a competent 2024 SaaS template that happens to be orange. It centres everything, leans on a static fake rota grid, uses font-weights the brand rulebook forbids (700/600), and — the thing that actually costs money — **it undersells a product that has since shipped roughly four times the features it advertises, while advertising two integrations that don't exist.**

The redesign has one structural idea: **stop describing the loop and show it.** The interactive walkthrough is not a decoration below the hero — it is the page's spine, and every section after it is a footnote to something the walkthrough already demonstrated.

---

## 1. Art direction

### 1.1 What stays

The identity is right and is not up for renegotiation: `#0D0D0D` ground, `#FF4D00` accent, off-white ink, Space Grotesk display + IBM Plex Sans body, 0.5px hairlines, 12px card radius, sentence case, flat surfaces.

### 1.2 What changes — six decisions

**A. One background colour for the entire page.** Delete `--surface-2`. Sections are not differentiated by shade; they are differentiated by hairlines, spacing and the presence or absence of a card. The current page already nearly does this — commit to it fully. A landing page that never changes its ground reads as *confident*; one that alternates `#0D0D0D` / `#111` reads as *template*. Cards (`#141414`) are the only surface lift, and they exist only where content is genuinely enumerable (feature cards, roadmap rows, walkthrough frames).

**B. Weight comes from size and tracking, never from weight.** The current CSS ships `font-weight: 700` on `h1` and the wordmark, `600` on `h2`, `.eyebrow`, `.nav-cta`, `.feature-card h3`, `.roadmap-tag`. That is a direct violation of the design language ("two weights only — 400 body, 500 bold"). Everything drops to **500 max**. The hero h1 does not get smaller as a result — it gets *bigger and tighter* (`-0.035em`) to recover the presence. This is the single most visible change and it is what will make the page look like the app instead of like a landing page bolted onto the app.

**C. Kill the glow.** `.mockup-shell` currently carries `box-shadow: 0 40px 100px -30px rgba(255,77,0,0.08)` — a soft orange bloom. It's the only shadow on the page and it's off-language. Replace elevation with: hairline border + a **1px inset top highlight** (`inset 0 1px 0 rgba(255,255,255,0.04)`) on the walkthrough device frames only. That inset-highlight trick is already precedent in this codebase (the onboarding "Refined Dark" elevation layer), so it's consistent rather than invented.

**D. Orange gets a budget: one focal orange per viewport-height.** Right now orange appears in the eyebrow dot, the eyebrow text, the badge, the badge pulse, the nav CTA, the form button, the roadmap tags, the filled rota cells and the quote full-stop — often four at once. New rule:

- Orange = **the thing you are meant to touch**, plus the wordmark dot.
- Eyebrows go to `--text-muted`, not accent. The dot before them goes; the uppercase micro-label carries itself.
- Product visuals inside the walkthrough are exempt — they use the app's real semantic palette (green/amber/red) because they are portraits of the product, and washing them orange would be a lie about what the manager actually sees.

**E. Import the app's semantic colours.** The landing page currently has no green/amber/red, which is why the fake rota grid can only say "filled" and can't show a coverage gap, a legal block, or the four availability states — i.e. it can't show the interesting parts. Add, matched exactly to `crewplan-staff-reference.html`:

```
--green:#2ECC71; --green-soft:rgba(46,204,113,0.14);
--amber:#E5A800; --amber-soft:rgba(255,193,7,0.14);
--red:#E5484D;   --red-soft:rgba(229,72,77,0.12);
```

Also correct `--text-primary` from `#F5F5F4` to **`#F0EFE9`** so the landing ink matches the product ink exactly.

**F. Section rhythm becomes three densities, not one.** Currently every section is `padding: 100px 32px`. Introduce:

| Density | Vertical padding (desktop / mobile) | Used by |
|---|---|---|
| **Stage** | 128px / 72px | Walkthrough |
| **Standard** | 104px / 64px | Feature sections, roadmap, FAQ, CTA |
| **Band** | 80px / 56px, hairline top *and* bottom | Quote, compliance |

A band is narrow, quiet, centred, and always has a hairline on both edges. It works as a breath between two loud sections. The current quote section already has this shape — generalise it.

### 1.3 Type scale (concrete — build to these numbers)

| Token | Size | Weight | Tracking | Line-height | Family |
|---|---|---|---|---|---|
| `display-xl` (h1) | `clamp(38px, 5.6vw, 64px)` | 500 | -0.035em | 1.04 | Space Grotesk |
| `display-l` (h2) | `clamp(27px, 3.4vw, 40px)` | 500 | -0.025em | 1.12 | Space Grotesk |
| `display-m` (h3, card titles) | 17px | 500 | -0.012em | 1.3 | Space Grotesk |
| `quote` | `clamp(24px, 3.2vw, 34px)` | **400** | -0.02em | 1.38 | Space Grotesk |
| `body-l` (hero sub, section sub) | 17px | 400 | 0 | 1.6 | IBM Plex Sans |
| `body` | 15px | 400 | 0 | 1.65 | IBM Plex Sans |
| `small` | 13.5px | 400 | 0 | 1.55 | IBM Plex Sans |
| `micro` (eyebrow, tags, frame chrome) | 11.5px | 500 | 0.1em | 1.2 | IBM Plex Sans, **UPPERCASE — the only uppercase on the page** |

The `quote` dropping to **400 at 34px** is deliberate: at that size 500 shouts, 400 reads as considered. It's the one place the page whispers.

### 1.4 Layout

- Prose column: **680px max** (currently `h2` is capped at 560 and `.section-sub` at 480 — two different measures, which is why headings and subs look misaligned). One measure: 680 for headings, 560 for subs, both left-aligned to the same edge.
- Content max-width: 1120px (unchanged).
- Walkthrough stage: 1200px max, and it is the **only** element allowed to exceed 1120.
- Hero: **stays centred**, but tighter — it's the only centred block above the footer besides the quote, the compliance band and the final CTA. Everything else is left-aligned. Centring everything is what makes the current page feel weightless.

### 1.5 Use of the product visual

Delete the static `.rota-grid` mockup entirely. It is replaced by the walkthrough, which sits **directly below the hero, breaking the fold** — the top ~120px of the device frame should be visible at 100vh on a laptop, so the page reads "claim → proof" before any scroll.

All product visuals are **live DOM built from the real reference markup**, never screenshots. Non-negotiable, for four reasons: they stay crisp at any DPR, they stay in sync when the product changes, they weigh a few KB instead of a few hundred, and they are readable at 375px in a way a scaled-down PNG never is.

---

## 2. Page IA — section by section

Order is fixed. Copy below is **direction and intent**, not final polish — write to the intent, keep the register (plain, British, spoken-aloud, never "empower your workforce").

---

### S0 · Nav (sticky)

Unchanged structurally. Links become: `Walkthrough · Features · Compliance · Roadmap`. Actions: `Log in` (ghost) + `Join waitlist` (accent pill). Wordmark drops to weight 500 with `-0.04em`.

Mobile (<768px): links hidden (as now), wordmark + `Join waitlist` pill only. Do not build a hamburger — there are four anchors on one page.

---

### S1 · Hero

- **Badge:** `Now taking pilot venues` — keep, keep the pulse, but scope the pulse under a reduced-motion guard (it currently isn't).
- **H1:** keep **"Rotas that build themselves."** It's the best line on the page and everything else in the redesign is in service of proving it. Orange full stop stays.
- **Sub (rewrite):** the current sub says the loop but not the differentiator. New intent — *your team never installs anything; the rota builds itself from what they send; you check it once*. One sentence, ≤ 26 words. e.g. "Your team sends their week from a link — no app, no accounts. Crewplan builds the rota, flags what needs you, and emails it out."
- **Waitlist form** (unchanged behaviour) + `Free while we're in pilot. No card, no commitment.`
- **Below the form:** a single hairline row of four micro-proof items, no icons, separated by `·`:
  `No staff app · UK working-time rules built in · Live in about 3 minutes · Free in pilot`
  This is where the four biggest new-since-last-copy claims get planted before anyone scrolls.

---

### S2 · The walkthrough — "See a week get scheduled"

Density: **stage**. Eyebrow: `THE PRODUCT`. Heading: short, e.g. **"A week, start to finish."** Sub, one line: *"Switch between what you see and what your team sees."* — this teaches the role toggle before they touch it, which is the only piece of instruction the component needs.

Full spec in §3.

---

### S3 · The loop — "Three steps, every week, on its own"

Density: standard. Keep the three-step block, but it now *summarises the walkthrough in words* rather than being the first explanation. Copy tightens accordingly (each step ≤ 22 words). Visual change: drop the 1px-gap grid-with-shared-border treatment; make it three plain columns separated by vertical hairlines, numbers `01/02/03` in accent at `micro` size. Lighter than the current bordered box, which competes with the walkthrough frame directly above it.

Copy intent per step (update from current):
1. **Send one link** — one link, one 4-digit PIN each, never changes. Staff can register themselves; you approve.
2. **Team fills it in** — four answers per shift: available, if needed, can't work, or not answered yet. We chase the stragglers by email.
3. **You get a rota** — built around real availability, holidays and the law. You review what's wrong, not what's right.

---

### S4 · For your team — "Nobody downloads anything"

Density: standard. **New section.** Left-aligned heading + sub, then a two-column layout: copy left, a **static phone frame** right (reuse the walkthrough's `PhoneFrame` primitive so there's one device component in the codebase) showing the staff *My shifts* timeline.

Four short items in the copy column (title + one line):
- **A link and a PIN** — no accounts, no passwords, no app store.
- **Four honest answers** — "if needed" and "haven't answered yet" are different things, and Crewplan treats them differently.
- **Drop, give or swap** — like-for-like swaps approve themselves; anything riskier comes to you.
- **Time off, requested properly** — holiday requests go through the same system, and the rota never schedules over an approved one.

Close with a quiet line: *"Shifts add straight to their phone calendar."*

---

### S5 · For you — "Review what's wrong, not what's right"

Density: standard. Mirrored layout (copy right, visual left) — a **cropped laptop frame** showing the rota review screen with the red coverage line and the approvals row. Cropping is fine here; this is a still, not the walkthrough.

Four items:
- **Coverage flagged before the week starts** — uncovered and under-staffed slots, ranked by severity, not buried in a grid.
- **Waiting on you** — pending claims and swaps in one row with approve or decline in place.
- **Real shift times, per day** — a Friday that runs till 1am is eight hours, and the rota knows it.
- **Export however you need it** — PDF, Excel or a shareable image for the staff-room wall.

---

### S6 · Compliance band — the quiet, serious one

Density: **band** (hairline top and bottom, centred, narrower measure). This is a genuine differentiator no competitor at this price point states plainly, and it deserves silence around it rather than a card grid.

Heading (`display-l`, centred): intent — *the law is in the solver, not in your head*.
Body (`body-l`, ≤ 45 words, centred): rest gaps between shifts, maximum weekly hours, a day off in every seven, and hard blocks on under-18 night and hours rules that **cannot be overridden** — enforced when the rota is generated *and* every time anyone adds, claims or swaps a shift.

One accent detail only: the word "cannot be overridden" in `--text-primary` while the rest of the sentence is `--text-secondary`. No icons, no card, no red. The restraint is the point.

---

### S7 · Set up in about three minutes

Density: standard, but **compact** — heading + sub + a single horizontal hairline strip of five labels with a thin accent rule beneath, showing the onboarding arc: `Your venue → Roles → Opening hours → Your team → First rota`.

Copy intent: an activation link lands in your inbox, eight short questions, and you're looking at a real rota for a real week. No import spreadsheet, no implementation call.

---

### S8 · Quote band

Density: band. Keep the existing line verbatim — **"Built for the pub with eight staff and one manager. Not the chain with a scheduling department."** It's the sharpest positioning in the repo. Restyle to the new `quote` token (weight 400). Attribution stays lowercase and muted.

---

### S9 · Everything else — the feature index

Density: standard. The problem with the current six feature cards is they're a *sample*, and the page has no place to state the full surface area. Fix: keep **four hero cards** (the ones that need a sentence) and follow them with a **compact two-column index** of everything else — 13.5px rows, hairline separated, title in ink + a four-word clause in muted. No icons, no cards.

Hero cards (title + 2 lines each):
1. **No staff accounts** — link + PIN is the whole login.
2. **Conflicts caught early** — you find out before the week, not on the night.
3. **Fair by default** — hours spread evenly so nobody quietly carries the rota.
4. **Reminders, handled** — we chase the two who always forget.

Index rows (all shipped, all true — this list is the replacement for the stale copy):
availability via one shared link · four-state availability · auto-generated rotas · drop a shift to the pool · give a shift to one person · two-sided swaps · holiday requests · staff self-registration · manager approval queue · per-day shift times · post-midnight closes · coverage warnings · under-18 hard blocks · rest-gap and weekly-hours checks · fair hours distribution · email reminders · rota emailed on publish · PDF export · Excel export · shareable image · add to phone calendar · light and dark themes · manager app · admin console.

Remove entirely: the current "One Saturday check-in" card (the review email is real but it's a detail, not a headline) — fold it into the index.

---

### S10 · Roadmap — two items, stated honestly

Density: standard. Delete Square, Xero and Multi-site. Keep the row layout and the tag pills.

| Item | Copy intent | Tag |
|---|---|---|
| **Holiday that accrues by the hour** | 12.07% of hours worked — the UK statutory model for irregular-hours staff. Days-based allowance works today; hours-based is next. | `Next` |
| **Notifications for claims and approvals** | Today a claim waits in the app until someone opens it. Email and push are coming. | `Next` |

Move **Shift swaps** out of roadmap and into S4 + the S9 index — it's live.

Add one honest closing line under the list: *"That's the whole list. We'd rather ship two things than promise ten."* This turns a short roadmap from a weakness into the positioning.

---

### S11 · Questions (new, optional but recommended)

Density: standard, compact. Five plain Q/A pairs, hairline separated, no accordion (an accordion on five 30-word answers is motion for nothing). Answer the objections a landlord actually has:

1. Do my staff need to download anything? — No.
2. What if someone doesn't submit? — We chase them; blank counts as can't-work and the rota says so.
3. Can I override the rota? — Yes, except the under-18 legal blocks.
4. What does it cost? — Free during pilot; we'll talk before that changes.
5. What if I already have a rota in a spreadsheet? — Onboarding takes about three minutes; there's nothing to import.

---

### S12 · Final CTA

Keep the current shape (centred, eyebrow + heading + sub + form). Copy intent: pilot venues onboarded by hand. Reuse `WaitlistForm` unchanged.

---

### S13 · Footer

Unchanged apart from type tokens and the new anchor list.

---

## 3. The interactive walkthrough — component spec

**File:** `frontend/app/(marketing)/walkthrough.tsx` (client component), imported by `page.tsx`. Styles live in `crewplan.css` under a `.wt` sub-scope so nothing leaks.

### 3.1 The core model

- **Five steps.** Five is the number of beats the loop actually has, and five fits one rail without wrapping at 1200px.
- **Two roles: manager / staff.** The role toggle is a **lens on the same moment**, not a second track. Both roles have a frame for all five steps. This is the whole idea of the component: *"at this instant, here's what you see and here's what Priya sees."* That comparison is the product's pitch — the manager does work, the staff member does almost nothing.
- **Two devices: laptop / phone** — desktop viewports only (see §3.7).
- **Step, role and device are three independent pieces of state. Changing any one never resets the other two.** Switching role at step 4 keeps you at step 4. This is the single most important interaction rule; getting it wrong makes the component feel broken.

State shape:

```ts
type Role = "manager" | "staff";
type Device = "laptop" | "phone";
const [step, setStep] = useState(0);        // 0..4, deterministic on SSR
const [role, setRole] = useState<Role>("manager");
const [device, setDevice] = useState<Device>("laptop");
const [autoplay, setAutoplay] = useState(true); // killed permanently on first interaction
```

### 3.2 Layout

**Desktop (≥ 900px):**

```
┌──────────────────────────────────────────────────────────────┐
│  [ Manager | Staff ]                    [ Laptop | Phone ]   │  ← toggle row, 44px tall
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   01 Send the link      ┌────────────────────────────────┐   │
│   02 Team fills it in   │                                │   │
│ ▌ 03 Crewplan builds it │        DEVICE FRAME            │   │
│   04 You review         │                                │   │
│   05 Everyone knows     └────────────────────────────────┘   │
│   ─────────────────────                                      │
│   Caption headline (display-m)                               │
│   Role-specific line (small, muted)          [‹] [›]         │
└──────────────────────────────────────────────────────────────┘
```

- Rail: 260px fixed left column, frame fills the rest. Rail items are 44px tall minimum, `body` size, muted; active item is ink with a **2px accent bar** at its left edge.
- Frame stage is a **fixed-height box** (620px desktop) so the page never reflows between steps. This matters more than it sounds — a stage that grows and shrinks as steps change makes the whole page below it jitter.
- Prev/Next sit bottom-right of the caption block, 40×40, hairline, ghost.

**Mobile (< 900px):** stacked — toggle row (role only), phone frame centred, caption below, then a horizontal step strip of five dots with the active label spelled out beside them, then Prev/Next. Frame height 560px, width `min(320px, 100% - 48px)`.

### 3.3 The five steps

Headline is **shared across roles** (the loop is one story). The second line is **role-specific** (the point differs per person).

---

**Step 1 — "One link. No app, no accounts."**
*Manager line:* Drop the link in the group chat once. It never changes.
*Staff line:* Tap it, type four digits, you're in.

- **Manager frame (laptop):** Team screen. Top bar `The Anchor` + tabs `Rota · Scheduler · Team · Settings` with Team active. Card 1: "Staff join link" — `crewplan.app/v/the-anchor` in mono-ish muted, `[Copy]` button in a settled **"Copied"** state, join-code chip `4821`, ghost `Reset` / `Turn off`. Card 2: roster rows — Sarah (Bar), Marcus (Floor), Priya (Bar), Tom (Kitchen, `U18` accent chip), PIN column masked `••••`. One amber-tinted row at the top of the roster: **"Jess wants to join — Bar"** with `Approve` / `Decline`. (That row is how staff self-registration gets shown without a section of its own.)
- **Staff frame (phone):** entry screen. Wordmark, `The Anchor, Southampton`, "Enter your PIN", four boxes with two filled and a caret in the third, and a secondary link "First time? Register".

---

**Step 2 — "Your team marks their week."**
*Manager line:* You watch a counter. That's your whole job this step.
*Staff line:* Four taps a day, under a minute, on the bus.

- **Staff frame (phone):** the availability screen, and this is the most important single frame in the component — it's the four-state claim made visible. Header `Your availability · 18–24 Aug · closes Thursday 6pm`. Legend row: green Available / amber If needed / red Can't work / **dashed hollow Not answered**. Day cards Mon–Sun, each with `Day` and `Evening` slot buttons carrying the exact reference colours (`--green-soft` + `rgba(46,204,113,0.4)` border, etc.). **Sunday must be left in the dashed untouched state** so the fourth state is on screen. Sticky bottom bar: `6 of 7 days` progress + accent `Submit`.
- **Manager frame (laptop):** "Waiting on availability" — big `5 of 7 submitted`, roster list with green ticks, two rows muted with an amber `Reminder sent Thu 6pm` chip, and a `Closes Thursday 6pm` pill top-right.

---

**Step 3 — "Crewplan builds the rota."**
*Manager line:* Availability, holidays and the law, solved in a few seconds.
*Staff line:* Nothing. Deliberately nothing.

- **Manager frame (laptop):** the resolved generate state — a green check (**pop-in beat #1**), `Rota built · 34 shifts placed`, and three quiet lines beneath: `Respected 6 approved holidays` / `Everyone under their weekly cap` / `Hours spread evenly`. Below that the draft matrix: 4 staff rows × 7 day columns, filled chips with real times, and **one empty cell with a dashed red border**.
- **Staff frame (phone):** a near-empty screen — green check (**pop-in beat #2**, and these two are the *only* pops in the component), `Availability sent`, `Nothing else to do — we'll email you when the rota's out.` The emptiness of this frame is the argument. The caption line should point at it explicitly.

---

**Step 4 — "You review what needs you."**
*Manager line:* One gap, one approval, one legal block. Not 34 rows to read.
*Staff line:* Still nothing — it's provisional until you say so.

- **Manager frame (laptop):** rota review, severity-ranked exactly as the real page is:
  1. Red coverage line: **`1 gap to fill`** / `Sat evening — nobody available`.
  2. `Waiting on you` row, count badge 2: a claim (`Marcus wants Fri evening` · Approve / ✕) and a swap (`Priya ↔ Tom, Sat` · Approve / ✕).
  3. Legal block card: lock glyph, **red left rule**, `Tom is 17 — can't work past 10pm before a school day`, and the line `This one can't be overridden.`
  4. Day strip Mon–Sun with red/amber/green dots.
  5. Sticky bottom bar: `Publish week` accent button + `34 shifts · 4 staff`.
- **Staff frame (phone):** quiet card — amber `Provisional` pill, `Your manager's still finalising this week`, and the week timeline rendered at 50% opacity. Honest, and it makes the publish beat in step 5 land.

---

**Step 5 — "Everyone knows. And when life happens, they sort it."**
*Manager line:* Published, emailed, and on the wall as a PDF if you want it.
*Staff line:* Their shifts, their colleagues, and a swap that sorted itself.

- **Staff frame (phone):** My shifts timeline from `crewplan-staff-reference.html` — the vertical rule, 40px day nodes, working days accent-tinted, `6:00pm – 11:30pm · Bar · with P Priya`, `5.5h` duration chips. A shift-detail sheet peeks from the bottom third with `Drop` / `Give` / `Swap` and one `Add to calendar` row.
- **Manager frame (laptop):** published state — green `Published · emailed to 7 staff`, an export row (`PDF` `Excel` `Image`), and the approvals row now reading `Swap approved automatically — like-for-like` in muted green. That single line is the clearest possible statement of the swap policy, and it costs no copy anywhere else on the page.

### 3.4 Toggle interaction model

- Both toggles are **segmented controls**, not switches: two equal-width labelled halves, hairline border, 8px radius, the active half filled `--accent-bg` with accent text; a **2px accent underline that translates** between halves (transform only, 180ms).
- Semantics: each toggle is `role="radiogroup"` with `aria-label` ("View as", "Device"), children `role="radio"` + `aria-checked`. Arrow keys move within a group; Tab moves between groups. (Do **not** use `aria-pressed` buttons — this is a single choice from two, which is exactly a radiogroup.)
- Changing a toggle **cross-fades the frame contents only** (140ms out / 200ms in). The frame shell — bezel, stage box, rail, caption headline — does not move or resize. Only the caption's second line changes with role.
- Changing device changes the bezel geometry; animate the bezel `width`/`height` **not at all** — instead the two bezels are separate elements and we cross-fade between them within the fixed stage. Animating a device frame's dimensions is where this kind of component always goes wrong.

### 3.5 Advance model

**Default: auto-advance once, then hand over permanently.**

- Autoplay arms only when the component is ≥ 60% in view (IntersectionObserver), and only on first entry.
- Dwell: **4500ms** per step. Step 3 gets **5500ms** (it has the pop beat and the most to read).
- Autoplay **stops permanently** — not pauses — on *any* of: rail click, prev/next, either toggle, a keydown inside the component, or reaching step 5. Never loops. A landing-page carousel that restarts after the visitor has taken control is the most reliably irritating pattern on the web; one guided pass and then it's theirs.
- While autoplaying, the active rail item's 2px accent bar grows `scaleX(0 → 1)` over the dwell duration, `transform-origin: left`, `linear`. That's the only progress indicator needed and it costs one transform.
- Autoplay is **off entirely** under `prefers-reduced-motion: reduce` — the component mounts on step 1 and waits.
- Autoplay must not start before hydration; `step` initialises to `0` deterministically so SSR and client agree.

### 3.6 Accessibility

- The step rail is a `role="tablist"` (`aria-orientation="vertical"` desktop, `horizontal` mobile) with roving tabindex; each item `role="tab"` + `aria-selected`; Left/Right/Up/Down move, Home/End jump. The frame stage is `role="tabpanel"` with `aria-labelledby` pointing at the active tab.
- Each frame carries a **visually-hidden one-sentence summary** as its first child, e.g. *"Manager view: the rota review screen shows one uncovered Saturday evening shift, two approvals waiting, and a legal block for a 17-year-old."* A screen-reader user should get the argument without parsing a synthetic UI. The decorative sub-parts of the frame (bezel, chrome) are `aria-hidden`.
- The frames contain **no interactive elements**. Every button-looking thing inside a frame is a `<div>` or a `<span>`, so nothing enters the tab order and nobody tabs into a fake `Approve` button. This is worth stating loudly because it's the easiest mistake to make when porting the reference HTML, which is full of real `<button>`s.
- Live region: a visually-hidden `<p>` announcing `Step 3 of 5 — Crewplan builds the rota`. Set `aria-live="off"` while autoplay is running and flip it to `"polite"` the moment autoplay is cancelled. Announcing five auto-advancing steps unbidden is worse than announcing none.
- Focus: rail items, toggles and prev/next all take a `:focus-visible` ring — 2px accent, 2px offset. Colour contrast: every text colour used inside a frame is straight from the app's own token set, which is already at AA.
- Prev at step 1 and Next at step 5 are `disabled` with `aria-disabled`, at 40% opacity — do not wrap.

### 3.7 Mobile degradation — the laptop-frame problem

**Decision: the device toggle does not exist below 900px. Under 900px the walkthrough is phone-only.**

The alternative — rendering a 960px-wide laptop layout inside a 375px viewport via `transform: scale(0.31)` — turns 13px product text into 4px. It is unreadable, and unreadable is worse than absent. A horizontally-scrollable laptop frame is worse still: it hijacks the page's own scroll on touch.

So: below 900px, `device` is forced to `"phone"`, the device segmented control is **removed from the DOM** (not hidden with CSS — a removed control can't be focus-trapped or read out), and the role toggle sits alone, full-width, centred.

The manager-on-a-laptop story is not lost — it's told by the static cropped laptop still in **S5 (For you)**, which is a single composed image-like block that can be cropped and left-aligned at 375px without lying about legibility.

Implementation: drive this off a `matchMedia("(min-width: 900px)")` hook, not a CSS-only trick, because the control has to leave the DOM. Guard against SSR (`useSyncExternalStore` or an effect-set boolean defaulting to `false` → phone-first, which is also the safer default).

### 3.8 Build notes

- **Frames are data + markup, not images.** One `STEPS` array of five objects, each `{ id, label, headline, manager: {line, Frame}, staff: {line, Frame} }`. Ten small frame components, each ~40–80 lines of JSX. Port the class names and colour values from `crewplan-staff-reference.html` / `crewplan-manager-reference.html` and prefix them `wt-` so they live under `.wt` and never collide with either the app or the marketing base.
- **Mount only the visible frame**, plus the outgoing one for the duration of the cross-fade (~200ms). Ten frames mounted at once is a needlessly heavy DOM on a marketing page and defeats the point of not using images.
- **No new dependencies.** No Framer Motion, no carousel library, no headless UI kit. This repo is deliberately zero-UI-dependency (inline SVG icons, a hand-rolled `usePresence`) and a landing page is the worst possible reason to fork that. Everything here is CSS transitions plus `useState`.
- **Icons:** inline SVG, ported from the app's own icon sets. No Tabler webfont CDN — the reference HTMLs pull one and it must not follow them into production (third-party request, icon-flash on pub wifi).
- The bezel: rounded rect, `0.5px` hairline, `12px` radius (laptop) / `28px` radius (phone), the inset top highlight from §1.2C, plus a 36×4px `--border` pill at the top of the phone. **No fake OS chrome** — no traffic-light dots, no URL bar, no notch cartoon, no battery icon. The frame is a bezel; the content is the product.

---

## 4. Motion plan

Everything below is **transform and opacity only**. No `transition: all` anywhere. No animated `height`, `width`, `top`, `box-shadow` or colour-on-scroll.

### 4.1 Tokens

```css
--ease-out: cubic-bezier(0.22, 1, 0.36, 1);
--ease-pop: cubic-bezier(0.34, 1.4, 0.64, 1);
```

(`--ease-pop` matches the value already in the app's `globals.css` — same overshoot, so the landing and the product move the same way.)

### 4.2 Hero entrance

Staggered on mount, not on scroll: badge → h1 → sub → form → proof row, `opacity 0→1` + `translateY(10px→0)`, 400ms, `--ease-out`, **60ms stagger**, total ≤ 640ms. The walkthrough stage does *not* animate in with the hero — it fades in at 300ms on its own once mounted, so the eye lands on the headline first.

### 4.3 Scroll reveals

Replace the current `.fade-in` (14px / 600ms — too far, too slow, and it re-triggers because the observer never unobserves).

- New: `opacity 0→1`, `translateY(10px→0)`, **380ms**, `--ease-out`.
- Observer: `threshold: 0.2`, `rootMargin: "0px 0px -8% 0px"`, and **`observer.unobserve(entry.target)` on first intersection** so scrolling back up doesn't replay the page.
- Stagger within a group via `style={{ "--i": i }}` and `transition-delay: calc(var(--i) * 50ms)`, **capped at 6** (`min(var(--i), 6)`) so a 24-row feature index doesn't take 1.2s to finish arriving.
- The **reduced-motion fallback needs no JS**: put the hidden initial state *inside* `@media (prefers-reduced-motion: no-preference)`. Under `reduce`, elements are simply never hidden, so even if the observer never fires (JS off, old browser, tab throttling) nothing is invisible. The current implementation has the opposite failure mode — `.fade-in` starts at `opacity: 0` unconditionally, so a JS failure blanks half the page.

### 4.4 Walkthrough transitions

| What | Motion | Duration |
|---|---|---|
| Step forward | outgoing `opacity→0`; incoming `opacity 0→1` + `translateX(10px→0)` | 120 out / 200 in |
| Step back | same, incoming from `translateX(-10px)` | 120 / 200 |
| Role or device change | contents cross-fade, **no translate** (it's a lens change, not a move) | 140 / 200 |
| Rail active indicator | 2px bar `translateY` between items | 220ms `--ease-out` |
| Autoplay progress | active bar `scaleX(0→1)`, origin left | = dwell, `linear` |
| Toggle underline | `translateX` between halves | 180ms `--ease-out` |
| Pop beats (×2 only) | `scale(0.85→1)` + `opacity`, `--ease-pop` | 320ms |

Under `prefers-reduced-motion: reduce`: all of the above collapse to a plain 120ms opacity cross-fade; the progress bar doesn't animate; the pop beats become a static check; autoplay is off.

### 4.5 Hover / press

- Links and nav items: `color` 120ms. Nothing else.
- Buttons (nav CTA, form submit, prev/next): `opacity: 0.9` on hover, `transform: scale(0.98)` on `:active`, explicit `transition: opacity 140ms, transform 140ms` — never `all`.
- Cards: **border-colour only** (`--border` → `--border-strong`), 160ms. No lift, no translate, no shadow — a flat language stays flat on hover.
- Rail items: colour + a 100ms `translateX(2px)` on hover. This is the one hover translate on the page and it earns it, because it signals "these are clickable" for a control that otherwise looks like a list.
- The hero badge pulse: keep, but move it inside `@media (prefers-reduced-motion: no-preference)` — currently it runs unconditionally.

### 4.6 Two motion bugs in the current CSS to fix while you're in there

1. `:global(html) { scroll-behavior: smooth; }` is set unconditionally and **leaks out of the `.crewplan` scope onto the whole app**. Wrap it in `@media (prefers-reduced-motion: no-preference)` and, ideally, scope it to the marketing route.
2. The IntersectionObserver never disconnects per-element, so `.visible` is re-added on every intersection — harmless today, wasteful, and it will misbehave the moment anything depends on the transition firing once.

---

## 5. What I would explicitly NOT do

1. **Do not ship screenshots.** PNGs of the app go stale within a batch, weigh 200–800KB, need `@2x` for retina, can't be themed, and are illegible when scaled to a 375px column. Live DOM, always. (Corollary: don't reach for `html2canvas` either — the same conclusion the team already reached on the "View as image" export.)
2. **Do not scale the laptop frame down on mobile.** Covered in §3.7. Absent beats unreadable.
3. **Do not make the walkthrough frames interactive.** The instant one availability slot is tappable, every other element in every frame becomes a bug report, and you've committed to maintaining a second copy of the product. It is a *depiction*. Its buttons are divs.
4. **Do not loop the autoplay**, and do not add play/pause chrome. One guided pass, then it's the visitor's.
5. **Do not add a light mode to the landing page.** The app is theme-aware because staff use it at 2pm in a beer garden and at midnight in a cellar. A marketing page has one job and one lighting condition. Dark only.
6. **Do not add a logo wall, testimonials, star ratings or "trusted by N venues".** There is one live venue. Inventing social proof for a pilot product is both dishonest and, at this scale, obviously fake to the exact audience you're courting.
7. **Do not add pricing.** "Free while we're in pilot" is the entire commercial statement until there's a price. A pricing table with a `£?` is worse than no pricing table.
8. **Do not claim notifications or hours-based accrual as shipped.** They're in `Next` for a reason. Same discipline the codebase already applies to itself.
9. **Do not add a nav dropdown or hamburger.** Four anchors, one page.
10. **Do not introduce new brand colours for the marketing page.** Green/amber/red come from the app's existing token values, exactly, or not at all.
11. **Do not import the app's Tailwind tokens into `crewplan.css`.** The `.crewplan` scoping is doing real work — the deliberate separation between marketing CSS and app CSS is why neither has ever broken the other. Keep the local `--bg/--surface/--accent` variable block; just extend it.
12. **Do not use `100vh`** anywhere (mobile browser chrome makes it lie). `100dvh` or, better, don't size by viewport at all — the walkthrough stage is a fixed pixel height by design.
13. **Do not put the walkthrough before the waitlist form in the DOM.** The form is the conversion; it stays directly under the hero copy, above the walkthrough, in both source order and tab order.
14. **Do not rewrite `WaitlistForm`.** It works, it handles the already-joined case, it has an error path. Restyle it; don't touch its logic.
15. **Resist adding a sixth walkthrough step.** Onboarding, exports and time off all feel like they want to be step 6. They get sections instead. Five beats is already at the edge of what a visitor will sit through.

---

## 6. Build order (suggested batches)

Sequential and verifiable, in the house style:

1. **Tokens + type + section shells** — rewrite `crewplan.css` foundations, drop the shadow, fix the weights, add semantic colours, restructure the reveal system. Page renders with all sections in place but placeholder copy. Verify at 375 / 768 / 1440.
2. **Copy pass** — S1–S13 written to the intent above. No new components. This is where the stale-claims problem actually gets fixed, so it should land early rather than last.
3. **Walkthrough shell** — stage, rail, both toggles, step/role/device state, prev/next, keyboard, ARIA, mobile collapse. Frames stubbed as labelled empty boxes. Verify the three-independent-state rule by hand.
4. **The ten frames** — manager and staff for each of five steps, ported from the reference HTMLs. Verify each at its target frame width, then verify the phone frames again at 375px page width.
5. **Motion** — entrance, reveals, walkthrough transitions, autoplay, the two pop beats, full `prefers-reduced-motion` pass.
6. **A11y + perf sweep** — tab through the whole page, confirm no tab stop lands inside a frame, confirm the live region behaviour, run a contrast check on the frame internals, confirm `next build` and lint are clean (delete `.eslintcache` first — a cached lint pass is not a pass).

---

## 7. Assumptions I'm making

- The waitlist remains the only conversion; there is no self-serve signup to design toward.
- Traffic is majority mobile (a landlord reading a link on their phone behind the bar), which is why phone-first degradation gets a firm decision rather than a hedge.
- No new backend, no new endpoints, no migration. Everything in this brief is frontend-only inside `app/(marketing)/`.
- The two reference HTMLs remain accurate portraits of the shipped UI. If the rota page redesign (B1–B7) shifted anything materially, the step-4 manager frame is the one to re-check — it's modelled on the *new* severity-ranked layout described in `CLAUDE.md`, not on the older reference screen.
