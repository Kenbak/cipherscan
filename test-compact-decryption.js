/**
 * TEST: Debug Compact Block Decryption
 *
 * Ce script teste la décryption compact avec des logs détaillés
 * pour identifier exactement où ça bloque.
 */

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

// Load proto files
const PROTO_PATH = path.join(__dirname, 'proto');
const packageDefinition = protoLoader.loadSync(
  [
    path.join(PROTO_PATH, 'service.proto'),
    path.join(PROTO_PATH, 'compact_formats.proto')
  ],
  {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    includeDirs: [PROTO_PATH]
  }
);

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
const CompactTxStreamer = protoDescriptor.cash.z.wallet.sdk.rpc.CompactTxStreamer;

// Connect to Lightwalletd
const client = new CompactTxStreamer(
  '127.0.0.1:9067',
  grpc.credentials.createInsecure()
);

// Block with known Orchard transaction (from your test)
const TEST_BLOCK_HEIGHT = 3656720;

console.log('🔍 [DEBUG] Starting compact block decryption test...\n');
console.log(`📦 [DEBUG] Fetching block ${TEST_BLOCK_HEIGHT} from Lightwalletd...\n`);

const call = client.GetBlockRange({
  start: { height: TEST_BLOCK_HEIGHT },
  end: { height: TEST_BLOCK_HEIGHT }
});

call.on('data', (block) => {
  console.log('✅ [DEBUG] Block received:');
  console.log(`  - Height: ${block.height}`);
  console.log(`  - Hash: ${Buffer.from(block.hash).toString('hex').slice(0, 16)}...`);
  console.log(`  - Transactions: ${block.vtx.length}\n`);

  if (block.vtx.length === 0) {
    console.log('⚠️  [DEBUG] No transactions in this block!\n');
    return;
  }

  // Test first transaction
  const tx = block.vtx[0];
  console.log('📝 [DEBUG] First transaction:');
  console.log(`  - Index: ${tx.index}`);
  console.log(`  - Hash: ${Buffer.from(tx.hash).toString('hex').slice(0, 16)}...`);
  console.log(`  - Sapling spends: ${tx.spends ? tx.spends.length : 0}`);
  console.log(`  - Sapling outputs: ${tx.outputs ? tx.outputs.length : 0}`);
  console.log(`  - Orchard actions: ${tx.actions ? tx.actions.length : 0}\n`);

  if (!tx.actions || tx.actions.length === 0) {
    console.log('⚠️  [DEBUG] No Orchard actions in this transaction!\n');
    return;
  }

  // Test first Orchard action
  const action = tx.actions[0];
  console.log('🔐 [DEBUG] First Orchard action RAW data:');
  console.log('  - nullifier type:', typeof action.nullifier);
  console.log('  - nullifier:', action.nullifier);
  console.log('  - cmx type:', typeof action.cmx);
  console.log('  - cmx:', action.cmx);
  console.log('  - ephemeralKey type:', typeof action.ephemeralKey);
  console.log('  - ephemeralKey:', action.ephemeralKey);
  console.log('  - ciphertext type:', typeof action.ciphertext);
  console.log('  - ciphertext length:', action.ciphertext ? action.ciphertext.length : 0);
  console.log('');

  // Convert to hex (like backend should do)
  console.log('🔄 [DEBUG] Converting to HEX strings:');

  const nullifierHex = action.nullifier ? Buffer.from(action.nullifier).toString('hex') : null;
  const cmxHex = action.cmx ? Buffer.from(action.cmx).toString('hex') : null;
  const ephemeralKeyHex = action.ephemeralKey ? Buffer.from(action.ephemeralKey).toString('hex') : null;
  const ciphertextHex = action.ciphertext ? Buffer.from(action.ciphertext).toString('hex') : null;

  console.log(`  - nullifier: ${nullifierHex}`);
  console.log(`  - cmx: ${cmxHex}`);
  console.log(`  - ephemeralKey: ${ephemeralKeyHex}`);
  console.log(`  - ciphertext: ${ciphertextHex}`);
  console.log(`  - ciphertext hex length: ${ciphertextHex ? ciphertextHex.length : 0} chars (should be 104 for 52 bytes)`);
  console.log('');

  // Validate lengths
  console.log('✅ [DEBUG] Validation:');
  console.log(`  - nullifier: ${nullifierHex ? nullifierHex.length : 0} chars (expected: 64 for 32 bytes) ${nullifierHex && nullifierHex.length === 64 ? '✅' : '❌'}`);
  console.log(`  - cmx: ${cmxHex ? cmxHex.length : 0} chars (expected: 64 for 32 bytes) ${cmxHex && cmxHex.length === 64 ? '✅' : '❌'}`);
  console.log(`  - ephemeralKey: ${ephemeralKeyHex ? ephemeralKeyHex.length : 0} chars (expected: 64 for 32 bytes) ${ephemeralKeyHex && ephemeralKeyHex.length === 64 ? '✅' : '❌'}`);
  console.log(`  - ciphertext: ${ciphertextHex ? ciphertextHex.length : 0} chars (expected: 104 for 52 bytes) ${ciphertextHex && ciphertextHex.length === 104 ? '✅' : '❌'}`);
  console.log('');

  // JSON format (what API should return)
  console.log('📤 [DEBUG] JSON format for API:');
  const apiFormat = {
    txid: Buffer.from(tx.hash).toString('hex'),
    actions: [{
      nullifier: nullifierHex,
      cmx: cmxHex,
      ephemeralKey: ephemeralKeyHex,
      ciphertext: ciphertextHex,
    }]
  };
  console.log(JSON.stringify(apiFormat, null, 2));
  console.log('');

  console.log('🎯 [DEBUG] Test complete!');
  console.log('');
  console.log('📋 [DEBUG] Next steps:');
  console.log('  1. Copy the hex values above');
  console.log('  2. Test them in browser console with:');
  console.log('     const wasm = window.__zcash_wasm__;');
  console.log('     wasm.decrypt_compact_output(nullifier, cmx, ephemeralKey, ciphertext, viewingKey);');
  console.log('  3. Check browser console for WASM logs');

  process.exit(0);
});

call.on('error', (err) => {
  console.error('❌ [DEBUG] Error:', err);
  process.exit(1);
});

call.on('end', () => {
  console.log('✅ [DEBUG] Stream ended');
});
