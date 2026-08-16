-- Staff self-registration (§3). Two orthogonal additions:
--
--  1. venues.join_pin — a rotatable code that gates registration on the venue's
--     existing shared link. NULL means "joining is disabled" (a forwarded link is
--     inert, and the roster is never exposed to an unauthenticated visitor).
--
--  2. staff_members.pending — awaiting manager approval. Deliberately NOT
--     is_active: soft-deleted (is_active=false) and awaiting-approval are
--     different states. A pending member is is_active=true (a live row that can
--     PIN-auth and submit availability) but pending=true, so the SOLVER and every
--     assignable-roster query must exclude pending until a manager confirms them
--     — an unconfirmed under-18 must never be schedulable.
alter table venues
    add column if not exists join_pin text;

alter table staff_members
    add column if not exists pending boolean not null default false;
