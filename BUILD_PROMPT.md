# Claude Code Prompt — Staff-Side UI Rebuild

## Context

Rebuilding the Crewplan staff hub and its five sub-screens with a new design language. A reference HTML file (`crewplan-staff-reference.html`) is attached — it contains all six screens as working, styled, interactive HTML. **This file is the visual source of truth: match it exactly** (colours, spacing, radii, typography, interactions). Your job is to port it faithfully into our stack, not to redesign it.

Before starting, read `/mnt/skills/public/frontend-design/SKILL.md` and follow it.

## Stack

- Next.js 14 (app router) + Tailwind, existing repo
- Staff screens are PIN-routed — no accounts, no auth context. Preferences live client-side only.

## Screens to build

1. **Staff hub** — greeting, venue strip, 5 tiles (hero "Submit availability" spans full width + 4 half-tiles: My shifts, Drop/give/swap, My hours, Time off)
2. **My shifts** — vertical timeline of the week, working days accent-tinted, colleague avatars, tappable through to drop/give/swap
3. **Availability submission** — 7 days × 3 slots, three-state cycle (available / if needed / can't work), "All day" shortcut, progress bar
4. **Drop / give / swap** — select a shift (progressive disclosure), then 3 action tiles; pending-swap card
5. **My hours** — hero card (hours + pay estimate), progress-to-target bar, shift breakdown, day-off rows dimmed
6. **Time off** — allowance strip (remaining / booked / pending), request button, request list with green/amber status

## Design tokens (extract into Tailwind config / CSS vars — do not hardcode per component)

**Dark (default)**
- bg `#0D0D0D` · card `#141414` · card-hover `#1A1A1A`
- border `rgba(255,255,255,0.07)` · text `#F0EFE9` · text-dim `#7A7A75` · text-faint `#4A4A47`

**Light**
- bg `#FAF9F5` · card `#FFFFFF` · card-hover `#FDFCF8`
- border `rgba(0,0,0,0.08)` · text `#1A1815` · text-dim `#78766F` · text-faint `#A8A69E`

**Shared**
- accent `#FF4D00` · accent-soft `rgba(255,77,0,0.12)` (dark) / `rgba(255,77,0,0.08)` (light)
- status green `#2ECC71` · amber `#E5A800` (each with a ~0.14 soft bg)
- radius: cards 12–14px, controls 8–11px, pills/toggles fully rounded
- borders always 0.5px
- two font weights only: 400 body, 500 medium. Sentence case everywhere.
- transitions: 0.2s on hover/interaction, 0.35s on the mode change

## Light / dark toggle

- Sun/moon knob toggle, top-right of every screen (see reference)
- Persist choice in `localStorage`, keyed to the venue PIN link (e.g. `crewplan-theme:{venueSlug}`) since there are no accounts
- On load, read the stored value before first paint to avoid a flash; default to dark
- Apply via a `.light` class (or `data-theme`) on the screen root — all tokens flip off that

## Recurring components to factor out (used across screens)

- `ModeToggle` — the sun/moon switch + persistence
- `CalendarBlock` — the day-of-week + date-number stack (My shifts, Drop/give/swap, My hours)
- `ProgressBar` — thin accent fill on a track (availability completion, hours-to-target)
- `StatusBadge` — green approved / amber pending pill
- `MetricCard` — small label + large number (hours hero, time-off allowance)
- `BackButton` — appears on all five sub-screens

## Data model note (availability)

The three-state slot must serialise cleanly for the solver: send `available` | `if_needed` | `unavailable` per (day, slot), **not** a binary. The amber "if needed" is a soft signal — keep it distinct in the payload.

## Interaction behaviours to preserve

- **Availability:** tap a slot to cycle states; "All day" sets all three slots of that day to available; progress bar counts days touched
- **Drop/give/swap:** action tiles are dimmed + disabled until a shift is selected
- **My shifts:** working days get the accent tint on the date node; each shift taps through to the drop/give/swap flow
- **Buttons that trigger a real action** stay wired to your existing endpoints — the reference uses placeholders

## Deliverables

- Reusable token setup + the shared components above
- Six screens as components/pages
- Responsive to mobile (staff use phones); visible keyboard focus; `prefers-reduced-motion` respected
- Build one screen fully (hub), let me verify on the deployed app, then continue with the rest
