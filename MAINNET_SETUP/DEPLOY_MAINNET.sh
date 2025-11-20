#!/bin/bash

###############################################################################
# Zcash Explorer Mainnet Deployment Script
# This script deploys all mainnet components to the server
###############################################################################

set -e  # Exit on error

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                                                               ║"
echo "║       Zcash Explorer Mainnet Deployment                      ║"
echo "║       Based on testnet configuration                         ║"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}❌ Please run as root${NC}"
  exit 1
fi

# Get server IP
SERVER_IP=$(hostname -I | awk '{print $1}')
echo -e "${YELLOW}📍 Server IP: ${SERVER_IP}${NC}"

# Step 1: Update system
echo -e "\n${YELLOW}📦 Step 1: Updating system...${NC}"
apt update && apt upgrade -y

# Step 2: Install dependencies
echo -e "\n${YELLOW}📦 Step 2: Installing dependencies...${NC}"
apt install -y \
  build-essential \
  pkg-config \
  libssl-dev \
  curl \
  wget \
  git \
  nginx \
  certbot \
  python3-certbot-nginx \
  redis-server \
  postgresql \
  postgresql-contrib

# Step 3: Install Rust (for Zebra)
echo -e "\n${YELLOW}🦀 Step 3: Installing Rust...${NC}"
if ! command -v cargo &> /dev/null; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  source $HOME/.cargo/env
  echo 'source $HOME/.cargo/env' >> ~/.bashrc
else
  echo "✅ Rust already installed"
fi

# Step 4: Install Node.js
echo -e "\n${YELLOW}📦 Step 4: Installing Node.js...${NC}"
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
else
  echo "✅ Node.js already installed"
fi

# Step 5: Install Zebra
echo -e "\n${YELLOW}🦓 Step 5: Installing Zebra...${NC}"
if ! command -v zebrad &> /dev/null; then
  cargo install zebrad --locked
else
  echo "✅ Zebra already installed"
fi

# Step 6: Setup PostgreSQL
echo -e "\n${YELLOW}🐘 Step 6: Setting up PostgreSQL...${NC}"
read -p "Enter PostgreSQL password for zcash_user: " DB_PASSWORD

sudo -u postgres psql -c "CREATE USER zcash_user WITH PASSWORD '${DB_PASSWORD}';" || echo "User already exists"
sudo -u postgres psql -c "CREATE DATABASE zcash_explorer_mainnet OWNER zcash_user;" || echo "Database already exists"

echo -e "${GREEN}✅ Creating database schema...${NC}"
sudo -u postgres psql -d zcash_explorer_mainnet << 'EOF'
-- Blocks table (exact schema from testnet)
CREATE TABLE IF NOT EXISTS blocks (
  height BIGINT PRIMARY KEY,
  hash TEXT UNIQUE NOT NULL,
  timestamp BIGINT NOT NULL,
  version INTEGER,
  merkle_root TEXT,
  final_sapling_root TEXT,
  bits TEXT,
  nonce TEXT,
  solution TEXT,
  difficulty NUMERIC,
  size INTEGER,
  transaction_count INTEGER DEFAULT 0,
  previous_block_hash TEXT,
  next_block_hash TEXT,
  total_fees BIGINT DEFAULT 0,
  miner_address TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  confirmations INTEGER
);

CREATE INDEX IF NOT EXISTS idx_blocks_hash ON blocks(hash);
CREATE INDEX IF NOT EXISTS idx_blocks_previous_hash ON blocks(previous_block_hash);
CREATE INDEX IF NOT EXISTS idx_blocks_timestamp ON blocks(timestamp DESC);

