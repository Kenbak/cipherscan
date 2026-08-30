# 🦀 Zcash WASM - Client-Side Memo Decryption

WebAssembly module for decrypting Zcash shielded transaction memos **entirely in the browser**.

## 🎯 Features

- ✅ **100% Client-Side** - Viewing keys never leave your device
- ✅ **Orchard Support** - Decrypt Orchard shielded memos
- ✅ **Ironwood Support** - Decrypt Ironwood shielded memos (same domain/keys as Orchard)
- ❌ **No Sapling Support** - Sapling decryption needs `zcash_primitives`/`sapling-crypto`, which pull in `secp256k1` (C code) via `zcash_transparent` and cannot compile to `wasm32`. This crate deliberately depends on `zakura-orchard` only (see `Cargo.toml`) to keep the wasm32 build lean.
- ✅ **Unified Viewing Keys** - Support for UFVK (Orchard component)
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

