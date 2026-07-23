#!/usr/bin/env node
/**
 * Milestone 3.5 Verification Script
 *
 * Tests all verifiable Milestone 3.5 deliverables against a live CipherScan deployment:
 *
 *   1. Fork Watch — Reorg monitoring, orphan block tracking
 *   2. Turnstile Tracker — Deshielded ZEC spend status
 *   3. Pool flow analytics — Per-pool volume, hourly granularity
 *   4. Reorg-proof indexer — Automatic detection & rollback
 *   5. Ironwood pool support — Schema, indexer, frontend
 *   6. Dedicated database server — Performance
 *
 * Usage:
 *   node zcg/milestone-3.5/verify.js [base_url]
 *
 * Examples:
 *   node zcg/milestone-3.5/verify.js https://cipherscan.app
 *   node zcg/milestone-3.5/verify.js https://testnet.cipherscan.app
 */

const BASE = (process.argv[2] || 'https://cipherscan.app').replace(/\/$/, '');

function deriveApiBase(frontendUrl) {
  if (frontendUrl.includes('localhost')) return frontendUrl.replace(':3000', ':3001');
  if (frontendUrl.includes('testnet')) return 'https://api.testnet.cipherscan.app';
  if (frontendUrl.includes('crosslink')) return 'https://api.crosslink.cipherscan.app';
  return 'https://api.mainnet.cipherscan.app';
}

const API = deriveApiBase(BASE);
const IS_TESTNET = BASE.includes('testnet');

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

function separator(title) {
  console.log(`\n${'━'.repeat(70)}`);
  console.log(`  ${title}`);
  console.log('━'.repeat(70));
}

