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
Staff hub restructure (done) → shift drop + claim (done: auto-approve
like-for-like, else manager approval queue) → give shift (done: targeted
1:1 offer) → swap shift (done: two-sided trade, own shift_swaps table,
worse-case-governs approval) → holiday requests → admin console controls
(venue toggle, delete, rota view) → full aesthetic pass last.

Future (not scheduled): a real notification system (email/push) for shift
claims and approvals — right now managers only see these via activity_log
("Recent Activity" on the dashboard), and claimers/droppers only find out
by reopening the app.

## Known bugs
- "Send code" button fails silently for unregistered emails (no error shown)
- No way to create managers from admin console without editing Supabase manually

## Learnings (append after each session — most recent first)
- Provisional/Confirmed rota status live and verified, no migration needed (`confirmed` was reserved in the status check constraint since day one, unused). `publish()` now checks `notice_window.close_for_week` at publish time: window still open → status stays `published` but reads as "Provisional" everywhere (banner recolored amber, was reused as "Published" before); window already closed → straight to `confirmed`. A background sweep (`confirm_published_periods_for_venue`, called from `cron_scheduler.refresh_jobs()`) promotes provisional→confirmed once the window closes on an already-published period — deliberately NOT a precise one-shot timer, since APScheduler jobs are in-memory only and don't survive a Render restart; the sweep self-heals on every startup instead. Live-confirmed this actually matters: the redeploy for this batch woke the sweep, and it promoted two real provisional periods (weeks of 3 Aug and 10 Aug) the instant the process restarted.
- Real bug this batch fixed: `_get_published_period()` only ever matched `status == "published"`, so the moment a period flipped to `confirmed` every staff-facing action (drop/claim/give/swap, 8 endpoints total, all fed by this one function) would have silently lost visibility into it. Fixed to match both statuses. Staff rota page (`/v/[venue_token]/rota`) had zero status indicator before this batch — added `StatusBanner` there too, confirmed live via a staff PIN login.
- Notification bell live and verified: activity_log reused directly, no new tables/RLS. Staff feed via allowlisted GET, localStorage-based last-seen badge.
- Known cosmetic bug (pre-existing, unrelated to this batch): manager dashboard's describeAction default branch double-prints the actor name for drop/give/swap rows (e.g. "Paulina B Paulina B dropped..."). Staff feed does NOT have this bug — confirmed live. Fix in the aesthetic pass (batch E).
- Swap Shift live and verified: propose/auto-accept/confirm-path/under-18 block/decline/same-day-swap/manager approve+reject/cross-guard all confirmed on the deployed app.
- Foreign keys referencing rota_assignments need explicit ON DELETE CASCADE, or a resolved swap permanently blocks deleting that assignment — surfaces as an opaque "Failed to fetch" with no real error. Check for this pattern on any future table linking back to rota_assignments.
- The three staff shift-actions (Give, Swap, Drop) are all complete and live as of this session.
- Rota-shaping venue rules (max_hours_per_week, min_rest_hours, per-shift min/max staff) now live only in Scheduler — removed from Settings, which keeps shift identity (name/time) only. All three backend PUT endpoints (rules, shifts) already did `exclude_unset` partial updates, so splitting the edit surfaces across two pages needed zero backend changes — just moved which page calls which existing endpoint. Live-verified on deployed app: edits in Scheduler persist and vanish from Settings; Settings' shift row keeps a read-only "X–Y staff" summary with a link to Scheduler. Also closed a real gap: check_manual_assignment never checked max_hours_per_week for adults, so a manual "+Add" could silently push someone over their weekly cap — added as a confirm-gated check (same pattern as rest-gap/day-off), live-verified via a real breach (12h cap, 4th 4h shift → correct "16.0h, over the venue's 12h weekly limit" popup, cancelled and cleaned up test data after).
- The manual-add risk popup's title ("This assignment breaks a rest rule") is a generic string now reused for three different confirm reasons (rest-gap, day-off-in-7, max-hours) — it should eventually say which rule actually triggered. Flagged for a future light-polish batch, not now.
- Drop Shift (parts 1+2) is live and verified end-to-end: drop → pool → claim, auto-approve (like-for-like), pending (role mismatch/rest-rule breach), manager approve, manager reject-back-to-pool (confirmed re-claimable by a different staff member after), and the under-18 hard-block on claim (never even reaches pending) — all confirmed on the deployed app.
- Manager notification for claims/approvals is activity_log only ("Recent Activity" on the dashboard) — no email/push yet. Future work, not this batch.
- Loose end: the already-passed guard on drop (can't drop a shift whose day has already gone by) is code-reviewed only, not live-verified — staff-facing requests always resolve to the single latest published period by week_start, and publishing a later test period during this session's testing permanently superseded the one with a past day, with no unpublish path to undo it. Live-verify this first thing in a future session, before publishing any other period.
- Bug pattern caught mid-session: added claim_staff_id to the StaffRotaAssignmentOut schema and to the DB column, but forgot to add it to the actual .select(...) in the shared _build_staff_rota query helper — it always serialized as null despite being set correctly in the DB. Always re-check that a new column is selected in every shared query helper that returns it, not just that it's written and present in the schema.
- Managers can now view actual submitted availability per week (read-only staff × day grid on the Rota page), not just a submitted/pending flag — and can clear a stale staff submission (whole-period, venue-scoped, confirm-gated).
- Pattern: destructive endpoints (clear submission, edit assignment) return the recomputed summary directly in their response, so the frontend updates conflict counts/state live without a second round-trip or manual reload.
- Under-18 rules are hardcoded non-toggleable legal minimums; adult rule breaches are warn-and-confirm (manager discretion), under-18 breaches are hard-blocked everywhere.
- Compliance must be enforced at EVERY write path, not just the solver — the manual "+Add" endpoint bypassed all constraints until guarded.
- _rest_gap_hours must use unrolled shift-end (_shift_bounds) for midnight-crossing shifts; raw end_time silently defeats the rest check.
- Backend uses the service-role key (RLS bypassed), so every staff/shift lookup MUST be explicitly venue-scoped — nothing else catches a leak.
- Migrations now auto-apply on deploy via backend/scripts/migrate.py over DATABASE_URL — never paste SQL into Supabase again. Just add a numbered file to supabase/migrations/ and push.
- Render build context must be repo root (Root Directory blank, Dockerfile Path backend/Dockerfile, Build Context ".") so the Dockerfile can COPY both backend/ and supabase/. Changing Render settings and Dockerfile paths must happen in the same commit or the build breaks.
- Magic-link auth breaks in Gmail/Mail in-app browsers (PKCE failure) → OTP only
- Per-staff tokenized URLs add too much complexity → single shared venue link + PIN
- Controlled pilot onboarding (waitlist + admin invite) beats public self-serve signup
