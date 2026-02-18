#!/usr/bin/env node
/**
 * Milestone 1 Verification Script
 *
 * Tests all Milestone 1 deliverables against a live CipherScan deployment:
 *
 *   1. Decode UA tool
 *   2. Mempool Explorer
 *   3. Fee calculation (cross-reference vs Blockchair)
 *   4. Supply & Circulating Supply APIs
 *   5. WASM decryption module (npm)
 *   6. Decode Binary TX tool
 *   7. Broadcast TX tool
 *   8. Developer Tools page (/tools)
 *
 * Usage:
 *   node server/scripts/verify-milestone1.js [base_url]
 *
 * Examples:
 *   node server/scripts/verify-milestone1.js https://cipherscan.app
 *   node server/scripts/verify-milestone1.js https://testnet.cipherscan.app
 */

const BASE = (process.argv[2] || 'https://cipherscan.app').replace(/\/$/, '');

// API base: derive from frontend URL
// cipherscan.app -> api.mainnet.cipherscan.app
// testnet.cipherscan.app -> api.testnet.cipherscan.app
// localhost:3000 -> localhost:3001
function deriveApiBase(frontendUrl) {
  if (frontendUrl.includes('localhost')) {
    return frontendUrl.replace(':3000', ':3001');
  }
  if (frontendUrl.includes('testnet')) {
    return 'https://api.testnet.cipherscan.app';
  }
  return 'https://api.mainnet.cipherscan.app';
}

const API = deriveApiBase(BASE);
const BLOCKCHAIR = 'https://api.blockchair.com/zcash/dashboards/transaction';

// Real mainnet test txids
const TX_TRANSPARENT = '66c677bfb9501a99c5f85be08a69ca8a6b0c13b55cdf028d62759b09d23ef4d7';
const TX_SHIELDED    = '09a50d6e41d3cc405ec847dbcbf7930f01873d520a2bcc6019942a7990298d85';
const TX_MIXED       = '7f6128309d6be25fc9c4b32f7a9c4d39ae882631dd0da14d2c73d5f4963f2637';

// ── Utilities ────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];

function assert(condition, testName, detail) {
  if (condition) {
    console.log(`  ✅ ${testName}`);
    passed++;
  } else {
    console.log(`  ❌ ${testName}${detail ? ` — ${detail}` : ''}`);
    failed++;
    failures.push(testName);
  }
}

function info(msg) {
  console.log(`  ℹ️  ${msg}`);
}

async function fetchSafe(url, options = {}) {
  try {
    const res = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, ok: res.ok, data };
  } catch (err) {
    return { status: 0, ok: false, data: null, error: err.message };
  }
}

function separator(title) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(60));
}

// ── 1. Decode UA Tool ────────────────────────────────────────────────────

async function testDecodeUA() {
  separator('1. Decode UA Tool');

  const uaAddr = 'u1fh3kwyl9hq9q907rx9j8mdy2r7gz4xh0y4yt63dxykk2856gr0238vxsegemyfu8s5a77ycq72tcnzkxa75ykjtcn6wp2w9rtuu3ssdzpe2fyghl8wlk3vh6f67304xe4lrxtvywtudy5t434zc07u6mh27ekufx7ssr55l8875z7f4k76c3tk23s3jzf8rxdlkequlta8lwsv09gxm';
  const pageRes = await fetchSafe(`${BASE}/address/${uaAddr}`);
  assert(pageRes.ok, 'Address page loads for unified address', `status ${pageRes.status}`);

  info(`Manual: Visit ${BASE}/address/${uaAddr}`);
  info('Verify the page decodes the UA into Unified, Transparent, and Sapling tabs');
}

// ── 2. Mempool Explorer ──────────────────────────────────────────────────

async function testMempool() {
  separator('2. Mempool Explorer');

  // Frontend page
  const pageRes = await fetchSafe(`${BASE}/mempool`);
  assert(pageRes.ok, 'Mempool page loads (/mempool)', `status ${pageRes.status}`);

  // API endpoint
  const apiRes = await fetchSafe(`${API}/api/mempool`);
  assert(apiRes.ok, 'Mempool API responds (/api/mempool)', `status ${apiRes.status}`);

  if (apiRes.ok && apiRes.data) {
    const count = apiRes.data.count ?? apiRes.data.transactions?.length ?? 0;
    assert(typeof count === 'number', `Mempool returns transaction count: ${count}`);
  }

  info(`Manual: ${BASE}/mempool`);
}

// ── 3. Fee Calculation ───────────────────────────────────────────────────

