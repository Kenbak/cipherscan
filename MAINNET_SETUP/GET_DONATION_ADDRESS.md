# 💰 How to Get Your Orchard Donation Address

You need an **Orchard-enabled Unified Address** to receive Zec.rocks rewards.

## Option 1: Zingo CLI (Recommended)

```bash
# Install Zingo CLI
wget https://github.com/zingolabs/zingolib/releases/latest/download/zingo-cli-linux.tar.gz
tar -xzf zingo-cli-linux.tar.gz
cd zingo-cli-linux

# Connect to a lightwalletd server (testnet for now)
./zingo-cli --server https://testnet.lightwalletd.com:443

# In Zingo CLI:
> seed
# SAVE THIS SEED PHRASE SECURELY!

> addresses
# You'll see something like:
# {
#   "z_addresses": [...],
#   "t_addresses": [...],
#   "o_addresses": [...],
#   "unified_address": "u1abc123..."  <-- THIS IS YOUR DONATION ADDRESS
# }

# Copy the unified_address (starts with u1...)
```

## Option 2: Zingo Mobile App

1. Download **Zingo Wallet** from App Store / Google Play
2. Create a new wallet (SAVE YOUR SEED!)
3. Go to **Receive**
4. Copy the **Unified Address** (starts with `u1...`)

## Option 3: Ywallet

1. Download **Ywallet** from https://ywallet.app
2. Create a new wallet
3. Go to **Receive**
4. Select **Unified Address**
5. Copy the address

## ⚠️ IMPORTANT

- **SAVE YOUR SEED PHRASE** - This is the only way to recover your funds!
- The address must be a **Unified Address** (starts with `u1...`)
- It must contain an **Orchard receiver** (most modern wallets do this automatically)
- This address will receive your **$100/month in ZEC** from Zec.rocks!

## Verify Your Address

Your unified address should look like:
```
u1abc123def456...xyz789
```

- Starts with `u1` (mainnet) or `utest1` (testnet)
- Very long (100+ characters)
- Contains both transparent and shielded receivers

## Next Steps

Once you have your address:

1. Edit the Lightwalletd systemd service:
   ```bash
   sudo nano /etc/systemd/system/lightwalletd.service
   ```

2. Replace `YOUR_ORCHARD_ADDRESS_HERE` with your actual address:
   ```
   ExecStart=/usr/local/bin/lightwalletd \
     --config /etc/lightwalletd/lightwalletd.conf \
     --donation-address u1abc123def456...xyz789
   ```

3. Reload and restart:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl restart lightwalletd
   ```

4. Verify it's broadcasting:
   ```bash
   # Check logs
   sudo journalctl -u lightwalletd -n 50 | grep donation
   ```

## 🎉 You're Ready!

Once your Lightwalletd is running with a donation address:
1. Register on [Hosh](https://hosh.zec.rocks)
2. Post your server on [Zec.rocks forum](https://forum.zec.rocks/t/zcash-operators-earn-zec-for-your-uptime)
3. Wait for the 15th of the month for your first payout!

**Expected earnings: ~$100/month in ZEC** 💰
