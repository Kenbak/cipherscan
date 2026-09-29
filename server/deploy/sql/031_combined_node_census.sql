-- Separate live-peer observation time from an actual crawler handshake.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS last_peer_seen_at timestamptz;
ALTER TABLE nodes_crawl ADD COLUMN IF NOT EXISTS last_peer_seen_at timestamptz;
COMMENT ON COLUMN nodes.last_peer_seen_at IS 'Time a successful local getpeerinfo poll observed this established peer connection; not a crawler handshake. Null legacy rows are not live-peer evidence.';
COMMENT ON COLUMN nodes_crawl.last_peer_seen_at IS 'Time a successful local getpeerinfo poll observed this established peer connection; not a crawler handshake.';
COMMENT ON COLUMN node_snapshots.census_version IS '0 = legacy mixed discovery; 1 = crawler handshakes within one hour; 2 = union of crawler handshakes within one hour and established live peers observed within fifteen minutes, deduplicated by IP.';
COMMIT;
