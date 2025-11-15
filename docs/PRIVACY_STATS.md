# 🛡️ Privacy Statistics System

Complete system to track and display Zcash blockchain privacy metrics.

## 🎯 What It Tracks

### **Core Metrics:**
- **Shielded vs Transparent Ratio**: % of transactions using privacy features
- **Shielded Pool Size**: Total TAZ in shielded addresses
- **Privacy Score**: 0-100 score based on privacy adoption
- **Adoption Trends**: Daily/weekly/monthly privacy usage

### **Transaction Types:**
- **Fully Shielded**: 100% private (best privacy)
- **Mixed**: Both shielded and transparent components
- **Transparent**: Fully public (no privacy)

## 🏗️ Architecture

```
┌──────────────────────────────────────┐
│ DigitalOcean Server                  │
│                                      │
│ ┌────────────┐  ┌─────────────────┐ │
│ │ Zebrad RPC │→ │ Privacy Worker  │ │
│ │  (Node)    │  │ (Cron 3AM UTC)  │ │
│ └────────────┘  └─────────────────┘ │
│                         ↓            │
│                  ┌──────────────┐    │
│                  │privacy-stats │    │
│                  │   .json      │    │
│                  └──────────────┘    │
└──────────────────────────────────────┘
              ↓
    ┌──────────────────┐
    │ Netlify/Vercel   │
    │ API Route        │
    │ /api/privacy     │
    └──────────────────┘
              ↓
    ┌──────────────────┐
    │ Frontend         │
    │ Privacy          │
    │ Dashboard        │
    └──────────────────┘
```

## 🚀 Setup Instructions

### **1. Install Dependencies**

```bash
cd /Users/imaginarium/code/zcash-explorer
npm install  # If not already done
```

### **2. Test Locally (Optional)**

```bash
# Make scripts executable
chmod +x scripts/calculate-privacy-stats.js
chmod +x scripts/test-privacy-stats.js

# Test on last 100 blocks
node scripts/test-privacy-stats.js

# Should create: data/privacy-stats.json
```

### **3. Deploy to DigitalOcean Server**

```bash
# SSH into your server
ssh root@YOUR_SERVER_IP

# Create project directory
mkdir -p /root/zcash-privacy-stats
cd /root/zcash-privacy-stats

# Copy the script
# (From your local machine)
scp scripts/calculate-privacy-stats.js root@YOUR_SERVER_IP:/root/zcash-privacy-stats/

# Install Node.js if not present
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Test run
export ZCASH_RPC_URL=http://localhost:18232
export ZCASH_RPC_COOKIE="your-cookie"
node calculate-privacy-stats.js

# Should output stats and create privacy-stats.json
```

### **4. Setup Cron Job**

```bash
# On DigitalOcean server
crontab -e

# Add this line (runs daily at 3 AM UTC):
0 3 * * * cd /root/zcash-privacy-stats && ZCASH_RPC_URL=http://localhost:18232 ZCASH_RPC_COOKIE="your-cookie" node calculate-privacy-stats.js >> /var/log/privacy-stats.log 2>&1
```

### **5. Serve Stats via CDN (Option A: Simple)**

```bash
# Create a public directory on your server
mkdir -p /var/www/stats

# Symlink stats file
ln -s /root/zcash-privacy-stats/data/privacy-stats.json /var/www/stats/privacy-stats.json

# Setup nginx to serve it
# Add to nginx config:
location /stats/ {
    alias /var/www/stats/;
    add_header Access-Control-Allow-Origin *;
    add_header Cache-Control "public, max-age=300";
}

# Update API to fetch from:
# https://your-server-ip/stats/privacy-stats.json
```

### **5. Serve Stats via CDN (Option B: S3/R2)**

```bash
# Upload to Cloudflare R2 (free 10GB)
# Or AWS S3

# After calculation, upload:
aws s3 cp data/privacy-stats.json s3://your-bucket/privacy-stats.json --acl public-read

# Update API to fetch from:
# https://your-bucket.s3.amazonaws.com/privacy-stats.json
```

