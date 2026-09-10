-- Admin-controlled "free pass" (comp) for venues, plus an admin-action audit
-- trail that survives a venue delete.
--
-- Comp is deliberately a SEPARATE flag from subscription_status, not another
-- value in that enum. subscription_status is owned by Stripe (the billing
-- webhook writes it by stripe_customer_id); if "comped" lived in the same
-- column, the next customer.subscription.updated event would silently overwrite
-- it and a design-partner venue would start owing money. billing_exempt is
-- never read or written by the Stripe webhook — the entitlement helper checks
-- it FIRST, independently of whatever Stripe thinks the status is.
--
-- Comp bypasses BILLING, not is_active: a comped-but-disabled venue stays
-- disabled. Two independent switches, same discipline as pending vs is_active
-- for staff.
ALTER TABLE venues
  -- The free pass itself. false = billed normally (trial/Stripe governs).
  ADD COLUMN IF NOT EXISTS billing_exempt boolean NOT NULL DEFAULT false,
  -- Why this venue is free. A short pick-list value (pilot / friends_family /
  -- goodwill / other) so comped venues can be counted, not free text. Required
  -- by the API whenever billing_exempt is set true — a comp with no reason is a
  -- future support mystery.
  ADD COLUMN IF NOT EXISTS billing_exempt_reason text,
  -- Optional expiry. NULL = comped forever (a pilot / friends & family). A date
  -- = comped UNTIL then, after which the venue reverts to whatever Stripe says
  -- (a goodwill month written off for a paying venue).
  ADD COLUMN IF NOT EXISTS billing_exempt_until timestamptz,
  -- Audit stamps, set server-side when the flag is toggled.
  ADD COLUMN IF NOT EXISTS billing_exempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS billing_exempt_by text;

-- Append-only record of admin-console actions, kept OUTSIDE the venue cascade
-- so it survives a venue delete (activity_log does not — it cascades away with
-- the venue it belongs to). target_venue_id is a plain uuid, NOT a foreign key,
-- precisely so a deleted venue's audit rows remain. This is the only
-- accountability the console has while it runs on a single shared ADMIN_SECRET
-- with no per-admin identity: it can record "an admin did X to venue Y", never
-- which admin, so the row is the whole trail.
CREATE TABLE IF NOT EXISTS admin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  target_venue_id uuid,
  target_venue_name text,
  target_email text,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_created_at ON admin_audit (created_at DESC);
