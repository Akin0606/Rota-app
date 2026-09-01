-- Stripe subscription fields on venues.
-- Existing venues start as 'trialing' with a 30-day window.
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'trialing',
  ADD COLUMN IF NOT EXISTS subscription_started_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS subscription_ends_at timestamptz NOT NULL DEFAULT (now() + interval '30 days');
