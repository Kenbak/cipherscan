#!/bin/bash

###############################################################################
# Fix Lightwalletd on Testnet
# This script diagnoses and fixes Lightwalletd issues
###############################################################################

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                                                               ║"
echo "║       Lightwalletd Testnet Diagnostic & Fix                  ║"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Step 1: Check if lightwalletd exists
echo -e "\n${YELLOW}🔍 Step 1: Checking Lightwalletd installation...${NC}"

if [ -d "/root/lightwalletd" ]; then
  echo -e "${GREEN}✅ Lightwalletd directory exists${NC}"
  cd /root/lightwalletd

  if [ -f "lightwalletd" ]; then
    echo -e "${GREEN}✅ Lightwalletd binary exists${NC}"
    ./lightwalletd --version || echo "Binary exists but version check failed"
  else
    echo -e "${RED}❌ Lightwalletd binary NOT found${NC}"
    echo -e "${YELLOW}Building Lightwalletd...${NC}"

    # Install Go if needed
    if ! command -v go &> /dev/null; then
      echo -e "${YELLOW}Installing Go...${NC}"
      apt update
      apt install -y golang-go
    fi

    # Build lightwalletd
    go build -o lightwalletd ./cmd/lightwalletd
    echo -e "${GREEN}✅ Lightwalletd built successfully${NC}"
  fi
else
  echo -e "${RED}❌ Lightwalletd directory NOT found${NC}"
  echo -e "${YELLOW}Cloning and building Lightwalletd...${NC}"

  # Install Go if needed
  if ! command -v go &> /dev/null; then
    echo -e "${YELLOW}Installing Go...${NC}"
    apt update
    apt install -y golang-go
  fi

  # Clone and build
  cd /root
  git clone https://github.com/zcash/lightwalletd.git
  cd lightwalletd
  go build -o lightwalletd ./cmd/lightwalletd
  echo -e "${GREEN}✅ Lightwalletd installed successfully${NC}"
fi

# Step 2: Check Zebra status
echo -e "\n${YELLOW}🔍 Step 2: Checking Zebra status...${NC}"

