-- Recent verified reachability is separate from legacy discovery/ingestion time.
-- Additive, idempotent; do not relabel or delete historical observations.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS last_verified_at timestamptz;
ALTER TABLE nodes_crawl ADD COLUMN IF NOT EXISTS last_verified_at timestamptz;
ALTER TABLE node_snapshots ADD COLUMN IF NOT EXISTS census_version smallint NOT NULL DEFAULT 0;
COMMENT ON COLUMN nodes.last_verified_at IS 'Time the crawler received both Zcash version and verack; never the ingest time. Null legacy rows are not verified.';
COMMENT ON COLUMN node_snapshots.census_version IS '0 = legacy mixed observations (not comparable); 1 = unique IPs with complete crawler handshake within one hour.';
COMMIT;
