-- Close an RLS gap that exposed six application tables to the public internet.
--
-- These tables shipped in earlier migrations WITHOUT `enable row level
-- security`, while the Supabase `anon` role kept its default SELECT/INSERT
-- grant on everything in the `public` schema. The anon key is not a secret —
-- it ships in the frontend bundle (NEXT_PUBLIC_SUPABASE_ANON_KEY) — so every
-- one of these tables was directly readable AND writable by anyone on the
-- internet via the Supabase REST API (`/rest/v1/<table>`), with no login.
--
-- The worst of them, onboarding_tokens, combined with POST
-- /api/onboarding/activate (which mints a real manager session for the email on
-- a token row) gave unauthenticated takeover of any manager account: read a
-- live token, or INSERT a forged row for a target email and then activate it.
-- admin_audit leaked/allowed tampering with the only admin accountability
-- trail; shift_swaps / shift_days / roles / staff_roles leaked and allowed
-- writes to cross-tenant scheduling data.
--
-- The fix is RLS ON with NO policy. Every legitimate access to these tables is
-- through the backend's service-role key, which bypasses RLS entirely. RLS-on +
-- no-policy therefore means: closed to anon/authenticated, unchanged for the
-- backend. This is exactly how `suggestions` and `waitlist` are already
-- (correctly) configured. Do NOT add a permissive policy — there is no
-- anon/authenticated code path that reads these directly (the frontend uses the
-- Supabase client for auth only; it never queries tables).
--
-- Idempotent: `enable row level security` is safe to re-run.

alter table onboarding_tokens enable row level security;
alter table admin_audit       enable row level security;
alter table shift_swaps       enable row level security;
alter table shift_days        enable row level security;
alter table roles             enable row level security;
alter table staff_roles       enable row level security;

-- Internal bookkeeping table (written by scripts/migrate.py as the DB owner,
-- read by /health via the service-role key) — both bypass RLS, so enabling it
-- here only removes the pointless public grant.
alter table schema_migrations enable row level security;
