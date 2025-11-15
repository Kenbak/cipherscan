#!/usr/bin/env node

/**
 * Script to find transactions with memos in recent blocks
 * Usage: node find-tx-with-memo.mjs
 */

const RPC_URL = 'http://165.232.65.78:18232';

async function rpcCall(method, params = []) {
  const response = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '1.0',
      id: 'find-memo',
      method,
      params,
    }),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(`RPC Error: ${data.error.message}`);
  }
  return data.result;
}

async function findTxWithMemo() {
  console.log('🔍 Searching for transactions with memos...\n');

  try {
    // Get current block height
    const currentHeight = await rpcCall('getblockcount');
    console.log(`📊 Current synced height: ${currentHeight}\n`);

    // Search last 100 blocks
    const searchLimit = 100;
    const startHeight = Math.max(0, currentHeight - searchLimit);

    console.log(`🔎 Searching blocks ${startHeight} to ${currentHeight}...\n`);

    for (let height = currentHeight; height >= startHeight; height--) {
      // Get block hash
      const blockHash = await rpcCall('getblockhash', [height]);

      // Get block with transactions
      const block = await rpcCall('getblock', [blockHash, 2]);

      // Check each transaction
      for (const tx of block.tx) {
        // Check for shielded outputs (vShieldedOutput for Sapling, vout with memo)
        const hasShieldedOutputs =
          (tx.vShieldedOutput && tx.vShieldedOutput.length > 0) ||
          (tx.vout && tx.vout.some(out => out.memo));

        if (hasShieldedOutputs) {
          console.log(`✅ Found shielded transaction!`);
          console.log(`   Block: ${height}`);
          console.log(`   TXID: ${tx.txid}`);
          console.log(`   Time: ${new Date(block.time * 1000).toISOString()}`);

          if (tx.vShieldedOutput) {
            console.log(`   Sapling outputs: ${tx.vShieldedOutput.length}`);
          }

          if (tx.vout) {
            const memosFound = tx.vout.filter(out => out.memo);
            if (memosFound.length > 0) {
              console.log(`   Memos found: ${memosFound.length}`);
              memosFound.forEach((out, idx) => {
                console.log(`   Memo ${idx}: ${out.memo.substring(0, 64)}...`);
              });
            }
          }

          console.log(`\n🎯 Test this TXID on your memo decoder!`);
          console.log(`   http://localhost:3000/decrypt\n`);

          return tx.txid;
        }
      }

      // Progress indicator
      if (height % 10 === 0) {
        process.stdout.write(`   Scanned ${currentHeight - height} blocks...\r`);
      }
    }

    console.log(`\n❌ No transactions with memos found in last ${searchLimit} blocks.`);
    console.log(`   This is normal - shielded transactions are rare on testnet.`);
    console.log(`\n💡 You need to create your own transaction with memo using zingo-cli.`);
    console.log(`   Wait for zebrad to finish syncing (currently at 76%).\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

findTxWithMemo();
