-- Rota App: 1-day-off-in-7 rule
-- Hard solver constraint: no staff member works all 7 days of a rota week.
-- Default ON; a manager can switch it off per venue via the Scheduler page,
-- behind a risk-popup confirmation (same pattern as the 72h notice override).

alter table scheduling_rules
    add column if not exists require_day_off boolean not null default true;
