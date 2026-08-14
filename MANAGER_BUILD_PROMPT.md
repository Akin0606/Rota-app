# Crewplan — Manager View Build Prompt

Rebuilding the Crewplan **manager** surface with a new design language. The reference file `crewplan-manager-reference.html` contains every screen as working, styled HTML — **it is the visual source of truth: match it exactly** (colours, spacing, radii, type, interactions). Port it faithfully into our stack; don't redesign.

Before writing any UI, read `/mnt/skills/public/frontend-design/SKILL.md` and follow it.

The reference file is organised into **Part 1 (build now)** and **Part 2 (build when ready)**. Only Part 1 is in scope for this build. Part 2 is documented here so the structure anticipates it, but do not build it yet.

---

## Stack

- Next.js 14 (app router) + Tailwind, existing repo (`rota-app`)
- FastAPI + OR-Tools CP-SAT solver on the backend (existing)
- Manager auth = email OTP (existing). Staff auth = PIN venue links (separate, already built)
- Supabase Postgres, Resend email (existing)

---

## Design tokens (extract to Tailwind config / CSS vars — never hardcode per component)

**Dark (default)**: bg `#0D0D0D` · card `#141414` · card-hover `#1A1A1A` · border `rgba(255,255,255,0.07)` · text `#F0EFE9` · text-dim `#7A7A75` · text-faint `#4A4A47`

**Light**: bg `#FAF9F5` · card `#FFFFFF` · card-hover `#FDFCF8` · border `rgba(0,0,0,0.08)` · text `#1A1815` · text-dim `#78766F` · text-faint `#A8A69E`

**Shared**: accent `#FF4D00` · accent-soft `rgba(255,77,0,0.12)` dark / `rgba(255,77,0,0.08)` light · green `#2ECC71` · amber `#E5A800` · red `#E5484D` (each with ~0.12–0.14 soft bg) · track `#1E1E1E` dark / `#ECEAE2` light

**Rules**: card radius 12–15px · control radius 8–11px · borders always 0.5px · two font weights only (400/500) · sentence case everywhere except tiny uppercase micro-labels · transitions 0.15–0.2s on interaction, 0.35s on theme change.

## Light / dark toggle

Sun/moon knob, top-right of every screen. Persist to `localStorage` (key `crewplan-theme:manager`, scoped to the manager account). Read before first paint to avoid flash; default dark. Flip a `.light` class / `data-theme` on the screen root — all tokens cascade from it. Same mechanism the staff-side build uses.

## Shared components to factor out (used across manager screens)

`ManagerNav` (wordmark + tab bar: Rota / Scheduler / Staff / Settings) · `ModeToggle` · `Stepper` (– value +) · `Switch` (toggle) · `Chip` (multi-select role/staff) · `CalendarBlock` (dow + date) · `StatusBadge` (green/amber/red) · `MetricCard` · `BottomSheet` (grab handle + header + scroll body + sticky footer — used by Add role, Add member, Edit member) · `PrimaryButton` / `SecondaryButton` · `BackButton`.

---

# PART 1 — build now

### 1. Manager login
Email OTP, two steps: email → 6-digit code. "No password" hint. Six separate OTP boxes (auto-advance + paste). Resend with countdown. "Staff member? Use your venue link" routes to the staff PIN flow. Respects theme toggle.

### 2. Rota review (day view + publish)
The solver's output for review. Status banner (amber when gaps: "Draft · 2 shifts unfilled" + reason). Week strip (7 days, fill-state dot: green full / amber gap), tap to select a day. Selected day = role groups (Bar/Floor/Kitchen) → daypart → assigned staff chips, with:
- **Gap chips** in amber ("Needs 1 more") — the visible signal for solver-skipped shifts. Never leave an unfilled requirement silent.
- **On-leave** shown as a dashed chip (from the leave blocked-set).
- **U18** tag on under-18 staff.
Sticky publish bar: notice-period check (green tick when ≥ the configured notice, i.e. 72h Employment Rights Act), gap count gate, weekly cost if pay is on. **Publish is blocked while gaps remain** (or requires explicit "publish with gaps" confirm — your call, but never silently publish an incomplete rota).

### 3. Rota matrix (whole week, one grid)
Staff × 7 days grid, grouped by role, shift times in cells, `·` for days off, dashed "Leave", U18 tag. **Sticky name column + sticky header** so days scroll horizontally on mobile while names stay pinned. Weekend headers accented. **Export control** top-right opening a menu: PDF / Excel / Image.
- **No totals in the grid or export** (explicit: no hours column, no daily-cost row, no summary counts). Times only. Hours/cost live only inside the app's labour-cost view.

