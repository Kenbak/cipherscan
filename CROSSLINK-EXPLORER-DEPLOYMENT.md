# CipherScan Crosslink Explorer — Deployment Guide

Complete step-by-step to deploy `crosslink.cipherscan.app`.

## What's Already Done (in main)

### Phase 1: Finality Integration (commit `ff79146`)

- **`lib/crosslink.ts`** — `getBlockFinality()` / `getBlocksFinality()` calling `get_tfl_block_finality_from_hash` RPC
- **`lib/api-config.ts`** — `crosslink-testnet` network type, auto-detected from `crosslink.cipherscan.app` domain
- **`app/api/blocks/route.ts`** — Enriches block list with finality status
- **`app/api/block/[height]/route.ts`** — Enriches single block with finality
- **`app/api/tx/[txid]/route.ts`** — Enriches transactions with finality
- **`app/block/[height]/page.tsx`** — Finality badge (green "Finalized" / orange "Not Yet Finalized")
- **`components/RecentBlocks.tsx`** — Finality column in recent blocks

### Phase 2: Crosslink Dashboard & Validators

- **`lib/config.ts`** — `isCrosslink` flag, `CTAZ` currency, `CROSSLINK` label, staking day constants
- **`lib/crosslink.ts`** — Extended with `getRoster()`, `getFinalityInfo()`, `getTipHeight()`, `computeStakingDay()`, `getCrosslinkStats()`
- **`app/api/crosslink/route.ts`** — API endpoint aggregating all crosslink stats (tip, finality, roster, staking day)
- **`components/CrosslinkStats.tsx`** — Dashboard widget (PoW tip, finalized height, finality gap, finalizer count, total stake)
- **`components/StakingDayBanner.tsx`** — Live staking window countdown (period=150, window=70 blocks, progress bar)
- **`app/validators/page.tsx`** — Full finalizer roster page with voting power distribution chart
- **`components/NavBar.tsx`** — Crosslink network switcher, Validators link in nav
- **`app/page.tsx`** — Homepage shows CrosslinkStats + StakingDayBanner instead of PrivacyWidget on crosslink

**No additional frontend code changes needed.** Just deploy with the right env vars.

## What Still Needs to Be Done

1. VPS with zebrad-crosslink running (RPC on 8232)
2. cipherscan-rust-crosslink indexer (forked, with crosslink `zebra-chain` dep) feeding PostgreSQL
3. Node.js API server pointing at crosslink PostgreSQL
4. Deploy this frontend with crosslink env vars
5. Nginx + SSL

---

## Phase 1: VPS Setup

### Spin up Digital Ocean droplet

- **OS:** Ubuntu 22.04 LTS
- **Size:** 8GB RAM, 4 vCPU, 160GB SSD ($48/mo)
- **Region:** NYC or SFO (close to seed peers)
- **Hostname:** `crosslink-explorer`

### SSH in and install dependencies

```bash
ssh root@YOUR_VPS_IP

apt update && apt upgrade -y

# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source ~/.cargo/env
rustup default stable

# Build tools + protobuf (needed for tonic/gRPC)
apt install -y build-essential pkg-config libssl-dev clang cmake protobuf-compiler libprotobuf-dev

# PostgreSQL
apt install -y postgresql postgresql-contrib
systemctl enable postgresql && systemctl start postgresql

# Redis
apt install -y redis-server
systemctl enable redis-server && systemctl start redis-server

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Nginx + Certbot
apt install -y nginx certbot python3-certbot-nginx
systemctl enable nginx
```

### DNS + SSL

```bash
# 1. Point crosslink.cipherscan.app A record → YOUR_VPS_IP in DNS provider
# 2. Wait for propagation, then:
certbot --nginx -d crosslink.cipherscan.app
```

---

## Phase 2: Build & Run zebrad-crosslink

