#!/usr/bin/env node
/**
 * API Route Test Script
 * Run this after refactoring to ensure all routes still work
 *
 * Usage: node server/api/scripts/test-all-routes.js [base_url]
 * Example: node server/api/scripts/test-all-routes.js http://localhost:3001
 */

const BASE_URL = process.argv[2] || 'http://localhost:3001';

// Test data - adjust these for your network (testnet/mainnet)
const TEST_DATA = {
  blockHeight: 1000,
  txid: null, // Will be fetched from a block
  address: null, // Will be fetched from a transaction
};

const routes = [
  // Health & Info
  { method: 'GET', path: '/health', name: 'Health Check', critical: true },
  { method: 'GET', path: '/api/info', name: 'Chain Info', critical: true },

  // Blocks
  { method: 'GET', path: '/api/blocks?limit=5', name: 'Block List', critical: true },
  { method: 'GET', path: '/api/block/{blockHeight}', name: 'Block by Height', critical: true, dynamic: true },

  // Transactions
  { method: 'GET', path: '/api/tx/shielded?limit=5', name: 'Shielded Transactions', critical: true },
  { method: 'GET', path: '/api/tx/{txid}', name: 'Transaction by ID', critical: true, dynamic: true, needsTxid: true },
  { method: 'GET', path: '/api/tx/{txid}/raw', name: 'Raw Transaction', critical: false, dynamic: true, needsTxid: true },
  { method: 'GET', path: '/api/tx/{txid}/linkability', name: 'Transaction Linkability', critical: false, dynamic: true, needsTxid: true },
  { method: 'GET', path: '/api/mempool', name: 'Mempool', critical: true },

  // Address
  { method: 'GET', path: '/api/address/{address}', name: 'Address Details', critical: true, dynamic: true, needsAddress: true },

  // Privacy
  { method: 'GET', path: '/api/privacy-stats', name: 'Privacy Stats', critical: true },
  { method: 'GET', path: '/api/privacy/risks?limit=5&period=7d', name: 'Privacy Risks', critical: true },
  { method: 'GET', path: '/api/privacy/common-amounts?period=7d', name: 'Common Amounts', critical: true },

  // Stats
  { method: 'GET', path: '/api/stats/shielded-count?since=2024-01-01', name: 'Shielded Count', critical: true },
  { method: 'GET', path: '/api/stats/shielded-daily?since=2024-12-01', name: 'Shielded Daily', critical: true },

  // Network
  { method: 'GET', path: '/api/network/stats', name: 'Network Stats', critical: true },
  { method: 'GET', path: '/api/network/fees', name: 'Network Fees', critical: false },
  { method: 'GET', path: '/api/network/health', name: 'Network Health', critical: true },
  { method: 'GET', path: '/api/network/peers', name: 'Network Peers', critical: false },

  // Cross-chain
  { method: 'GET', path: '/api/crosschain/stats', name: 'Cross-chain Stats', critical: false },
  { method: 'GET', path: '/api/crosschain/inflows', name: 'Cross-chain Inflows', critical: false },
  { method: 'GET', path: '/api/crosschain/outflows', name: 'Cross-chain Outflows', critical: false },
  { method: 'GET', path: '/api/crosschain/status', name: 'Cross-chain Status', critical: false },

  // POST routes (test with empty/minimal body)
  { method: 'POST', path: '/api/tx/raw/batch', name: 'Batch Raw TX', critical: false, body: { txids: [] } },
  // These require valid data, skip in automated test:
  // { method: 'POST', path: '/api/scan/orchard', name: 'Scan Orchard', critical: false },
  // { method: 'POST', path: '/api/lightwalletd/scan', name: 'Lightwalletd Scan', critical: false },
];

async function fetchJson(url, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    const data = await response.json();
    return { status: response.status, data, ok: response.ok };
  } catch (error) {
    return { status: 0, error: error.message, ok: false };
  }
}

