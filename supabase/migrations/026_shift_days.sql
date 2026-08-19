-- ============================================================
-- Real per-day shift model — shift_days table + total backfill
-- ------------------------------------------------------------
-- Batch 1 of SHIFT_MODEL_BUILD_PROMPT.md. Behaviour-neutral: this only adds
-- the table and backfills it so every existing (shift, day) has a concrete
-- row. Nothing reads shift_days yet — the shared accessor lands in the same
-- batch but falls back to shifts.* until Batch 2 routes reads through it.
--
--   Row present for (shift_id, day_index) => the shift runs that day.
--   Row absent                            => it does not (a closed day).
--
-- `shifts` stays the identity anchor (name, color, sort_order) and keeps its
-- single start_time/end_time/min_staff/max_staff as the migration fallback.
-- ============================================================

create table if not exists shift_days (
    id uuid primary key default gen_random_uuid(),
    shift_id  uuid not null references shifts(id) on delete cascade,
    day_index integer not null check (day_index between 0 and 6),
    start_time text not null,
    end_time   text not null,
    min_staff  integer not null default 1,
    max_staff  integer not null default 2,
    unique (shift_id, day_index),
    check (min_staff >= 0 and max_staff >= 1 and max_staff >= min_staff)
);

create index if not exists idx_shift_days_shift_id on shift_days(shift_id);

-- ------------------------------------------------------------
-- Total backfill: 7 rows (day_index 0-6) per existing shift, copying its
-- current times/staffing. Idempotent via on conflict do nothing, so re-running
-- the migration never duplicates or clobbers hand-edited per-day rows.
--
-- `end_time = 'close'` is free text with no measurable duration — the solver
-- silently reads it as 23.0 today, which under-reports any later evening close.
-- Resolve it here to a concrete '11:00pm': defensible because it equals the old
-- silent 23.0 and is never shorter, so it cannot NEWLY under-report. Venues
-- carrying a 'close' are flagged below for the Batch 5 onboarding re-capture,
-- where the manager enters the real close time.
-- ------------------------------------------------------------
insert into shift_days (shift_id, day_index, start_time, end_time, min_staff, max_staff)
select
    s.id,
    d.day_index,
    s.start_time,
    case when lower(trim(s.end_time)) = 'close' then '11:00pm' else s.end_time end,
    coalesce(s.min_staff, 1),
    coalesce(s.max_staff, 2)
from shifts s
cross join generate_series(0, 6) as d(day_index)
on conflict (shift_id, day_index) do nothing;

-- ------------------------------------------------------------
-- Flag venues whose shifts used 'close' so Batch 5 onboarding can prompt them
-- to enter real close times (the '11:00pm' above is a safe placeholder, not a
-- captured value).
-- ------------------------------------------------------------
alter table venues
    add column if not exists needs_shift_recapture boolean not null default false;

update venues v
set needs_shift_recapture = true
where exists (
    select 1 from shifts s
    where s.venue_id = v.id and lower(trim(s.end_time)) = 'close'
);
