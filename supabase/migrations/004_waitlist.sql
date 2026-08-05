-- Crewplan: public waitlist signups from the marketing landing page.

create table if not exists waitlist (
    id uuid primary key default gen_random_uuid(),
    venue_name text not null,
    email text not null,
    status text not null default 'pending',
    created_at timestamptz not null default now()
);

-- One signup per email — the API turns a duplicate into a friendly message.
do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'waitlist_email_key'
    ) then
        alter table waitlist add constraint waitlist_email_key unique (email);
    end if;
end $$;

create index if not exists idx_waitlist_created_at on waitlist(created_at desc);

-- Only the backend (service role) touches this table; deny all direct
-- anon/authenticated access so signup emails can't be scraped via the anon key.
alter table waitlist enable row level security;
