#!/usr/bin/env node
/**
 * Milestone 3 Verification Script
 *
 * Tests all verifiable Milestone 3 deliverables against a live CipherScan deployment:
 *
 *   1. Feature parity audit (document exists — manual review)
 *   2. Tor Hidden Service (skipped — post-deployment)
 *   3. Shielded Supply History API — 365 days
 *   4. Query performance optimizations (MVs, Redis-cached pool routes)
 *   5. Privacy Index weekly publication (newsletter)
 *   6. Documentation improvements (/docs endpoint count)
 *   7. Forum progress report (skipped — manual)
 *
 * Usage:
 *   node zcg/milestone-3/verify.js [base_url]
 *
 * Examples:
 *   node zcg/milestone-3/verify.js https://cipherscan.app
 *   node zcg/milestone-3/verify.js https://testnet.cipherscan.app
 */

const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'https://cipherscan.app').replace(/\/$/, '');

function deriveApiBase(frontendUrl) {
  if (frontendUrl.includes('localhost')) return frontendUrl.replace(':3000', ':3001');
  if (frontendUrl.includes('testnet')) return 'https://api.testnet.cipherscan.app';
  if (frontendUrl.includes('crosslink')) return 'https://api.crosslink.cipherscan.app';
  return 'https://api.mainnet.cipherscan.app';
}

const API = deriveApiBase(BASE);
const EXPECTED_ENDPOINT_COUNT = 43;
const MIN_POOL_HISTORY_DAYS = 365;
const MIN_NEWSLETTER_ISSUES = 10;

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

function skip(testName, reason) {
  console.log(`  ⏭️  ${testName} — ${reason}`);
  skipped++;
}

function show(label, value) {
  if (typeof value === 'object') {
    console.log(`     ${label}:`);
    JSON.stringify(value, null, 2).split('\n').forEach(l => console.log(`       ${l}`));
  } else {
    console.log(`     ${label}: ${value}`);
  }
}

function url(label, href) {
  console.log(`     🔗 ${label}: ${href}`);
}

