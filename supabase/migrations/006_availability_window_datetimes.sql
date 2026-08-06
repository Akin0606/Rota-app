-- Rota App: Real datetimes for the availability window
-- Replaces the day-of-week scheduling logic with three concrete trigger points
-- (opens / reminder / closes), stored as naive Europe/London wall-clock values.
-- The legacy avail_*_day / avail_*_time columns are kept for backward-compat
-- (staff-facing deadline copy) but are no longer the source of truth.

alter table scheduling_rules
    add column if not exists avail_opens_at    timestamp,
    add column if not exists avail_reminder_at timestamp,
    add column if not exists avail_closes_at   timestamp;

-- Backfill existing venues so nothing is left null/broken. Each gets the next
-- Saturday 06:00 (opens), the following Wednesday 23:00 (closes) and the Tuesday
-- before at 10:00 (reminder), computed from the current date.
update scheduling_rules
set
    avail_opens_at = coalesce(
        avail_opens_at,
        (date_trunc('day', now())
            + ((6 - extract(isodow from now())::int + 7) % 7 || ' days')::interval
            + interval '6 hours')
    )
where avail_opens_at is null;

update scheduling_rules
set
    avail_closes_at = coalesce(
        avail_closes_at,
        date_trunc('day', avail_opens_at) + interval '4 days' + interval '23 hours'
    ),
    avail_reminder_at = coalesce(
        avail_reminder_at,
        date_trunc('day', avail_opens_at) + interval '3 days' + interval '10 hours'
    )
where avail_closes_at is null or avail_reminder_at is null;
