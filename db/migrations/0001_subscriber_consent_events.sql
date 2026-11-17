-- Additive migration. Existing subscriber rows are untouched.
CREATE TABLE IF NOT EXISTS subscriber_consent_events (
  event_id INTEGER PRIMARY KEY,
  subscriber_id TEXT NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK(event_type IN ('baseline','requested','confirmed','withdrawn')),
  recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  status TEXT NOT NULL CHECK(status IN ('pending','active','unsubscribed')),
  consent_version TEXT NOT NULL,
  consent_at TEXT,
  confirmed_at TEXT,
  unsubscribed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_subscriber_consent_events_owner ON subscriber_consent_events(subscriber_id,event_id);

INSERT INTO subscriber_consent_events(subscriber_id,event_type,status,consent_version,consent_at,confirmed_at,unsubscribed_at)
SELECT s.id,'baseline',s.status,s.consent_version,s.consent_at,s.confirmed_at,s.unsubscribed_at
FROM subscribers s
WHERE NOT EXISTS (SELECT 1 FROM subscriber_consent_events e WHERE e.subscriber_id=s.id);

CREATE TRIGGER IF NOT EXISTS subscriber_consent_insert
AFTER INSERT ON subscribers
BEGIN
  INSERT INTO subscriber_consent_events(subscriber_id,event_type,status,consent_version,consent_at,confirmed_at,unsubscribed_at)
  VALUES(NEW.id,CASE WHEN NEW.status='pending' THEN 'requested' ELSE 'baseline' END,NEW.status,NEW.consent_version,NEW.consent_at,NEW.confirmed_at,NEW.unsubscribed_at);
END;

CREATE TRIGGER IF NOT EXISTS subscriber_consent_request
AFTER UPDATE OF consent_at ON subscribers
WHEN NEW.status='pending'
BEGIN
  INSERT INTO subscriber_consent_events(subscriber_id,event_type,status,consent_version,consent_at,confirmed_at,unsubscribed_at)
  VALUES(NEW.id,'requested',NEW.status,NEW.consent_version,NEW.consent_at,NEW.confirmed_at,NEW.unsubscribed_at);
END;

CREATE TRIGGER IF NOT EXISTS subscriber_consent_status
AFTER UPDATE OF status ON subscribers
WHEN OLD.status<>NEW.status AND NEW.status IN ('active','unsubscribed')
BEGIN
  INSERT INTO subscriber_consent_events(subscriber_id,event_type,status,consent_version,consent_at,confirmed_at,unsubscribed_at)
  VALUES(NEW.id,CASE WHEN NEW.status='active' THEN 'confirmed' ELSE 'withdrawn' END,NEW.status,NEW.consent_version,NEW.consent_at,NEW.confirmed_at,NEW.unsubscribed_at);
END;
