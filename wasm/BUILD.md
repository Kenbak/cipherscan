# 🛠️ Building the Zcash WASM Module

## 📋 Prerequisites

### 1. Install Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
```

### 2. Install wasm-pack

```bash
cargo install wasm-pack
```

### 3. Add wasm32 target

```bash
rustup target add wasm32-unknown-unknown
```

---

## 🔨 Build Commands

### Development Build (with debug symbols)

```bash
cd wasm
wasm-pack build --target web --dev
```

**Output:** `pkg/` directory with:
- `zcash_wasm.js` (~15 KB)
- `zcash_wasm_bg.wasm` (~800 KB uncompressed)
- `zcash_wasm.d.ts` (TypeScript definitions)

---

### Production Build (optimized)

```bash
cd wasm
wasm-pack build --target web --release
```

**Optimizations:**
- ✅ Size optimization (`opt-level = "z"`)
- ✅ Link Time Optimization (LTO)
- ✅ Dead code elimination
- ✅ Single codegen unit

**Expected size:**
- WASM: ~200-400 KB (gzipped: ~100-200 KB)
- JS: ~10 KB

---

## 📦 Integration with Next.js

### 1. Copy WASM files to public directory

```bash
# After building
cp -r wasm/pkg public/wasm/
```

### 2. Update Next.js config

```javascript
// next.config.ts
const nextConfig = {
  webpack: (config) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };
    return config;
  },
};
```

### 3. Use in components

```typescript
// app/decrypt/page.tsx
import init, { decrypt_memo } from '@/public/wasm/zcash_wasm';

useEffect(() => {
  init(); // Initialize WASM
}, []);

const handleDecrypt = async () => {
  const memo = decrypt_memo(txHex, viewingKey);
  console.log('Memo:', memo);
};
```

---

## 🧪 Testing

### Run Rust tests

```bash
cd wasm
cargo test
```

### Run with browser

```bash
# Start a local server
python3 -m http.server 8000

# Open http://localhost:8000/test.html
```

---

## 🐛 Troubleshooting

### Error: "wasm-pack not found"

```bash
cargo install wasm-pack
```

### Error: "target 'wasm32-unknown-unknown' not found"

```bash
rustup target add wasm32-unknown-unknown
```

### Error: WASM file too large (>1 MB)

Check that you're using release build:
```bash
wasm-pack build --target web --release
```

Verify `Cargo.toml` has optimizations:
```toml
[profile.release]
opt-level = "z"
lto = true
```

---

## 📊 Build Performance

| Build Type | Time | WASM Size | Gzipped |
|------------|------|-----------|---------|
| Dev | ~30s | 800 KB | 250 KB |
| Release | ~2min | 300 KB | 120 KB |

---

## 🚀 Continuous Integration

### GitHub Actions

```yaml
name: Build WASM

on: [push]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions-rs/toolchain@v1
        with:
          toolchain: stable
          target: wasm32-unknown-unknown
      - run: cargo install wasm-pack
      - run: cd wasm && wasm-pack build --target web --release
      - uses: actions/upload-artifact@v2
        with:
          name: wasm-pkg
          path: wasm/pkg/
```

---

## 📝 Next Steps

After building:
1. ✅ Test in browser
2. ✅ Integrate with Next.js
3. ✅ Deploy to production
4. ✅ Monitor bundle size