```bash
cd /root
git clone https://github.com/ShieldedLabs/crosslink_monolith.git
cd crosslink_monolith
git checkout season-1-workshop-1   # pin to the tagged release

# CRITICAL: disable the internal miner.
# The crosslink fork forcibly enables `internal_miner = true` in
# zebra-crosslink/zebrad/src/application.rs regardless of user config.
# For a passive explorer node we MUST NOT mine — it causes the node
# to fork at ~block 1120 during initial sync (confirmed by ShieldedLabs).
# A sidechain longer than 100 blocks corrupts the finalizer roster and
# requires a full cache wipe.
sed -i 's|c.mining.internal_miner = true;|c.mining.internal_miner = false; // explorer: passive, never mine|' \
  zebra-crosslink/zebrad/src/application.rs

# Build headless zebrad (no GUI) — ~20-30 min
cd zebra-crosslink
cargo build --release --bin zebrad
# Binary: /root/crosslink_monolith/zebra-crosslink/target/release/zebrad
```

### Systemd service

```bash
cat > /etc/systemd/system/zebrad-crosslink.service << 'EOF'
[Unit]
Description=Zebra Crosslink Node
After=network.target

[Service]
Type=simple
User=root
ExecStart=/root/crosslink_monolith/zebra-crosslink/target/release/zebrad start
Restart=always
RestartSec=10
TimeoutStopSec=30
KillMode=mixed
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable zebrad-crosslink
systemctl start zebrad-crosslink
```

### Verify RPC

```bash
curl -s -X POST http://127.0.0.1:8232/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"1.0","method":"getblockcount","params":[],"id":1}'
# Expected: {"result":HEIGHT,"error":null,"id":1}
```

---

## Phase 3: Fork & Deploy cipherscan-rust Indexer

```bash
cd /root
git clone https://github.com/ALabsGit/cipherscan-rust.git cipherscan-rust-crosslink
cd cipherscan-rust-crosslink
```

### Swap zebra-chain dependency

```bash
sed -i 's|zebra-chain = "3"|zebra-chain = { path = "/root/crosslink_monolith/zebra-crosslink/zebra-chain" }|' Cargo.toml
```

### Add Crosslink network variant

Edit `src/config.rs`:

```rust
// 1. Add variant to enum:
pub enum Network {
    Mainnet,
    Testnet,
    Crosslink,
}

// 2. In Config::from_env(), add match arm:
"crosslink" => Network::Crosslink,

// 3. In Config::network_name():
Network::Crosslink => "crosslink",
```

### Build

```bash
cargo build --release
```

### Create PostgreSQL database

```bash
sudo -u postgres psql << 'EOF'
CREATE USER crosslink_user WITH PASSWORD 'CHANGE_THIS_PASSWORD';
CREATE DATABASE zcash_explorer_crosslink OWNER crosslink_user;
GRANT ALL PRIVILEGES ON DATABASE zcash_explorer_crosslink TO crosslink_user;
\c zcash_explorer_crosslink
GRANT ALL ON SCHEMA public TO crosslink_user;
EOF
```

### Create schema

