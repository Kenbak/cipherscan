#!/usr/bin/env node
/**
 * @cipherscan/zcash-decoder - Interactive Memo Decryption Example
 * 
 * Usage: node examples/decrypt-memo.mjs
 * 
 * This example demonstrates how to:
 * 1. Initialize the WASM module
 * 2. Detect viewing key type
 * 3. Fetch a raw transaction from CipherScan API
 * 4. Decrypt the memo using your viewing key
 */

import { ZcashWASM } from '@cipherscan/zcash-decoder';
import * as readline from 'node:readline';

// CipherScan API endpoints
const APIS = {
  mainnet: 'https://api.mainnet.cipherscan.app',
  testnet: 'https://api.testnet.zecblock.com',
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const ask = (question) => new Promise((resolve) => rl.question(question, resolve));

async function fetchRawTx(apiUrl, txid) {
  console.log(`\n📡 Fetching from ${apiUrl}/api/tx/${txid}/raw ...`);
  
  const response = await fetch(`${apiUrl}/api/tx/${txid}/raw`);
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API returned ${response.status}: ${text}`);
  }
  
  const data = await response.json();
  
  if (!data.hex) {
    throw new Error('No hex in response');
  }
  
  return data.hex;
}

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║          CipherScan Zcash Decoder - Memo Decryption           ║
╚═══════════════════════════════════════════════════════════════╝
`);

  console.log('Initializing WASM...');
  const wasm = await ZcashWASM.init();
  console.log('✅ WASM ready!\n');

  // Get viewing key
  const viewingKey = await ask('Enter your viewing key (UFVK): ');
  
  if (!viewingKey.trim()) {
    console.log('❌ No viewing key provided');
    rl.close();
    return;
  }

  // Detect key type and network
  const keyType = wasm.detectKeyType(viewingKey.trim());
  console.log(`📋 Key type: ${keyType}`);
  
  const network = keyType.includes('testnet') ? 'testnet' : 'mainnet';
  const apiUrl = APIS[network];
  console.log(`🌐 Network: ${network}`);

  // Get txid
  const txid = await ask('\nEnter transaction ID (txid): ');
  
  if (!txid.trim()) {
    console.log('❌ No txid provided');
    rl.close();
    return;
  }

  // Fetch raw tx
  let rawHex;
  try {
    rawHex = await fetchRawTx(apiUrl, txid.trim());
    console.log(`✅ Got raw tx (${rawHex.length} chars)\n`);
  } catch (e) {
    console.log(`❌ Failed: ${e.message}`);
    rl.close();
    return;
  }

  console.log('🔓 Decrypting...\n');

  try {
    const result = await wasm.decryptMemo(rawHex, viewingKey.trim());
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Decryption successful!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 Memo:', result.memo || '(empty)');
    console.log('💰 Amount:', result.amount, 'ZEC');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  } catch (e) {
    console.log('❌ Decryption failed:', e.message);
    console.log('\n💡 Make sure this transaction was sent TO your viewing key address.');
  }

  rl.close();
}

main().catch((e) => {
  console.error('Error:', e);
  rl.close();
  process.exit(1);
});
