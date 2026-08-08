-- Rota App: Swap Shift — a two-sided trade of one shift for another between
-- named staff. Unlike drop/give (which move a single rota_assignments row
-- and can therefore live entirely on that row), a swap pairs TWO rows and
-- needs one state machine spanning both — so it gets its own table rather
-- than a second set of swap-partner columns on rota_assignments.
--
-- Neither rota_assignments row is touched until the swap is fully resolved:
-- staff_id on both rows stays with the original owners through
-- pending_response and pending_approval, matching drop/give's no-gap
-- guarantee. Only on approval (auto or manager) do the two staff_id values
-- actually flip, atomically.

create table if not exists shift_swaps (
    id uuid primary key default gen_random_uuid(),
    venue_id uuid not null references venues(id) on delete cascade,
    period_id uuid not null references availability_periods(id) on delete cascade,
    initiator_staff_id uuid not null references staff_members(id),
    initiator_assignment_id uuid not null references rota_assignments(id),
    recipient_staff_id uuid not null references staff_members(id),
    recipient_assignment_id uuid not null references rota_assignments(id),
    status text not null default 'pending_response'
        check (status in ('pending_response', 'pending_approval', 'approved', 'declined', 'rejected')),
    reason text,
    created_at timestamptz not null default now(),
    resolved_at timestamptz
);

create index if not exists idx_shift_swaps_period on shift_swaps(period_id);
create index if not exists idx_shift_swaps_recipient_pending
    on shift_swaps(recipient_staff_id) where status = 'pending_response';
create index if not exists idx_shift_swaps_venue_pending_approval
    on shift_swaps(venue_id) where status = 'pending_approval';
