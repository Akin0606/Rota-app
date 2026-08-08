-- Rota App: fix shift_swaps' missing delete cascade
-- shift_swaps.initiator_assignment_id/recipient_assignment_id referenced
-- rota_assignments(id) with NO ACTION (the default), so once a rota_assignments
-- row had EVER been part of any swap — even one long resolved (approved,
-- declined, or rejected) — a manager could never remove that assignment
-- again: Postgres blocks the delete with a foreign key violation. A swap
-- record documenting a shift that no longer exists is meaningless anyway,
-- so cascade its deletion, matching the existing rota_assignments_staff_id_fkey
-- precedent (008_delete_cascades.sql).

alter table shift_swaps
    drop constraint if exists shift_swaps_initiator_assignment_id_fkey;
alter table shift_swaps
    add constraint shift_swaps_initiator_assignment_id_fkey
    foreign key (initiator_assignment_id) references rota_assignments(id) on delete cascade;

alter table shift_swaps
    drop constraint if exists shift_swaps_recipient_assignment_id_fkey;
alter table shift_swaps
    add constraint shift_swaps_recipient_assignment_id_fkey
    foreign key (recipient_assignment_id) references rota_assignments(id) on delete cascade;
