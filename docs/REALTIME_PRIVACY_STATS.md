# ⚡ Real-Time Privacy Stats

## Overview

Automatic privacy statistics updates triggered by new blocks on the blockchain.

**Architecture:**
1. **Block Watcher** - Monitors blockchain for new blocks (every 60s)
2. **Update Server** - Receives update requests and executes calculation script
3. **Privacy Stats Script** - Calculates stats incrementally (only new blocks)
4. **API Server** - Serves stats to frontend via Nginx

**Optimization:**
- ✅ Updates triggered every **10 blocks** (~25 minutes)
- ✅ Incremental calculation (only new blocks)
- ✅ Rate limited (1 update per minute max)
- ✅ Async execution (doesn't block other services)

## Performance

**Before optimization:**
- 576 updates/day (~every 2.5 min)
- High CPU usage (~20%)

**After optimization:**
- ~58 updates/day (~every 25 min)
- Low CPU usage (~2%)
- **90% reduction in load** 🎉

## Setup on RPC Server

### 1. Install Dependencies

```bash
cd /root/zcash-explorer

# node-fetch for block-watcher
npm install node-fetch
```

### 2. Set Environment Variables

```bash
# Add to ~/.bashrc or create .env file
export PRIVACY_STATS_UPDATE_TOKEN="your-secure-random-token-here"
export ZCASH_RPC_URL="http://127.0.0.1:18232"
export ZCASH_RPC_USER="your-rpc-username"
export ZCASH_RPC_PASS="your-rpc-password"
```

### 3. Create Systemd Services

#### Update Server Service

```bash
sudo nano /etc/systemd/system/privacy-stats-update-server.service
```

```ini
[Unit]
Description=Privacy Stats Update Server
After=network.target zebrad.service

[Service]
Type=simple
User=root
WorkingDirectory=/root/zcash-explorer
Environment="PRIVACY_STATS_UPDATE_TOKEN=your-secure-token"
ExecStart=/snap/bin/node /root/zcash-explorer/scripts/privacy-stats-update-server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

#### Block Watcher Service

```bash
sudo nano /etc/systemd/system/block-watcher.service
```

```ini
[Unit]
Description=Zcash Block Watcher for Privacy Stats
After=network.target zebrad.service privacy-stats-update-server.service

[Service]
Type=simple
User=root
WorkingDirectory=/root/zcash-explorer
Environment="PRIVACY_STATS_UPDATE_TOKEN=your-secure-token"
Environment="ZCASH_RPC_URL=http://127.0.0.1:18232"
Environment="ZCASH_RPC_USER=your-rpc-username"
Environment="ZCASH_RPC_PASS=your-rpc-password"
ExecStart=/snap/bin/node /root/zcash-explorer/scripts/block-watcher.mjs
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### 4. Enable and Start Services

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable services (start on boot)
sudo systemctl enable privacy-stats-update-server
sudo systemctl enable block-watcher

# Start services
sudo systemctl start privacy-stats-update-server
sudo systemctl start block-watcher

# Check status
sudo systemctl status privacy-stats-update-server
sudo systemctl status block-watcher
```

### 5. View Logs

```bash
# Update server logs
sudo journalctl -u privacy-stats-update-server -f

# Block watcher logs
sudo journalctl -u block-watcher -f

# Both
sudo journalctl -u privacy-stats-update-server -u block-watcher -f
```

## Configuration

### Adjust Update Frequency

Edit `/root/zcash-explorer/scripts/block-watcher.mjs`:

```javascript
const UPDATE_THRESHOLD = 10; // Change to 5, 20, etc.
```

Then restart:
```bash
sudo systemctl restart block-watcher
```

### Adjust Check Interval

```javascript
const CHECK_INTERVAL = 60000; // 1 minute (in milliseconds)
```

## Frontend Integration

The frontend automatically fetches updated stats from `/api/privacy-stats` which proxies to the Nginx-exposed API.

**No frontend changes needed!** Stats update automatically every 10 blocks.

## Security

### Authentication

- ✅ Bearer token required for update endpoint
- ✅ Update server only listens on localhost (127.0.0.1)
- ✅ Exposed via Nginx with rate limiting

### Rate Limiting

- ✅ 1 update per minute (server-side)
- ✅ Nginx rate limiting (10 req/min per IP)

### Token Generation

```bash
# Generate secure token
openssl rand -hex 32
```

Update in:
1. `.bashrc` or `.env` on RPC server
2. `.env.local` on Next.js app (for `/api/privacy-stats/update`)

## Monitoring

### Check if Services are Running

```bash
sudo systemctl is-active privacy-stats-update-server
sudo systemctl is-active block-watcher
```

### Check Last Update Time

```bash
# View stats file timestamp
ls -lh /data/privacy-stats.json
```

### Manual Trigger (for testing)

```bash
curl -X POST http://127.0.0.1:8082/update \
  -H "Authorization: Bearer your-token-here"
```

## Troubleshooting

### Service won't start

```bash
# Check logs
sudo journalctl -u block-watcher -n 50

# Common issues:
# - Node.js path wrong (use /snap/bin/node)
# - Script path wrong
# - Environment variables not set
```

### Updates not triggering

```bash
# Check block watcher logs
sudo journalctl -u block-watcher -f

# Should see:
# "🆕 New block(s) detected!"
# "Blocks since last update: X/10"
```

### Stats file not updating

```bash
# Check update server logs
sudo journalctl -u privacy-stats-update-server -f

# Test manual update
curl -X POST http://127.0.0.1:8082/update \
  -H "Authorization: Bearer your-token"
```

## Architecture Diagram

```
┌─────────────────┐
│   Zebrad RPC    │
└────────┬────────┘
         │
         ├──────────────────────────────┐
         │                              │
         ▼                              ▼
┌─────────────────┐          ┌──────────────────┐
│  Block Watcher  │─────────▶│  Update Server   │
│  (every 60s)    │  POST    │  (localhost:8082)│
│  Threshold: 10  │          └────────┬─────────┘
└─────────────────┘                   │
                                      ▼
                          ┌───────────────────────┐
                          │ calculate-privacy-    │
                          │ stats.mjs (incr.)     │
                          └───────────┬───────────┘
                                      │
                                      ▼
                          ┌───────────────────────┐
                          │ /data/privacy-stats   │
                          │ .json                 │
                          └───────────┬───────────┘
                                      │
                                      ▼
                          ┌───────────────────────┐
                          │ Privacy Stats API     │
                          │ Server (port 8081)    │
                          └───────────┬───────────┘
                                      │
                                      ▼
                          ┌───────────────────────┐
                          │ Nginx Reverse Proxy   │
                          │ (public endpoint)     │
                          └───────────┬───────────┘
                                      │
                                      ▼
                          ┌───────────────────────┐
                          │ Next.js Frontend      │
                          │ /api/privacy-stats    │
                          └───────────────────────┘
```

## Benefits

- ✅ **Always up-to-date** - Stats update automatically
- ✅ **Efficient** - Only processes new blocks (incremental)
- ✅ **Optimized** - Updates every 10 blocks (not every block)
- ✅ **Reliable** - Auto-restart on failure
- ✅ **Secure** - Token auth + rate limiting
- ✅ **Scalable** - Low resource usage (~2% CPU)

## Future Improvements

- [ ] WebSocket notifications to frontend (real-time updates)
- [ ] Configurable threshold via API
- [ ] Metrics dashboard (Prometheus/Grafana)
- [ ] Alert on failed updates (email/Slack)
