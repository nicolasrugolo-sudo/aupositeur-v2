-- Run once on existing D1 database aupositeur-studio
CREATE TABLE IF NOT EXISTS video_generations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'agnes',
  provider_job_id TEXT,
  model TEXT NOT NULL,
  prompt TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  num_frames INTEGER NOT NULL,
  frame_rate INTEGER NOT NULL,
  generate_audio INTEGER NOT NULL DEFAULT 0,
  audio_style TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  progress INTEGER NOT NULL DEFAULT 0,
  remote_url TEXT,
  asset_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_video_generations_project ON video_generations(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_generations_status ON video_generations(status);
