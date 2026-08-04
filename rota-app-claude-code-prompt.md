# Claude Code Prompt — Full-Stack Rota App Build

## REFERENCE DESIGN

Read the file `Rota_Prototype_dc.html` in this project folder. It's a Claude Design interactive prototype showing every screen, interaction, colour, layout, and state for this app. It uses a proprietary DCLogic framework — DO NOT copy the framework code. Instead, reverse-engineer the visuals, component structure, state logic, and UX flows into a real Next.js + FastAPI stack as described below.

---

## PROJECT OVERVIEW

Build a full-stack rota scheduling web app for small UK pubs and restaurants. The core loop is:

1. Manager shares ONE venue link in the staff WhatsApp group
2. Staff tap the link → enter their personal PIN (4-digit, auto-generated when manager adds them) → land on their availability form
3. Staff fill availability for the week → submit
4. OR-Tools solver auto-generates an optimised rota from availability
5. Every Saturday, the manager gets an email with a link to review the rota
6. Manager approves or tweaks → rota is emailed to all staff
7. Cycle repeats weekly

Two user types:
- **Staff**: No accounts, no login. ONE shared venue link + personal 4-digit PIN identifies and authenticates them. PIN is auto-generated when manager adds the staff member, and emailed to staff automatically. Manager can also view/copy/reset PINs from the team page.
- **Managers**: Magic-link email login via Supabase Auth. No passwords.

---

## TECH STACK

