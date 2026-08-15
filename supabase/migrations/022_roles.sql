-- ============================================================
-- Roles as first-class, venue-configurable entities (+ multi-role staff)
-- ------------------------------------------------------------
-- Until now roles were a hardcoded frontend constant (STAFF_ROLES) mirrored
-- into staff_members.role as a single free-text string. This makes them real:
--
--   * `roles`        — one row per role a venue offers (name + icon).
--   * `staff_roles`  — many-to-many "who can work this role" (eligibility).
--
-- Deliberately NON-BREAKING: staff_members.role stays as the primary/display
-- role (matrix grouping, exports, open-shift claim gating all keep reading it
-- untouched). staff_roles is additive eligibility on top. Nothing here feeds
-- the solver yet — the per-role solver rules (keyholder, under-18 gate) need
-- role-based shift coverage first, so their columns are intentionally NOT
-- added until that work lands, rather than shipping dead schema.
-- ============================================================

create table if not exists roles (
    id uuid primary key default gen_random_uuid(),
    venue_id uuid not null references venues(id) on delete cascade,
    name text not null,
    icon text not null default 'users',
    sort_order integer not null default 0,
    created_at timestamptz not null default now(),
    unique (venue_id, name)
);

create index if not exists idx_roles_venue_id on roles(venue_id);

create table if not exists staff_roles (
    staff_id uuid not null references staff_members(id) on delete cascade,
    role_id uuid not null references roles(id) on delete cascade,
    primary key (staff_id, role_id)
);

create index if not exists idx_staff_roles_role_id on staff_roles(role_id);

-- ------------------------------------------------------------
-- Seed. Idempotent (on conflict do nothing) so re-running is safe.
-- ------------------------------------------------------------

-- 1. The familiar default palette for every venue, so the role picker reads
--    exactly as it did when STAFF_ROLES was hardcoded.
insert into roles (venue_id, name, icon, sort_order)
select v.id, d.name, d.icon, d.sort_order
from venues v
cross join (values
    ('Bartender', 'glass', 0),
    ('Server',    'user',  1),
    ('Kitchen',   'chef-hat', 2),
    ('Host',      'users', 3),
    ('Manager',   'star',  4)
) as d(name, icon, sort_order)
on conflict (venue_id, name) do nothing;

-- 2. Any role string actually in use that isn't one of the defaults (a venue
--    that typed its own), so no existing staff member is left role-less.
insert into roles (venue_id, name, icon, sort_order)
select distinct s.venue_id, s.role, 'users', 9
from staff_members s
where coalesce(s.role, '') <> ''
on conflict (venue_id, name) do nothing;

-- 3. Link every staff member to their current primary role as an eligible role.
insert into staff_roles (staff_id, role_id)
select s.id, r.id
from staff_members s
join roles r on r.venue_id = s.venue_id and r.name = s.role
on conflict do nothing;
