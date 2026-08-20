-- Persist UI locale on the user and world region/country on the org.
-- No geo-blocking: these columns only change copy and defaults.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS locale varchar(16) NOT NULL DEFAULT 'en';

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS region varchar(32),
  ADD COLUMN IF NOT EXISTS country varchar(8);