### Frontend (Next.js)
- **Framework**: Next.js 14 with App Router
- **Styling**: Tailwind CSS
- **UI**: Match the exact visual style from `Rota_Prototype_dc.html` — colours, spacing, border-radius, typography, shadows. The prototype uses: system-ui font, blue accent (#3b82f6), light grey backgrounds (#f3f4f6), 16px border-radius on cards, subtle 1px borders with rgba(0,0,0,0.04)
- **Responsive**: Mobile-first. Staff screens max-width 420px (phone). Manager screens: sidebar nav on desktop, bottom tab bar on mobile.
- **Auth**: Supabase Auth with magic-link email (managers only)
- **State**: React hooks + Supabase realtime subscriptions where useful
- **Hosting target**: Vercel

### Backend (FastAPI)
- **Framework**: Python 3.11+ with FastAPI
- **Database**: Supabase Postgres (use supabase-py client)
- **Solver**: Google OR-Tools CP-SAT for rota generation
- **Email**: Resend API for transactional emails (reminders, rota review, published rota)
- **Cron**: Scheduled endpoints triggered by Vercel Cron or Render cron
- **Hosting target**: Render

---

## DATABASE SCHEMA (Supabase Postgres)

Create these tables with proper foreign keys, indexes, and RLS policies:

### `venues`
- `id` UUID primary key (default gen_random_uuid())
- `name` text not null (e.g. "The Rose & Crown")
- `manager_email` text not null unique
- `manager_id` UUID references auth.users(id)
- `link_token` text unique not null (auto-generated short token for the shared venue URL, e.g. "rose-crown-a7x3". This is the ONE link the manager shares with all staff)
- `created_at` timestamptz default now()

### `shifts`
- `id` UUID primary key
- `venue_id` UUID references venues(id) on delete cascade
- `name` text not null (e.g. "Morning", "Evening")
- `start_time` text not null (e.g. "7:00am")
- `end_time` text not null (e.g. "2:00pm")
- `color` text not null (hex colour code)
- `sort_order` integer default 0

### `staff_members`
- `id` UUID primary key
- `venue_id` UUID references venues(id) on delete cascade
- `name` text not null
- `email` text (used to send them their PIN automatically)
- `phone` text
- `role` text not null (e.g. "Bartender", "Server", "Kitchen")
- `pin` text not null (auto-generated 4-digit PIN, unique within the venue. Used to identify AND authenticate staff when they tap the venue link. Generated on staff creation, emailed to staff automatically if email provided.)
- `is_active` boolean default true
- `created_at` timestamptz default now()
- Unique constraint on (venue_id, pin) — PINs must be unique within a venue

### `scheduling_rules`
- `id` UUID primary key
- `venue_id` UUID references venues(id) on delete cascade (unique, one row per venue)
- `max_hours_per_week` integer default 48
- `min_rest_hours` integer default 11
- `avail_opens_day` text default 'Saturday' (day of week availability window opens)
- `avail_closes_day` text default 'Wednesday' (day of week availability closes)
- `avail_closes_time` text default '23:00'
- `review_email_day` text default 'Saturday'
- `review_email_time` text default '09:00'

### `availability_periods`
- `id` UUID primary key
- `venue_id` UUID references venues(id) on delete cascade
- `week_start` date not null (Monday of the target week)
- `status` text default 'collecting' (enum: 'collecting', 'closed', 'generated', 'confirmed', 'published')
- `created_at` timestamptz default now()
- Unique constraint on (venue_id, week_start)

### `availability_submissions`
- `id` UUID primary key
- `period_id` UUID references availability_periods(id) on delete cascade
- `staff_id` UUID references staff_members(id) on delete cascade
- `day_index` integer not null (0=Mon, 6=Sun)
- `shift_id` UUID references shifts(id)
- `status` integer not null (0=unset, 1=available, 2=unavailable, 3=preferred)
- `note` text
- `submitted_at` timestamptz default now()
- Unique constraint on (period_id, staff_id, day_index, shift_id)

### `rota_assignments`
- `id` UUID primary key
- `period_id` UUID references availability_periods(id) on delete cascade
- `staff_id` UUID references staff_members(id)
- `day_index` integer not null
- `shift_id` UUID references shifts(id)
- `manually_assigned` boolean default false (true if manager overrode the solver)
- `created_at` timestamptz default now()

### `activity_log`
- `id` UUID primary key
- `venue_id` UUID references venues(id) on delete cascade
- `staff_id` UUID references staff_members(id) nullable
- `action` text not null (e.g. 'submitted_availability', 'rota_generated', 'rota_published')
- `detail` text
- `created_at` timestamptz default now()

---

## BACKEND API ENDPOINTS (FastAPI)

### Auth & Venue Setup
- `POST /api/auth/magic-link` — Trigger Supabase magic-link email
- `GET /api/venue` — Get current manager's venue details (auth required)
- `POST /api/venue` — Create venue during onboarding (auth required)
- `PUT /api/venue` — Update venue details (auth required)

### Shifts
- `GET /api/shifts` — List shifts for venue (auth required)
- `POST /api/shifts` — Create a shift
- `PUT /api/shifts/{id}` — Update a shift
- `DELETE /api/shifts/{id}` — Delete a shift

### Staff Management
- `GET /api/staff` — List all staff for venue (auth required). Response includes each staff member's PIN (visible to manager for sharing manually if email fails).
- `POST /api/staff` — Add a staff member (auto-generates unique 4-digit PIN within venue, emails PIN to staff if email provided)
- `PUT /api/staff/{id}` — Update staff member
- `DELETE /api/staff/{id}` — Soft-delete (set is_active=false)
- `POST /api/staff/{id}/reset-pin` — Generate a new PIN and email it to staff
- `POST /api/staff/remind` — Send reminder emails to staff who haven't submitted

### Availability (staff-facing — NO auth, venue link + PIN)
- `GET /api/availability/{venue_token}` — Get venue name + shift list for the PIN entry screen. Validates the venue link exists. Does NOT return any staff data yet.
- `POST /api/availability/{venue_token}/auth` — Staff submits their 4-digit PIN. Returns staff member info + current period + their existing submissions if PIN matches an active staff member at this venue. Returns error if PIN is wrong.
- `POST /api/availability/{venue_token}/submit` — Submit/update availability for the current period. Requires PIN in request body for authentication. Accepts {pin, submissions: [{day_index, shift_id, status, note}]}.
- `GET /api/availability/{venue_token}/rota` — Get published rota. Requires PIN as query param to identify staff member and highlight their shifts.
- `POST /api/availability/{venue_token}/forgot-pin` — Staff enters their email, system resends their PIN if email matches a staff member at this venue.

### Scheduling Rules
- `GET /api/rules` — Get scheduling rules for venue
- `PUT /api/rules` — Update scheduling rules

### Availability Periods
- `GET /api/periods` — List periods (current, upcoming, past)
- `POST /api/periods` — Create a new availability period for a week
- `PUT /api/periods/{id}/status` — Update period status

### Rota (manager-facing, auth required)
- `GET /api/rota/{period_id}` — Get the generated rota for a period
- `POST /api/rota/{period_id}/generate` — Trigger the OR-Tools solver to generate a rota
- `PUT /api/rota/{period_id}/assignments` — Manager edits: add/remove/move assignments
- `POST /api/rota/{period_id}/publish` — Confirm and publish the rota, trigger emails to all staff

### Activity Log
- `GET /api/activity` — Recent activity feed for the venue dashboard

### Cron / Scheduled Jobs
- `POST /api/cron/open-availability` — Opens the availability window for next week (runs weekly)
- `POST /api/cron/close-availability` — Closes the window, triggers solver (runs on the closes_day)
- `POST /api/cron/send-review-email` — Sends the Saturday review email to the manager
- `POST /api/cron/send-reminders` — Reminds staff who haven't submitted yet (runs day before deadline)

Protect cron endpoints with a shared secret header (CRON_SECRET env var).

---

## OR-TOOLS SOLVER (the core brain)

Build a module `solver.py` that:

1. Takes as input: list of staff (with roles), list of shifts, 7 days, availability matrix, scheduling rules
2. Creates a CP-SAT model where:
   - **Decision variable**: `assignments[staff_id, day, shift]` — boolean, 1 if assigned
   - **Hard constraints**:
     - Staff can only be assigned to a shift they marked available (status 1) or preferred (status 3)
     - Staff CANNOT be assigned when marked unavailable (status 2)
     - Max one shift per staff per day
     - Max hours per week per staff (from scheduling_rules)
     - Minimum rest hours between consecutive shifts
     - If "always need" rules exist (e.g. "1 Bartender per shift"), enforce them
   - **Soft constraints / objective (maximize)**:
     - Prefer assigning staff to shifts they marked as "preferred" (status 3) — weight 3
     - Prefer assigning staff to shifts they marked "available" (status 1) — weight 1
     - Spread shifts fairly across staff (minimize variance in total hours)
3. Solves and returns the assignment matrix
4. Handles edge cases: not enough staff for a shift (flag as conflict), no solution found (return partial + warnings)

Solver should complete in under 1 second for up to 25 staff × 7 days × 3 shifts.

---

## EMAIL TEMPLATES (Resend)

Build these email templates (clean HTML, mobile-friendly, matches app branding):

1. **Magic-link login** — "Here's your login link for [Venue Name]"
2. **Staff welcome / PIN delivery** — "Hi [Name], you've been added to [Venue Name]'s rota. Your personal PIN is [XXXX]. Use it at [venue link] to submit your availability each week. Keep this PIN private."
3. **PIN reset** — "Hi [Name], your PIN for [Venue Name] has been reset. Your new PIN is [XXXX]."
4. **Availability reminder** — "Hi [Name], please submit your availability for [Week]. Go to [venue link] and enter your PIN. Deadline: [Day, Time]"
5. **Manager review** — "Hi [Manager], your rota for [Week] is ready to review. [6/8 staff submitted]. [Link to review]. [One-click approve button]"
6. **Published rota (to staff)** — "Hi [Name], here's your rota for [Week]. You're working: [shift list]. [Link to full rota]. [Add to Calendar link]"
7. **Bulk reminder** — "Reminder: [X] staff haven't submitted availability yet. [Link to dashboard]"

---

## FRONTEND PAGES & ROUTING (Next.js App Router)

Match every screen from the prototype. The routing structure:

### Public (no auth — venue link + PIN)
- `/v/[venue_token]` — PIN entry screen. Shows venue name, PIN input (4 digits), submit button, and "Forgot PIN?" link. This is the ONE link the manager shares with all staff.
- `/v/[venue_token]/availability` — Staff availability form (shown after valid PIN entry. PIN stored in sessionStorage so staff don't re-enter on page refresh)
- `/v/[venue_token]/submitted` — Confirmation after submitting
- `/v/[venue_token]/rota` — Staff's published rota view (read-only, requires PIN)
- `/v/[venue_token]/forgot-pin` — "Enter your email" form to get PIN resent

### Manager Auth
- `/login` — Magic-link email input
- `/login/check-email` — "Check your email" confirmation screen

### Manager Dashboard (auth required, layout with sidebar/bottom nav)
- `/dashboard` — Main dashboard (status card, team grid, activity feed, stats)
- `/rota` — Rota builder/viewer (weekly grid, drag-to-assign, publish button)
- `/team` — Team management (list, add, edit, view/copy/reset PINs, remind)
- `/settings` — Venue details, shift config, scheduling rules, availability window

### Onboarding (auth required, first-time only)
- `/onboarding` — 4-step wizard:
  1. Venue name
  2. Define shifts (pre-filled Morning/Afternoon/Evening)
  3. Add team members (name, email, role — PIN auto-generated and emailed to each)
  4. "You're all set" + your single venue link to share in WhatsApp (copyable). Also shows a summary: "PINs have been emailed to [X] staff members"

### Components to build (reusable)
- `AvailabilityGrid` — The 7-day × N-shift tap-to-toggle grid (used in staff form)
- `RotaGrid` — Weekly calendar grid with staff rows and shift blocks (desktop)
- `RotaDayView` — Single-day swipeable view (mobile rota)
- `TeamStatusCard` — Avatar circles with submitted/pending badges
- `ShiftBadge` — Coloured pill showing shift name and time
- `StatusBanner` — Top-of-page status indicator (collecting/ready/confirmed/published)
- `BottomNav` — Mobile bottom tab bar (Dashboard/Rota/Team/Settings)
- `Sidebar` — Desktop sidebar navigation
- `Toast` — Floating notification toast
- `Modal` — Reusable modal (used for edit member, add member)
- `StepProgress` — Onboarding progress indicator (dots/bar)

---

## ENVIRONMENT VARIABLES

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Backend
DATABASE_URL=
RESEND_API_KEY=
CRON_SECRET=
FRONTEND_URL=http://localhost:3000

# App
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## FILE STRUCTURE

```
rota-app/
├── frontend/                    # Next.js app
│   ├── app/
│   │   ├── layout.tsx           # Root layout
│   │   ├── page.tsx             # Landing/redirect
│   │   ├── login/
│   │   │   ├── page.tsx         # Magic-link login
│   │   │   └── check-email/
│   │   │       └── page.tsx
│   │   ├── dashboard/
│   │   │   ├── layout.tsx       # Sidebar + bottom nav layout
│   │   │   ├── page.tsx         # Main dashboard
│   │   │   ├── loading.tsx
│   │   ├── rota/
│   │   │   └── page.tsx         # Rota builder
│   │   ├── team/
│   │   │   └── page.tsx         # Team management
│   │   ├── settings/
│   │   │   └── page.tsx         # Settings
│   │   ├── onboarding/
│   │   │   └── page.tsx         # 4-step wizard
│   │   └── v/
│   │       └── [venue_token]/
│   │           ├── page.tsx     # PIN entry screen
│   │           ├── availability/
│   │           │   └── page.tsx # Staff availability form (after PIN)
│   │           ├── submitted/
│   │           │   └── page.tsx
│   │           ├── rota/
│   │           │   └── page.tsx # Staff rota view
│   │           └── forgot-pin/
│   │               └── page.tsx # Forgot PIN form
│   ├── components/
│   │   ├── ui/                  # Reusable UI primitives
│   │   ├── availability-grid.tsx
│   │   ├── rota-grid.tsx
│   │   ├── rota-day-view.tsx
│   │   ├── team-status-card.tsx
│   │   ├── shift-badge.tsx
│   │   ├── status-banner.tsx
│   │   ├── bottom-nav.tsx
│   │   ├── sidebar.tsx
│   │   ├── toast.tsx
│   │   └── modal.tsx
│   ├── lib/
│   │   ├── supabase.ts          # Supabase client init
│   │   ├── api.ts               # API helper functions
│   │   └── utils.ts             # Date helpers, formatters
│   ├── tailwind.config.ts
│   ├── package.json
│   └── next.config.js
│
├── backend/                     # FastAPI app
│   ├── main.py                  # App init, CORS, middleware
│   ├── config.py                # Env vars, settings
│   ├── database.py              # Supabase client setup
│   ├── routers/
│   │   ├── auth.py              # Magic-link endpoints
│   │   ├── venue.py             # Venue CRUD
│   │   ├── shifts.py            # Shift CRUD
│   │   ├── staff.py             # Staff management + token generation
│   │   ├── availability.py      # Token-based availability endpoints
│   │   ├── rota.py              # Rota generation, editing, publishing
│   │   ├── rules.py             # Scheduling rules
│   │   ├── activity.py          # Activity log
│   │   └── cron.py              # Scheduled job endpoints
│   ├── services/
│   │   ├── solver.py            # OR-Tools CP-SAT rota solver
│   │   ├── email_service.py     # Resend email sending + templates
│   │   └── pin_service.py       # PIN generation (unique 4-digit within venue) + venue link token generation
│   ├── models/
│   │   └── schemas.py           # Pydantic request/response models
│   ├── requirements.txt
│   └── Dockerfile
│
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql  # All tables, indexes, RLS policies
│
└── README.md
```

---

## IMPLEMENTATION PRIORITIES

Build in this order:

1. **Database**: Run the migration, verify tables in Supabase
2. **Backend core**: FastAPI app shell, Supabase client, config, health check
3. **Staff availability flow**: Venue link + PIN auth → GET/POST availability endpoints → PIN entry screen → availability form frontend page. This is the first end-to-end feature you can test.
4. **Manager auth**: Magic-link login flow (frontend + backend)
5. **Onboarding wizard**: Create venue, define shifts, add team, generate links
6. **Dashboard**: Stats, team status, activity feed
7. **Solver**: OR-Tools module, generate endpoint, wire to rota page
8. **Rota builder**: Display generated rota, manual edit, publish
9. **Email notifications**: Resend templates, send on publish, reminders
10. **Cron jobs**: Weekly automation (open/close availability, trigger solver, email manager)
11. **Staff rota view**: Published rota page, "Add to Calendar" .ics generation
12. **Polish**: Loading states, error handling, edge cases, mobile refinement

---

## CRITICAL REQUIREMENTS

- Staff NEVER need an account. One shared venue link + their personal 4-digit PIN is all they need.
- PINs are auto-generated (unique within venue) when manager adds staff, and emailed automatically if email is provided. Manager can also view/copy PIN from the team page to share manually (e.g. via WhatsApp DM).
- "Forgot PIN" flow: staff enters their email on the venue page → PIN is resent if email matches.
- Manager can reset a staff member's PIN from the team page (generates new PIN, emails it).
- Manager onboarding creates the venue, shifts, and team in one flow. PINs are generated and emailed during onboarding.
- The availability grid must feel instant on mobile — no lag, large tap targets (min 44px).
- The solver must handle "not enough availability" gracefully — show warnings, not errors.
- All API responses should include proper error messages and HTTP status codes.
- CORS must be configured for the frontend domain.
- Supabase RLS policies should ensure managers can only see their own venue's data.
- Generate .ics calendar files when staff want to "Add to Calendar".
- Activity log tracks all meaningful actions for the dashboard feed.
- Mobile bottom nav shows on screens < 768px, sidebar shows on >= 768px.
