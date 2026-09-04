#!/usr/bin/env node

/**
 * Background Scanner for Batch Deshield Patterns
 *
 * This script detects "batch deshield" patterns and stores them in the
 * detected_patterns table for fast API access.
 *
 * Run periodically via cron (e.g., every 10 minutes):
 *   Cron: 0,10,20,30,40,50 * * * * cd /path/to/server/api && node scripts/scan-batch-patterns.js
 *
 * Or run manually:
 *   node scripts/scan-batch-patterns.js
 *
 * Options:
 *   --period=30    Time window in days (default: 30)
 *   --min-batch=3  Minimum batch count (default: 3)
 *   --min-amount=10  Minimum ZEC per tx (default: 10)
 *   --dry-run      Don't save to database, just print results
 */

const crypto = require('crypto');
const { loadEnv } = require('../lib/job-utils');
const { getPool, getReadPool } = require('../lib/db-pool');

loadEnv(__dirname);

const { detectBatchDeshields } = require('../api/privacy-linkage');

const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.replace('--', '').split('=');
  acc[key] = value === undefined ? true : value;
  return acc;
}, {});

const CONFIG = {
  period: parseInt(args.period) || 30,
  minBatchCount: parseInt(args['min-batch']) || 3,
  minAmountZec: parseFloat(args['min-amount']) || 10,
  dryRun: args['dry-run'] === true,
};

const pool = getPool({ max: 2, idleTimeoutMillis: 10000 });
// detectBatchDeshields() is read-only end to end (it either queries the
// precomputed privacy_batch_clusters table or falls back to computing
// clusters live from shielded_flows — both read paths). storePattern() and
// the expired-pattern cleanup below are the only writes, and they run in a
// separate step after detection finishes, so the detection phase is safe to
// offload to the replica.
const readPool = getReadPool({ max: 2, idleTimeoutMillis: 10000 });

/**
 * Generate a unique hash for a set of txids (for deduplication)
 */
function generatePatternHash(txids) {
  const sorted = [...txids].sort().join(',');
  return crypto.createHash('sha256').update(sorted).digest('hex');
}

/**
 * Store a detected pattern in the database
 */
async function storePattern(pattern) {
  const patternHash = generatePatternHash(pattern.txids);

  try {
    await pool.query(`
      INSERT INTO detected_patterns (
        pattern_type,
        pattern_hash,
        score,
        warning_level,
        shield_txids,
        deshield_txids,
        total_amount_zat,
        per_tx_amount_zat,
        batch_count,
        first_tx_time,
        last_tx_time,
        time_span_hours,
        metadata,
        expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW() + INTERVAL '90 days')
      ON CONFLICT (pattern_hash) DO UPDATE SET
        score = EXCLUDED.score,
        warning_level = EXCLUDED.warning_level,
        metadata = EXCLUDED.metadata,
        updated_at = NOW(),
        expires_at = NOW() + INTERVAL '90 days'
    `, [
      pattern.patternType,
      patternHash,
      pattern.score,
      pattern.warningLevel,
      pattern.matchingShield ? [pattern.matchingShield.txid] : [],
      pattern.txids,
      Math.round(pattern.totalAmountZec * 100000000),
      Math.round(pattern.perTxAmountZec * 100000000),
      pattern.batchCount,
      pattern.firstTime,
      pattern.lastTime,
      pattern.timeSpanHours,
      JSON.stringify(pattern),
    ]);

    return true;
  } catch (error) {
    if (error.code === '42P01') {
      // Table doesn't exist - need to run migration
      console.error('❌ Table detected_patterns does not exist. Run the migration first:');
      console.error('   psql -d zcash_explorer -f scripts/create-detected-patterns-table.sql');
      return false;
    }
    console.error(`❌ Failed to store pattern: ${error.message}`);
    return false;
  }
}

/**
 * Main scanner function
 */
async function runScanner() {
  const startTime = Date.now();
  console.log('═'.repeat(60));
  console.log(`🔍 BATCH PATTERN SCANNER`);
  console.log(`   Period: ${CONFIG.period} days`);
  console.log(`   Min batch count: ${CONFIG.minBatchCount}`);
  console.log(`   Min amount: ${CONFIG.minAmountZec} ZEC`);
  console.log(`   Dry run: ${CONFIG.dryRun}`);
  console.log('═'.repeat(60));

  try {
    // Detect batch patterns
    console.log('\n📊 Detecting batch deshield patterns...');
    const patterns = await detectBatchDeshields(readPool, {
      minBatchCount: CONFIG.minBatchCount,
      minAmountZat: Math.round(CONFIG.minAmountZec * 100000000),
      timeWindowDays: CONFIG.period,
      limit: 100,
    });

    console.log(`\n✅ Found ${patterns.length} patterns\n`);

    // Stats
    const stats = {
      total: patterns.length,
      high: patterns.filter(p => p.warningLevel === 'HIGH').length,
      medium: patterns.filter(p => p.warningLevel === 'MEDIUM').length,
      low: patterns.filter(p => p.warningLevel === 'LOW').length,
      totalZec: patterns.reduce((sum, p) => sum + p.totalAmountZec, 0),
      stored: 0,
      failed: 0,
    };

    // Display and store patterns
    for (const pattern of patterns) {
      const icon = pattern.warningLevel === 'HIGH' ? '🔴' : pattern.warningLevel === 'MEDIUM' ? '🟡' : '🟢';
      console.log(`${icon} [${pattern.score}] ${pattern.batchCount}× ${pattern.perTxAmountZec} ZEC = ${pattern.totalAmountZec} ZEC`);
      console.log(`   Txids: ${pattern.txids.slice(0, 3).map(t => t.slice(0, 8)).join(', ')}...`);
      if (pattern.matchingShield) {
        console.log(`   Matches shield: ${pattern.matchingShield.txid.slice(0, 8)}... (${pattern.matchingShield.amountZec} ZEC)`);
      }
      console.log(`   Explanation: ${pattern.explanation}`);
      console.log('');

      // Store in database (unless dry run)
      if (!CONFIG.dryRun) {
        const stored = await storePattern(pattern);
        if (stored) {
          stats.stored++;
        } else {
          stats.failed++;
        }
      }
    }

    // Clean up expired patterns
    if (!CONFIG.dryRun) {
      try {
        const cleanupResult = await pool.query(`SELECT cleanup_expired_patterns() as deleted`);
        const deleted = cleanupResult.rows[0]?.deleted || 0;
        if (deleted > 0) {
          console.log(`🧹 Cleaned up ${deleted} expired patterns`);
        }
      } catch (e) {
        // Function might not exist yet
      }
    }

    // Summary
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('═'.repeat(60));
    console.log('📈 SUMMARY');
    console.log(`   Total patterns: ${stats.total}`);
    console.log(`   🔴 HIGH: ${stats.high}`);
    console.log(`   🟡 MEDIUM: ${stats.medium}`);
    console.log(`   🟢 LOW: ${stats.low}`);
    console.log(`   Total ZEC flagged: ${stats.totalZec.toLocaleString()}`);
    if (!CONFIG.dryRun) {
      console.log(`   Stored: ${stats.stored}, Failed: ${stats.failed}`);
    }
    console.log(`   Time: ${elapsed}s`);
    console.log('═'.repeat(60));

  } catch (error) {
    console.error('❌ Scanner error:', error);
    process.exit(1);
  } finally {
    await pool.end();
    if (readPool !== pool) await readPool.end();
  }
}

// Run the scanner
runScanner().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
