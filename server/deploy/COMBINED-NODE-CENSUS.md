# Combined active-node observations

Census version 2 combines recent crawler version/verack handshakes (one hour)
with established connections observed by the local node's `getpeerinfo`
(fifteen minutes). Only peers reporting a positive protocol version qualify.
One IP is one identity regardless of port; IPv4 and IPv6 remain distinct.
This is an observed population, not a complete global census or operator count.
DNS/gossip-only addresses never become active without either observation.

Migration 031 adds nullable `nodes.last_peer_seen_at` and its shadow-table
counterpart. Do not backfill these from ingestion time, discovery, or old peer
rows. `last_verified_at` remains the actual crawler handshake timestamp. Peer
polls do not refresh crawler success counters or provide handshake-latency
samples. Displayed average handshake time uses crawler measurements only.

The existing five-minute `ingest-crawl.js` job is the sole census writer in
crawl mode, using advisory lock 839272. Peer and crawler sources are read
independently; unavailable sources are not refreshed. All-source failure aborts.
Transactions use a one-second lock deadline and ten-second statement deadline.
No node/crawler restart, extra network probe, or indexer change is needed.

All census APIs use the combined read-time expiry rule. Geographic maps omit
unlocated IPs; topology includes active peer-only IPs without fabricated links.
Topology links remain advertised/gossiped relationships, not proof of live links
between arbitrary remote nodes. Returned identities are anonymized as before.
Version-0 mixed-discovery and version-1 crawler-only history remain retained;
version-2 charts/trends use only compatible snapshots. Missing baselines are null.

## Release

1. Apply migration 031 with its lock limit to the mainnet primary, verify
   replication to standby, and confirm the API role can read the new column.
   The migration is mirrored in `cipherscan-rust/schema/migrations` and is SQL
   only. Do not restart the indexer just to apply this migration.
2. Deploy the reviewed API, ingestion job and matching UI from the same release.
   The existing `NODE_SOURCE=crawl` selects the combined census. Peer-mode
   deployments keep their existing behavior; do not enable crawl mode without
   its schema and collectors. Keep passive standby writers inactive.
3. Verify the first natural cron ingestion, source timestamps, no raw-IP exposure,
   API count/client/list/topology agreement and map geolocation coverage. Check
   live node/indexer health and replica lag. No full Redis flush is needed;
   stats/location cache identity and topology key include census version 2.
4. Roll back code to the prior release if needed; retain the additive column and
   versioned history. Old code will continue to use crawler timestamps. Peer-only
   rows cannot pass the old crawler-only filter. Re-run the prior ingester to
   restore its snapshot population, then expire only census cache keys.

Local tests use TEST_NODE_CENSUS_DATABASE_URL and session-local temporary tables;
no persistent records or production sequences are changed. The production
canary used fresh observations in temporary tables and rolled back: 462 unique
IPs (430 local peers, 64 crawler IPs, 32 overlap), 445 geolocated, 45 countries,
and matching 462-node stats/client/topology counts at 2026-09-29 07:58 UTC.
This canary is not itself a deployed census or a stable network-size promise.
