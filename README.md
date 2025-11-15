# CipherScan

**⚡ Zcash Blockchain Explorer**

**Simple. Clear. Built for everyone.**

A blockchain explorer for Zcash that explains everything in plain language. Privacy meets transparency. No jargon. No confusion.

## 🎯 Mission

Make the Zcash blockchain accessible to **everyone**, not just developers.

## ✨ Features

- 🔍 **Search** addresses, transactions, and blocks
- 💰 **View balances** and transaction history
- 🛡️ **Privacy Dashboard** - Real-time shielded adoption metrics
- 🔓 **Decrypt Memos** - Client-side Orchard memo decryption (WASM)
- 📊 **Mempool Viewer** - Real-time pending transactions
- 📡 **Live Updates** - WebSocket for real-time block updates
- 📚 **Educational** - Privacy-preserving blockchain explorer
- 🔐 **100% Private** - Viewing keys never leave your browser

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Open http://localhost:3000
```

## 🏗️ Tech Stack

- **Next.js 15** - React framework with App Router
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **PostgreSQL** - Fast indexed blockchain data
- **Express.js** - API server with WebSocket support
- **Rust + WASM** - Client-side Orchard memo decryption
- **Zebra** - Zcash node (testnet/mainnet)

## ⚙️ Configuration (Optional)

The app works out of the box with public endpoints. To use your own Zcash node:

Create a `.env.local` file:
```bash
ZCASH_RPC_URL=http://localhost:8232
ZCASH_RPC_USER=your_username
ZCASH_RPC_PASSWORD=your_password
```

## 📋 Roadmap

### ✅ Completed
- [x] Connect to Zcash RPC server
- [x] Fetch real blockchain data
- [x] Display recent blocks
- [x] Show transaction details
- [x] Address lookup (transparent & shielded)
- [x] Block explorer with navigation
- [x] Transaction viewer with shielded data detection
- [x] PostgreSQL indexer for fast queries
- [x] Privacy analytics dashboard
- [x] Mempool viewer
- [x] WebSocket real-time updates
- [x] Client-side Orchard memo decryption (WASM)
- [x] Mobile responsive design

### 🚧 In Progress
- [ ] Scan all transactions for a viewing key
- [ ] Mainnet deployment
- [ ] Performance optimizations (caching, CDN)

### 🔮 Future
- [ ] Sapling memo decryption
- [ ] Batch transaction scanning
- [ ] Export transaction history to CSV
- [ ] Advanced search filters
- [ ] Dark mode toggle

## 🌐 Live

- **Testnet**: [testnet.cipherscan.app](https://testnet.cipherscan.app)
- **Mainnet**: Coming soon

## 🔐 Privacy Features

CipherScan allows you to decrypt your shielded memos **entirely client-side** using WebAssembly:

1. **100% Private** - Your viewing key never leaves your browser
2. **Orchard Support** - Decrypt Orchard shielded transactions
3. **Zero-Knowledge** - No server-side key processing
4. **Open Source** - Verifiable privacy guarantees

Try it: [testnet.cipherscan.app/decrypt](https://testnet.cipherscan.app/decrypt)

## 🤝 Contributing

Built for the Zcash community. Contributions welcome!

## 📄 License

MIT

---

**Built with ⚡ for the Zcash community**
