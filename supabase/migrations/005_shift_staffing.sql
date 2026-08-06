-- Rota App: Per-shift staffing bounds
-- Adds min_staff / max_staff to shifts so the solver can cap how many people
-- land on a single shift (fixing over-population) and flag under-covered shifts.

alter table shifts
    add column if not exists min_staff integer not null default 1,
    add column if not exists max_staff integer not null default 2;

-- Keep the range sane: at least one person can be assigned, and the floor is
-- never above the ceiling. Existing rows all satisfy this (defaults 1 / 2).
do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'shifts_staff_range'
    ) then
        alter table shifts
            add constraint shifts_staff_range
            check (min_staff >= 0 and max_staff >= 1 and max_staff >= min_staff);
    end if;
end $$;
