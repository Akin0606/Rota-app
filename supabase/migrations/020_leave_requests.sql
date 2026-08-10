-- Holiday / annual leave requests. Deliberately decoupled from
-- availability_periods (date range, not period_id) so leave can be
-- requested for future weeks that don't have a period row yet.
create table if not exists leave_requests (
    id uuid primary key default gen_random_uuid(),
    venue_id uuid not null references venues(id) on delete cascade,
    staff_id uuid not null references staff_members(id) on delete cascade,
    start_date date not null,
    end_date date not null,
    status text not null default 'pending'
        check (status in ('pending', 'approved', 'rejected', 'cancelled')),
    reason text,
    manager_note text,
    created_at timestamptz not null default now(),
    decided_at timestamptz,
    check (end_date >= start_date)
);

create index if not exists idx_leave_requests_venue_id on leave_requests(venue_id);
create index if not exists idx_leave_requests_staff_id on leave_requests(staff_id);
create index if not exists idx_leave_requests_status on leave_requests(status);
create index if not exists idx_leave_requests_dates on leave_requests(start_date, end_date);

alter table leave_requests enable row level security;

create policy "leave_requests_all_own_venue" on leave_requests
    for all using (
        venue_id in (select id from venues where manager_id = auth.uid())
    )
    with check (
        venue_id in (select id from venues where manager_id = auth.uid())
    );
