# CipherScan Deployment Guide

Operational documentation for running CipherScan locally and in production.

**Architecture:** Frontend (Next.js) → API (Express + WebSocket) → PostgreSQL ← cipherscan-rust indexer → Zebra node

See also: [server infrastructure wiki](https://github.com/Kenbak/cipherscan) and `zcg/milestone-3/VERIFICATION.md` for M3 acceptance checks.

---

## Prerequisites

| Component | Version / Notes |
|-----------|----------------|
| **Node.js** | 18+ (20 LTS recommended) |
| **npm** | 9+ |
| **PostgreSQL** | 14+ with `zcash_explorer_mainnet` or `zcash_explorer_testnet` database |
| **Redis** | 6+ (pub/sub for multi-worker WebSocket; API response caching) |
| **Zebra** | v5.0.0+ full node with `--features indexer` for gRPC streaming |
| **cipherscan-rust** | Rust indexer writing to the same PostgreSQL database |
| **lightwalletd** | Optional — gRPC light client interface backed by Zebra |
| **Caddy** | Production reverse proxy with automatic HTTPS |

---

## Service Architecture

```
┌─────────────┐     HTTPS      ┌──────────────┐
│   Browser   │ ──────────────▶│  Caddy :443  │
│  (Netlify)  │                └──────┬───────┘
└─────────────┘                       │
                                      ▼
                              ┌───────────────┐
                              │ Next.js :3000 │  (frontend — Netlify or systemd)
                              └───────┬───────┘
                                      │ REST / WS
                                      ▼
                              ┌───────────────┐
                              │ Express :3001 │  (API + WebSocket)
                              └───────┬───────┘
                         ┌────────────┼────────────┐
                         ▼            ▼            ▼
                   ┌──────────┐ ┌──────────┐ ┌──────────┐
                   │PostgreSQL│ │  Redis   │ │  Zebra   │
                   │  :5432   │ │  :6379   │ │RPC :8232 │
                   └────▲─────┘ └──────────┘ │gRPC:8230 │
                        │                     └────▲─────┘
                        │                          │
                   ┌────┴─────┐              ┌─────┴────┐
                   │cipherscan│              │lightwalletd│
                   │  -rust   │              │  :9067    │
                   └──────────┘              └──────────┘
```

**Data flow:** Zebra indexes blocks → cipherscan-rust writes to PostgreSQL → Node API reads PostgreSQL + Zebra RPC/gRPC → Frontend fetches API → WebSocket pushes real-time events.

**Cross-repo impact:** Schema changes in cipherscan-rust migrations affect the API. Materialized views and cron jobs in this repo must be compatible with indexer table ownership (`zcash_user`).

---

## Environment Variables

Never commit secrets. Reference `.env.example` (frontend) and `server/api/.env` (API server, not in repo).

### Frontend (`.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_NETWORK` | **Yes for builds** | Deployment identity: `mainnet`, `testnet`, or `crosslink-testnet`. Controls APIs, currency labels, canonical hosts, and indexation. |
| `SITEMAP_BLOCK_MIN_HEIGHT` | No | Mainnet-only lower bound for advertised block sitemap shards. Leave unset with `SITEMAP_BLOCK_MAX_HEIGHT` to disable block shards. Must be divisible by 50,000. |
| `SITEMAP_BLOCK_MAX_HEIGHT` | No | Mainnet-only inclusive upper bound for advertised block sitemap shards. Must end a complete 50,000-height bucket (for example, `3449999`). |
| `NEXT_PUBLIC_LIGHTWALLETD_HOST` | No | Lightwalletd hostname for client-side gRPC |
| `NEXT_PUBLIC_LIGHTWALLETD_PORT` | No | Lightwalletd port (default 9067) |
| `NEAR_INTENTS_API_KEY` | No | NEAR Intents Explorer API (historical swap data) |
| `NEXT_TELEMETRY_DISABLED` | Recommended | Set to `1` — disable Next.js telemetry |
| `ZEBRA_GRPC_URL` | No | Zebra gRPC indexer address (e.g. `127.0.0.1:8230`) |

### API Server (`server/api/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DB_HOST` | Yes | PostgreSQL host |
| `DB_PORT` | Yes | PostgreSQL port (default `5432`) |
| `DB_NAME` | Yes | Database name (`zcash_explorer_mainnet`) |
| `DB_USER` | Yes | Database user (`zcash_user`) |
| `DB_PASSWORD` | Yes | Database password |
| `REDIS_HOST` | Recommended | Redis host (default `127.0.0.1`) |
| `REDIS_PORT` | Recommended | Redis port (default `6379`) |
| `ZEBRA_RPC_URL` | Yes | Zebra JSON-RPC URL (e.g. `http://127.0.0.1:8232`) |
| `ZEBRA_RPC_COOKIE_FILE` | Yes | Path to Zebra `.cookie` file for RPC auth |
| `ZCASH_RPC_USER` | Fallback | RPC username if cookie file unavailable |
| `ZCASH_RPC_PASSWORD` | Fallback | RPC password if cookie file unavailable |
| `ZEBRA_GRPC_URL` | Recommended | Zebra gRPC indexer for real-time mempool/blocks |
| `ZEBRA_HEALTH_URL` | No | Zebra health endpoint (default `http://127.0.0.1:8080`) |
| `PORT` | No | API listen port (default `3001`) |
| `NODE_ENV` | Recommended | `production` in prod |
| `CORS_ORIGINS` | No | Comma-separated allowed origins |
| `NEAR_INTENTS_API_KEY` | For crosschain | NEAR Intents API key for swap sync |

### Cron Jobs (`server/jobs/.env`)

Cron jobs load from `server/jobs/.env` and `server/api/.env`. Same `DB_*` and `ZEBRA_*` variables as the API server.

### cipherscan-rust (separate repo)

The Rust indexer has its own `.env` with `ZEBRA_RPC_URL`, `DATABASE_URL`, and gRPC settings. Must point to the same PostgreSQL database as the API.

---

## Local Development

### Frontend only (uses public API)

```bash
git clone https://github.com/Kenbak/cipherscan.git
cd cipherscan
npm install
npm run dev
# Open http://localhost:3000
```

The frontend auto-detects localhost and can use the public mainnet API, or proxy to a local API on port 3001.

### Full stack (local API + database)

1. **Start PostgreSQL and Redis** locally or via Docker.

2. **Run cipherscan-rust indexer** (separate repo) against a synced Zebra node.

3. **Start the API server:**

```bash
cd server/api
cp .env.example .env  # create from template if available; set DB_* and ZEBRA_*
npm install
node server.js
# API listens on http://127.0.0.1:3001
```

4. **Start the frontend:**

```bash
cd ../..  # repo root
npm run dev
# Frontend on http://localhost:3000, API on http://localhost:3001
```

5. **Verify:**

```bash
curl http://localhost:3001/api/network/health
node zcg/milestone-3/verify.js http://localhost:3000
```

---

## Production Deployment

### Frontend — Netlify

The same Next.js source deploys as three independent Netlify sites. The
Netlify site name `cipherscan` is the testnet deployment; it is a legacy name,
not the root-domain deployment.

| Netlify site | Public host | `NEXT_PUBLIC_NETWORK` | PR preview pattern |
| --- | --- | --- | --- |
| `cipherscan-main` | `cipherscan.app` | `mainnet` | `deploy-preview-<PR>--cipherscan-main.netlify.app` |
| `cipherscan` (rename to `cipherscan-testnet` when practical) | `testnet.cipherscan.app` | `testnet` | `deploy-preview-<PR>--cipherscan.netlify.app` |
| `cipherscan-crosslink` | `crosslink.cipherscan.app` | `crosslink-testnet` | `deploy-preview-<PR>--cipherscan-crosslink.netlify.app` |

Build command: `npm run build`.

Set `NEXT_PUBLIC_NETWORK` explicitly for the Production, Deploy Preview, and
Branch deploy contexts of every site. Production builds fail when it is absent
or invalid so a deployment cannot silently fall back to testnet. Netlify also
sends `X-Robots-Tag: noindex` on deploy-preview hosts; application metadata is
still verified per network before promotion.

For Docker, pass the same value as the `NEXT_PUBLIC_NETWORK` build argument and
runtime environment variable. `NEXT_PUBLIC_*` values are compiled into the
browser bundle, so setting only the runtime variable is too late.

### Sitemap rollout

The mainnet `/sitemap.xml` endpoint is a sitemap index. Its core, content, and
tools children are independent of chain APIs; dynamic children fail with a
retryable `503` instead of publishing an empty successful sitemap. Testnet
retains a homepage-only sitemap, and Crosslink does not advertise one.

Deploy the split sitemap with `SITEMAP_BLOCK_MIN_HEIGHT` and
`SITEMAP_BLOCK_MAX_HEIGHT` unset. Submit `/sitemap.xml`, `/sitemap-core.xml`,
`/sitemap-content.xml`, and `/sitemap-tools.xml` separately in Google Search
Console. After those files have processed successfully for seven days, choose
the two fixed pilot buckets from the authoritative mainnet tip:

```text
bucketStart = floor(tip / 50000) * 50000
SITEMAP_BLOCK_MIN_HEIGHT = bucketStart - 50000
SITEMAP_BLOCK_MAX_HEIGHT = bucketStart + 49999
```

For a tip near `3,412,933`, configure `3350000` through `3449999`. Values that
are missing, invalid, or not aligned disable all block shards, and arbitrary
range filenames return `404`.

Observe the pilot for 28 days before extending the lower bound by one 50,000
height bucket. Expand only when core indexing remains at least 90%, core
coverage has not fallen by more than five percentage points, sitemap fetch
errors remain zero, Googlebot-facing 5xx responses remain below 0.1%, page p95
has not regressed by more than 20%, and at least 20% of the block pilot is
indexed with an upward trend. If a gate fails, keep existing shards advertised
and pause expansion.

### API + Indexer — DigitalOcean (systemd)

Production runs on bare-metal DigitalOcean droplets with systemd units.

**Mainnet units:**

| Unit | Service |
|------|---------|
| `zebrad-mainnet.service` | Zebra full node |
| `cipherscan-rust.service` | Rust indexer |
| `zcash-api-mainnet.service` | Node.js API + WebSocket |
| `lightwalletd.service` | Light client gRPC |

**Testnet units:** `zebrd.service`, `cipherscan-rust-testnet.service`, `zcash-api.service`, `lightwalletd.service`

**Start order:** PostgreSQL → Zebra → cipherscan-rust → lightwalletd → API → Caddy

**Caddy** terminates TLS on ports 443/80 and reverse-proxies to:
- Frontend (Netlify origin or local Next.js)
- API (`127.0.0.1:3001`)
- lightwalletd gRPC (`127.0.0.1:9067`)

Privacy hardening: Caddy access logs disabled; no `X-Forwarded-For` to upstreams; TLS 1.2+ only.

### After Zebra restart

Update the `.cookie` password in `zcash.conf` and restart lightwalletd so RPC authentication stays aligned.

---

## Cron Jobs

All cron jobs run from `/root/cipherscan/server/jobs/` on production hosts.

| Schedule | Job | Purpose |
|----------|-----|---------|
| `*/5 * * * *` | `sync-crosschain-swaps.js` | NEAR Intents swap sync + MV refresh |
| `*/5 * * * *` | `refresh-turnstile.js` | Incremental turnstile daily aggregates |
| `0 4 * * *` | `refresh-turnstile.js --sweep` | Full held-output sweep |
| `0 * * * *` | `update-privacy-stats.js` | Pool sizes, privacy trends, `flow_daily` MV |
| `0 * * * *` | `update-chain-snapshots.js` | Chain supply snapshots |
| `0 * * * *` | `sync-nodes.js` | Network node geo data |
| `*/10 * * * *` | `run-pattern-scanners.sh` | Privacy linkage edges + batch clusters |

**Logs:** `/var/log/crosschain-sync.log`, `/var/log/refresh-turnstile.log`, `/var/log/privacy-stats.log`, `/var/log/pattern-scanner.log`

**Lockfiles:** `sync-crosschain-swaps.js` uses `.sync-crosschain.lock`; `refresh-turnstile.js` uses PostgreSQL advisory lock `839271`.

---

## Monitoring & Health Checks

### API health endpoints

```bash
# Zebra node health
curl -s https://api.mainnet.cipherscan.app/api/network/health | jq .

# gRPC + WebSocket status
curl -s https://api.mainnet.cipherscan.app/api/grpc-status | jq .

# Crosschain DB stats (MV performance canary)
curl -s https://api.mainnet.cipherscan.app/api/crosschain/db-stats | jq '.totalSwapsAllTime'

# Pool history (365-day data canary)
curl -s "https://api.mainnet.cipherscan.app/api/network/pool-history?period=1y" | jq '.points | length'
```

### systemd status

```bash
systemctl status zebrd-mainnet cipherscan-rust zcash-api-mainnet lightwalletd
journalctl -u zcash-api-mainnet -f
```

### Frontend maintenance banner

`MaintenanceBanner.tsx` auto-detects stale block data (>15 min since last indexed block) and displays a banner to users.

### M3 verification script

```bash
node zcg/milestone-3/verify.js https://cipherscan.app
```

Runs automated checks across all verifiable M3 deliverables. Exit code 0 = passed.

### Alerts to watch

- Root disk > 90% full (Zebra state is ~300GB+)
- PostgreSQL pool exhaustion ("connection slots reserved for superuser")
- Zebra RPC `ECONNREFUSED` on localhost
- Indexer lag: compare `privacy_stats.lastBlockScanned` vs chain tip
- Redis down: WebSocket rate limiting falls back to allow-all

---

## Tor Hidden Service (M3 Deliverable)

Pending server-side deployment. When configured:

1. Install Tor, configure `HiddenServiceDir` and `HiddenServicePort`
2. Point Caddy to serve frontend/API on the onion address
3. Verify in Tor Browser — no clearnet-only dependencies

See `zcg/milestone-3/VERIFICATION.md` deliverable #2 for acceptance criteria.

---

## See Also

- [API Documentation](https://cipherscan.app/docs) — 43 public endpoints
- [M1 Verification](zcg/milestone-1/VERIFICATION.md)
- [M2 Verification](zcg/milestone-2/VERIFICATION.md)
- [M3 Verification](zcg/milestone-3/VERIFICATION.md)
- [Feature Parity Audit](zcg/milestone-3/FEATURE_PARITY_AUDIT.md)
- cipherscan-rust repo — indexer schema migrations
