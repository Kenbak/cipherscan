/**
 * Example: Birthday scan with compact blocks
 *
 * This example shows how to scan all transactions from a wallet's
 * birthday height to the current chain tip.
 */

import { ZcashWASM } from '@cipherscan/zcash-decoder';

async function main() {
  // Configuration
  const viewingKey = 'uviewtest1...'; // Replace with your UFVK
  const birthdayHeight = 3121131;
  const apiUrl = 'http://localhost:3001/api';

  // 1. Get current block height
  console.log('📊 Fetching current block height...');
  const heightRes = await fetch(`${apiUrl}/block/height`);
  const { height: currentHeight } = await heightRes.json();
  console.log(`✅ Chain tip: ${currentHeight}\n`);

  // 2. Fetch compact blocks from Lightwalletd
  const totalBlocks = currentHeight - birthdayHeight;
  console.log(`📦 Fetching ${totalBlocks.toLocaleString()} compact blocks...`);

  const scanRes = await fetch(`${apiUrl}/lightwalletd/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startHeight: birthdayHeight,
      endHeight: currentHeight,
    }),
  });

  const { blocks } = await scanRes.json();
  console.log(`✅ Received ${blocks.length.toLocaleString()} blocks\n`);

  // 3. Initialize WASM
  console.log('🔧 Initializing WASM module...');
  const wasm = await ZcashWASM.init();
  console.log('✅ WASM loaded\n');

  // 4. Filter compact blocks
  console.log('🔍 Filtering compact blocks...');
  const startTime = Date.now();

  const matches = await wasm.filterCompactBlocks(
    blocks,
    viewingKey,
    (progress) => {
      const percent = ((progress.blocksProcessed / progress.totalBlocks) * 100).toFixed(1);
      console.log(
        `  ${progress.blocksProcessed.toLocaleString()}/${progress.totalBlocks.toLocaleString()} ` +
        `blocks (${percent}%) — ${progress.matchesFound} matches`
      );
    }
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ Filtering complete in ${elapsed}s\n`);

  // 5. Display results
  console.log('═══════════════════════════════════════');
  console.log(`Found ${matches.length} transactions:\n`);

  matches.forEach((tx, i) => {
    console.log(`${i + 1}. TXID: ${tx.txid}`);
    console.log(`   Block: ${tx.height}`);
    console.log(`   Time: ${new Date(tx.timestamp * 1000).toISOString()}\n`);
  });
  console.log('═══════════════════════════════════════');

  // 6. (Optional) Fetch and decrypt full memos
  if (matches.length > 0) {
    console.log('\n🔓 Decrypting memos...');

    for (const match of matches) {
      try {
        // Fetch raw transaction
        const txRes = await fetch(`${apiUrl}/tx/raw/${match.txid}`);
        const { rawHex } = await txRes.json();

        // Decrypt memo
        const result = await wasm.decryptMemo(rawHex, viewingKey);

        console.log(`\n  TXID: ${match.txid.slice(0, 16)}...`);
        console.log(`  Amount: ${result.amount} ZEC`);
        console.log(`  Memo: ${result.memo}`);
      } catch (error) {
        console.error(`  ❌ Failed to decrypt ${match.txid}:`, error);
      }
    }
  }
}

main().catch(console.error);