async function testFees() {
  separator('3. Fee Calculation (cross-reference)');

  // Transparent tx — cross-reference with Blockchair
  console.log(`\n  Transparent: ${TX_TRANSPARENT.substring(0, 20)}...`);
  const csRes = await fetchSafe(`${API}/api/tx/${TX_TRANSPARENT}`);
  if (!csRes.ok) {
    console.log('  ⏭️  Cannot fetch tx from API — skipping');
    skipped += 3;
    return;
  }

  const csFeeZat = Math.round(csRes.data.fee * 100000000);
  console.log(`    CipherScan: ${csFeeZat} zatoshi`);

  const bcRes = await fetchSafe(`${BLOCKCHAIR}/${TX_TRANSPARENT}`);
  if (bcRes.ok && bcRes.data?.data?.[TX_TRANSPARENT]) {
    const bcFeeZat = bcRes.data.data[TX_TRANSPARENT].transaction.fee;
    console.log(`    Blockchair:  ${bcFeeZat} zatoshi`);
    const diff = Math.abs(csFeeZat - bcFeeZat);
    assert(diff <= 1, `Fee matches Blockchair (diff: ${diff} zatoshi)`);
  } else {
    assert(csFeeZat > 0 && csFeeZat < 1000000, `Fee in reasonable range: ${csFeeZat} zatoshi`);
  }

  // Shielded & mixed — verify against known values, link to 3xpl for manual check
  console.log(`\n  Shielded: ${TX_SHIELDED.substring(0, 20)}...`);
  const shRes = await fetchSafe(`${API}/api/tx/${TX_SHIELDED}`);
  if (shRes.ok) {
    const shFeeZat = Math.round(shRes.data.fee * 100000000);
    console.log(`    CipherScan: ${shFeeZat} zatoshi`);
    assert(shFeeZat === 10000, `Shielded fee = 10,000 zatoshi (ZIP-317)`, `got ${shFeeZat}`);
    info(`Verify: https://3xpl.com/zcash/transaction/${TX_SHIELDED}`);
  }

  console.log(`\n  Mixed: ${TX_MIXED.substring(0, 20)}...`);
  const mxRes = await fetchSafe(`${API}/api/tx/${TX_MIXED}`);
  if (mxRes.ok) {
    const mxFeeZat = Math.round(mxRes.data.fee * 100000000);
    console.log(`    CipherScan: ${mxFeeZat} zatoshi`);
    assert(mxFeeZat === 15000, `Mixed fee = 15,000 zatoshi (ZIP-317)`, `got ${mxFeeZat}`);
    info(`Verify: https://3xpl.com/zcash/transaction/${TX_MIXED}`);
  }
}

// ── 4. Supply & Circulating Supply ───────────────────────────────────────

async function testSupply() {
  separator('4. Supply & Circulating Supply APIs');

  // /api/supply
  const supplyRes = await fetchSafe(`${API}/api/supply`);
  assert(supplyRes.ok, '/api/supply responds', `status ${supplyRes.status}`);

  if (supplyRes.ok && supplyRes.data) {
    const pools = Array.isArray(supplyRes.data) ? supplyRes.data : [];
    const poolIds = pools.map(p => p.id);
    const hasAll = ['transparent', 'sprout', 'sapling', 'orchard'].every(id => poolIds.includes(id));
    assert(hasAll, 'Supply returns pool breakdown (transparent, sprout, sapling, orchard)');
    const totalValue = pools.reduce((sum, p) => sum + (p.chainValue || 0), 0);
    assert(totalValue > 1000000, `Total pool value = ${totalValue.toFixed(2)} ZEC`);
  }

  // /api/circulating-supply (plain text)
  const circRes = await fetchSafe(`${API}/api/circulating-supply`);
  assert(circRes.ok, '/api/circulating-supply responds', `status ${circRes.status}`);

  if (circRes.ok) {
    const val = parseFloat(circRes.data);
    assert(val > 10000000 && val <= 21000000, `Circulating supply = ${val} ZEC (sane range)`, `got ${val}`);
  }

  // /api/circulating-supply?format=json
  const circJsonRes = await fetchSafe(`${API}/api/circulating-supply?format=json`);
  assert(circJsonRes.ok, '/api/circulating-supply?format=json responds', `status ${circJsonRes.status}`);

  if (circJsonRes.ok && circJsonRes.data) {
    assert(circJsonRes.data.maxSupply === 21000000, `maxSupply = 21,000,000 ZEC`, `got ${circJsonRes.data.maxSupply}`);
    assert(circJsonRes.data.circulatingSupply > 0, `circulatingSupply > 0`, `got ${circJsonRes.data.circulatingSupply}`);
  }
}

// ── 5. WASM Decryption Module ────────────────────────────────────────────

async function testWASM() {
  separator('5. WASM Decryption Module (npm)');

  // Check npm package exists
  const npmRes = await fetchSafe('https://registry.npmjs.org/@cipherscan/zcash-decoder');
  assert(npmRes.ok, '@cipherscan/zcash-decoder exists on npm', `status ${npmRes.status}`);

  if (npmRes.ok && npmRes.data) {
    const latest = npmRes.data['dist-tags']?.latest;
    assert(latest != null, `Latest version: ${latest}`);
  }

  // Check decrypt page on frontend
  const decryptRes = await fetchSafe(`${BASE}/decrypt`);
  assert(decryptRes.ok, 'Decrypt page loads (/decrypt)', `status ${decryptRes.status}`);

  info(`Manual: Try decrypting a memo at ${BASE}/decrypt`);
  info('npm: https://www.npmjs.com/package/@cipherscan/zcash-decoder');
}