```bash
sudo -u postgres psql -d zcash_explorer_crosslink << 'SCHEMA'
CREATE TABLE IF NOT EXISTS blocks (
    height BIGINT PRIMARY KEY,
    hash TEXT NOT NULL UNIQUE,
    timestamp BIGINT NOT NULL,
    transaction_count INT NOT NULL DEFAULT 0,
    size INT,
    version INT,
    merkle_root TEXT,
    bits TEXT,
    nonce TEXT,
    difficulty DOUBLE PRECISION,
    previous_block_hash TEXT,
    miner_address TEXT,
    total_fees BIGINT DEFAULT 0,
    final_sapling_root TEXT,
    solution TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
    txid TEXT PRIMARY KEY,
    block_height BIGINT REFERENCES blocks(height),
    block_hash TEXT,
    block_time BIGINT,
    version INT,
    locktime BIGINT DEFAULT 0,
    size INT,
    fee BIGINT DEFAULT 0,
    total_input BIGINT DEFAULT 0,
    total_output BIGINT DEFAULT 0,
    sapling_value_balance BIGINT DEFAULT 0,
    orchard_value_balance BIGINT DEFAULT 0,
    is_coinbase BOOLEAN DEFAULT FALSE,
    has_sapling BOOLEAN DEFAULT FALSE,
    has_orchard BOOLEAN DEFAULT FALSE,
    vin_count INT DEFAULT 0,
    vout_count INT DEFAULT 0,
    joinsplit_count INT DEFAULT 0,
    sapling_spend_count INT DEFAULT 0,
    sapling_output_count INT DEFAULT 0,
    orchard_action_count INT DEFAULT 0,
    tx_index INT DEFAULT 0,
    expiry_height BIGINT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transaction_outputs (
    txid TEXT NOT NULL,
    vout_index INT NOT NULL,
    value BIGINT NOT NULL,
    address TEXT,
    script_type TEXT,
    PRIMARY KEY (txid, vout_index)
);

CREATE TABLE IF NOT EXISTS transaction_inputs (
    txid TEXT NOT NULL,
    vout_index INT NOT NULL,
    prev_txid TEXT,
    prev_vout INT,
    address TEXT,
    value BIGINT DEFAULT 0,
    PRIMARY KEY (txid, vout_index)
);

CREATE TABLE IF NOT EXISTS addresses (
    address TEXT PRIMARY KEY,
    balance BIGINT DEFAULT 0,
    total_received BIGINT DEFAULT 0,
    total_sent BIGINT DEFAULT 0,
    tx_count INT DEFAULT 0,
    first_seen BIGINT,
    last_seen BIGINT
);

CREATE TABLE IF NOT EXISTS address_transactions (
    address TEXT NOT NULL,
    txid TEXT NOT NULL,
    block_height BIGINT,
    block_time BIGINT,
    tx_index INT DEFAULT 0,
    is_input BOOLEAN DEFAULT FALSE,
    is_output BOOLEAN DEFAULT FALSE,
    value_in BIGINT DEFAULT 0,
    value_out BIGINT DEFAULT 0,
    PRIMARY KEY (address, txid)
);

CREATE TABLE IF NOT EXISTS shielded_flows (
    txid TEXT NOT NULL,
    block_height BIGINT,
    block_time BIGINT,
    flow_type TEXT,
    amount_zat BIGINT,
    pool TEXT,
    transparent_addresses TEXT[],
    transparent_value_zat BIGINT DEFAULT 0,
    PRIMARY KEY (txid, flow_type)
);

CREATE TABLE IF NOT EXISTS indexer_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tx_block_height ON transactions(block_height);
CREATE INDEX IF NOT EXISTS idx_tx_block_time ON transactions(block_time);
CREATE INDEX IF NOT EXISTS idx_addr_tx_height ON address_transactions(block_height);
CREATE INDEX IF NOT EXISTS idx_addr_tx_address ON address_transactions(address);
CREATE INDEX IF NOT EXISTS idx_outputs_address ON transaction_outputs(address);
CREATE INDEX IF NOT EXISTS idx_flows_height ON shielded_flows(block_height);
CREATE INDEX IF NOT EXISTS idx_blocks_hash ON blocks(hash);
SCHEMA
```

### Indexer .env and service

```bash
cat > /root/cipherscan-rust-crosslink/.env << 'EOF'
DATABASE_URL=postgres://crosslink_user:CHANGE_THIS_PASSWORD@localhost/zcash_explorer_crosslink
ZEBRA_RPC_URL=http://127.0.0.1:8232
NETWORK=crosslink
BATCH_SIZE=100
RUST_LOG=info
EOF

cat > /etc/systemd/system/crosslink-indexer.service << 'EOF'
[Unit]
Description=CipherScan Crosslink Indexer
After=network.target postgresql.service zebrad-crosslink.service

[Service]
Type=simple
User=root
WorkingDirectory=/root/cipherscan-rust-crosslink
EnvironmentFile=/root/cipherscan-rust-crosslink/.env
ExecStart=/root/cipherscan-rust-crosslink/target/release/cipherscan-indexer live
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable crosslink-indexer
systemctl start crosslink-indexer
```

---

## Phase 4: Deploy API + Frontend

### Clone and install

```bash
cd /root
git clone https://github.com/ALabsGit/zcash-explorer.git cipherscan-crosslink
cd cipherscan-crosslink
npm install

cd server/api
npm install
```

### API .env and service

```bash
cat > /root/cipherscan-crosslink/server/api/.env << 'EOF'
DB_HOST=localhost
DB_PORT=5432
DB_NAME=zcash_explorer_crosslink
DB_USER=crosslink_user
DB_PASSWORD=CHANGE_THIS_PASSWORD
PORT=3002
NODE_ENV=production
NETWORK=crosslink
ZEBRA_RPC_URL=http://127.0.0.1:8232
EOF

cat > /etc/systemd/system/crosslink-api.service << 'EOF'
[Unit]
Description=CipherScan Crosslink API
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/root/cipherscan-crosslink/server/api
EnvironmentFile=/root/cipherscan-crosslink/server/api/.env
ExecStart=/usr/bin/node /root/cipherscan-crosslink/server/api/server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable crosslink-api
systemctl start crosslink-api
```

