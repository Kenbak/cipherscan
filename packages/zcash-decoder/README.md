# @cipherscan/zcash-decoder

**Client-side decoder for Zcash shielded transactions and memos.**

100% privacy-preserving — your viewing key **never leaves the browser**.

---

## ✨ Features

- 🔐 **Client-side memo decryption** — Viewing keys stay in the browser
- ⚡ **Batch compact block filtering** — 13x faster than sequential processing
- 🧵 **Web Worker compatible** — Zero UI freeze during scans
- 📦 **TypeScript native** — Full type safety
- 🎯 **Production-ready** — Battle-tested on [CipherScan](https://cipherscan.app)

---

## 📦 Installation

```bash
npm install @cipherscan/zcash-decoder
```

---

## 🚀 Quick Start

### 1. Decrypt a Transaction Memo

```typescript
import { ZcashWASM } from '@cipherscan/zcash-decoder';

// Initialize WASM module
const wasm = await ZcashWASM.init();

// Decrypt a memo from a raw transaction hex
const txHex = '0400008085202f89...'; // Full transaction hex
const viewingKey = 'uviewtest1...'; // Your UFVK

const result = await wasm.decryptMemo(txHex, viewingKey);

console.log('Memo:', result.memo);
console.log('Amount:', result.amount, 'ZEC');
```

**Output:**
```
Memo: Thanks for using testnet.ZecFaucet.com
Amount: 0.3 ZEC
```

---

### 2. Filter Compact Blocks (Birthday Scan)

```typescript
import { ZcashWASM } from '@cipherscan/zcash-decoder';

// Fetch compact blocks from Lightwalletd
const response = await fetch('/api/lightwalletd/scan', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    startHeight: 3121131,
    endHeight: 3685893,
  }),
});

const { blocks } = await response.json();

// Initialize WASM
const wasm = await ZcashWASM.init();

// Filter blocks to find matching transactions
const matches = await wasm.filterCompactBlocks(
  blocks,
  'uviewtest1...', // Your UFVK
  (progress) => {
    console.log(
      `Processed ${progress.blocksProcessed}/${progress.totalBlocks} blocks, ` +
      `found ${progress.matchesFound} matches`
    );
  }
);

console.log(`Found ${matches.length} transactions:`);
matches.forEach((tx) => {
  console.log(`- TXID: ${tx.txid}, Block: ${tx.height}`);
});
```

---

### 3. Use in a Web Worker (Recommended for UI Performance)

**worker.ts:**
```typescript
import { ZcashWASM } from '@cipherscan/zcash-decoder';

let wasm: ZcashWASM | null = null;

self.onmessage = async (e) => {
  const { type, blocks, viewingKey } = e.data;

  if (type === 'filter') {
    // Initialize WASM (once)
    if (!wasm) {
      wasm = await ZcashWASM.init();
    }

    // Filter blocks
    const matches = await wasm.filterCompactBlocks(blocks, viewingKey);

    // Send results back
    self.postMessage({ type: 'results', matches });
  }
};
```

**Main thread:**
```typescript
const worker = new Worker(new URL('./worker.ts', import.meta.url), {
  type: 'module',
});

worker.postMessage({
  type: 'filter',
  blocks: compactBlocks,
  viewingKey: 'uviewtest1...',
});

worker.onmessage = (e) => {
  if (e.data.type === 'results') {
    console.log('Matches:', e.data.matches);
  }
};
```

---

## 📚 API Reference

### `ZcashWASM.init()`

Initialize the WASM module.

```typescript
const wasm = await ZcashWASM.init();
```

---

### `wasm.decryptMemo(txHex, viewingKey)`

Decrypt a shielded transaction memo.

**Parameters:**
- `txHex` (string): Raw transaction hex
- `viewingKey` (string): Unified Full Viewing Key (UFVK)

**Returns:** `Promise<DecryptedOutput>`
```typescript
interface DecryptedOutput {
  memo: string;   // Decrypted memo text
  amount: number; // Amount in ZEC
}
```

---

### `wasm.filterCompactBlocks(blocks, viewingKey, onProgress?)`

Filter compact blocks to find transactions matching the viewing key.

**Parameters:**
- `blocks` (CompactBlock[]): Array of compact blocks
- `viewingKey` (string): Unified Full Viewing Key (UFVK)
- `onProgress` (optional): Progress callback

**Returns:** `Promise<MatchingTransaction[]>`
```typescript
interface MatchingTransaction {
  txid: string;
  height: number;
  timestamp: number;
}
```

---

### `wasm.detectKeyType(viewingKey)`

Detect the type of viewing key.

**Parameters:**
- `viewingKey` (string): Viewing key to detect

**Returns:** `ViewingKeyType`
```typescript
type ViewingKeyType = 'ufvk-mainnet' | 'ufvk-testnet' | 'unknown';
```

---

## 🔒 Security

- **Client-side only**: Viewing keys are processed entirely in the browser's WASM sandbox
- **No server communication**: Sensitive data never leaves the client
- **Web Worker isolation**: Run decryption in a separate thread for additional isolation
- **Auditable**: Open-source Rust implementation compiled to WASM

---

## 🏗️ Architecture

This library is a thin TypeScript wrapper around Rust WASM code:

```
┌─────────────────────────────────────┐
│   TypeScript API (@cipherscan/...)  │
│   - ZcashWASM.init()                │
│   - decryptMemo()                   │
│   - filterCompactBlocks()           │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   WASM Module (Rust → WASM)         │
│   - librustzcash                    │
│   - zcash_note_encryption::batch    │
│   - orchard/sapling domains         │
└─────────────────────────────────────┘
```

**Rust crates used:**
- `zcash_primitives` — Core Zcash primitives
- `zcash_note_encryption` — Batch decryption
- `orchard` — Orchard shielded pool
- `wasm-bindgen` — Rust ↔ JavaScript bridge

---

## 🧪 Try It Out

After installing, run the interactive example:

```bash
node node_modules/@cipherscan/zcash-decoder/examples/decrypt-memo.mjs
```

This will prompt you for:
1. Your viewing key (UFVK)
2. A transaction ID

And decrypt the memo for you.

---

## 🛠️ Development

### Build the WASM module

```bash
cd wasm/
wasm-pack build --target web
```

### Build the TypeScript SDK

```bash
npm run build
```

---

## 📄 License

MIT OR Apache-2.0

You may choose either license at your option.

---

## 🙏 Acknowledgments

Built with:
- [librustzcash](https://github.com/zcash/librustzcash) — Official Zcash Rust library
- [wasm-pack](https://rustwasm.github.io/wasm-pack/) — Rust → WASM compiler

Funded by the **Gemini Hackathon 2025** bounty for privacy-preserving Zcash tooling.

---

## 💝 Support This Project

If you find this library useful, consider supporting development with ZEC:

```
u1fh3kwyl9hq9q907rx9j8mdy2r7gz4xh0y4yt63dxykk2856gr0238vxsegemyfu8s5a77ycq72tcnzkxa75ykjtcn6wp2w9rtuu3ssdzpe2fyghl8wlk3vh6f67304xe4lrxtvywtudy5t434zc07u6mh27ekufx7ssr55l8875z7f4k76c3tk23s3jzf8rxdlkequlta8lwsv09gxm
```

All donations go towards:
- 🔧 Maintaining and improving the decoder
- 📚 Better documentation and examples
- 🚀 New privacy-preserving features
- ☕ Keeping the developers caffeinated

---

## 🔗 Links

- **CipherScan Explorer**: https://cipherscan.app
- **GitHub**: https://github.com/Kenbak/cipherscan
- **Bounty**: Gemini Hackathon 2025 — Zcash Data & Analytics

---

**Made with 🔐 for the Zcash community**