### 4. Scheduler (coverage + solver rules) — *the differentiator*
Config-first surface. Sections:
- **Coverage matrix** — per-role, per-daypart headcount steppers. Day tabs start with **"All / Default"**: set once, Mon–Sun inherit. Overridden days show an amber dot. "Copy to weekdays / weekend" for bulk edits. Live "shifts / week" total recomputes.
- **Shift rules** (2-col): min shift, max shift, rest gap, notice (steppers); "one day off in 7" (toggle); **under-18 · 5 hard constraints (locked, ALWAYS ON, non-toggleable)**.
- **Fairness weighting** — slider (coverage-first ↔ strictly equal).
- **Sticky generate bar** — "shifts/week" + "+ Add pay rates for live cost" teaser (links to Settings pay opt-in) + Generate.
Data model note: coverage stores a **default pattern + per-day overrides**, not 7 full copies.

### 5. Generate (solver running → result)
Stepped solving animation mirroring real solver phases: availability/leave → coverage & role rules → compliance & under-18 → fairness. Resolves to an **honest result**: "60 of 62 filled · all compliance rules met", stat cards (filled / gaps / cost), an **amber flag naming any unfilled shifts and why** ("no eligible staff free"), and two exits: "Adjust rules" (→ Scheduler, carry the gap reason in as a dismissable note) / "Review rota" (→ Rota review). Respect `prefers-reduced-motion` (skip animation, show result).

### 6. Settings (venue / roles / team / pay / account)
Grouped cards: **Venue** (name, hours, dayparts) · **Roles** (chips + add) · **Team** (staff rows with U18 / Key tags, edit on tap, add member) · **Pay & labour cost — optional** (off by default; toggle reveals one-rate vs per-staff choice + rate input + green confirm; off = no cost UI anywhere) · **Account** (Plan, Integrations — both link to Part 2 screens; keep the entries, mark "coming soon").

### 7. Add role (bottom sheet)
Name + icon picker + **multi-select "who can work this role"**. Collapsed **Advanced · solver rules**: "Require a Key staff member" (≥1 keyholder per shift of this role) + "Allow under-18s" (off → role excluded from U18 assignment via the 5 constraints). Simple by default; advanced folded away.

### 8. Add team member (bottom sheet)
Name · Contact (email/phone — **for the PIN venue link; no account**) · multi-select roles · min/max weekly hours (steppers, solver bounds) · **Key staff** toggle · **Under 18** toggle → reveals **DOB** (constraints auto-lift at 18) · Pay rate (**only shown if per-staff pay is on**). Primary action: "Add & send link" (fires Resend).

### 9. Edit member (bottom sheet)
Same form as Add member, pre-filled, plus: **access-link status banner** (active / last opened / Resend), header identity (avatar + "added N months ago"), and a **Manage** zone: **Archive** (soft — out of scheduling, history kept) vs **Remove** (hard delete, red). Both require a **confirm dialog showing consequences**; Remove's is firmer and nudges toward Archive. One shared member-form component powers Add (empty) and Edit (hydrated).

### 10. Export (branded, no totals)
One branded template drives all three formats:
- **PDF** — print-ready, paper-white always (ignore dark mode). Minimal Crewplan branding: small logo + wordmark, one thin orange rule, quiet "Made with Crewplan" footer. Full times (`18:00–23:00`), grouped by role, U18 tag, "On leave" span. **No hours column, no cost, no totals.**
- **Excel** — via **SheetJS (`xlsx`)**, real cells (staff × days, times), not an image.
- **Image** — PNG of the same branded layout via html-to-canvas, for WhatsApp sharing.

---

# PART 2 — build when ready (DO NOT build now)

These are designed (see Part 2 in the reference file) but deferred. Leave the Settings → Account entries pointing at them as "coming soon" placeholders.

### P2.1 Integrations hub
Grouped by benefit (POS → forecast demand; Payroll → push hours; Calendar). Square & Xero = "coming soon" (roadmap). SumUp/QuickBooks = "Notify me" (demand signal). Google Calendar = connectable pattern shown. "Request an integration" collector. **Needs the actual integration work + OAuth per provider — post-MVP.**

### P2.2 Plan & billing
Current-plan card with **usage bars** (seats, venues — amber when maxed as an honest upgrade nudge), tier cards (Starter/Pro/Multi-site — placeholder pricing, swap in real), billing rows (payment method, invoices), understated Cancel. **Needs a payment provider — Stripe assumed (checkout + customer portal + webhooks). Pricing/limits are placeholders.** Plan-change actions (upgrade/downgrade/cancel) each need a **confirm step showing consequences**; downgrade must **guard the seat limit** (block if over) and apply at period end, not instantly.

---

## Build approach

- Extract tokens + shared components first, then build **Part 1 screen by screen**, verifying each on the deployed app before the next.
- Mobile-first throughout (managers use phones): horizontal-scroll where needed, thumb-sized controls, sticky action bars, sticky matrix name column.
- Accessibility: visible focus, `prefers-reduced-motion` respected (esp. the generate animation), OTP paste support.
- Wire real actions to existing endpoints; the reference uses placeholders.
- Keep `crewplan-manager-reference.html` in the repo as the living spec.