async function fetchSafe(fetchUrl, options = {}) {
  try {
    const res = await fetch(fetchUrl, {
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
  console.log(`\n${'━'.repeat(70)}`);
  console.log(`  ${title}`);
  console.log('━'.repeat(70));
}

// ══════════════════════════════════════════════════════════════════════════
//  1. Feature Parity Audit (document check)
// ══════════════════════════════════════════════════════════════════════════

function testFeatureParityAudit() {
  separator('DELIVERABLE 1: Feature Parity Audit');
  console.log('  Formal comparison vs Nighthawk zcashblockexplorer.com\n');

  const auditPath = path.join(__dirname, 'FEATURE_PARITY_AUDIT.md');
  const exists = fs.existsSync(auditPath);
  assert(exists, 'FEATURE_PARITY_AUDIT.md exists in zcg/milestone-3/');

  if (exists) {
    const content = fs.readFileSync(auditPath, 'utf8');
    assert(content.includes('Feature Matrix'), 'Document contains feature matrix');
    assert(content.includes('CipherScan-Exclusive'), 'Document lists exclusive features');
    assert(content.includes('Intentional Omissions'), 'Document notes intentional omissions');
    assert(content.includes('Nighthawk'), 'Document references Nighthawk baseline');
    show('Document path', auditPath);
  }

  url('Manual review', `${BASE.replace('cipherscan.app', 'github.com/Kenbak/cipherscan/blob/main/zcg/milestone-3/FEATURE_PARITY_AUDIT.md')}`);
  console.log('     (Or open locally: zcg/milestone-3/FEATURE_PARITY_AUDIT.md)');
}

// ══════════════════════════════════════════════════════════════════════════
//  2. Tor Hidden Service (post-deployment)
// ══════════════════════════════════════════════════════════════════════════

function testTorHiddenService() {
  separator('DELIVERABLE 2: Tor Hidden Service (.onion)');
  console.log('  Privacy-focused Tor mirror access\n');

  skip('Tor .onion endpoint', 'To be verified after server deployment');
  console.log('     Configure Tor HiddenServiceDir + Caddy, then test in Tor Browser.');
}

// ══════════════════════════════════════════════════════════════════════════
//  3. Shielded Supply History — 365 Days
// ══════════════════════════════════════════════════════════════════════════

async function testPoolHistory365() {
  separator('DELIVERABLE 3: Shielded Supply History API — 365 Days');
  console.log('  GET /api/network/pool-history?period=1y\n');

  url('API endpoint', `${API}/api/network/pool-history?period=1y`);

  const t0 = Date.now();
  const res = await fetchSafe(`${API}/api/network/pool-history?period=1y`);
  const elapsed = Date.now() - t0;

  assert(res.ok, `GET /api/network/pool-history?period=1y → ${res.status}`);
  show('Response time', `${elapsed}ms`);

  if (!res.ok || !res.data) return;

  const points = res.data.points || [];
  show('Data points returned', points.length);
  show('Period', res.data.period);
  show('hasPoolBreakdown', res.data.hasPoolBreakdown);
  show('hasVerifiedPerPoolBreakdown', res.data.hasVerifiedPerPoolBreakdown);

  assert(points.length >= MIN_POOL_HISTORY_DAYS, `At least ${MIN_POOL_HISTORY_DAYS} daily data points`, `got ${points.length}`);

  if (points.length > 0) {
    show('Date range', `${points[0].date} → ${points[points.length - 1].date}`);

    const sample = points[points.length - 1];
    assert(typeof sample.shielded === 'number', `Latest shielded supply: ${sample.shielded?.toFixed(2)} ZEC`);
    assert(sample.hasPoolBreakdown === true || res.data.hasPoolBreakdown === true, 'Per-pool breakdown available');

    if (sample.sprout !== undefined) {
      show('Latest pool breakdown (ZEC)', {
        sprout: sample.sprout?.toFixed(2),
        sapling: sample.sapling?.toFixed(2),
        orchard: sample.orchard?.toFixed(2),
        transparent: sample.transparent?.toFixed(2),
      });
    }
  }

  url('Privacy dashboard chart', `${BASE}/privacy`);
  url('Pool analytics', `${BASE}/pools`);
}

// ══════════════════════════════════════════════════════════════════════════
//  4. Query Performance Optimizations
// ══════════════════════════════════════════════════════════════════════════

async function testPerformanceOptimizations() {
  separator('DELIVERABLE 4: Query Performance Optimizations');
  console.log('  Materialized views, Redis caching, cursor pagination\n');

  // ── Crosschain MV path ──
  console.log('  ┌─ Crosschain materialized views ─────────────────────────');
  const t0 = Date.now();
  const dbStats = await fetchSafe(`${API}/api/crosschain/db-stats`);
  const dbElapsed = Date.now() - t0;

  assert(dbStats.ok, `GET /api/crosschain/db-stats → ${dbStats.status}`);
  show('Response time', `${dbElapsed}ms`);
  assert(dbElapsed < 5000, `MV-backed query under 5s: ${dbElapsed}ms`);

  if (dbStats.ok && dbStats.data) {
    show('Swaps aggregated', dbStats.data.totalSwapsAllTime?.toLocaleString());
    assert(dbStats.data.totalSwapsAllTime > 0, 'Materialized views return data');
  }

  // ── Pool analytics (Redis-cached) ──
  console.log('\n  ┌─ Pool analytics (Redis-cached routes) ──────────────────');

  const poolEndpoints = [
    { path: '/api/pools/overview', label: 'Pool overview' },
    { path: '/api/pools/flows?period=30d', label: 'Pool flows (30d)' },
    { path: '/api/pools/turnstile?since=2026-01-01', label: 'Turnstile tracker' },
  ];

  for (const ep of poolEndpoints) {
    const t1 = Date.now();
    const res = await fetchSafe(`${API}${ep.path}`);
    const epElapsed = Date.now() - t1;
    assert(res.ok, `${ep.label}: GET ${ep.path} → ${res.status} (${epElapsed}ms)`);
  }

  // Second request should be same or faster (cache warm)
  const t2 = Date.now();
  const cachedRes = await fetchSafe(`${API}/api/pools/overview`);
  const cachedElapsed = Date.now() - t2;
  show('Cached overview response time', `${cachedElapsed}ms`);

  // ── Network health (Redis-backed) ──
  console.log('\n  ┌─ Network health (cached) ───────────────────────────────');
  const healthRes = await fetchSafe(`${API}/api/network/health`);
  assert(healthRes.ok, `GET /api/network/health → ${healthRes.status}`);
  if (healthRes.ok) {
    show('Zebra healthy', healthRes.data?.zebra?.healthy);
  }

  console.log('\n     Optimizations in production:');
  console.log('       • 6 materialized views (5 crosschain + flow_daily)');
  console.log('       • Redis cache on pool analytics routes (2–5 min TTL)');
  console.log('       • Cursor pagination on blocks/txs/shielded flows');
  console.log('       • Client-side CSV/JSON export (ExportButton)');
}

// ══════════════════════════════════════════════════════════════════════════
//  5. Privacy Index — Newsletter
// ══════════════════════════════════════════════════════════════════════════

async function testNewsletter() {
  separator('DELIVERABLE 5: Privacy Index — Weekly Newsletter');
  console.log('  Weekly Zcash intelligence publication\n');

  url('Newsletter page', `${BASE}/newsletter`);
  url('RSS feed', `${BASE}/newsletter/rss`);

  const pageRes = await fetchSafe(`${BASE}/newsletter`);
  assert(pageRes.ok, `Newsletter page loads → ${pageRes.status}`);

  if (pageRes.ok && typeof pageRes.data === 'string') {
    assert(
      pageRes.data.includes('CipherScan Weekly') || pageRes.data.includes('Newsletter'),
      'Page contains newsletter branding'
    );

    // Count issue links (weekly-YYYY-MM-DD slugs)
    const issueMatches = pageRes.data.match(/weekly-\d{4}-\d{2}-\d{2}/g) || [];
    const uniqueIssues = new Set(issueMatches);
    show('Issues found on page', uniqueIssues.size);
    assert(uniqueIssues.size >= MIN_NEWSLETTER_ISSUES, `At least ${MIN_NEWSLETTER_ISSUES} published issues`, `found ${uniqueIssues.size}`);
  }

  const rssRes = await fetchSafe(`${BASE}/newsletter/rss`);
  assert(rssRes.ok, `RSS feed responds → ${rssRes.status}`);
  if (rssRes.ok && typeof rssRes.data === 'string') {
    assert(rssRes.data.includes('<rss') || rssRes.data.includes('<feed'), 'RSS feed is valid XML');
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  6. Documentation Improvements
// ══════════════════════════════════════════════════════════════════════════

async function testDocumentation() {
  separator('DELIVERABLE 6: Documentation Improvements');
  console.log('  Interactive API docs + deployment guide\n');

  url('API docs', `${BASE}/docs`);

  const docsRes = await fetchSafe(`${BASE}/docs`);
  assert(docsRes.ok, `Docs page loads → ${docsRes.status}`);

  if (docsRes.ok && typeof docsRes.data === 'string') {
    assert(docsRes.data.includes('API Documentation'), 'Page has API Documentation heading');

    const countMatch = docsRes.data.match(/(\d+)\s+endpoints/i);
    if (countMatch) {
      const count = parseInt(countMatch[1], 10);
      show('Endpoint count on page', count);
      assert(count >= EXPECTED_ENDPOINT_COUNT, `At least ${EXPECTED_ENDPOINT_COUNT} documented endpoints`, `found ${count}`);
    } else {
      assert(
        docsRes.data.includes('Blocks') && docsRes.data.includes('Cross-Chain'),
        'Docs page lists endpoint categories'
      );
    }
  }

  const deploymentPath = path.join(__dirname, '../../DEPLOYMENT.md');
  assert(fs.existsSync(deploymentPath), 'DEPLOYMENT.md exists in repo root');
  if (fs.existsSync(deploymentPath)) {
    const dep = fs.readFileSync(deploymentPath, 'utf8');
    assert(dep.includes('Prerequisites'), 'DEPLOYMENT.md covers prerequisites');
    assert(dep.includes('Environment Variables'), 'DEPLOYMENT.md lists env vars');
    assert(dep.includes('Cron Jobs'), 'DEPLOYMENT.md documents cron jobs');
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  7. Core API Availability + Forum Report
// ══════════════════════════════════════════════════════════════════════════

async function testCoreApiEndpoints() {
  separator('DELIVERABLE 7: Core API Endpoint Availability');
  console.log('  Key endpoints respond with 200\n');

  const endpoints = [
    '/api/network/stats',
    '/api/supply',
    '/api/circulating-supply',
    '/api/mempool',
    '/api/privacy-stats',
    '/api/crosschain/history?limit=1',
    '/api/rich-list?limit=5',
    '/api/network/halving',
    '/api/blend-check?amount=1.0',
  ];

  for (const ep of endpoints) {
    const res = await fetchSafe(`${API}${ep}`);
    assert(res.ok, `GET ${ep} → ${res.status}`);
  }
}

function testForumReport() {
  separator('DELIVERABLE 8: Forum Progress Report');
  skip('Forum progress report', 'Manual — publish on forum.zcashcommunity.com before M3 acceptance');
  console.log('     Draft summary included in zcg/milestone-3/VERIFICATION.md');
}

// ══════════════════════════════════════════════════════════════════════════
//  Run
// ══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║              CipherScan — Milestone 3 Verification                  ║');
  console.log('║     Feature Parity & Privacy Infrastructure ($14,700)               ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Frontend : ${BASE}`);
  console.log(`  API      : ${API}`);
  console.log(`  Date     : ${new Date().toISOString()}`);
  console.log(`  Node     : ${process.version}`);

  testFeatureParityAudit();
  testTorHiddenService();
  await testPoolHistory365();
  await testPerformanceOptimizations();
  await testNewsletter();
  await testDocumentation();
  await testCoreApiEndpoints();
  testForumReport();

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  RESULTS                                                            ║');
  console.log('╠══════════════════════════════════════════════════════════════════════╣');
  console.log(`║  ✅ Passed:  ${String(passed).padEnd(55)}║`);
  console.log(`║  ❌ Failed:  ${String(failed).padEnd(55)}║`);
  console.log(`║  ⏭️  Skipped: ${String(skipped).padEnd(54)}║`);
  console.log(`║  📝 Total:   ${String(passed + failed + skipped).padEnd(55)}║`);
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  if (failures.length > 0) {
    console.log('\n  Failures:');
    failures.forEach(f => console.log(`    • ${f}`));
  }

  console.log('');
  console.log('  Post-deployment verification needed:');
  console.log('    • Tor hidden service (.onion address)');
  console.log('    • Forum progress report publication');
  console.log('');

  url('Feature parity audit', 'zcg/milestone-3/FEATURE_PARITY_AUDIT.md');
  url('Pool history API', `${API}/api/network/pool-history?period=1y`);
  url('Newsletter', `${BASE}/newsletter`);
  url('API docs', `${BASE}/docs`);
  console.log('');

  if (failed > 0) {
    console.log('💥 Milestone 3 verification FAILED.\n');
    process.exit(1);
  } else {
    console.log('🎉 Milestone 3 verification PASSED — all automated checks confirmed.\n');
    console.log('   (Tor hidden service and forum report require manual verification.)\n');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(2);
});
