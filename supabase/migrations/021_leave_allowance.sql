-- Leave allowance had no fields behind it: the staff screen assumed 28 days and
-- a Jan-Dec leave year, with a per-device localStorage override standing in for
-- a real entitlement. These are the smallest set of real fields that remove
-- both guesses.
--
-- `working_days_per_week` is what makes a range cost the right amount. Pub
-- staff work days spread across all seven, so a seven-day absence costs a
-- five-day worker five days, not seven.

alter table venues
  add column if not exists leave_year_start_month smallint not null default 1,
  add column if not exists full_time_leave_days numeric(4, 1) not null default 28;

alter table staff_members
  -- Fractional on purpose: 4.5 days a week is a real contract.
  add column if not exists working_days_per_week numeric(2, 1) not null default 5,
  -- NULL means "derive from the venue's full-time figure, prorated by this
  -- person's working days" — so a manager only has to set it for someone whose
  -- entitlement genuinely differs from the pro-rata calculation.
  add column if not exists annual_leave_days numeric(4, 1);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'venues_leave_year_start_month_check') then
    alter table venues add constraint venues_leave_year_start_month_check
      check (leave_year_start_month between 1 and 12);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'venues_full_time_leave_days_check') then
    alter table venues add constraint venues_full_time_leave_days_check
      check (full_time_leave_days >= 0 and full_time_leave_days <= 366);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_working_days_per_week_check') then
    alter table staff_members add constraint staff_working_days_per_week_check
      check (working_days_per_week > 0 and working_days_per_week <= 7);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_annual_leave_days_check') then
    alter table staff_members add constraint staff_annual_leave_days_check
      check (annual_leave_days is null or (annual_leave_days >= 0 and annual_leave_days <= 366));
  end if;
end $$;
