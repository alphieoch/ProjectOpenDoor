-- Reserved capacity: keep min replicas warm (no scale-to-zero)
ALTER TABLE deployments
  ADD COLUMN IF NOT EXISTS reserved boolean NOT NULL DEFAULT false;

UPDATE deployments
SET min_replicas = GREATEST(min_replicas, 1),
    scale_to_zero = false
WHERE reserved = true AND min_replicas < 1;
