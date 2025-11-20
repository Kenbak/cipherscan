# 🚀 Zcash Mainnet Setup Guide

Complete setup for Zcash mainnet infrastructure based on [zec.rocks best practices](https://github.com/zecrocks/zcash-stack).

## 📋 Server Specs

- **CPU**: 8 vCPUs (Premium AMD)
- **RAM**: 16 GB
- **Storage**: 320 GB SSD
- **Cost**: $112/month (DigitalOcean)

## 📦 What's Included

1. **Zebra** - Zcash full node (mainnet)
2. **Lightwalletd** - Light wallet server (💰 **EARN $100/MONTH!**)
3. **PostgreSQL** - Indexed blockchain database
4. **Indexer** - Real-time blockchain indexer
5. **Express API** - REST API for blockchain data
6. **Nginx + Caddy** - Reverse proxies with SSL

## 💰 ZEC.ROCKS REWARDS PROGRAM

**Your server can earn ~$100/month in ZEC!**

By running a reliable Lightwalletd server, you qualify for [Zec.rocks monthly rewards](https://forum.zec.rocks/t/zcash-operators-earn-zec-for-your-uptime):
- **$150 one-time** initial payout
- **~$100/month** for top 25 servers with best uptime
- **Paid in ZEC** to your Orchard donation address
- **Monitored by Hosh** for uptime tracking

Requirements:
- ✅ Run Lightwalletd with latest version
- ✅ Broadcast an Orchard donation address
- ✅ Maintain high uptime (24/7)
- ✅ Register on [Hosh](https://hosh.zec.rocks)

## 🎯 Quick Start

### Step 1: Verify Server

```bash
ssh root@your-mainnet-server

# Run verification checklist
cat VERIFICATION_CHECKLIST.md
```

### Step 2: Copy Files to Server

```bash
# From your local machine
scp -r MAINNET_SETUP/* root@your-mainnet-server:/root/mainnet-setup/
```

### Step 3: Run Setup Script

```bash
# On the server
cd /root/mainnet-setup
chmod +x setup-mainnet.sh
sudo ./setup-mainnet.sh
```

### Step 4: Start Zebra

```bash
sudo systemctl start zebrad-mainnet
sudo systemctl enable zebrad-mainnet

# Monitor sync progress
sudo journalctl -u zebrad-mainnet -f
```

### Step 5: Download Snapshot (Optional but Recommended)

**Without snapshot**: ~10 days sync time
**With snapshot**: ~10 hours sync time

```bash
# Download latest mainnet snapshot (this will take a few hours)
cd /var/lib/zebrad-cache
wget https://snapshot.mainnet.zcash.network/latest -O mainnet-snapshot.tar.gz

# Extract
tar -xzf mainnet-snapshot.tar.gz

# Fix permissions
chown -R zebra:zebra /var/lib/zebrad-cache

# Restart Zebra
sudo systemctl restart zebrad-mainnet
```

### Step 6: Setup Indexer

```bash
cd /root/zcash-mainnet/indexer

# Copy indexer script
cp /root/mainnet-setup/indexer-mainnet.js .

# Install dependencies
npm install pg axios

# Create .env file
cat > .env << 'EOF'
ZEBRA_RPC_URL=http://localhost:8232
DB_HOST=localhost
DB_PORT=5432
DB_NAME=zcash_mainnet
DB_USER=zcash
DB_PASSWORD=YOUR_PASSWORD_HERE
EOF

# Create systemd service
sudo tee /etc/systemd/system/zcash-indexer-mainnet.service > /dev/null << 'EOF'
[Unit]
Description=Zcash Mainnet Indexer
After=zebrad-mainnet.service postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/root/zcash-mainnet/indexer
ExecStart=/usr/bin/node indexer-mainnet.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Start indexer (ONLY after Zebra is fully synced!)
sudo systemctl daemon-reload
sudo systemctl start zcash-indexer-mainnet
sudo systemctl enable zcash-indexer-mainnet

# Monitor
sudo journalctl -u zcash-indexer-mainnet -f
```

### Step 7: Setup API

```bash
cd /root/zcash-mainnet/api

# Copy server.js from testnet and adapt
# (Use the same server.js but with mainnet env vars)

# Create .env
cat > .env << 'EOF'
PORT=3001
ZEBRA_RPC_URL=http://localhost:8232
DATABASE_URL=postgresql://zcash:YOUR_PASSWORD@localhost/zcash_mainnet
ALLOWED_ORIGINS=https://cipherscan.app,https://www.cipherscan.app
EOF

# Install dependencies
npm install express pg cors helmet express-rate-limit

# Create systemd service
sudo tee /etc/systemd/system/zcash-api-mainnet.service > /dev/null << 'EOF'
[Unit]
Description=Zcash Mainnet API
After=postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/root/zcash-mainnet/api
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Start API
sudo systemctl daemon-reload
sudo systemctl start zcash-api-mainnet
sudo systemctl enable zcash-api-mainnet

# Test API
curl http://localhost:3001/api/info
```

### Step 8: Configure Nginx

```bash
# Create Nginx config for api.cipherscan.app
sudo tee /etc/nginx/sites-available/api-mainnet << 'EOF'
server {
    listen 80;
    server_name api.cipherscan.app;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# Enable site
sudo ln -s /etc/nginx/sites-available/api-mainnet /etc/nginx/sites-enabled/

# Test config
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx

# Setup SSL with Certbot
sudo certbot --nginx -d api.cipherscan.app
```

## 📊 Monitoring

### Check Zebra Sync Status

```bash
# Via RPC
curl -s -X POST http://localhost:8232 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"1.0","id":"curl","method":"getblockchaininfo","params":[]}' \
  | jq .

# Via logs
sudo journalctl -u zebrad-mainnet -n 100 --no-pager
```

### Check Indexer Progress

```bash
# Via logs
sudo journalctl -u zcash-indexer-mainnet -f

# Via PostgreSQL
sudo -u postgres psql -d zcash_mainnet -c "SELECT MAX(height) FROM blocks;"
```

### Check API

```bash
# Health check
curl https://api.cipherscan.app/api/info

# Get latest block
curl https://api.cipherscan.app/api/blocks?limit=1
```

### Step 9: Setup Lightwalletd (💰 EARN $100/MONTH!)

```bash
cd /root/mainnet-setup
chmod +x setup-lightwalletd.sh
sudo ./setup-lightwalletd.sh
```

**Get your Orchard donation address:**
```bash
# Option 1: Use Zingo CLI
zingo-cli --server https://testnet.lightwalletd.com:443
> addresses
> Copy the Unified Address (u1...)

# Option 2: Use any Zcash wallet (Zingo mobile, Ywallet, etc.)
```

**Configure donation address:**
```bash
sudo nano /etc/systemd/system/lightwalletd.service
# Replace: YOUR_ORCHARD_ADDRESS_HERE with your actual address
```

**Start Lightwalletd (ONLY after Zebra is fully synced!):**
```bash
sudo systemctl daemon-reload
sudo systemctl start lightwalletd
sudo systemctl enable lightwalletd

# Monitor
sudo journalctl -u lightwalletd -f
```

**Register for rewards:**
1. Go to [Hosh](https://hosh.zec.rocks)
2. Add your server: `lightwalletd.cipherscan.app:443`
3. Post on [Zec.rocks forum](https://forum.zec.rocks/t/zcash-operators-earn-zec-for-your-uptime)

## ⏱️ Timeline

| Task | Duration |
|------|----------|
| Server resize | 5-15 minutes |
| Setup script | 10-15 minutes |
| Zebra sync (from scratch) | ~10 days |
| Zebra sync (from snapshot) | ~10 hours |
| Indexer catch-up | ~2-4 hours |
| Lightwalletd setup | 15-20 minutes |
| **Total (with snapshot)** | **~12-16 hours** |

## 💰 ROI Calculation

**Monthly Costs:**
- Server: $112/month

**Monthly Revenue:**
- Zec.rocks rewards: ~$100/month
- **Net cost: $12/month** 🎉

Plus, you're helping decentralize Zcash! 🚀

## 🔍 Troubleshooting

### Zebra won't start

```bash
# Check logs
sudo journalctl -u zebrad-mainnet -n 100

# Check config
zebrad -c /etc/zebrad/zebrad.toml check

# Check permissions
ls -la /var/lib/zebrad-cache
```

### Indexer stuck

```bash
# Check if Zebra is synced
curl -s -X POST http://localhost:8232 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"1.0","id":"curl","method":"getblockchaininfo","params":[]}' \
  | jq '.result.blocks'

# Restart indexer
sudo systemctl restart zcash-indexer-mainnet
```

### API not responding

```bash
# Check if running
sudo systemctl status zcash-api-mainnet

# Check logs
sudo journalctl -u zcash-api-mainnet -n 50

# Test locally
curl http://localhost:3001/api/info
```

## 📚 Resources

- [Zec.rocks Workshop](https://github.com/zecrocks/zcash-stack/tree/main/docs)
- [Zebra Documentation](https://zebra.zfnd.org/)
- [Zcash Protocol Spec](https://zips.z.cash/protocol/protocol.pdf)

## 🎉 Success Criteria

- ✅ Zebra synced to latest block
- ✅ Indexer caught up with Zebra
- ✅ API responding at `https://api.cipherscan.app`
- ✅ Frontend deployed at `https://cipherscan.app`
- ✅ SSL certificates valid
- ✅ All services running and enabled

---

**Next**: Once everything is running, deploy the frontend to Vercel pointing to `https://api.cipherscan.app`!