### Frontend .env, build, and service

These are the env vars that activate crosslink mode — no code changes needed:

```bash
cat > /root/cipherscan-crosslink/.env.local << 'EOF'
NEXT_PUBLIC_NETWORK=crosslink-testnet
NEXT_PUBLIC_CROSSLINK_API_URL=https://crosslink.cipherscan.app/api
CROSSLINK_RPC_URL=http://127.0.0.1:8232
NEXT_TELEMETRY_DISABLED=1
EOF

cd /root/cipherscan-crosslink
npx next build

cat > /etc/systemd/system/crosslink-frontend.service << 'EOF'
[Unit]
Description=CipherScan Crosslink Frontend
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/cipherscan-crosslink
ExecStart=/usr/bin/npx next start -p 3000
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable crosslink-frontend
systemctl start crosslink-frontend
```

### How the env vars work

| Env Var | Effect |
|---------|--------|
| `NEXT_PUBLIC_NETWORK=crosslink-testnet` | `detectNetwork()` in `api-config.ts` returns `crosslink-testnet` server-side |
| `NEXT_PUBLIC_CROSSLINK_API_URL` | Sets `POSTGRES_API_URLS['crosslink-testnet']` for API calls |
| `CROSSLINK_RPC_URL` | Enables `lib/crosslink.ts` finality enrichment — without this, finality returns `null` gracefully |

Client-side, network detection happens automatically from the `crosslink.cipherscan.app` hostname.

---

## Phase 5: Nginx Reverse Proxy

```bash
cat > /etc/nginx/sites-available/crosslink.cipherscan.app << 'NGINX'
server {
    listen 80;
    server_name crosslink.cipherscan.app;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name crosslink.cipherscan.app;

    ssl_certificate /etc/letsencrypt/live/crosslink.cipherscan.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/crosslink.cipherscan.app/privkey.pem;

    # API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:3002/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Next.js frontend
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/crosslink.cipherscan.app /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

---

## Verify Everything

```bash
# 1. zebrad syncing
systemctl status zebrad-crosslink
curl -s -X POST http://127.0.0.1:8232/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"1.0","method":"getblockcount","params":[],"id":1}'

# 2. Indexer running
systemctl status crosslink-indexer
sudo -u postgres psql -d zcash_explorer_crosslink -c "SELECT MAX(height) FROM blocks;"

# 3. API responding
curl http://localhost:3002/health
curl "http://localhost:3002/api/blocks?limit=1"

# 4. Frontend up
curl -I https://crosslink.cipherscan.app

# 5. All services
systemctl status zebrad-crosslink crosslink-indexer crosslink-api crosslink-frontend
```

---

## Phase 6: Crosslink-Specific Features (V2 — Future)

After the base explorer is live:

1. **Validator roster page** — Poll `get_tfl_roster_zats` RPC, display on `/validators`
2. **Staking transactions** — Parse v7 `VCrosslink` / `StakingAction`, show bond/unbond/withdraw in tx details
3. **Staking day indicator** — Show when staking windows are open (every 150 blocks, 70 block window)
4. **Network stats** — Miner count, finalizer count, total staked, staking APY estimate
5. **Crosslink branding** — Banner/badge, accent color, network label in header

---

## Quick Reference

| Service | Port | Status |
|---------|------|--------|
| zebrad RPC | 8232 | `systemctl status zebrad-crosslink` |
| Indexer | — | `systemctl status crosslink-indexer` |
| API | 3002 | `systemctl status crosslink-api` |
| Frontend | 3000 | `systemctl status crosslink-frontend` |
| Nginx | 443 | `systemctl status nginx` |
| PostgreSQL | 5432 | `systemctl status postgresql` |
| Redis | 6379 | `systemctl status redis-server` |

| Log | Command |
|-----|---------|
| zebrad | `journalctl -u zebrad-crosslink -f` |
| Indexer | `journalctl -u crosslink-indexer -f` |
| API | `journalctl -u crosslink-api -f` |
| Frontend | `journalctl -u crosslink-frontend -f` |
