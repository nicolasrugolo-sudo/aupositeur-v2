-- AUPOSITEUR Social Studio — private scheduler, migration 0001
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS social_posts (
 id TEXT PRIMARY KEY,
 source_type TEXT NOT NULL CHECK(source_type IN ('citation','ecrit','reflexion','musique','livre','original')),
 source_id TEXT,
 caption TEXT NOT NULL DEFAULT '',
 media_reference TEXT,
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS social_accounts (
 id TEXT PRIMARY KEY,
 platform TEXT NOT NULL CHECK(platform IN ('facebook','instagram','pinterest','tiktok','youtube','x')),
 account_reference TEXT NOT NULL,
 display_name TEXT NOT NULL,
 connection_status TEXT NOT NULL DEFAULT 'disconnected' CHECK(connection_status IN ('disconnected','connected','expired')),
 UNIQUE(platform,account_reference)
);
CREATE TABLE IF NOT EXISTS social_targets (
 id TEXT PRIMARY KEY,
 post_id TEXT NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
 account_id TEXT NOT NULL REFERENCES social_accounts(id),
 scheduled_at_utc TEXT,
 timezone TEXT NOT NULL DEFAULT 'Europe/Brussels',
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','scheduled','sending','published','failed','unknown','cancelled')),
 approved_at TEXT,
 published_at TEXT,
 remote_post_id TEXT,
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 updated_at TEXT NOT NULL DEFAULT (datetime('now')),
 CHECK(status NOT IN ('approved','scheduled','sending','published') OR approved_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_social_targets_due ON social_targets(status,scheduled_at_utc);
CREATE INDEX IF NOT EXISTS idx_social_targets_post ON social_targets(post_id);
CREATE TABLE IF NOT EXISTS social_attempts (
 id TEXT PRIMARY KEY,
 target_id TEXT NOT NULL REFERENCES social_targets(id) ON DELETE CASCADE,
 attempt_key TEXT NOT NULL UNIQUE,
 started_at TEXT NOT NULL DEFAULT (datetime('now')),
 finished_at TEXT,
 result TEXT NOT NULL DEFAULT 'started',
 sanitized_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_social_attempts_target ON social_attempts(target_id);