async function runTests() {
  console.log('🧪 API Route Test Script');
  console.log(`📍 Base URL: ${BASE_URL}`);
  console.log('─'.repeat(60));

  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const failures = [];

  // First, fetch some test data
  console.log('\n📦 Fetching test data...');

  // Get a block to extract txid
  const blocksRes = await fetchJson(`${BASE_URL}/api/blocks?limit=1`);
  if (blocksRes.ok && blocksRes.data.blocks?.[0]) {
    TEST_DATA.blockHeight = blocksRes.data.blocks[0].height;
    console.log(`   Block height: ${TEST_DATA.blockHeight}`);
  }

  // Get a transaction
  const blockRes = await fetchJson(`${BASE_URL}/api/block/${TEST_DATA.blockHeight}`);
  if (blockRes.ok && blockRes.data.transactions?.[0]) {
    TEST_DATA.txid = blockRes.data.transactions[0].txid;
    console.log(`   Transaction ID: ${TEST_DATA.txid?.substring(0, 16)}...`);
  }

  // Get an address - search through recent blocks to find a transparent tx
  for (let i = 0; i < 10 && !TEST_DATA.address; i++) {
    const height = TEST_DATA.blockHeight - i;
    const blockRes = await fetchJson(`${BASE_URL}/api/block/${height}`);
    if (blockRes.ok && blockRes.data.transactions) {
      for (const tx of blockRes.data.transactions) {
        if (tx.vout && tx.vout.length > 0) {
          const vout = tx.vout.find(v => v.scriptPubKey?.addresses?.[0]);
          if (vout) {
            TEST_DATA.address = vout.scriptPubKey.addresses[0];
            TEST_DATA.txid = tx.txid; // Update to a tx with transparent outputs
            console.log(`   Address: ${TEST_DATA.address?.substring(0, 20)}... (from block ${height})`);
            break;
          }
        }
      }
    }
  }
  if (!TEST_DATA.address) {
    console.log('   Address: (none found in last 10 blocks - using fallback)');
    // Fallback: use a known testnet address
    TEST_DATA.address = 'tmQoJ3PTXgQLaRRZZYT6xk8XtjRbr2kCqwu'; // Testnet faucet
  }

  console.log('\n─'.repeat(60));
  console.log('🚀 Running tests...\n');

  for (const route of routes) {
    let path = route.path;
    let skip = false;

    // Replace dynamic parameters
    if (route.dynamic) {
      if (route.needsTxid && !TEST_DATA.txid) {
        skip = true;
      } else if (route.needsAddress && !TEST_DATA.address) {
        skip = true;
      } else {
        path = path
          .replace('{blockHeight}', TEST_DATA.blockHeight)
          .replace('{txid}', TEST_DATA.txid || '')
          .replace('{address}', TEST_DATA.address || '');
      }
    }

    if (skip) {
      console.log(`⏭️  SKIP: ${route.name} (missing test data)`);
      skipped++;
      continue;
    }

    const url = `${BASE_URL}${path}`;
    const options = route.method === 'POST'
      ? { method: 'POST', body: JSON.stringify(route.body || {}) }
      : {};

    const result = await fetchJson(url, options);

    // Consider 200-299 as success, also 503 for cross-chain (API not configured)
    const isSuccess = result.ok || (result.status === 503 && path.includes('crosschain'));

    if (isSuccess) {
      console.log(`✅ PASS: ${route.name}`);
      passed++;
    } else {
      const icon = route.critical ? '❌' : '⚠️';
      console.log(`${icon} FAIL: ${route.name} (${result.status}) ${result.error || ''}`);
      failed++;
      failures.push({ route, result });
    }
  }

  console.log('\n' + '─'.repeat(60));
  console.log('📊 Results:');
  console.log(`   ✅ Passed:  ${passed}`);
  console.log(`   ❌ Failed:  ${failed}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   📝 Total:   ${routes.length}`);

  if (failures.length > 0) {
    console.log('\n❌ Failed routes:');
    failures.forEach(({ route, result }) => {
      console.log(`   - ${route.name}: ${route.method} ${route.path}`);
      console.log(`     Status: ${result.status}, Error: ${result.error || JSON.stringify(result.data)?.substring(0, 100)}`);
    });
  }

  console.log('\n' + '─'.repeat(60));

  if (failed === 0) {
    console.log('🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('💥 Some tests failed. Check the routes above.');
    process.exit(1);
  }
}

runTests();
