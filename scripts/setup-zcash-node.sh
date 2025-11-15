#!/bin/bash

# 🚀 Zcash Testnet Node Installation Script
# Run this on your Ubuntu 22.04 server

set -e

echo "📦 Installing dependencies..."
sudo apt-get update
sudo apt-get install -y \
    wget \
    gnupg2 \
    apt-transport-https \
    ca-certificates \
    curl

echo "🔑 Adding Zcash GPG key..."
wget -qO - https://apt.z.cash/zcash.asc | sudo gpg --dearmor -o /usr/share/keyrings/zcash-archive-keyring.gpg

echo "📝 Adding Zcash repository..."
echo "deb [signed-by=/usr/share/keyrings/zcash-archive-keyring.gpg] https://apt.z.cash/ $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/zcash.list

echo "📥 Installing zcashd..."
sudo apt-get update
sudo apt-get install -y zcash

echo "🔧 Creating configuration directory..."
mkdir -p ~/.zcash

echo "⚙️ Configuring zcash.conf for TESTNET..."
cat > ~/.zcash/zcash.conf << EOF
# Zcash Testnet Configuration
testnet=1

# RPC Configuration
server=1
rpcuser=zcashuser
rpcpassword=$(openssl rand -hex 32)
# IMPORTANT: Replace YOUR_APP_SERVER_IP with your actual application server IP
# Never use 0.0.0.0/0 in production - it allows anyone to connect!
rpcallowip=127.0.0.1
rpcallowip=YOUR_APP_SERVER_IP/32
rpcbind=0.0.0.0
rpcport=18232

# Indexing for explorer functionality
txindex=1
insightexplorer=1

# Performance optimizations
maxconnections=50
EOF

echo "✅ Configuration created!"
echo ""
echo "⚠️  IMPORTANT: Edit ~/.zcash/zcash.conf and replace YOUR_APP_SERVER_IP with your actual server IP"
echo ""
echo "📋 Your RPC credentials (SAVE THESE SECURELY):"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "RPC User: zcashuser"
echo "RPC Password: $(grep rpcpassword ~/.zcash/zcash.conf | cut -d= -f2)"
echo "RPC Port: 18232"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "🔥 Configuring firewall..."
sudo ufw allow 18233/tcp  # Zcash testnet P2P
# Only allow RPC from specific IPs - edit this to add your application server IP
# sudo ufw allow from YOUR_APP_SERVER_IP to any port 18232
sudo ufw allow 22/tcp     # SSH
sudo ufw --force enable

echo "🎬 Creating systemd service..."
sudo tee /etc/systemd/system/zcashd.service > /dev/null << EOF
[Unit]
Description=Zcash daemon
After=network.target

[Service]
Type=forking
User=$USER
Group=$USER
ExecStart=/usr/bin/zcashd -daemon -conf=/home/$USER/.zcash/zcash.conf -datadir=/home/$USER/.zcash
ExecStop=/usr/bin/zcash-cli -conf=/home/$USER/.zcash/zcash.conf stop
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

echo "🚀 Starting zcashd..."
sudo systemctl daemon-reload
sudo systemctl enable zcashd
sudo systemctl start zcashd

echo ""
echo "✅ Installation complete!"
echo ""
echo "📊 To check synchronization progress:"
echo "   zcash-cli getblockchaininfo"
echo ""
echo "📝 To view logs:"
echo "   tail -f ~/.zcash/testnet3/debug.log"
echo ""
echo "⏳ Full sync will take 2-4 hours..."
echo ""
echo "🔗 Test your node from your local machine:"
echo "   curl -u zcashuser:YOUR_PASSWORD http://YOUR_IP:18232 -d '{\"jsonrpc\":\"1.0\",\"id\":\"test\",\"method\":\"getblockchaininfo\",\"params\":[]}'"
echo ""
echo "⚠️  SECURITY REMINDER:"
echo "   1. Edit ~/.zcash/zcash.conf and set rpcallowip to your app server IP only"
echo "   2. Configure UFW to only allow RPC from your app server"
echo "   3. Never expose RPC to 0.0.0.0/0 in production!"
echo ""
