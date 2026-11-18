-- Manual editorial calendar; no social OAuth or automatic publishing.
CREATE TABLE IF NOT EXISTS social_post_details (
 post_id TEXT PRIMARY KEY REFERENCES social_posts(id) ON DELETE CASCADE,
 title TEXT,
 share_url TEXT,
 image_url TEXT,
 scheduled_at_utc TEXT,
 timezone TEXT NOT NULL DEFAULT 'Europe/Brussels',
 shared_at TEXT,
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_social_post_details_due ON social_post_details(scheduled_at_utc,shared_at);
