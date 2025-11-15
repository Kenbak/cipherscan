# CipherScan

**⚡ Zcash Blockchain Explorer**

**Simple. Clear. Built for everyone.**

A blockchain explorer for Zcash that explains everything in plain language. Privacy meets transparency. No jargon. No confusion.

## 🎯 Mission

Make the Zcash blockchain accessible to **everyone**, not just developers.

## ✨ Features

- 🔍 **Search** addresses, transactions, and blocks
- 💰 **View balances** and transaction history
- 🛡️ **Understand privacy** - see which addresses are shielded
- 📝 **Read memos** - private messages in transactions
- 📚 **Educational** - every term explained simply

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
- **Zcash RPC** - Real blockchain data via JSON-RPC

## ⚙️ Configuration (Optional)

The app works out of the box with public endpoints. To use your own Zcash node:

Create a `.env.local` file:
```bash
ZCASH_RPC_URL=http://localhost:8232
ZCASH_RPC_USER=your_username
ZCASH_RPC_PASSWORD=your_password
```

## 📋 Roadmap

- [x] Connect to Zcash RPC server
- [x] Fetch real blockchain data
- [x] Display recent blocks
- [x] Show transaction details
- [x] Address lookup (transparent & shielded)
- [x] Block explorer with navigation
- [x] Transaction viewer with shielded data detection
- [ ] Decode shielded memos (for transparent addresses)
- [ ] Add search filters
- [ ] Mobile responsive design improvements
- [ ] Dark mode
- [ ] Performance optimizations
- [ ] Mempool viewer

## 🌐 Live

Coming soon: **cipherscan.app**

## 🤝 Contributing

Built for the Zcash community. Contributions welcome!

## 📄 License

MIT

---

**Built with ⚡ for the Zcash community**