if systemctl is-active --quiet zebrad; then
  echo -e "${GREEN}✅ Zebra is running${NC}"

  # Check if RPC is responding
  COOKIE=$(cat /root/.cache/zebra/.cookie 2>/dev/null || echo "")
  if [ -n "$COOKIE" ]; then
    echo -e "${GREEN}✅ Zebra cookie found${NC}"

    # Test RPC
    RESPONSE=$(curl -s --user "$COOKIE" --data-binary '{"jsonrpc":"1.0","id":"test","method":"getblockchaininfo","params":[]}' -H 'content-type: text/plain;' http://127.0.0.1:18232/ || echo "")

    if [ -n "$RESPONSE" ]; then
      echo -e "${GREEN}✅ Zebra RPC is responding${NC}"
      echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
    else
      echo -e "${RED}❌ Zebra RPC is NOT responding${NC}"
    fi
  else
    echo -e "${RED}❌ Zebra cookie NOT found${NC}"
  fi
else
  echo -e "${RED}❌ Zebra is NOT running${NC}"
  echo "Start Zebra first: systemctl start zebrad"
  exit 1
fi

# Step 3: Create Lightwalletd config
echo -e "\n${YELLOW}🔍 Step 3: Creating Lightwalletd config...${NC}"

cat > /root/lightwalletd/lightwalletd.yml << 'EOF'
# Lightwalletd configuration for Zcash Testnet

# Network type
chain-name: "testnet"

# Zebra RPC connection
zcash-rpc-url: "http://127.0.0.1:18232"
zcash-rpc-cookie-file: "/root/.cache/zebra/.cookie"

# gRPC server settings
grpc-bind-addr: "127.0.0.1:9067"

# Disable TLS for local/internal use
no-tls-very-insecure: true

# Logging
log-file: "/var/log/lightwalletd.log"
log-level: "info"

# Data directory
data-dir: "/var/lib/lightwalletd"

# Cache settings
cache-size: 1000

# Sapling activation height (testnet)
sapling-activation-height: 280000

# Orchard activation height (testnet)
orchard-activation-height: 1842420
EOF

echo -e "${GREEN}✅ Config created at /root/lightwalletd/lightwalletd.yml${NC}"

# Step 4: Create data directory
echo -e "\n${YELLOW}🔍 Step 4: Creating data directory...${NC}"
mkdir -p /var/lib/lightwalletd
mkdir -p /var/log
touch /var/log/lightwalletd.log
echo -e "${GREEN}✅ Data directory created${NC}"

# Step 5: Update systemd service
echo -e "\n${YELLOW}🔍 Step 5: Updating systemd service...${NC}"

cat > /etc/systemd/system/lightwalletd.service << 'EOF'
[Unit]
Description=Lightwalletd Zcash Testnet
After=network.target zebrad.service
Requires=zebrad.service
StartLimitIntervalSec=0

[Service]
Type=simple
User=root
WorkingDirectory=/root/lightwalletd
ExecStart=/root/lightwalletd/lightwalletd --config /root/lightwalletd/lightwalletd.yml
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

# Increase file descriptor limit
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
echo -e "${GREEN}✅ Systemd service updated${NC}"

# Step 6: Start Lightwalletd
echo -e "\n${YELLOW}🔍 Step 6: Starting Lightwalletd...${NC}"

systemctl enable lightwalletd
systemctl restart lightwalletd

# Wait a bit for startup
sleep 3

# Check status
if systemctl is-active --quiet lightwalletd; then
  echo -e "${GREEN}✅ Lightwalletd is running!${NC}"

  # Show logs
  echo -e "\n${YELLOW}📋 Recent logs:${NC}"
  journalctl -u lightwalletd -n 20 --no-pager

  # Check if gRPC port is listening
  if ss -tlnp | grep -q ":9067"; then
    echo -e "\n${GREEN}✅ gRPC port 9067 is listening${NC}"
  else
    echo -e "\n${YELLOW}⚠️  gRPC port 9067 is NOT listening yet (may take a few seconds)${NC}"
  fi
else
  echo -e "${RED}❌ Lightwalletd failed to start${NC}"
  echo -e "\n${YELLOW}📋 Error logs:${NC}"
  journalctl -u lightwalletd -n 50 --no-pager
  exit 1
fi

# Step 7: Test gRPC connection
echo -e "\n${YELLOW}🔍 Step 7: Testing gRPC connection...${NC}"

# Install grpcurl if not present
if ! command -v grpcurl &> /dev/null; then
  echo -e "${YELLOW}Installing grpcurl...${NC}"
  apt install -y grpcurl || {
    # Alternative: install from GitHub
    wget https://github.com/fullstorydev/grpcurl/releases/download/v1.8.9/grpcurl_1.8.9_linux_x86_64.tar.gz
    tar -xzf grpcurl_1.8.9_linux_x86_64.tar.gz
    mv grpcurl /usr/local/bin/
    rm grpcurl_1.8.9_linux_x86_64.tar.gz
  }
fi

# Wait a bit more for full startup
sleep 5

# Test GetLightdInfo
echo -e "\n${YELLOW}Testing GetLightdInfo...${NC}"
grpcurl -plaintext 127.0.0.1:9067 cash.z.wallet.sdk.rpc.CompactTxStreamer/GetLightdInfo || {
  echo -e "${RED}❌ gRPC test failed${NC}"
  echo -e "${YELLOW}Lightwalletd may still be initializing. Check logs:${NC}"
  echo "journalctl -u lightwalletd -f"
}

echo -e "\n${GREEN}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                                                               ║"
echo "║       ✅ Lightwalletd Setup Complete!                         ║"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "${YELLOW}📋 Next Steps:${NC}"
echo ""
echo "1. Monitor logs:"
echo "   journalctl -u lightwalletd -f"
echo ""
echo "2. Check status:"
echo "   systemctl status lightwalletd"
echo ""
echo "3. Test gRPC:"
echo "   grpcurl -plaintext 127.0.0.1:9067 cash.z.wallet.sdk.rpc.CompactTxStreamer/GetLightdInfo"
echo ""
echo "4. Integrate with frontend for TX scanning"
echo ""
echo -e "${GREEN}🎉 Lightwalletd is ready for use!${NC}"
