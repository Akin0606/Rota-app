-- Rota App: Automated 72-hour notice window
-- Replaces the manually-set availability-window datetimes with a formula that
-- recalculates every week:
--   close(week) = that week's earliest shift start - (72h legal min + buffer)
--   open        = close - open_offset_hours
--   reminder    = close - reminder_offset_hours
-- Nothing is stored per-week except optional manual overrides (below); the three
-- trigger points are derived on the fly from the shift definitions.

-- Offsets for the notice window (all in hours). Sensible defaults so existing
-- venues keep a familiar cadence without any manager action.
alter table scheduling_rules
    add column if not exists notice_buffer_hours   integer not null default 6,   -- safety margin on top of the 72h legal minimum
    add column if not exists open_offset_hours     integer not null default 144, -- availability opens 6 days before close
    add column if not exists reminder_offset_hours integer not null default 24;  -- reminder nudge 24h before close

-- Per-week manual close-time overrides. When present, this close time is used
-- for that one week instead of the formula; open/reminder still derive from it.
-- Stored as a naive Europe/London wall-clock value, matching avail_*_at.
create table if not exists schedule_week_overrides (
    id uuid primary key default gen_random_uuid(),
    venue_id uuid not null references venues(id) on delete cascade,
    week_start date not null,
    close_at timestamp not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (venue_id, week_start)
);

create index if not exists idx_schedule_week_overrides_venue on schedule_week_overrides(venue_id);

alter table schedule_week_overrides enable row level security;

-- Managers reach this only through the backend (service_role, bypasses RLS);
-- this policy just mirrors the other tables so any direct/authenticated access
-- stays scoped to the manager's own venue.
create policy "schedule_week_overrides_all_own_venue" on schedule_week_overrides
    for all using (
        venue_id in (select id from venues where manager_id = auth.uid())
    )
    with check (
        venue_id in (select id from venues where manager_id = auth.uid())
    );
