/**
 * Block Watcher Service
 *
 * Monitors the Zcash blockchain for new blocks and triggers privacy stats updates.
 * Runs continuously and checks for new blocks every 60 seconds.
 * Executes the privacy stats script directly (no HTTP server needed).
 */

import fetch from 'node-fetch';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

const RPC_URL = process.env.ZCASH_RPC_URL;
const RPC_USER = process.env.ZCASH_RPC_USER;
const RPC_PASS = process.env.ZCASH_RPC_PASS;
const UPDATE_SCRIPT = '/root/zcash-explorer/scripts/update-privacy-stats.sh';

// Validate required environment variables
if (!RPC_URL || !RPC_USER || !RPC_PASS) {
  console.error('❌ Missing required environment variables:');
  if (!RPC_URL) console.error('  - ZCASH_RPC_URL');
  if (!RPC_USER) console.error('  - ZCASH_RPC_USER');
  if (!RPC_PASS) console.error('  - ZCASH_RPC_PASS');
  process.exit(1);
}
const CHECK_INTERVAL = 60000; // 1 minute (optimized)
const UPDATE_THRESHOLD = 10; // Update every 10 blocks (optimized for efficiency)

let lastKnownBlock = 0;
let lastUpdateBlock = 0;
let isUpdating = false;

async function rpcCall(method, params = []) {
  const auth = Buffer.from(`${RPC_USER}:${RPC_PASS}`).toString('base64');

  const response = await fetch(RPC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${auth}`,
    },
    body: JSON.stringify({
      jsonrpc: '1.0',
      id: 'block-watcher',
      method,
      params,
    }),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message);
  }
  return data.result;
}

async function getCurrentBlockHeight() {
  return await rpcCall('getblockcount');
}

async function triggerPrivacyStatsUpdate() {
  if (isUpdating) {
    console.log('⏳ Update already in progress, skipping...');
    return;
  }

  isUpdating = true;
  console.log('🔄 Executing privacy stats update script...');

  try {
    const startTime = Date.now();
    const { stdout, stderr } = await execAsync(UPDATE_SCRIPT, {
      timeout: 300000, // 5 minute timeout
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    if (stderr) {
      console.log('⚠️  stderr:', stderr.trim());
    }

    console.log(`✅ Update completed in ${duration}s`);

    // Show last few lines of output
    const lines = stdout.trim().split('\n');
    const lastLines = lines.slice(-3).join('\n');
    if (lastLines) {
      console.log(`📊 Output:\n${lastLines}`);
    }
  } catch (error) {
    console.error('❌ Failed to execute update script:', error.message);
    if (error.stderr) {
      console.error('   stderr:', error.stderr.trim());
    }
  } finally {
    isUpdating = false;
  }
}

async function checkForNewBlocks() {
  try {
    const currentBlock = await getCurrentBlockHeight();

    if (lastKnownBlock === 0) {
      // First run
      lastKnownBlock = currentBlock;
      lastUpdateBlock = currentBlock;
      console.log(`📊 Starting block watcher at height ${currentBlock}`);
      console.log(`⚙️  Optimization: Updates triggered every ${UPDATE_THRESHOLD} blocks`);
      return;
    }

    if (currentBlock > lastKnownBlock) {
      const newBlocks = currentBlock - lastKnownBlock;
      const blocksSinceUpdate = currentBlock - lastUpdateBlock;

      console.log(`🆕 New block(s) detected! ${lastKnownBlock} → ${currentBlock} (+${newBlocks})`);
      console.log(`   Blocks since last update: ${blocksSinceUpdate}/${UPDATE_THRESHOLD}`);

      lastKnownBlock = currentBlock;

      // Only trigger update if threshold reached
      if (blocksSinceUpdate >= UPDATE_THRESHOLD) {
        console.log(`✨ Threshold reached! Triggering privacy stats update...`);
        await triggerPrivacyStatsUpdate();
        lastUpdateBlock = currentBlock;
      } else {
        console.log(`⏳ Waiting for ${UPDATE_THRESHOLD - blocksSinceUpdate} more blocks before update`);
      }
    } else {
      console.log(`⏸️  No new blocks (height: ${currentBlock})`);
    }
  } catch (error) {
    console.error('❌ Error checking blocks:', error.message);
  }
}

async function main() {
  console.log('🚀 Block Watcher Service Starting...');
  console.log(`📡 RPC: ${RPC_URL}`);
  console.log(`📜 Update Script: ${UPDATE_SCRIPT}`);
  console.log(`⏱️  Check interval: ${CHECK_INTERVAL / 1000}s`);
  console.log(`🔄 Update threshold: ${UPDATE_THRESHOLD} blocks`);
  console.log('');

  // Initial check
  await checkForNewBlocks();

  // Start polling
  setInterval(checkForNewBlocks, CHECK_INTERVAL);
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down...');
  process.exit(0);
});

// Start the watcher
main().catch((error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
