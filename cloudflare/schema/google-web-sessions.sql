-- Apply only to a separately provisioned staging D1 database.
-- Never apply to production without explicit approval and a reviewed rollout.
CREATE TABLE IF NOT EXISTS google_web_sessions (
  session_hash TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS google_web_sessions_expires_at ON google_web_sessions(expires_at);
