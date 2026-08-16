-- Onboarding activation loop (§1). Two additions:
--
--  1. onboarding_tokens — our OWN one-time, expiring activation token. The
--     accept email links to /onboarding?token=… and the backend validates it
--     server-side, then mints a Supabase session via the Admin API. This
--     deliberately avoids a Supabase magic link, whose PKCE code-exchange fails
--     in the Gmail/Mail in-app browser (documented failure in this project).
--
--  2. venues.setup_state — server-side save-and-resume. Holds the wizard's
--     progress ({"step": N} while in-flight, {"completed": true} when done) so a
--     manager pulled away mid-setup resumes where they stopped. NULL on an
--     existing/legacy venue means "already onboarded" — those skip to the app.
create table if not exists onboarding_tokens (
    id uuid primary key default gen_random_uuid(),
    email text not null,
    token text not null unique,
    expires_at timestamptz not null,
    used_at timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists onboarding_tokens_token_idx on onboarding_tokens (token);

alter table venues
    add column if not exists setup_state jsonb;
