# Zingo-CLI & Lightwalletd Quick Reference

Quick commands for managing your Zcash testnet node, lightwalletd, and zingo-cli wallet.

---

## 🔧 System Services

### Zebrad (Zcash Node)
```bash
# Check status
systemctl status zebrad

# View logs
journalctl -u zebrad -f

# Restart
systemctl restart zebrad

# Check current block height
curl -X POST http://localhost:18232 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"1.0","id":"test","method":"getblockcount","params":[]}'
```

### Lightwalletd (Wallet Server)
```bash
# Check status
systemctl status lightwalletd

# View logs
journalctl -u lightwalletd -f

# Restart
systemctl restart lightwalletd

# Run manually (for debugging)
cd ~/lightwalletd
./lightwalletd --config lightwalletd.yml
```

---

## 💰 Zingo-CLI Wallet

### Launch Wallet
```bash
cd ~/zingolib

# Main wallet (mining address)
./target/release/zingo-cli --data-dir ~/zingo-testnet --chain testnet --server http://127.0.0.1:9067

# Alternative wallet
./target/release/zingo-cli --data-dir ~/zingo-testnet-local --chain testnet --server http://127.0.0.1:9067
```

### Common Commands (inside zingo-cli)
```bash
# Show all commands
help

# Show addresses
addresses           # Unified addresses
t_addresses         # Transparent addresses only

# Check balance
balance

# Sync wallet
sync run

# Create new addresses
new_address                 # New unified address
new_taddress_allow_gap      # New transparent address

# Send funds
quicksend <address> <amount> "<memo>"

# Shield transparent funds to Orchard
quickshield

# View transactions
transactions

# View wallet info
info
height
birthday

# Export viewing key
export_ufvk

# Quit
quit
```

---

## ⛏️ Mining (After Full Sync)

### Mine Blocks
```bash
# Mine 1 block (gives 2.5 TAZ)
curl -X POST http://localhost:18232 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"1.0","id":"test","method":"generate","params":[1]}'

# Mine 10 blocks
curl -X POST http://localhost:18232 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"1.0","id":"test","method":"generate","params":[10]}'
```

**Mining Address:** `tm9kut3k4ts2DFmnd7Age9esmLQtPa42FZC`
(Configured in `~/.config/zebrad.toml`)

---

## 📁 File Locations

### Configuration Files
- **Zebrad config:** `~/.config/zebrad.toml`
- **Lightwalletd config:** `~/lightwalletd/lightwalletd.yml`
- **Lightwalletd zcash.conf:** `~/lightwalletd/zcash.conf`

### Data Directories
- **Zebrad blockchain:** `~/.cache/zebra/`
- **Main wallet:** `~/zingo-testnet/`
- **Alternative wallet:** `~/zingo-testnet-local/`
- **Lightwalletd source:** `~/lightwalletd/`
- **Zingo-cli source:** `~/zingolib/`

### Logs
- **Zebrad:** `journalctl -u zebrad -f`
- **Lightwalletd:** `journalctl -u lightwalletd -f` or `/var/log/lightwalletd.log`

---

## 🔑 Your Addresses

### Main Wallet (`~/zingo-testnet`)
- **Transparent (mining):** `tm9kut3k4ts2DFmnd7Age9esmLQtPa42FZC`
- **Unified (Orchard):** `utest1qz2c9w98v9xavajc8ml5zd459902alt62tndt3sktsx0hd3gd20evhwfrqq834335a7lmw4a4mx79pnhczxvs50w5cfffelsuvtl9fer`

### Alternative Wallet (`~/zingo-testnet-local`)
- **Transparent 0:** `tmYWZuRKmdZwgKAxtV9RZRAuPsnWrLkyUtT`
- **Transparent 1:** `tmFpbevoRX1HSW368MVbeJwhwRgjfs78YQy`

---

## 🚨 Troubleshooting

### Zebrad not syncing?
```bash
# Check if it's running
systemctl status zebrad

# View recent logs
journalctl -u zebrad -n 50

# Restart if needed
systemctl restart zebrad
```

### Lightwalletd not responding?
```bash
# Check if port 9067 is listening
ss -tlnp | grep 9067

# Check logs
journalctl -u lightwalletd -n 50

# Restart
systemctl restart lightwalletd
```

### Zingo-cli connection error?
```bash
# Make sure lightwalletd is running
systemctl status lightwalletd

# Check zebrad block height
curl -X POST http://localhost:18232 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"1.0","id":"test","method":"getblockcount","params":[]}'

# Lightwalletd needs zebrad at block 280,000+ (Sapling activation)
```

### Wallet sync error?
```bash
# In zingo-cli
sync run

# If still failing, wait for zebrad to reach block 280,000+
```

---

## ⏰ Sync Timeline

1. **Zebrad sync:** 2-4 hours (to block 280,000+)
2. **Lightwalletd indexing:** Starts automatically after zebrad reaches 280,000
3. **Zingo-cli sync:** A few minutes after lightwalletd is ready
4. **Mining available:** After zebrad is 100% synced

---

## 📝 Quick Start Checklist

- [ ] Zebrad running and syncing
- [ ] Lightwalletd running (waiting for zebrad)
- [ ] Zingo-cli can connect (even if sync fails)
- [ ] Wait for zebrad to reach block 280,000+
- [ ] Zingo-cli syncs successfully
- [ ] Mine some TAZ
- [ ] Test memo decoder with a real transaction

---

## 🔗 Useful Links

- **Zebrad docs:** https://zebra.zfnd.org/
- **Lightwalletd repo:** https://github.com/zcash/lightwalletd
- **Zingo-cli repo:** https://github.com/zingolabs/zingolib
- **Zcash testnet faucet:** https://faucet.zecpages.com/

---

**Last Updated:** November 2, 2025
