-- Migration 016: full known-network topology tables
--
-- Stores the complete crawler graph (reachable core + connected "known/unreachable"
-- addresses that reachable nodes gossiped) for the 3D topology visualization.
--
-- Kept separate from the `nodes` table on purpose:
--   * `nodes` is shared with cipherscan-rust and drives reachable-node metrics
--     (health score, concentration, counts) that all filter WHERE is_active = TRUE.
--     Mixing in thousands of unreachable gossiped addresses would pollute those.
--   * These tables are snapshot-style: the ingester DELETEs and repopulates them
--     every crawl, so they are cheap and disposable.
--
-- Privacy: `addr` and `ip` are server-side only (node identity + geo/tor/join key)
-- and MUST NEVER be returned by any public API. The topology endpoint exposes only
-- synthetic ids, client label, reachability, country, rounded lat/lon, and centrality.

CREATE TABLE IF NOT EXISTS topology_nodes (
    addr         TEXT PRIMARY KEY,              -- "ip:port" — server-side identity, never exposed
    ip           TEXT NOT NULL,                 -- for geo/Tor detection and join to nodes
    reachable    BOOLEAN NOT NULL,              -- true = completed handshake; false = gossiped/unreachable ("off")
    client_impl  TEXT,                          -- Zebra/Zakura/zcashd/Unknown (from crawler user-agent; reachable only)
    is_tor       BOOLEAN NOT NULL DEFAULT FALSE,
    country_code TEXT,
    lat          DOUBLE PRECISION,
    lon          DOUBLE PRECISION,
    degree       INTEGER NOT NULL DEFAULT 0,
    betweenness  DOUBLE PRECISION,
    closeness    DOUBLE PRECISION,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_topology_nodes_ip ON topology_nodes (ip);
CREATE INDEX IF NOT EXISTS idx_topology_nodes_degree ON topology_nodes (degree DESC);

CREATE TABLE IF NOT EXISTS topology_edges (
    src TEXT NOT NULL,                           -- topology_nodes.addr
    dst TEXT NOT NULL,                           -- topology_nodes.addr
    PRIMARY KEY (src, dst)
);

CREATE INDEX IF NOT EXISTS idx_topology_edges_src ON topology_edges (src);
CREATE INDEX IF NOT EXISTS idx_topology_edges_dst ON topology_edges (dst);

-- Owned by the ingester/API role so it can TRUNCATE/DELETE/INSERT each crawl.
ALTER TABLE topology_nodes OWNER TO zcash_user;
ALTER TABLE topology_edges OWNER TO zcash_user;
