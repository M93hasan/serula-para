-- Apply only to a separate staging D1 database after review.
-- Never apply to production without explicit approval and backup.
CREATE TABLE IF NOT EXISTS web_credentials (
 owner_id TEXT NOT NULL,
 provider TEXT NOT NULL,
 envelope TEXT NOT NULL,
 PRIMARY KEY (owner_id,provider)
);
