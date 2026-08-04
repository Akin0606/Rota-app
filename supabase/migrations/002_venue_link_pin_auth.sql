-- Rota App: Move staff auth from per-staff token links to a single
-- venue link + personal 4-digit PIN.

-- ============================================================
-- venues: add link_token (the ONE shared link for all staff)
-- ============================================================
alter table venues add column if not exists link_token text;

update venues
set link_token = lower(substr(md5(random()::text || id::text), 1, 10))
where link_token is null;

alter table venues alter column link_token set not null;

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'venues_link_token_key'
    ) then
        alter table venues add constraint venues_link_token_key unique (link_token);
    end if;
end $$;

create index if not exists idx_venues_link_token on venues(link_token);

-- ============================================================
-- staff_members: add pin, drop token
-- ============================================================
alter table staff_members add column if not exists pin text;

update staff_members
set pin = lpad(floor(random() * 10000)::int::text, 4, '0')
where pin is null;

alter table staff_members alter column pin set not null;

alter table staff_members drop constraint if exists staff_members_token_key;
drop index if exists idx_staff_members_token;
alter table staff_members drop column if exists token;

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'staff_members_venue_pin_key'
    ) then
        alter table staff_members add constraint staff_members_venue_pin_key unique (venue_id, pin);
    end if;
end $$;
