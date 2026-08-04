-- Deleting a shift currently fails with a foreign key violation once it has
-- any availability submissions or rota assignments against it, because
-- shift_id on those tables had no ON DELETE behavior (default RESTRICT).
-- Switch to SET NULL so historical submissions/assignments survive a shift
-- being removed, instead of silently cascading real staff data away.

alter table availability_submissions
    drop constraint if exists availability_submissions_shift_id_fkey;
alter table availability_submissions
    add constraint availability_submissions_shift_id_fkey
    foreign key (shift_id) references shifts(id) on delete set null;

alter table rota_assignments
    drop constraint if exists rota_assignments_shift_id_fkey;
alter table rota_assignments
    add constraint rota_assignments_shift_id_fkey
    foreign key (shift_id) references shifts(id) on delete set null;