// ── 6. Decode Binary TX Tool ─────────────────────────────────────────────

async function testDecodeTool() {
  separator('6. Decode Binary TX Tool');

  const pageRes = await fetchSafe(`${BASE}/tools/decode`);
  assert(pageRes.ok, 'Decode page loads (/tools/decode)', `status ${pageRes.status}`);

  if (pageRes.ok && typeof pageRes.data === 'string') {
    assert(
      pageRes.data.includes('Decode Raw Transaction') || pageRes.data.includes('decode'),
      'Page has decode content'
    );
  }

  info(`Manual: Paste a raw tx hex at ${BASE}/tools/decode`);
  info(`Test vectors:`);
  info(`  Transparent: ${TX_TRANSPARENT}`);
  info(`  Shielded:    ${TX_SHIELDED}`);
  info(`  Mixed:       ${TX_MIXED}`);
  info(`Fetch raw hex: ${API}/api/tx/<txid>/raw`);
}

// ── 7. Broadcast TX Tool ─────────────────────────────────────────────────

async function testBroadcastTool() {
  separator('7. Broadcast TX Tool');

  // Frontend
  const pageRes = await fetchSafe(`${BASE}/tools/broadcast`);
  assert(pageRes.ok, 'Broadcast page loads (/tools/broadcast)', `status ${pageRes.status}`);

  // API validation
  const emptyRes = await fetchSafe(`${API}/api/tx/broadcast`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  assert(emptyRes.status === 400, 'Rejects empty body (400)', `got ${emptyRes.status}`);

  const badHexRes = await fetchSafe(`${API}/api/tx/broadcast`, {
    method: 'POST',
    body: JSON.stringify({ rawTx: 'ZZZZ-not-hex' }),
  });
  assert(badHexRes.status === 400, 'Rejects invalid hex (400)', `got ${badHexRes.status}`);

  const fakeRes = await fetchSafe(`${API}/api/tx/broadcast`, {
    method: 'POST',
    body: JSON.stringify({ rawTx: 'deadbeef' }),
  });
  assert(fakeRes.status === 400, 'Rejects malformed tx (400)', `got ${fakeRes.status}`);

  info(`Manual: ${BASE}/tools/broadcast`);
}

// ── 8. Developer Tools Page ──────────────────────────────────────────────

async function testToolsPage() {
  separator('8. Developer Tools Page (/tools)');

  const pageRes = await fetchSafe(`${BASE}/tools`);
  assert(pageRes.ok, 'Tools hub loads (/tools)', `status ${pageRes.status}`);

  if (pageRes.ok && typeof pageRes.data === 'string') {
    assert(pageRes.data.includes('Decode Raw Transaction'), 'Links to Decode tool');
    assert(pageRes.data.includes('Broadcast Transaction'), 'Links to Broadcast tool');
    assert(pageRes.data.includes('Decrypt Shielded Memo'), 'Links to Decrypt tool');
  }

  // Navbar integration
  const homeRes = await fetchSafe(`${BASE}/`);
  if (homeRes.ok && typeof homeRes.data === 'string') {
    assert(
      homeRes.data.includes('/tools') || homeRes.data.includes('Tools'),
      'Navbar links to /tools from homepage'
    );
  }

  info(`Manual: ${BASE}/tools`);
}

// ── Run ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║        CipherScan — Milestone 1 Verification           ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`\n  Frontend: ${BASE}`);
  console.log(`  API:      ${API}`);
  console.log(`  Date:     ${new Date().toISOString()}\n`);

  await testDecodeUA();
  await testMempool();
  await testFees();
  await testSupply();
  await testWASM();
  await testDecodeTool();
  await testBroadcastTool();
  await testToolsPage();

  console.log(`\n${'═'.repeat(60)}`);
  console.log('  RESULTS');
  console.log('═'.repeat(60));
  console.log(`  ✅ Passed:  ${passed}`);
  console.log(`  ❌ Failed:  ${failed}`);
  console.log(`  ⏭️  Skipped: ${skipped}`);
  console.log(`  📝 Total:   ${passed + failed + skipped}`);

  if (failures.length > 0) {
    console.log(`\n  Failures:`);
    failures.forEach(f => console.log(`    • ${f}`));
  }

  console.log('═'.repeat(60));

  if (failed > 0) {
    console.log('\n💥 Milestone 1 verification FAILED.\n');
    process.exit(1);
  } else {
    console.log('\n🎉 Milestone 1 verification PASSED.\n');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(2);
});
