-- Rota App: Venue enable/disable
-- A clean is_active flag on venues. When false, manager login and staff PIN
-- entry for that venue are blocked with a clear "inactive" message. This is the
-- hook a future payment gateway will flip automatically.

alter table venues
    add column if not exists is_active boolean not null default true;

create index if not exists idx_venues_is_active on venues(is_active);
