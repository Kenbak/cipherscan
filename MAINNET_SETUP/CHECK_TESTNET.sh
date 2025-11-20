#!/bin/bash

###############################################################################
# Script pour vérifier la config testnet et s'assurer que mainnet sera identique
###############################################################################

echo "🔍 Checking Testnet Configuration..."
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}1. PostgreSQL Schema${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

echo "Databases:"
sudo -u postgres psql -c "\l"

echo ""
echo "Tables in zcash_testnet:"
sudo -u postgres psql -d zcash_testnet -c "\dt"

echo ""
echo "Blocks table schema:"
sudo -u postgres psql -d zcash_testnet -c "\d blocks"

echo ""
echo "Transactions table schema:"
sudo -u postgres psql -d zcash_testnet -c "\d transactions"

echo ""
echo "Privacy stats table schema:"
sudo -u postgres psql -d zcash_testnet -c "\d privacy_stats"

echo ""
echo "Row counts:"
sudo -u postgres psql -d zcash_testnet -c "
SELECT
  'blocks' as table_name,
  COUNT(*) as row_count,
  MAX(height) as max_height
FROM blocks
UNION ALL
SELECT
  'transactions',
  COUNT(*),
  MAX(block_height)
FROM transactions;
"

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}2. Nginx Configuration${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

echo "Nginx sites enabled:"
ls -la /etc/nginx/sites-enabled/

echo ""
echo "API Nginx config:"
cat /etc/nginx/sites-enabled/zcash-api 2>/dev/null || echo "Not found"

echo ""
echo "Nginx test:"
nginx -t

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}3. Systemd Services${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

echo "Zcash-related services:"
systemctl list-units --all | grep -E '(zcash|zebra|lightwalletd)'

echo ""
echo "Service statuses:"
for service in zebrad zcash-indexer zcash-api lightwalletd; do
  echo ""
  echo "--- $service ---"
  systemctl status $service --no-pager -n 5 2>/dev/null || echo "Not found"
done

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}4. Lightwalletd Check${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

if [ -d "/root/lightwalletd" ]; then
  echo "✓ Lightwalletd directory exists"

  echo ""
  echo "Lightwalletd binary:"
  which lightwalletd || echo "Not in PATH"

  echo ""
  echo "Lightwalletd config:"
  cat /etc/lightwalletd/lightwalletd.conf 2>/dev/null || echo "Config not found"

  echo ""
  echo "Lightwalletd systemd service:"
  cat /etc/systemd/system/lightwalletd.service 2>/dev/null || echo "Service not found"

  echo ""
  echo "Is Lightwalletd running?"
  ps aux | grep lightwalletd | grep -v grep || echo "Not running"

  echo ""
  echo "Lightwalletd ports:"
  ss -tulpn | grep -E ':(9067|9068)' || echo "Ports not listening"

else
  echo "✗ Lightwalletd not installed"
fi

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}5. Zebra/Zcashd Check${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

echo "Zebra binary:"
which zebrad || echo "Not found"

echo ""
echo "Zebra config:"
cat /etc/zebrad/zebrad.toml 2>/dev/null || echo "Not found"

echo ""
echo "RPC check (port 18232 for testnet):"
ss -tulpn | grep 18232 || echo "Port 18232 not listening"

echo ""
echo "Blockchain info via RPC:"
curl -s -X POST http://localhost:18232 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"1.0","id":"check","method":"getblockchaininfo","params":[]}' \
  | jq . || echo "RPC call failed"

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}6. API Server Check${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

if [ -d "/root/zcash-api" ]; then
  echo "✓ API directory exists"

  echo ""
  echo "API .env file:"
  cat /root/zcash-api/.env 2>/dev/null || echo ".env not found"

  echo ""
  echo "API server.js (first 50 lines):"
  head -n 50 /root/zcash-api/server.js 2>/dev/null || echo "server.js not found"

  echo ""
  echo "API port check:"
  ss -tulpn | grep 3000 || echo "Port 3000 not listening"

else
  echo "✗ API directory not found"
fi

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}7. Indexer Check${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

if [ -d "/root/zcash-indexer" ]; then
  echo "✓ Indexer directory exists"

  echo ""
  echo "Indexer .env file:"
  cat /root/zcash-indexer/.env 2>/dev/null || echo ".env not found"

  echo ""
  echo "Indexer index.js (first 50 lines):"
  head -n 50 /root/zcash-indexer/index.js 2>/dev/null || echo "index.js not found"

else
  echo "✗ Indexer directory not found"
fi

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}8. SSL Certificates${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

echo "Certbot certificates:"
certbot certificates 2>/dev/null || echo "Certbot not installed or no certs"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✓ Testnet check complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Save this output to compare with mainnet setup!"
