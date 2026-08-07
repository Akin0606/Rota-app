-- Rota App: Give Shift — a targeted 1:1 offer of one's own shift to a named
-- colleague, reusing drop-a-shift's existing pending_pickup/pending_approval
-- states rather than adding new ones. target_staff_id distinguishes a
-- targeted give (visible + actionable only by that person) from an open-pool
-- drop (target_staff_id is null). Once the give is resolved (accepted,
-- accepted-pending-approval, or declined), target_staff_id is cleared —
-- pending_approval gives look identical in shape to pending_approval claims
-- from the open pool, so the existing manager claims queue needs zero
-- changes to handle them.

alter table rota_assignments
    add column if not exists target_staff_id uuid references staff_members(id);

create index if not exists idx_rota_assignments_target_staff_id
    on rota_assignments(target_staff_id) where target_staff_id is not null;
