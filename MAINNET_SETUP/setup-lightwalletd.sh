#!/bin/bash

###############################################################################
# Lightwalletd Setup for Zec.rocks Rewards Program
# Earn $100/month for running a reliable light wallet server!
###############################################################################

set -e

echo "💰 Setting up Lightwalletd for Zec.rocks Rewards..."
echo ""

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Please run as root (sudo)${NC}"
  exit 1
fi

echo -e "${YELLOW}Step 1: Install Go (required for Lightwalletd)${NC}"
if ! command -v go &> /dev/null; then
  wget https://go.dev/dl/go1.21.5.linux-amd64.tar.gz
  rm -rf /usr/local/go
  tar -C /usr/local -xzf go1.21.5.linux-amd64.tar.gz
  echo 'export PATH=$PATH:/usr/local/go/bin' >> /etc/profile
  export PATH=$PATH:/usr/local/go/bin
  rm go1.21.5.linux-amd64.tar.gz
fi
go version

echo ""
echo -e "${YELLOW}Step 2: Clone and build Lightwalletd${NC}"
cd /root
if [ ! -d "lightwalletd" ]; then
  git clone https://github.com/zcash/lightwalletd.git
fi
cd lightwalletd
git pull
git checkout master  # Use latest stable

# Build
go build -o lightwalletd cmd/lightwalletd/main.go

# Install binary
cp lightwalletd /usr/local/bin/
chmod +x /usr/local/bin/lightwalletd

echo ""
echo -e "${YELLOW}Step 3: Create lightwalletd user${NC}"
if ! id "lightwalletd" &>/dev/null; then
  useradd -r -m -d /var/lib/lightwalletd -s /bin/bash lightwalletd
fi

echo ""
echo -e "${YELLOW}Step 4: Create directories${NC}"
mkdir -p /var/lib/lightwalletd
mkdir -p /var/log/lightwalletd
mkdir -p /etc/lightwalletd

chown -R lightwalletd:lightwalletd /var/lib/lightwalletd
chown -R lightwalletd:lightwalletd /var/log/lightwalletd

echo ""
echo -e "${YELLOW}Step 5: Generate SSL certificates for gRPC${NC}"
cd /etc/lightwalletd

# Self-signed cert for now (will be replaced by Let's Encrypt via Caddy)
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=lightwalletd.cipherscan.app"

chown lightwalletd:lightwalletd /etc/lightwalletd/*.pem

echo ""
echo -e "${YELLOW}Step 6: Create Lightwalletd config${NC}"
cat > /etc/lightwalletd/lightwalletd.conf << 'EOF'
# Lightwalletd Configuration for Mainnet

# Zebra RPC endpoint
zcash-conf-path = ""
rpchost = "127.0.0.1"
rpcport = 8232
rpcuser = ""
rpcpassword = ""

# gRPC server settings
grpc-bind-addr = "0.0.0.0:9067"
http-bind-addr = "0.0.0.0:9068"

# TLS certificates
tls-cert = "/etc/lightwalletd/cert.pem"
tls-key = "/etc/lightwalletd/key.pem"

# Cache settings
cache-size = 1000

# Logging
log-file = "/var/log/lightwalletd/lightwalletd.log"
log-level = "info"

# Network
no-tls-very-insecure = false
EOF

chown lightwalletd:lightwalletd /etc/lightwalletd/lightwalletd.conf

echo ""
echo -e "${YELLOW}Step 7: Create systemd service${NC}"
cat > /etc/systemd/system/lightwalletd.service << 'EOF'
[Unit]
Description=Lightwalletd - Zcash Light Wallet Server
After=zebrad-mainnet.service
Requires=zebrad-mainnet.service

[Service]
Type=simple
User=lightwalletd
Group=lightwalletd
WorkingDirectory=/var/lib/lightwalletd

# IMPORTANT: Add your Orchard donation address here!
# Get one from Zingo CLI or any Zcash wallet
ExecStart=/usr/local/bin/lightwalletd \
  --config /etc/lightwalletd/lightwalletd.conf \
  --donation-address YOUR_ORCHARD_ADDRESS_HERE

Restart=always
RestartSec=10

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/lightwalletd /var/log/lightwalletd

# Resource limits
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

echo ""
echo -e "${YELLOW}Step 8: Setup Caddy for HTTPS (port 443)${NC}"
# Install Caddy
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update
apt install -y caddy

# Configure Caddy as reverse proxy for Lightwalletd
cat > /etc/caddy/Caddyfile << 'EOF'
# Lightwalletd gRPC endpoint
lightwalletd.cipherscan.app:443 {
    reverse_proxy localhost:9067 {
        transport http {
            versions h2c 2
        }
    }

    tls {
        protocols tls1.2 tls1.3
    }

    log {
        output file /var/log/caddy/lightwalletd-access.log
    }
}

# HTTP endpoint for monitoring
lightwalletd.cipherscan.app:80 {
    redir https://{host}{uri} permanent
}
EOF

# Restart Caddy
systemctl restart caddy
systemctl enable caddy

echo ""
echo -e "${YELLOW}Step 9: Open firewall ports${NC}"
ufw allow 9067/tcp  # gRPC
ufw allow 9068/tcp  # HTTP monitoring
ufw reload

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✓ Lightwalletd setup complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANT NEXT STEPS:${NC}"
echo ""
echo "1. Get an Orchard donation address from Zingo CLI:"
echo "   zingo-cli --server https://lightwalletd.cipherscan.app:443"
echo "   > addresses"
echo "   > Copy the Unified Address (starts with 'u1...')"
echo ""
echo "2. Edit the systemd service with your donation address:"
echo "   sudo nano /etc/systemd/system/lightwalletd.service"
echo "   Replace: YOUR_ORCHARD_ADDRESS_HERE"
echo ""
echo "3. Wait for Zebra to fully sync before starting Lightwalletd!"
echo "   Check: curl -s -X POST http://localhost:8232 \\"
echo "     -d '{\"jsonrpc\":\"1.0\",\"method\":\"getblockchaininfo\"}' | jq"
echo ""
echo "4. Start Lightwalletd:"
echo "   sudo systemctl daemon-reload"
echo "   sudo systemctl start lightwalletd"
echo "   sudo systemctl enable lightwalletd"
echo ""
echo "5. Test your server:"
echo "   grpcurl -plaintext localhost:9067 list"
echo ""
echo "6. Register on Hosh for monitoring:"
echo "   https://hosh.zec.rocks"
echo ""
echo "7. Post your server on Zec.rocks forum:"
echo "   Format: lightwalletd.cipherscan.app:443"
echo "   https://forum.zec.rocks/t/zcash-operators-earn-zec-for-your-uptime"
echo ""
echo -e "${GREEN}💰 Potential earnings: ~$100/month in ZEC!${NC}"
echo ""