async function fetchSafe(fetchUrl, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(fetchUrl, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, ok: res.ok, data };
  } catch (err) {
    return { status: 0, ok: false, data: null, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  1. Fork Watch — Reorg Monitoring
// ══════════════════════════════════════════════════════════════════════════

async function testForkWatch() {
  separator('DELIVERABLE 1: Fork Watch — Real-Time Reorg Monitoring');
  console.log('  GET /api/uncles/forks\n');

  url('API endpoint', `${API}/api/uncles/forks`);
  url('Frontend', `${BASE}/reorgs`);
  url('Fork Monitor', `${BASE}/fork-monitor`);
  console.log();

  const t0 = Date.now();
  const res = await fetchSafe(`${API}/api/uncles/forks`);
  const elapsed = Date.now() - t0;

  assert(res.ok, `GET /api/uncles/forks → ${res.status}`);
  show('Response time', `${elapsed}ms`);

  if (!res.ok || !res.data) return;

  const forks = res.data.forks || [];
  show('Total forks recorded', forks.length);
  assert(forks.length > 0, 'At least one historical fork detected and archived');

  if (forks.length > 0) {
    const latest = forks[0];
    show('Latest reorg', {
      forkHeight: latest.forkHeight,
      depth: latest.depth,
      orphanedBlocks: latest.orphanedCount,
      detectedAt: latest.detectedAt,
      description: latest.description,
    });

    if (latest.comparisons && latest.comparisons[0]) {
      const comp = latest.comparisons[0];
      show('Orphaned block', {
        hash: comp.orphaned?.hash,
        miner: comp.orphaned?.minerPool || 'Unknown',
        txCount: comp.orphaned?.transactionCount,
      });
      show('Canonical replacement', {
        hash: comp.canonical?.hash,
        miner: comp.canonical?.minerPool || 'Unknown',
        txCount: comp.canonical?.transactionCount,
      });
    }

    assert(latest.depth >= 1, `Fork depth field present: ${latest.depth}`);
    assert(latest.forkHeight > 0, `Fork height: ${latest.forkHeight}`);
  }

  // Check pages load
  const reorgsStatus = await fetchSafe(`${BASE}/reorgs`);
  assert(reorgsStatus.ok, `Fork Watch page (/reorgs) → ${reorgsStatus.status}`);

  const fmStatus = await fetchSafe(`${BASE}/fork-monitor`);
  assert(fmStatus.ok, `Fork Monitor page → ${fmStatus.status}`);
}

// ══════════════════════════════════════════════════════════════════════════
//  2. Turnstile Tracker
// ══════════════════════════════════════════════════════════════════════════

async function testTurnstileTracker() {
  separator('DELIVERABLE 2: Turnstile Tracker — Deshielded ZEC Spend Status');
  console.log('  GET /api/pools/turnstile\n');

  url('API endpoint', `${API}/api/pools/turnstile`);
  url('Frontend', `${BASE}/turnstile`);
  console.log();

  const t0 = Date.now();
  const res = await fetchSafe(`${API}/api/pools/turnstile`);
  const elapsed = Date.now() - t0;

  assert(res.ok, `GET /api/pools/turnstile → ${res.status}`);
  show('Response time', `${elapsed}ms`);

  if (!res.ok || !res.data) return;

  assert(res.data.success === true, 'API returns success');
  show('Tracking since', res.data.since);
  show('Last updated', res.data.lastUpdated);

  const s = res.data.summary;
  if (s) {
    show('Deshielded ZEC breakdown', {
      totalDeshielded: `${s.totalDeshielded?.toFixed(2)} ZEC`,
      held: `${s.totalHeld?.toFixed(2)} ZEC (${s.heldPercent?.toFixed(2)}%)`,
      reshielded: `${s.totalReshielded?.toFixed(2)} ZEC (${s.reshieldedPercent?.toFixed(2)}%)`,
      exchange: `${s.totalExchange?.toFixed(2)} ZEC (${s.exchangePercent?.toFixed(2)}%)`,
      bridge: `${s.totalBridge?.toFixed(2)} ZEC (${s.bridgePercent?.toFixed(2)}%)`,
      transferred: `${s.totalTransferred?.toFixed(2)} ZEC (${s.transferredPercent?.toFixed(2)}%)`,
      classifiedTxCount: s.txCount?.toLocaleString(),
    });

    assert(s.totalDeshielded > 0, `Total deshielded: ${s.totalDeshielded?.toFixed(2)} ZEC`);
    assert(s.heldPercent != null, 'Held percentage calculated');
    assert(s.reshieldedPercent != null, 'Reshielded percentage calculated');
    assert(s.exchangePercent != null, 'Exchange percentage calculated');
    assert(s.bridgePercent != null, 'Bridge percentage calculated');
    assert(s.transferredPercent != null, 'Transferred percentage calculated');
    assert(s.txCount > 0, `Classified transactions: ${s.txCount?.toLocaleString()}`);
  }

  // With date filter
  const resFiltered = await fetchSafe(`${API}/api/pools/turnstile?since=2026-01-01`);
  assert(resFiltered.ok, 'Turnstile with ?since= date filter responds');

  // Page loads
  const page = await fetchSafe(`${BASE}/turnstile`);
  assert(page.ok, `Turnstile page → ${page.status}`);
}

// ══════════════════════════════════════════════════════════════════════════
//  3. Pool Flow Analytics
// ══════════════════════════════════════════════════════════════════════════

async function testPoolFlowAnalytics() {
  separator('DELIVERABLE 3: Pool Flow Analytics — Hourly Granularity');
  console.log('  GET /api/pools/flows?period=7d&granularity=hourly\n');

  url('API endpoint', `${API}/api/pools/flows?period=7d&granularity=hourly`);
  url('Pool overview', `${API}/api/pools/overview`);
  url('Frontend', `${BASE}/pools`);
  console.log();

  // Hourly flows
  console.log('  ┌─ Hourly flow data ────────────────────────────────────────');
  const t0 = Date.now();
  const hourly = await fetchSafe(`${API}/api/pools/flows?period=7d&granularity=hourly`);
  const elapsed = Date.now() - t0;

  assert(hourly.ok, `GET /api/pools/flows (hourly) → ${hourly.status}`);
  show('Response time', `${elapsed}ms`);

  if (hourly.ok && hourly.data) {
    const points = hourly.data.points || [];
    show('Hourly data points (7d)', points.length);
    assert(points.length > 100, `Hourly returns 100+ points: ${points.length}`);

    if (points.length > 0) {
      show('Sample data point', {
        date: points[0].date,
        shielded: `${points[0].shield?.toFixed(2)} ZEC`,
        deshielded: `${points[0].deshield?.toFixed(2)} ZEC`,
        shieldTx: points[0].shieldTx,
        deshieldTx: points[0].deshieldTx,
        netFlow: `${points[0].net?.toFixed(2)} ZEC`,
      });
    }
  }

  // Pool overview
  console.log('\n  ┌─ Pool overview (current balances) ─────────────────────────');
  const overview = await fetchSafe(`${API}/api/pools/overview`);
  assert(overview.ok, `GET /api/pools/overview → ${overview.status}`);

  if (overview.ok && overview.data && overview.data.current) {
    const c = overview.data.current;
    show('Current pool balances (zatoshis)', {
      sprout: c.sprout?.toLocaleString(),
      sapling: c.sapling?.toLocaleString(),
      orchard: c.orchard?.toLocaleString(),
      ironwood: c.ironwood?.toLocaleString(),
      transparent: c.transparent?.toLocaleString(),
      chainSupply: c.chainSupply?.toLocaleString(),
      updatedAt: c.updatedAt,
    });

    assert(c.orchard > 0, `Orchard pool balance: ${(c.orchard / 1e8).toFixed(2)} ZEC`);
    assert(c.sapling > 0, `Sapling pool balance: ${(c.sapling / 1e8).toFixed(2)} ZEC`);
    assert('ironwood' in c, 'Ironwood field present in pool overview');
  }

  // Daily flows
  console.log('\n  ┌─ Daily flow data (30d) ─────────────────────────────────────');
  const daily = await fetchSafe(`${API}/api/pools/flows?period=30d`);
  assert(daily.ok, `GET /api/pools/flows (daily, 30d) → ${daily.status}`);
  if (daily.ok && daily.data) {
    show('Daily data points', (daily.data.points || []).length);
  }

  // Page loads
  const page = await fetchSafe(`${BASE}/pools`);
  assert(page.ok, `Pools page → ${page.status}`);
}

// ══════════════════════════════════════════════════════════════════════════
//  4. Reorg-Proof Indexer
// ══════════════════════════════════════════════════════════════════════════

async function testReorgProofIndexer() {
  separator('DELIVERABLE 4: Reorg-Proof Indexer — Detection & Rollback');
  console.log('  Automatic reorg detection, rollback, and re-indexing\n');

  url('Source code', 'https://github.com/Kenbak/cipherscan-rust/blob/main/src/indexer/mod.rs');
  console.log('     Function: detect_and_handle_reorg()');
  console.log();

  // Evidence: orphaned blocks exist
  const forks = await fetchSafe(`${API}/api/uncles/forks`);
  const forkCount = forks.data?.forks?.length || 0;
  assert(forkCount > 0, `${forkCount} reorgs automatically handled (orphaned blocks archived)`);

  // Network is healthy and synced
  const stats = await fetchSafe(`${API}/api/network/stats`);
  assert(stats.ok, 'Network stats API responds (indexer healthy)');

  if (stats.ok && stats.data) {
    const height = stats.data.network?.height || stats.data.mining?.height;
    show('Current chain tip', height?.toLocaleString());
    assert(height > 0, `Chain tip at height ${height?.toLocaleString()}`);
  }

  console.log('\n  How it works:');
  console.log('     1. Compare stored block hash at tip with canonical hash from RPC');
  console.log('     2. If mismatch → walk backward (up to 100 blocks) to find fork point');
  console.log('     3. Roll back all blocks/txs/flows in a single DB transaction');
  console.log('     4. Archive orphaned blocks with full metadata');
  console.log('     5. Re-index from common ancestor');

  skip('Manual code review', 'Review src/indexer/mod.rs detect_and_handle_reorg()');
}

// ══════════════════════════════════════════════════════════════════════════
//  5. Ironwood Pool Support
// ══════════════════════════════════════════════════════════════════════════

async function testIronwoodSupport() {
  separator('DELIVERABLE 5: Ironwood Pool Support (NU6.3)');
  console.log(`  Network: ${IS_TESTNET ? 'Testnet (Ironwood LIVE)' : 'Mainnet (pre-activation)'}\n`);

  url('Frontend (migration tracker)', `${BASE}/ironwood`);
  if (IS_TESTNET) {
    url('Migration API', `${API}/api/migration/overview`);
  }
  console.log();

  // Pool overview includes ironwood
  const overview = await fetchSafe(`${API}/api/pools/overview`);
  if (overview.ok && overview.data?.current) {
    assert('ironwood' in overview.data.current, 'Ironwood field in pools/overview');
    show('Ironwood pool balance', `${(overview.data.current.ironwood / 1e8).toFixed(2)} ZEC`);
  }

  // Privacy stats include ironwood
  const privStats = await fetchSafe(`${API}/api/privacy-stats`);
  if (privStats.ok && privStats.data) {
    assert(
      'ironwood' in (privStats.data.shieldedPool || {}),
      'Ironwood in privacy-stats shieldedPool'
    );
    show('Ironwood in privacy stats', `${privStats.data.shieldedPool?.ironwood?.toFixed(2)} ZEC`);
  }

  if (IS_TESTNET) {
    // Ironwood is live on testnet — full verification
    console.log('\n  ┌─ Migration Overview (testnet) ──────────────────────────────');
    const migration = await fetchSafe(`${API}/api/migration/overview`);
    assert(migration.ok, `GET /api/migration/overview → ${migration.status}`);

    if (migration.ok && migration.data) {
      show('Ironwood activation', {
        activated: migration.data.activated,
        activationHeight: migration.data.activationHeight,
        tipHeight: migration.data.tipHeight,
        blocksIndexedSinceActivation: migration.data.tipHeight - migration.data.activationHeight,
      });

      assert(migration.data.activated === true, 'Ironwood shows as activated');

      if (migration.data.poolSizes) {
        show('Pool sizes', {
          orchardZat: migration.data.poolSizes.orchardZat?.toLocaleString(),
          ironwoodZat: migration.data.poolSizes.ironwoodZat?.toLocaleString(),
          ironwoodZEC: `${(migration.data.poolSizes.ironwoodZat / 1e8).toFixed(2)} ZEC`,
        });
        assert(migration.data.poolSizes.ironwoodZat > 0, 'Ironwood pool has non-zero balance');
      }

      if (migration.data.migration) {
        const m = migration.data.migration;
        show('Migration progress', {
          totalMigrated: `${(m.totalMigratedZat / 1e8).toFixed(2)} ZEC`,
          transactionCount: m.txCount?.toLocaleString(),
          migratedPercent: `${m.migratedPercent?.toFixed(2)}%`,
          firstHeight: m.firstHeight,
          lastHeight: m.lastHeight,
        });
        assert(m.txCount > 0, `Migration transactions indexed: ${m.txCount?.toLocaleString()}`);
        assert(m.migratedPercent > 0, `Migration progress: ${m.migratedPercent?.toFixed(2)}%`);
      }
    }

    // Cohorts
    console.log('\n  ┌─ Migration Cohorts ──────────────────────────────────────────');
    const cohorts = await fetchSafe(`${API}/api/migration/cohorts`);
    assert(cohorts.ok, `GET /api/migration/cohorts → ${cohorts.status}`);
    if (cohorts.ok && cohorts.data?.cohorts) {
      show('Cohort count', cohorts.data.cohorts.length);
    }

    // Denominations
    console.log('\n  ┌─ Migration Denominations ───────────────────────────────────');
    const denoms = await fetchSafe(`${API}/api/migration/denominations`);
    assert(denoms.ok, `GET /api/migration/denominations → ${denoms.status}`);
    if (denoms.ok && denoms.data?.denominations) {
      show('Denomination buckets', denoms.data.denominations.length);
    }
  } else {
    // Mainnet pre-activation
    assert(
      overview.data?.current?.ironwood === 0,
      'Ironwood pool ready (pre-activation, balance = 0)'
    );
    console.log('\n     Ironwood activates on mainnet at block 3,428,143 (July 28, 2026)');
    console.log('     Run against testnet for full live verification:');
    console.log('       node zcg/milestone-3.5/verify.js https://testnet.cipherscan.app');
  }

  // Frontend page
  const page = await fetchSafe(`${BASE}/ironwood`);
  assert(page.ok, `Ironwood migration page → ${page.status}`);
}

// ══════════════════════════════════════════════════════════════════════════
//  6. Dedicated Database Server
// ══════════════════════════════════════════════════════════════════════════

async function testDedicatedDatabase() {
  separator('DELIVERABLE 6: Dedicated Database Server — Performance');
  console.log('  PostgreSQL on dedicated host for concurrent indexing + API\n');

  const endpoints = [
    { path: '/api/privacy-stats', label: 'Privacy stats (aggregate millions of rows)' },
    { path: '/api/blocks?limit=50', label: 'Block list (cursor pagination)' },
    { path: '/api/pools/flows?period=30d', label: 'Pool flows (30d aggregation)' },
    { path: '/api/pools/turnstile', label: 'Turnstile (900k+ classified outputs)' },
  ];

  for (const ep of endpoints) {
    const t0 = Date.now();
    const res = await fetchSafe(`${API}${ep.path}`);
    const elapsed = Date.now() - t0;
    const ok = res.ok || (res.data && (res.data.blocks || res.data.success));
    assert(ok, `${ep.label} → ${res.status}`);
    show('Response time', `${elapsed}ms`);
    assert(elapsed < 5000, `Under 5s: ${elapsed}ms`);
  }

  console.log('\n  Infrastructure notes:');
  console.log('     • Connection pool: max=20, idle timeout=30s');
  console.log('     • Concurrent: Rust indexer + Node API + analytics jobs');
  console.log('     • See DEPLOYMENT.md for full config');

  skip('Dedicated host verification', 'Confirm separate DB host in DEPLOYMENT.md');
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log(' CipherScan — Milestone 3.5 Verification');
  console.log(` Frontend: ${BASE}`);
  console.log(` API:      ${API}`);
  console.log(` Network:  ${IS_TESTNET ? 'Testnet (Ironwood live)' : 'Mainnet'}`);
  console.log('═══════════════════════════════════════════════════════════════════════');

  await testForkWatch();
  await testTurnstileTracker();
  await testPoolFlowAnalytics();
  await testReorgProofIndexer();
  await testIronwoodSupport();
  await testDedicatedDatabase();

  console.log(`\n${'═'.repeat(70)}`);
  console.log(` RESULTS: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  if (failures.length > 0) {
    console.log(` Failures:`);
    failures.forEach((f) => console.log(`   • ${f}`));
  }
  console.log('═'.repeat(70));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(2);
});