## 📊 Data Structure

```json
{
  "version": "1.0",
  "lastUpdated": "2025-11-01T03:00:00Z",
  "lastBlockScanned": 1706202,

  "totals": {
    "blocks": 1706202,
    "shieldedTx": 45230,
    "transparentTx": 125430,
    "mixedTx": 5420,
    "fullyShieldedTx": 38500
  },

  "shieldedPool": {
    "currentSize": 12500000.50,
    "totalShielded": 15000000,
    "totalUnshielded": 2500000
  },

  "metrics": {
    "shieldedPercentage": 26.5,
    "privacyScore": 73,
    "avgShieldedPerDay": 120,
    "adoptionTrend": "growing"
  },

  "trends": {
    "daily": [
      {
        "date": "2025-11-01",
        "blocks": 1706202,
        "shielded": 45230,
        "transparent": 125430,
        "poolSize": 12500000.50,
        "shieldedPercentage": 26.5
      }
    ]
  }
}
```

## ⚡ Performance

### **First Run (Complete Scan):**
- Scans: All blocks (0 → current)
- Time: 30-60 minutes
- Frequency: Once

### **Daily Updates (Incremental):**
- Scans: ~100 new blocks/day
- Time: 1-5 minutes
- Frequency: Daily at 3 AM

### **Server Impact:**
- CPU: ~30-50% during calculation
- RAM: ~500 MB
- Duration: 1-5 min/day
- ✅ Minimal impact on Zebrad node

## 🎨 Privacy Score Algorithm

```typescript
Privacy Score =
  (Shielded Ratio × 40%) +        // % of txs that are shielded
  (Fully Shielded Ratio × 40%) +  // % of txs that are 100% private
  (Pool Size Score × 20%)         // Size of shielded pool

Where:
- Shielded Ratio = shieldedTx / (shieldedTx + transparentTx)
- Fully Shielded Ratio = fullyShieldedTx / totalTx
- Pool Size Score = min(poolSize / 10M TAZ, 1.0)

Result: 0-100 (higher = more private)
```

## 🧪 Testing

### **Test API Locally:**

```bash
# Start dev server
npm run dev

# Test endpoint
curl http://localhost:3000/api/privacy-stats | jq

# Should return stats or "not yet available"
```

### **Test on Production:**

```bash
curl https://testnet.cipherscan.app/api/privacy-stats | jq
```

## 📈 Monitoring

### **Check Last Update:**

```bash
# On server
cat /root/zcash-privacy-stats/data/privacy-stats.json | jq '.lastUpdated'
```

### **Check Cron Logs:**

```bash
# On server
tail -f /var/log/privacy-stats.log
```

### **Manual Run:**

```bash
# On server
cd /root/zcash-privacy-stats
node calculate-privacy-stats.js
```

## 🐛 Troubleshooting

### **Stats Not Updating:**

```bash
# Check cron is running
crontab -l

# Check logs
tail -50 /var/log/privacy-stats.log

# Manual test
node calculate-privacy-stats.js
```

### **API Returns 503:**

```bash
# Stats file missing
ls -la data/privacy-stats.json

# Run calculator
node scripts/calculate-privacy-stats.js
```

### **RPC Connection Failed:**

```bash
# Check Zebrad is running
ps aux | grep zebrad

# Test RPC
curl -X POST http://localhost:18232 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"1.0","method":"getblockcount","params":[]}'
```

## 🎯 Next Steps

1. ✅ Script created
2. ✅ API endpoint created
3. ⏳ Deploy to DigitalOcean
4. ⏳ Setup cron job
5. ⏳ Create dashboard UI
6. ⏳ Add widget to homepage

---

**Status:** ✅ Backend Complete | ⏳ Frontend Pending
**Last Updated:** November 2025
