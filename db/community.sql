-- AUPOSITEUR community database (Cloudflare D1 / SQLite)
-- Apply only after provisioning the D1 database and securing the Worker.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL CHECK(content_type IN ('ecrits','reflexions','musiques','citations')),
  content_id TEXT NOT NULL,
  author_name TEXT NOT NULL CHECK(length(author_name) BETWEEN 1 AND 80),
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 3000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  moderated_at TEXT,
  moderation_note TEXT,
  parent_id TEXT REFERENCES comments(id) ON DELETE SET NULL,
  is_author_reply INTEGER NOT NULL DEFAULT 0 CHECK(is_author_reply IN (0,1))
);
CREATE INDEX IF NOT EXISTS idx_comments_public ON comments(content_type,content_id,status,created_at);
CREATE INDEX IF NOT EXISTS idx_comments_moderation ON comments(status,created_at);

CREATE TABLE IF NOT EXISTS subscribers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','unsubscribed')),
  interests TEXT NOT NULL DEFAULT '[]',
  consent_version TEXT NOT NULL,
  consent_at TEXT NOT NULL DEFAULT (datetime('now')),
  confirmed_at TEXT,
  unsubscribed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(status);

-- Store only hashes of one-time verification and unsubscribe tokens.
CREATE TABLE IF NOT EXISTS subscriber_tokens (
  token_hash TEXT PRIMARY KEY,
  subscriber_id TEXT NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK(purpose IN ('confirm','unsubscribe')),
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_subscriber_tokens_owner ON subscriber_tokens(subscriber_id);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  content_type TEXT CHECK(content_type IN ('ecrits','reflexions','musiques','citations','livres')),
  content_id TEXT,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'all',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','queued','sending','sent','failed','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at TEXT,
  sent_at TEXT
);
CREATE TABLE IF NOT EXISTS campaign_deliveries (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  subscriber_id TEXT NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','sent','failed','skipped')),
  provider_message_id TEXT,
  attempted_at TEXT,
  PRIMARY KEY (campaign_id,subscriber_id)
);

-- Settings are per publication; default is comments enabled.
CREATE TABLE IF NOT EXISTS comment_settings (
  content_type TEXT NOT NULL CHECK(content_type IN ('ecrits','reflexions','musiques','citations')),
  content_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  PRIMARY KEY(content_type,content_id)
);

-- Store only a keyed hash of a visitor's IP, not their raw address.
CREATE TABLE IF NOT EXISTS submission_limits (
  scope TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  window_start TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(scope,visitor_hash,window_start)
);
CREATE INDEX IF NOT EXISTS idx_submission_limits_window ON submission_limits(window_start);
