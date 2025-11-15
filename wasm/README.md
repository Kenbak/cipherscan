# 🦀 Zcash WASM - Client-Side Memo Decryption

WebAssembly module for decrypting Zcash shielded transaction memos **entirely in the browser**.

## 🎯 Features

- ✅ **100% Client-Side** - Viewing keys never leave your device
- ✅ **Sapling Support** - Decrypt Sapling shielded memos
- ⏳ **Orchard Support** - Coming soon
- ✅ **Unified Viewing Keys** - Support for UFVK and Sapling ExtFVK
- ✅ **Privacy-Preserving** - Zero server-side processing

## 🚀 Building

### Prerequisites

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install wasm-pack
cargo install wasm-pack
```

### Build for Web

```bash
# Development build
wasm-pack build --target web --dev

# Production build (optimized for size)
wasm-pack build --target web --release
```

This will generate files in `pkg/`:
- `zcash_wasm.js` - JavaScript bindings
- `zcash_wasm_bg.wasm` - WebAssembly binary
- `zcash_wasm.d.ts` - TypeScript definitions

## 📦 Usage in Next.js

```typescript
import init, { decrypt_memo } from '@/wasm/pkg/zcash_wasm';

// Initialize WASM
await init();

// Decrypt memo
const memo = decrypt_memo(txHex, viewingKey);
console.log('Decrypted memo:', memo);
```

## 🧪 Testing

```bash
cargo test
```

## 📊 Bundle Size

- **WASM binary:** ~200-500 KB (gzipped)
- **JS bindings:** ~10 KB

## 🔐 Security

- Viewing keys are processed entirely in the browser's memory
- No network calls are made during decryption
- Memory is cleared after decryption completes

## 📝 License

MIT

## 🙏 Credits

Built with [librustzcash](https://github.com/zcash/librustzcash) by the Zcash Foundation.

