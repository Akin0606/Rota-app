# Crewplan — Agent Guide

Rota scheduling web app for small independent UK pubs & restaurants.
Core loop: staff submit availability via PIN → solver auto-generates rota
→ manager approves → confirmed rota emails to staff. Radical simplicity is
the product. We are NOT competing with Deputy/Rotaready.

## Stack
- Frontend: Next.js 14 (App Router) + Tailwind → Vercel (rota-app-mu.vercel.app)
- Backend: FastAPI + APScheduler → Render (rota-app-ugee.onrender.com)
- DB/Auth: Supabase Postgres. Managers = OTP login, staff = 4-digit PIN
- Solver: Google OR-Tools CP-SAT
- Email: Resend
- Admin: /admin, gated by ADMIN_SECRET header
- Repo: github.com/Akin0606/Rota-app

## Working rules
- Build ONE priority batch at a time. Verify before moving on.
- Sequential, verified increments — never generate everything at once.
- Never touch the auth flow (OTP / PIN) without flagging it first.
- Format Claude Code prompts in markdown (headers, code blocks, hr).
- Explain alongside implementation — this is a learning project.

## Brand
- Wordmark: `crewplan.` lowercase, orange dot
- Palette: #0D0D0D / #FF4D00 / off-white
- Type: Space Grotesk (headings) + IBM Plex Sans (body)

## Current priority
B2b: 1-day-off-in-7 rule (with manager override + risk popup) and
under-18 staff handling with differentiated rest rules.

## Roadmap after B2b
Staff hub restructure (tiles: availability/holiday/swap/drop) →
shift swap + drop (auto-approve like-for-like, else manager approval) →
holiday requests → admin console controls (venue toggle, delete, rota view)
→ full aesthetic pass last.

## Known bugs
- "Send code" button fails silently for unregistered emails (no error shown)
- No way to create managers from admin console without editing Supabase manually

## Learnings (append after each session — most recent first)
- Under-18 rules are hardcoded non-toggleable legal minimums; adult rule breaches are warn-and-confirm (manager discretion), under-18 breaches are hard-blocked everywhere.
- Compliance must be enforced at EVERY write path, not just the solver — the manual "+Add" endpoint bypassed all constraints until guarded.
- _rest_gap_hours must use unrolled shift-end (_shift_bounds) for midnight-crossing shifts; raw end_time silently defeats the rest check.
- Backend uses the service-role key (RLS bypassed), so every staff/shift lookup MUST be explicitly venue-scoped — nothing else catches a leak.
- Known gap for later: no manager-facing "clear a submission" control; stale availability rows can't be removed from the UI.
- Migrations now auto-apply on deploy via backend/scripts/migrate.py over DATABASE_URL — never paste SQL into Supabase again. Just add a numbered file to supabase/migrations/ and push.
- Render build context must be repo root (Root Directory blank, Dockerfile Path backend/Dockerfile, Build Context ".") so the Dockerfile can COPY both backend/ and supabase/. Changing Render settings and Dockerfile paths must happen in the same commit or the build breaks.
- Magic-link auth breaks in Gmail/Mail in-app browsers (PKCE failure) → OTP only
- Per-staff tokenized URLs add too much complexity → single shared venue link + PIN
- Controlled pilot onboarding (waitlist + admin invite) beats public self-serve signup
