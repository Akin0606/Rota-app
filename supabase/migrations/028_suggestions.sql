-- Public suggestion box on the marketing site. Deliberately NOT folded into the
-- `waitlist` table: a waitlist row is a lead with a unique email that gets
-- invited exactly once, whereas a suggestion is free text that the same person
-- may send several times and that nobody is "invited" from. Overloading
-- waitlist would break its unique-email constraint and pollute the invite queue.
--
-- Email is optional on purpose — asking for it is the main reason people don't
-- send feedback, and an anonymous suggestion is still worth having. `status`
-- mirrors the waitlist's shape so the admin console can triage the same way.
create table if not exists suggestions (
    id uuid primary key default gen_random_uuid(),
    message text not null,
    email text,
    source text not null default 'landing',
    status text not null default 'new' check (status in ('new', 'read', 'actioned', 'archived')),
    created_at timestamptz not null default now()
);

create index if not exists suggestions_created_at_idx on suggestions (created_at desc);
create index if not exists suggestions_status_idx on suggestions (status);

-- Defense in depth only. The backend uses the service-role key (RLS bypassed),
-- same as every other table here; this policy exists so a direct anon/public
-- client can never read what people have written.
alter table suggestions enable row level security;
