-- Persist Stripe checkout/subscription seat quantity for team invite caps.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS paid_seat_quantity integer NOT NULL DEFAULT 1;
