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

# Create public/wasm directory if it doesn't exist
mkdir -p ../public/wasm

# Copy WASM files to public
echo "📁 Copying WASM files to public/wasm/..."
cp pkg/zcash_wasm.js ../public/wasm/
cp pkg/zcash_wasm_bg.wasm ../public/wasm/
cp pkg/zcash_wasm.d.ts ../public/wasm/

# Get file sizes
WASM_SIZE=$(du -h ../public/wasm/zcash_wasm_bg.wasm | cut -f1)
JS_SIZE=$(du -h ../public/wasm/zcash_wasm.js | cut -f1)

echo "✅ WASM build complete!"
echo "📊 Bundle sizes:"
echo "   - WASM: $WASM_SIZE"
echo "   - JS:   $JS_SIZE"
echo ""
echo "🚀 Ready to commit and deploy!"

