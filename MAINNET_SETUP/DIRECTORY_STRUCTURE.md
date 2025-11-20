# Directory Structure: Testnet vs Mainnet

## ✅ IDENTICAL STRUCTURE

Both testnet and mainnet now use the **SAME directory structure** for consistency.

## 📁 Testnet Structure (Working)

```
/root/
├── zcash-api/
│   ├── server.js
│   ├── .env
│   ├── package.json
│   └── node_modules/
│
├── zcash-indexer/
│   ├── index.js
│   ├── .env
│   ├── package.json
│   └── node_modules/
│
├── .cache/zebra/
│   ├── .cookie
│   └── state/
│
└── .cargo/bin/
    └── zebrad

/etc/
├── zebrad.toml
├── nginx/sites-available/
│   └── zcash-api
└── systemd/system/
    ├── zebrad.service
    ├── zcash-indexer.service
    └── zcash-api.service
```

## 📁 Mainnet Structure (New)

```
/root/
├── zcash-api-mainnet/
│   ├── server.js          # Renamed from server-mainnet.js
│   ├── .env
│   ├── package.json
│   └── node_modules/
│
├── zcash-indexer-mainnet/
│   ├── index.js           # Renamed from indexer-mainnet.js
│   ├── .env
│   ├── package.json
│   └── node_modules/
│
├── .cache/zebra/
│   ├── .cookie            # Shared cookie file
│   └── state/
│
└── .cargo/bin/
    └── zebrad             # Same binary for both

/etc/
├── zebrad-mainnet.toml    # Separate config
├── nginx/sites-available/
│   └── zcash-api-mainnet
└── systemd/system/
    ├── zebrad-mainnet.service
    ├── zcash-indexer-mainnet.service
    └── zcash-api-mainnet.service
```

## 🔑 Key Differences

| Component | Testnet | Mainnet |
|-----------|---------|---------|
| **API Directory** | `/root/zcash-api` | `/root/zcash-api-mainnet` |
| **Indexer Directory** | `/root/zcash-indexer` | `/root/zcash-indexer-mainnet` |
| **Zebra Config** | `/etc/zebrad.toml` | `/etc/zebrad-mainnet.toml` |
| **Zebra RPC Port** | `18232` | `8232` |
| **Zebra P2P Port** | `18233` | `8233` |
| **PostgreSQL DB** | `zcash_explorer_testnet` | `zcash_explorer_mainnet` |
| **API Port** | `3001` (same) | `3001` (same) |
| **Nginx Config** | `zcash-api` | `zcash-api-mainnet` |
| **Systemd Services** | `zebrad.service` | `zebrad-mainnet.service` |

## 📝 File Naming Convention

### ✅ Correct (Deployed)
```bash
# API
/root/zcash-api-mainnet/server.js

# Indexer
/root/zcash-indexer-mainnet/index.js
```

### ❌ Incorrect (Source files)
```bash
# These are SOURCE files in MAINNET_SETUP/
# They get RENAMED during deployment
MAINNET_SETUP/server-mainnet.js    → /root/zcash-api-mainnet/server.js
MAINNET_SETUP/indexer-mainnet.js   → /root/zcash-indexer-mainnet/index.js
```

## 🚀 Deployment Process

1. **Copy source files** from `MAINNET_SETUP/` to server
2. **Rename during copy**:
   - `server-mainnet.js` → `server.js`
   - `indexer-mainnet.js` → `index.js`
3. **Create .env files** in each directory
4. **Install npm dependencies** in each directory
5. **Setup systemd services** pointing to correct paths

## 🔧 Why This Structure?

### ✅ Advantages
- **Consistent naming** with testnet
- **Easy to identify** which network (by directory name)
- **Can run both** testnet and mainnet on same server
- **Systemd services** clearly named
- **No confusion** about which file to run

### ❌ Previous Issues (Fixed)
- ~~Used `/root/zcash-mainnet/api/` (nested)~~
- ~~Kept `-mainnet` suffix in filenames~~
- ~~Inconsistent with testnet structure~~

## 📋 Checklist for Deployment

- [x] Directory structure matches testnet pattern
- [x] Files renamed correctly during deployment
- [x] Systemd services point to correct paths
- [x] Environment variables use correct DB names
- [x] Nginx config uses correct paths
- [x] Both networks can coexist on same server

## 🎯 Summary

**Pattern**: `zcash-{component}-{network}`

- API: `zcash-api` (testnet) vs `zcash-api-mainnet` (mainnet)
- Indexer: `zcash-indexer` (testnet) vs `zcash-indexer-mainnet` (mainnet)
- Services: `zebrad.service` (testnet) vs `zebrad-mainnet.service` (mainnet)

This makes it **crystal clear** which component belongs to which network! 🎉
