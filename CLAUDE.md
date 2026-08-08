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
- Swap Shift is live and verified end-to-end on the deployed app: propose → auto-accept (both sides "ok"), confirm-needed path (engineered a real 15h rest-gap breach — one side of the swap under 16h min rest), under-18 hard-block (recipient into a night-touching shift, swap correctly left untouched/still pending_response afterward — not silently mutated), decline, same-day swap (two people trading different shifts on the SAME day — the exact bug caught at plan stage, confirmed both rows survive and flip correctly, neither wrongly deleted), manager approve (needs_confirm → confirm=true → approved), manager reject (no-op on rota_assignments, confirmed via UI), and the cross-guard itself (both staff drop_shift and manager edit_assignment remove correctly blocked with a clear message when the target shift has a pending swap).
- Real bug caught live (not by code review): `shift_swaps.initiator_assignment_id`/`recipient_assignment_id` referenced `rota_assignments(id)` with the default NO ACTION instead of CASCADE. Once any rota_assignments row had EVER been part of a swap — even one long resolved (approved/declined/rejected) — it became permanently undeletable: Postgres blocked the delete with an FK violation, which surfaced to the browser as an opaque "TypeError: Failed to fetch" (no CORS headers on the error response), not a visible error message. Fixed via migration 016 adding `on delete cascade` to both FKs, matching the `rota_assignments_staff_id_fkey` precedent in 008_delete_cascades.sql. Lesson: any new FK referencing rota_assignments(id) needs an explicit cascade decision — the default silently breaks future deletes of the referenced row, and the failure mode in the browser gives no hint what actually went wrong.
- Also caught live: the hub's tile grid still had a standalone "🔄 Swap a Shift — Coming soon" tile after Swap shipped, since Swap (like Give) lives inside the Drop page rather than getting its own route. Fixed by relabeling the Drop tile to "Drop or Swap a Shift" and removing the stale one. Pattern to remember: when a "Coming soon" feature ships, explicitly check TILES/nav arrays for its placeholder — it's easy to build the feature and forget the entry point still says it doesn't exist.
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
