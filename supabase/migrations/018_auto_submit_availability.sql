-- Per-staff opt-in: when the new week's availability opens, auto-copy their
-- most recent submission forward if it's on, so they don't have to log in at
-- all when nothing's changed.
alter table staff_members
    add column if not exists auto_submit_availability boolean not null default false;
