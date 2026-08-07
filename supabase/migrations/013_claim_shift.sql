-- Rota App: drop-a-shift part 2 — claim + approval queue
-- Stores who is attempting to claim a pending_pickup shift and why it needs
-- manager review, on the same rota_assignments row (mirrors part 1's
-- reuse-the-assignment-row approach rather than a separate claims table).
-- claim_staff_id is only set while a claim is pending_approval — staff_id
-- stays the original person until the claim is approved (auto or by a
-- manager), matching part 1's "never create a gap" guarantee.

alter table rota_assignments
    add column if not exists claim_staff_id uuid references staff_members(id),
    add column if not exists claim_reason text;
