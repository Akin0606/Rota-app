# Claude Design Prompt — Rota App Frontend

## What This Is

Design the complete frontend for a **hospitality rota web app** targeting small UK pubs and restaurants. The app auto-builds weekly rotas from staff availability — managers do almost nothing. Think "anti-Rotaready": radically simple, no feature bloat, one purpose done beautifully.

**Give me 3 distinct visual directions** (e.g. minimal/monochrome, warm/friendly, bold/modern) so I can mix and match elements I like. Each direction should cover every screen below.

---

## Tech Context (for realistic designs)

- **Framework**: Next.js (React) with Tailwind CSS
- **Auth**: Supabase magic-link email login (managers only)
- **Staff access**: No accounts — staff use unique tokenized URLs (no login screen for them)
- **Responsive**: Must work beautifully on mobile first (bar staff will use phones), desktop second
- **Database**: Supabase/Postgres

---

## The Two User Types

### 1. Staff (no account, no login)
They receive a unique link (shared in their WhatsApp group). They tap it, see their name, fill availability, done. Frictionless. No onboarding, no signup, no password.

### 2. Manager (magic-link login)
They log in via email link once a week. They see the auto-generated rota, approve or tweak it, and it gets sent to staff. That's their entire interaction.

---

## Screens to Design (in user flow order)

### A. Staff Availability Form (public, no auth)
- Staff taps their unique link → lands directly on their personal form
- Shows their name at the top and the venue name
- **Core interaction**: A weekly grid — days across the top (Mon–Sun), time slots or shift types down the side (Morning / Afternoon / Evening, or custom shift names the manager defined)
- Staff taps cells to toggle: Available (green) / Unavailable (red) / Preferred (gold star or highlight)
- Option to add a note per day (e.g. "can only do until 6pm")
- Big "Submit" button at the bottom
- Confirmation state after submit: friendly "You're all set" with a summary of what they submitted
- **Deadline indicator**: shows when availability closes (e.g. "Submit by Wednesday 11pm")
- Must feel instant and obvious on a phone — no scrolling confusion, no tiny tap targets

### B. Manager Magic-Link Login
- Simple email input → "We'll send you a login link"
- Email received → tap link → straight into dashboard
- No password fields, no signup form, no OAuth buttons

### C. Manager Dashboard (main screen after login)
- **This week's rota status** front and centre: a card/banner showing state — "Rota ready for review", "Awaiting staff availability (4/8 submitted)", "Rota confirmed & sent"
- **Quick stats**: staff who've submitted / total, days until deadline, any flagged conflicts
- **Team list**: small avatar/initial circles showing who's submitted (checkmark) and who hasn't (greyed out) — tappable to nudge/remind
- **Navigation** to: This Week's Rota, Team Management, Settings
- Should feel like a calm control panel, not a busy enterprise dashboard
- Consider a sidebar nav on desktop, bottom tab bar on mobile

### D. Rota View / Review Screen (the core manager screen)
- **Weekly calendar grid**: days across top, staff names down the left side, shifts shown as coloured blocks in the cells
- Colour-code by shift type (morning = blue, afternoon = amber, evening = purple — or similar)
- **Edit mode**: manager can drag-and-drop or tap to reassign shifts
- **Conflict warnings**: if someone is scheduled when unavailable, show a red warning badge on that cell
- **Approve button**: prominent "Confirm & Send Rota" button that triggers email to all staff
- **Hours summary**: small row at bottom showing total hours per employee for the week
- On mobile: consider a day-by-day swipeable view instead of the full grid (the grid won't fit on 375px)
- Empty state: "No rota generated yet — waiting for availability submissions"

### E. Published Rota (what staff receive via email link)
- Clean, read-only view of the confirmed rota
- Staff member sees their own shifts highlighted/prominent
- Full team rota visible below (so they know who they're working with)
- Option to "Add to Calendar" (generates .ics file)
- No login required — accessed via unique tokenized link

### F. Team Management Screen (manager only)
- List of all staff with: name, email/phone, role/position, status (active/inactive)
- "Add team member" button → simple form: name, email, phone, role
- Each staff member has a unique availability link shown (copyable) so manager can share it
- "Send reminder" button per person or bulk "Remind all who haven't submitted"
- Remove/deactivate staff member option

### G. Settings Screen (manager only)
- **Venue details**: pub/restaurant name, address
- **Shift configuration**: define shift types and times (e.g. "Morning 7am–2pm", "Evening 5pm–close")
- **Scheduling rules**: max hours per week per person, minimum rest between shifts, any always-needed roles
- **Notification preferences**: when to send the Saturday review email, when to auto-remind staff
- **Availability window**: which day availability opens and closes each week

### H. Onboarding Flow (first-time manager setup)
- 3–4 step wizard after first login:
  1. "What's your venue called?" (name + optional logo upload)
  2. "Define your shifts" (pre-filled with Morning/Afternoon/Evening defaults, editable)
  3. "Add your team" (bulk add names + emails/phones, or skip and add later)
  4. "You're set — here's your team's availability link to share"
- Should feel fast and encouraging, not bureaucratic

---

## Design Principles

1. **Mobile-first**: Bar staff and busy pub managers use phones. Every screen must be thumb-friendly
2. **Radical simplicity**: If a screen has more than 3 things competing for attention, it's too busy. One primary action per screen
3. **Warm and approachable**: This is for small independent pubs, not corporate chains. Avoid cold enterprise aesthetics
4. **Status visibility**: At every point, both staff and manager should know exactly what state things are in (submitted/pending/confirmed)
5. **Speed**: No unnecessary loading states, transitions, or intermediate screens. Link → form → done

---

## Visual Direction Requests (give me 3 options)

### Option 1: "Clean & Calm"
- Muted colour palette (soft whites, light greys, one accent colour)
- Generous whitespace, rounded corners, subtle shadows
- Think: Linear, Notion, or Calmly
- Typography: Inter or similar clean sans-serif

### Option 2: "Warm & Friendly"  
- Warmer tones (creams, terracotta, forest green accents)
- Slightly more personality — friendly illustrations or icons
- Think: Mailchimp, Gusto, or a cosy pub menu board gone digital
- Typography: Something with a bit of character (DM Sans, Plus Jakarta Sans)

### Option 3: "Bold & Modern"
- Higher contrast, darker option available (dark mode by default?)
- Vibrant accent colours against dark or very light backgrounds
- Think: Vercel, Linear dark mode, or Raycast
- Typography: Tight, modern (Geist, Space Grotesk)

---

## What I Need Delivered

For each of the 3 visual directions:
- All 8 screens above (A through H) designed at **mobile (375px)** and **desktop (1440px)** widths
- Interactive prototype showing the main staff flow (link → form → submit → confirmation) and main manager flow (login → dashboard → review rota → confirm)
- A small component library / design system showing: buttons, input fields, cards, the calendar grid component, status badges, colour palette, typography scale
- Light mode + dark mode for at least one direction

---

## Inspiration References

Study these apps for UX patterns (not to copy, but to understand why they work):
- **When I Work** — clean availability grid UX
- **7shifts** — restaurant scheduling done well on mobile
- **Homebase** — simple SMB scheduling
- **Linear** — for UI polish and minimalism
- **Calmly** — for the "calm dashboard" feel

The competitive advantage is NOT more features — it's fewer features done with zero friction. Design accordingly.
