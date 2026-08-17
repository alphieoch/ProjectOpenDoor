-- 24h object-storage batch pipeline (input/output JSONL file ids + expiry)

ALTER TABLE batch_jobs
  ADD COLUMN IF NOT EXISTS input_file_id VARCHAR(128);

ALTER TABLE batch_jobs
  ADD COLUMN IF NOT EXISTS output_file_id VARCHAR(128);

ALTER TABLE batch_jobs
  ADD COLUMN IF NOT EXISTS completion_window VARCHAR(20) NOT NULL DEFAULT '24h';

ALTER TABLE batch_jobs
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS batch_jobs_active_idx
  ON batch_jobs (status, created_at)
  WHERE status IN ('pending', 'validating', 'running');
