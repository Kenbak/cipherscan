# CipherScan Server Deployment Guide

This guide explains how to deploy the CipherScan API and Indexer on a fresh server.

## Prerequisites

- Ubuntu 22.04 LTS
- Node.js 20+ (via snap: `snap install node --classic`)
- PostgreSQL 14+
- Redis
- Zebrad (Zcash node)

## 1. Clone the Repository

```bash
cd ~
git clone https://github.com/Kenbak/cipherscan.git
cd cipherscan
```

## 2. Install Dependencies

```bash
# API Server
cd ~/cipherscan/server/api
npm install

# Indexer
cd ~/cipherscan/server/indexer
npm install
```

## 3. Create Environment Files

### API Server (.env)

```bash
cd ~/cipherscan/server/api
cat > .env << 'EOF'
DB_HOST=localhost
DB_PORT=5432
DB_NAME=zcash_explorer_NETWORK
DB_USER=zcash_user
DB_PASSWORD=YOUR_DB_PASSWORD
PORT=3001
NODE_ENV=production
EOF
```

Replace:
- `NETWORK` with `testnet` or `mainnet`
- `YOUR_DB_PASSWORD` with your actual password

### Indexer (.env)

```bash
cd ~/cipherscan/server/indexer
cat > .env << 'EOF'
# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=zcash_explorer_NETWORK
DB_USER=zcash_user
DB_PASSWORD=YOUR_DB_PASSWORD

# Zebrad RPC
ZEBRA_RPC_URL=http://127.0.0.1:18232
ZEBRA_RPC_COOKIE_FILE=/root/.cache/zebra/.cookie

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Network
NETWORK=testnet
NODE_ENV=production
EOF
```

Replace:
- `NETWORK` with `testnet` or `mainnet`
- `YOUR_DB_PASSWORD` with your actual password
- `18232` with `8232` for mainnet

## 4. Create Systemd Services

### API Service

```bash
cat > /etc/systemd/system/zcash-api.service << 'EOF'
[Unit]
Description=Zcash Explorer API Server
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/root/cipherscan/server/api
EnvironmentFile=/root/cipherscan/server/api/.env
ExecStart=/snap/bin/node /root/cipherscan/server/api/server.js
Restart=always
RestartSec=10
TimeoutStopSec=10
KillMode=mixed
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
```

### Indexer Service

```bash
cat > /etc/systemd/system/zcash-indexer.service << 'EOF'
[Unit]
Description=Zcash Blockchain Indexer
After=network.target postgresql.service redis-server.service zebrad.service

[Service]
Type=simple
User=root
WorkingDirectory=/root/cipherscan/server/indexer
EnvironmentFile=/root/cipherscan/server/indexer/.env
ExecStart=/snap/bin/node /root/cipherscan/server/indexer/index.js
Restart=always
RestartSec=10
TimeoutStopSec=10
KillMode=mixed
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
```

## 5. Start Services

```bash
systemctl daemon-reload
systemctl enable zcash-api
systemctl enable zcash-indexer
systemctl start zcash-api
systemctl start zcash-indexer
```

## 6. Verify

```bash
# Check status
systemctl status zcash-api
systemctl status zcash-indexer

# Test API
curl http://localhost:3001/health
curl "http://localhost:3001/api/blocks?limit=1"

# View logs
journalctl -u zcash-api -f
journalctl -u zcash-indexer -f
```

## Updating (Deployment)

To deploy updates:

```bash
cd ~/cipherscan
git pull
cd server/api && npm install
cd ../indexer && npm install
systemctl restart zcash-api
systemctl restart zcash-indexer
```

## Troubleshooting

### Service won't start

```bash
# Check logs
journalctl -u zcash-api -n 50

# Test manually
systemctl stop zcash-api
cd ~/cipherscan/server/api
node server.js
```

### Database connection issues

```bash
# Test PostgreSQL connection
PGPASSWORD=YOUR_PASSWORD psql -h localhost -U zcash_user -d zcash_explorer_testnet -c "SELECT 1;"
```

### Port already in use

```bash
# Find process using port 3001
lsof -i :3001
# Kill if needed
kill -9 PID
```

## Network-Specific Notes

### Testnet
- Zebra RPC port: `18232`
- Database: `zcash_explorer_testnet`
- API port: `3001`

### Mainnet
- Zebra RPC port: `8232`
- Database: `zcash_explorer_mainnet`
- API port: `3001` (or different if running both)

