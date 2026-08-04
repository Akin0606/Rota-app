-- Rota App: Initial Schema
-- Tables, indexes, and RLS policies for venues, staff, shifts, availability, and rota assignments.

create extension if not exists pgcrypto;

-- ============================================================
-- venues
-- ============================================================
create table if not exists venues (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    manager_email text not null unique,
    manager_id uuid references auth.users(id),
    created_at timestamptz not null default now()
);

create index if not exists idx_venues_manager_id on venues(manager_id);

-- ============================================================
-- shifts
-- ============================================================
create table if not exists shifts (
    id uuid primary key default gen_random_uuid(),
    venue_id uuid not null references venues(id) on delete cascade,
    name text not null,
    start_time text not null,
    end_time text not null,
    color text not null,
    sort_order integer not null default 0
);

create index if not exists idx_shifts_venue_id on shifts(venue_id);

-- ============================================================
-- staff_members
-- ============================================================
create table if not exists staff_members (
    id uuid primary key default gen_random_uuid(),
    venue_id uuid not null references venues(id) on delete cascade,
    name text not null,
    email text,
    phone text,
    role text not null,
    token text unique not null,
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

create index if not exists idx_staff_members_venue_id on staff_members(venue_id);
create index if not exists idx_staff_members_token on staff_members(token);

-- ============================================================
-- scheduling_rules
-- ============================================================
create table if not exists scheduling_rules (
    id uuid primary key default gen_random_uuid(),
    venue_id uuid not null unique references venues(id) on delete cascade,
    max_hours_per_week integer not null default 48,
    min_rest_hours integer not null default 11,
    avail_opens_day text not null default 'Saturday',
    avail_closes_day text not null default 'Wednesday',
    avail_closes_time text not null default '23:00',
    review_email_day text not null default 'Saturday',
    review_email_time text not null default '09:00'
);

create index if not exists idx_scheduling_rules_venue_id on scheduling_rules(venue_id);

-- ============================================================
-- availability_periods
-- ============================================================
create table if not exists availability_periods (
    id uuid primary key default gen_random_uuid(),
    venue_id uuid not null references venues(id) on delete cascade,
    week_start date not null,
    status text not null default 'collecting'
        check (status in ('collecting', 'closed', 'generated', 'confirmed', 'published')),
    created_at timestamptz not null default now(),
    unique (venue_id, week_start)
);

create index if not exists idx_availability_periods_venue_id on availability_periods(venue_id);
create index if not exists idx_availability_periods_status on availability_periods(status);

-- ============================================================
-- availability_submissions
-- ============================================================
create table if not exists availability_submissions (
    id uuid primary key default gen_random_uuid(),
    period_id uuid not null references availability_periods(id) on delete cascade,
    staff_id uuid not null references staff_members(id) on delete cascade,
    day_index integer not null check (day_index between 0 and 6),
    shift_id uuid references shifts(id),
    status integer not null default 0 check (status in (0, 1, 2, 3)),
    note text,
    submitted_at timestamptz not null default now(),
    unique (period_id, staff_id, day_index, shift_id)
);

create index if not exists idx_availability_submissions_period_id on availability_submissions(period_id);
create index if not exists idx_availability_submissions_staff_id on availability_submissions(staff_id);

-- ============================================================
-- rota_assignments
-- ============================================================
create table if not exists rota_assignments (
    id uuid primary key default gen_random_uuid(),
    period_id uuid not null references availability_periods(id) on delete cascade,
    staff_id uuid references staff_members(id),
    day_index integer not null check (day_index between 0 and 6),
    shift_id uuid references shifts(id),
    manually_assigned boolean not null default false,
    created_at timestamptz not null default now()
);

create index if not exists idx_rota_assignments_period_id on rota_assignments(period_id);
create index if not exists idx_rota_assignments_staff_id on rota_assignments(staff_id);

-- ============================================================
-- activity_log
-- ============================================================
create table if not exists activity_log (
    id uuid primary key default gen_random_uuid(),
    venue_id uuid not null references venues(id) on delete cascade,
    staff_id uuid references staff_members(id),
    action text not null,
    detail text,
    created_at timestamptz not null default now()
);

create index if not exists idx_activity_log_venue_id on activity_log(venue_id);
create index if not exists idx_activity_log_created_at on activity_log(created_at desc);

-- ============================================================
-- Row Level Security
--
-- Staff-facing endpoints are token-based (no Supabase auth session) and
-- are served by the backend using the service_role key, which bypasses
-- RLS entirely. The policies below protect direct/anon and authenticated
-- (manager) access so a manager can only ever see their own venue's data.
-- ============================================================

alter table venues enable row level security;
alter table shifts enable row level security;
alter table staff_members enable row level security;
alter table scheduling_rules enable row level security;
alter table availability_periods enable row level security;
alter table availability_submissions enable row level security;
alter table rota_assignments enable row level security;
alter table activity_log enable row level security;

-- venues: manager can read/write only their own venue row
create policy "venues_select_own" on venues
    for select using (manager_id = auth.uid());

create policy "venues_insert_own" on venues
    for insert with check (manager_id = auth.uid());

create policy "venues_update_own" on venues
    for update using (manager_id = auth.uid());

-- shifts: manager can manage shifts belonging to their venue
create policy "shifts_all_own_venue" on shifts
    for all using (
        venue_id in (select id from venues where manager_id = auth.uid())
    )
    with check (
        venue_id in (select id from venues where manager_id = auth.uid())
    );

-- staff_members
create policy "staff_members_all_own_venue" on staff_members
    for all using (
        venue_id in (select id from venues where manager_id = auth.uid())
    )
    with check (
        venue_id in (select id from venues where manager_id = auth.uid())
    );

-- scheduling_rules
create policy "scheduling_rules_all_own_venue" on scheduling_rules
    for all using (
        venue_id in (select id from venues where manager_id = auth.uid())
    )
    with check (
        venue_id in (select id from venues where manager_id = auth.uid())
    );

-- availability_periods
create policy "availability_periods_all_own_venue" on availability_periods
    for all using (
        venue_id in (select id from venues where manager_id = auth.uid())
    )
    with check (
        venue_id in (select id from venues where manager_id = auth.uid())
    );

-- availability_submissions (scoped via period -> venue)
create policy "availability_submissions_all_own_venue" on availability_submissions
    for all using (
        period_id in (
            select ap.id from availability_periods ap
            join venues v on v.id = ap.venue_id
            where v.manager_id = auth.uid()
        )
    )
    with check (
        period_id in (
            select ap.id from availability_periods ap
            join venues v on v.id = ap.venue_id
            where v.manager_id = auth.uid()
        )
    );

-- rota_assignments (scoped via period -> venue)
create policy "rota_assignments_all_own_venue" on rota_assignments
    for all using (
        period_id in (
            select ap.id from availability_periods ap
            join venues v on v.id = ap.venue_id
            where v.manager_id = auth.uid()
        )
    )
    with check (
        period_id in (
            select ap.id from availability_periods ap
            join venues v on v.id = ap.venue_id
            where v.manager_id = auth.uid()
        )
    );

-- activity_log
create policy "activity_log_all_own_venue" on activity_log
    for all using (
        venue_id in (select id from venues where manager_id = auth.uid())
    )
    with check (
        venue_id in (select id from venues where manager_id = auth.uid())
    );
