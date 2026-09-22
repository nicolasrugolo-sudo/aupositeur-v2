-- Agnes durable queue / retry state
CREATE TABLE IF NOT EXISTS agnes_jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  target_id TEXT,
  payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 6,
  next_attempt_at TEXT,
  last_error TEXT,
  result TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_agnes_jobs_queue ON agnes_jobs(status,next_attempt_at,created_at);
CREATE INDEX IF NOT EXISTS idx_agnes_jobs_project ON agnes_jobs(project_id,created_at DESC);
