-- Rota App: Admin notes
-- Free-text field on venues for the founder's own support context (e.g.
-- "refund requested 12 Aug"), visible only in the admin console. Not shown
-- to managers or staff anywhere.

alter table venues
    add column if not exists admin_notes text;
