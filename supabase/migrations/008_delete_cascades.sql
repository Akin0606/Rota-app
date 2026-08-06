-- Rota App: complete the delete cascades
-- Deleting a venue cascades to periods (which cascade to rota_assignments) and
-- to staff_members — but rota_assignments.staff_id and activity_log.staff_id
-- were NO ACTION, so a venue (or a single staff member) with assignments/
-- activity couldn't be deleted. Fix both so a venue delete cleanly removes all
-- related data.

alter table rota_assignments
    drop constraint if exists rota_assignments_staff_id_fkey;
alter table rota_assignments
    add constraint rota_assignments_staff_id_fkey
    foreign key (staff_id) references staff_members(id) on delete cascade;

-- Keep the venue-level activity trail if an individual staff member is removed,
-- but don't let it block deletion.
alter table activity_log
    drop constraint if exists activity_log_staff_id_fkey;
alter table activity_log
    add constraint activity_log_staff_id_fkey
    foreign key (staff_id) references staff_members(id) on delete set null;
