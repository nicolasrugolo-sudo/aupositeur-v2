-- Run once on existing D1 database aupositeur-studio
ALTER TABLE projects ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS idx_projects_deleted ON projects(deleted_at);
