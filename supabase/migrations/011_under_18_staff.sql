-- Rota App: under-18 staff handling
-- Marks staff members who are under 18, so the solver can apply the
-- stricter UK Working Time Regulations that apply to 16-17 year-olds
-- (shorter daily/weekly hour caps, longer rest, no night shifts, two
-- consecutive days off). Always enforced when set — not a toggle.

alter table staff_members
    add column if not exists is_under_18 boolean not null default false;