-- Transactions table (exact schema from testnet)
CREATE TABLE IF NOT EXISTS transactions (
  txid TEXT PRIMARY KEY,
  block_height BIGINT REFERENCES blocks(height) ON DELETE CASCADE,
  block_hash TEXT,
  timestamp BIGINT,
  version INTEGER,
  locktime BIGINT,
  size INTEGER,
  fee BIGINT DEFAULT 0,
  total_input BIGINT DEFAULT 0,
  total_output BIGINT DEFAULT 0,
  shielded_spends INTEGER DEFAULT 0,
  shielded_outputs INTEGER DEFAULT 0,
  orchard_actions INTEGER DEFAULT 0,
  value_balance BIGINT DEFAULT 0,
  value_balance_sapling BIGINT DEFAULT 0,
  value_balance_orchard BIGINT DEFAULT 0,
  binding_sig TEXT,
  binding_sig_sapling TEXT,
  has_shielded_data BOOLEAN DEFAULT FALSE,
  is_coinbase BOOLEAN DEFAULT FALSE,
  confirmations INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  block_time BIGINT,
  vin_count INTEGER DEFAULT 0,
  vout_count INTEGER DEFAULT 0,
  tx_index INTEGER,
  has_sapling BOOLEAN DEFAULT FALSE,
  has_orchard BOOLEAN DEFAULT FALSE,
  has_sprout BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_transactions_block_hash ON transactions(block_hash);
CREATE INDEX IF NOT EXISTS idx_transactions_block_height ON transactions(block_height DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_block_time ON transactions(block_time);
CREATE INDEX IF NOT EXISTS idx_transactions_block_tx ON transactions(block_height, tx_index);
CREATE INDEX IF NOT EXISTS idx_transactions_coinbase ON transactions(is_coinbase);
CREATE INDEX IF NOT EXISTS idx_transactions_shielded ON transactions(has_shielded_data);
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp DESC);

-- Transaction inputs table
CREATE TABLE IF NOT EXISTS transaction_inputs (
  id SERIAL PRIMARY KEY,
  txid TEXT REFERENCES transactions(txid) ON DELETE CASCADE,
  vout_index INTEGER,
  prev_txid TEXT,
  prev_vout INTEGER,
  script_sig TEXT,
  sequence BIGINT,
  coinbase TEXT,
  value BIGINT,
  address TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tx_inputs_txid ON transaction_inputs(txid);
CREATE INDEX IF NOT EXISTS idx_tx_inputs_prev_txid ON transaction_inputs(prev_txid);
CREATE INDEX IF NOT EXISTS idx_tx_inputs_address ON transaction_inputs(address);

-- Transaction outputs table
CREATE TABLE IF NOT EXISTS transaction_outputs (
  id SERIAL PRIMARY KEY,
  txid TEXT REFERENCES transactions(txid) ON DELETE CASCADE,
  vout_index INTEGER,
  value BIGINT,
  script_pubkey TEXT,
  address TEXT,
  spent BOOLEAN DEFAULT FALSE,
  spent_txid TEXT,
  spent_vin INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tx_outputs_txid ON transaction_outputs(txid);
CREATE INDEX IF NOT EXISTS idx_tx_outputs_address ON transaction_outputs(address);
CREATE INDEX IF NOT EXISTS idx_tx_outputs_spent ON transaction_outputs(spent);

-- Addresses table
CREATE TABLE IF NOT EXISTS addresses (
  address TEXT PRIMARY KEY,
  first_seen_block BIGINT,
  last_seen_block BIGINT,
  tx_count INTEGER DEFAULT 0,
  total_received BIGINT DEFAULT 0,
  total_sent BIGINT DEFAULT 0,
  balance BIGINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_addresses_balance ON addresses(balance DESC);
CREATE INDEX IF NOT EXISTS idx_addresses_tx_count ON addresses(tx_count DESC);

-- Mempool table
CREATE TABLE IF NOT EXISTS mempool (
  txid TEXT PRIMARY KEY,
  timestamp BIGINT,
  size INTEGER,
  fee BIGINT,
  fee_per_byte NUMERIC,
  has_shielded BOOLEAN DEFAULT FALSE,
  has_orchard BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mempool_timestamp ON mempool(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_mempool_fee_per_byte ON mempool(fee_per_byte DESC);

-- Privacy stats table
CREATE TABLE IF NOT EXISTS privacy_stats (
  id SERIAL PRIMARY KEY,
  last_block_scanned BIGINT NOT NULL,
  total_blocks BIGINT NOT NULL,
  shielded_tx BIGINT NOT NULL,
  transparent_tx BIGINT NOT NULL,
  mixed_tx BIGINT NOT NULL,
  fully_shielded_tx BIGINT NOT NULL,
  sapling_pool NUMERIC(20, 8) DEFAULT 0,
  orchard_pool NUMERIC(20, 8) DEFAULT 0,
  shielded_percentage NUMERIC(5, 2),
  privacy_score INTEGER,
  adoption_trend VARCHAR(20),
  last_updated TIMESTAMP DEFAULT NOW()
);

-- Privacy trends daily table
CREATE TABLE IF NOT EXISTS privacy_trends_daily (
  date DATE PRIMARY KEY,
  total_tx INTEGER,
  shielded_tx INTEGER,
  transparent_tx INTEGER,
  shielded_percentage NUMERIC(5, 2),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_privacy_trends_date ON privacy_trends_daily(date DESC);

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO zcash_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO zcash_user;
EOF

echo -e "${GREEN}✅ PostgreSQL setup complete${NC}"

# Step 7: Setup directories (SAME structure as testnet)
echo -e "\n${YELLOW}📁 Step 7: Creating directories...${NC}"
mkdir -p /root/zcash-api-mainnet
mkdir -p /root/zcash-indexer-mainnet
mkdir -p /root/.cache/zebra
mkdir -p /var/log/zebrad

# Step 8: Copy files
echo -e "\n${YELLOW}📋 Step 8: Copying configuration files...${NC}"

# Copy Zebra config
cp zebrad-mainnet.toml /etc/zebrad-mainnet.toml

# Copy indexer
cp indexer-mainnet.js /root/zcash-indexer-mainnet/index.js
cp package.json /root/zcash-indexer-mainnet/

# Copy API
cp server-mainnet.js /root/zcash-api-mainnet/server.js
cp package.json /root/zcash-api-mainnet/

# Create .env files
cat > /root/zcash-indexer-mainnet/.env << ENVEOF
DB_HOST=localhost
DB_PORT=5432
DB_NAME=zcash_explorer_mainnet
DB_USER=zcash_user
DB_PASSWORD=${DB_PASSWORD}

ZEBRA_RPC_URL=http://127.0.0.1:8232
ZEBRA_RPC_COOKIE_FILE=/root/.cache/zebra/.cookie

REDIS_HOST=localhost
REDIS_PORT=6379

NETWORK=mainnet
ENVEOF

cat > /root/zcash-api-mainnet/.env << ENVEOF
DB_HOST=localhost
DB_PORT=5432
DB_NAME=zcash_explorer_mainnet
DB_USER=zcash_user
DB_PASSWORD=${DB_PASSWORD}

ZCASH_RPC_URL=http://127.0.0.1:8232
ZCASH_RPC_USER=__cookie__
ZCASH_RPC_PASSWORD=

REDIS_HOST=localhost
REDIS_PORT=6379

PORT=3001
NODE_ENV=production

CORS_ORIGINS=https://cipherscan.app,https://api.cipherscan.app
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=300
ENVEOF

# Step 9: Install npm dependencies
echo -e "\n${YELLOW}📦 Step 9: Installing npm dependencies...${NC}"
cd /root/zcash-indexer-mainnet && npm install
cd /root/zcash-api-mainnet && npm install

# Step 10: Setup systemd services
echo -e "\n${YELLOW}⚙️  Step 10: Setting up systemd services...${NC}"
cp zebrad-mainnet.service /etc/systemd/system/
cp zcash-indexer-mainnet.service /etc/systemd/system/
cp zcash-api-mainnet.service /etc/systemd/system/

systemctl daemon-reload
systemctl enable zebrad-mainnet
systemctl enable zcash-indexer-mainnet
systemctl enable zcash-api-mainnet

# Step 11: Setup Nginx
echo -e "\n${YELLOW}🌐 Step 11: Setting up Nginx...${NC}"
cp nginx-api-mainnet.conf /etc/nginx/sites-available/zcash-api-mainnet
ln -sf /etc/nginx/sites-available/zcash-api-mainnet /etc/nginx/sites-enabled/

nginx -t

# Step 12: Setup SSL with Certbot
echo -e "\n${YELLOW}🔒 Step 12: Setting up SSL...${NC}"
read -p "Enter your email for Let's Encrypt: " EMAIL
certbot --nginx -d api.cipherscan.app --non-interactive --agree-tos -m ${EMAIL}

# Step 13: Setup UFW Firewall
echo -e "\n${YELLOW}🔥 Step 13: Configuring firewall...${NC}"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw allow 8233/tcp  # Zebra P2P
ufw --force enable

# Step 14: Enable Redis
echo -e "\n${YELLOW}📦 Step 14: Enabling Redis...${NC}"
systemctl enable redis-server
systemctl start redis-server

echo -e "\n${GREEN}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                                                               ║"
echo "║       ✅ Mainnet Deployment Complete!                         ║"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "${YELLOW}📋 Next Steps:${NC}"
echo ""
echo "1. Start Zebra (will take 24-48h to sync):"
echo "   systemctl start zebrad-mainnet"
echo "   journalctl -u zebrad-mainnet -f"
echo ""
echo "2. Once Zebra is synced, start indexer:"
echo "   systemctl start zcash-indexer-mainnet"
echo "   journalctl -u zcash-indexer-mainnet -f"
echo ""
echo "3. Start API server:"
echo "   systemctl start zcash-api-mainnet"
echo "   journalctl -u zcash-api-mainnet -f"
echo ""
echo "4. Test API:"
echo "   curl https://api.cipherscan.app/api/info"
echo ""
echo "5. Update frontend .env:"
echo "   NEXT_PUBLIC_POSTGRES_API_URL=https://api.cipherscan.app"
echo ""
echo "6. Deploy frontend to Vercel"
echo ""
echo -e "${GREEN}🎉 Your Zcash Mainnet Explorer is ready!${NC}"
