#!/bin/bash

# Build WASM and copy to public directory
# Usage: ./scripts/build-wasm.sh

set -e

echo "🦀 Building Zcash WASM..."

# Check if wasm-pack is installed
if ! command -v wasm-pack &> /dev/null; then
    echo "❌ wasm-pack not found. Installing..."
    cargo install wasm-pack
fi

# Build WASM
cd wasm
echo "📦 Compiling Rust to WASM..."
wasm-pack build --target web --release

# Keep the web application and published decoder bundle on the same ABI.
echo "📁 Copying WASM files to web and decoder bundles..."
for output_dir in ../public/wasm ../packages/zcash-decoder/wasm; do
  mkdir -p "$output_dir"
  cp pkg/zcash_wasm.js pkg/zcash_wasm_bg.wasm pkg/zcash_wasm.d.ts pkg/zcash_wasm_bg.wasm.d.ts "$output_dir/"
done

# Get file sizes
WASM_SIZE=$(du -h ../public/wasm/zcash_wasm_bg.wasm | cut -f1)
JS_SIZE=$(du -h ../public/wasm/zcash_wasm.js | cut -f1)

echo "✅ WASM build complete!"
echo "📊 Bundle sizes:"
echo "   - WASM: $WASM_SIZE"
echo "   - JS:   $JS_SIZE"
echo ""
echo "🚀 Ready to commit and deploy!"

