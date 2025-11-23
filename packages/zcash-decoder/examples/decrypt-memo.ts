/**
 * Example: Decrypt a single transaction memo
 *
 * This example shows how to decrypt a memo from a known transaction.
 */

import { ZcashWASM } from '@cipherscan/zcash-decoder';

async function main() {
  // Initialize WASM
  console.log('Initializing WASM module...');
  const wasm = await ZcashWASM.init();
  console.log('✅ WASM loaded\n');

  // Example transaction (testnet)
  const txHex = '04000080...'; // Replace with actual hex
  const viewingKey = 'uviewtest1...'; // Replace with your UFVK

  try {
    console.log('Decrypting memo...');
    const result = await wasm.decryptMemo(txHex, viewingKey);

    console.log('✅ Decryption successful!\n');
    console.log('═══════════════════════════════════════');
    console.log('Memo:', result.memo);
    console.log('Amount:', result.amount, 'ZEC');
    console.log('═══════════════════════════════════════');
  } catch (error) {
    console.error('❌ Decryption failed:', error);
  }
}

main();
