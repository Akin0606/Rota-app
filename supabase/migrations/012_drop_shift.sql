-- Rota App: drop-a-shift (part 1 — drop into a team pool, no claiming yet)
-- Reuses rota_assignments rather than a new table: the original assignment
-- row already represents "who's covering this shift", so a drop just marks
-- that same row as open. The original staff_id/day_index/shift_id are left
-- untouched — the shift stays covered by the original person until someone
-- valid claims it (part 2), so the system never creates its own gap.
--
-- The check constraint already allows 'pending_approval' alongside
-- 'pending_pickup' so part 2 (claim -> manager approval) doesn't need its
-- own migration just to widen this.

alter table rota_assignments
    add column if not exists drop_status text check (drop_status in ('pending_pickup', 'pending_approval')),
    add column if not exists dropped_at timestamptz;

create index if not exists idx_rota_assignments_drop_status
    on rota_assignments(period_id) where drop_status is not null;
