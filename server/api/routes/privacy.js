/**
 * Privacy Routes
 *
 * Handles privacy analysis and risk detection endpoints:
 * - GET /api/privacy/risks - Linkable transaction pairs
 * - GET /api/privacy/common-amounts - Common shielding amounts
 */

const express = require('express');
const router = express.Router();

// Dependencies injected via app.locals
let pool;
let calculateLinkabilityScore;
let formatTimeDelta;
let getTransparentAddresses;

// Middleware to inject dependencies
router.use((req, res, next) => {
  pool = req.app.locals.pool;
  calculateLinkabilityScore = req.app.locals.calculateLinkabilityScore;
  formatTimeDelta = req.app.locals.formatTimeDelta;
  getTransparentAddresses = req.app.locals.getTransparentAddresses;
  next();
});

/**
 * GET /api/privacy/risks
 *
 * Get recent linkable transaction pairs for the Privacy Risks page.
 * Returns detected round-trip transactions with scores.
 *
 * Query params:
 *   - limit: Max results (default 20, max 100)
 *   - minScore: Minimum linkability score (default 40)
 *   - period: Time period - 24h, 7d, 30d, 90d (default 7d)
 *   - riskLevel: Filter by HIGH, MEDIUM, or ALL (default ALL)
 */
router.get('/api/privacy/risks', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const minScore = Math.max(parseInt(req.query.minScore) || 40, 0);
    const riskLevel = (req.query.riskLevel || 'ALL').toUpperCase();
    const sortBy = req.query.sort === 'score' ? 'score' : 'recent';

    // Parse period
    const periodMap = {
      '24h': 24 * 3600,
      '7d': 7 * 24 * 3600,
      '30d': 30 * 24 * 3600,
      '90d': 90 * 24 * 3600,
    };
    const periodSeconds = periodMap[req.query.period] || periodMap['7d'];
    const minTime = Math.floor(Date.now() / 1000) - periodSeconds;

    console.log(`🔗 [PRIVACY RISKS] Fetching risks (limit=${limit}, minScore=${minScore}, period=${req.query.period || '7d'})`);

    // Minimum amount to consider (filter out dust - 0.001 ZEC = 100,000 zatoshis)
    const MIN_AMOUNT_ZAT = 100000;

    // Query: Find shield -> deshield pairs with similar amounts
    const pairsResult = await pool.query(`
      WITH recent_shields AS (
        SELECT txid, block_height, block_time, amount_zat, pool, transparent_addresses
        FROM shielded_flows
        WHERE flow_type = 'shield'
          AND block_time > $1
          AND amount_zat >= $2
      ),
      recent_deshields AS (
        SELECT txid, block_height, block_time, amount_zat, pool, transparent_addresses
        FROM shielded_flows
        WHERE flow_type = 'deshield'
          AND block_time > $1
          AND amount_zat >= $2
      )
      SELECT
        s.txid as shield_txid,
        s.block_height as shield_height,
        s.block_time as shield_time,
        s.amount_zat as shield_amount,
        s.pool as shield_pool,
        s.transparent_addresses as shield_addresses,
        d.txid as deshield_txid,
        d.block_height as deshield_height,
        d.block_time as deshield_time,
        d.amount_zat as deshield_amount,
        d.pool as deshield_pool,
        d.transparent_addresses as deshield_addresses,
        (d.block_time - s.block_time) as time_delta_seconds
      FROM recent_shields s
      JOIN recent_deshields d ON
        d.block_time > s.block_time
        AND d.block_time < s.block_time + (90 * 24 * 3600)
        AND ABS(d.amount_zat - s.amount_zat) < 100000
      ORDER BY d.block_time DESC
      LIMIT 5000
    `, [minTime, MIN_AMOUNT_ZAT]);

    // Count occurrences for rarity scoring (based on user's period filter)
    const rarityResult = await pool.query(`
      SELECT amount_zat, COUNT(*) as count
      FROM shielded_flows
      WHERE block_time > $1
      GROUP BY amount_zat
    `, [minTime]);

    const rarityCounts = new Map();
    rarityResult.rows.forEach(r => {
      rarityCounts.set(parseInt(r.amount_zat), parseInt(r.count));
    });

    // Score each pair using the unified scoring function
    const scoredPairs = pairsResult.rows.map(row => {
      const shieldAmount = parseInt(row.shield_amount);
      const deshieldAmount = parseInt(row.deshield_amount);
      const timeDelta = parseInt(row.time_delta_seconds);
      const occurrences = rarityCounts.get(shieldAmount) || 1;

      // Use unified scoring function (single source of truth)
      const { score, warningLevel, breakdown } = calculateLinkabilityScore(
        shieldAmount,
        deshieldAmount,
        timeDelta,
        occurrences
      );

      return {
        shieldTxid: row.shield_txid,
        shieldHeight: parseInt(row.shield_height),
        shieldTime: parseInt(row.shield_time),
        shieldAmount: shieldAmount / 100000000,
        shieldPool: row.shield_pool,
        shieldAddresses: row.shield_addresses || [],
        deshieldTxid: row.deshield_txid,
        deshieldHeight: parseInt(row.deshield_height),
        deshieldTime: parseInt(row.deshield_time),
        deshieldAmount: deshieldAmount / 100000000,
        deshieldPool: row.deshield_pool,
        deshieldAddresses: row.deshield_addresses || [],
        timeDelta: formatTimeDelta(timeDelta),
        timeDeltaSeconds: timeDelta,
        score,
        warningLevel,
        scoreBreakdown: breakdown,
      };
    });

    // Filter by minimum score and risk level BEFORE fetching addresses (for performance)
    let filteredPairs = scoredPairs.filter(p => p.score >= minScore);

    if (riskLevel === 'HIGH') {
      filteredPairs = filteredPairs.filter(p => p.warningLevel === 'HIGH');
    } else if (riskLevel === 'MEDIUM') {
      filteredPairs = filteredPairs.filter(p => p.warningLevel === 'MEDIUM');
    }

    // Sort based on request
    if (sortBy === 'score') {
      filteredPairs.sort((a, b) => b.score - a.score || b.deshieldTime - a.deshieldTime);
    } else {
      filteredPairs.sort((a, b) => b.deshieldTime - a.deshieldTime);
    }

    // Apply pagination
    const totalCount = filteredPairs.length;
    const topPairs = filteredPairs.slice(offset, offset + limit);

    // Fetch addresses for each pair (only for results we'll return)
    const resultsWithAddresses = await Promise.all(
      topPairs.map(async (pair) => {
        // Only fetch if not already populated
        const shieldAddrs = pair.shieldAddresses.length > 0
          ? pair.shieldAddresses
          : await getTransparentAddresses(pool, pair.shieldTxid, 'shield');
        const deshieldAddrs = pair.deshieldAddresses.length > 0
          ? pair.deshieldAddresses
          : await getTransparentAddresses(pool, pair.deshieldTxid, 'deshield');

        return {
          ...pair,
          shieldAddresses: shieldAddrs,
          deshieldAddresses: deshieldAddrs,
        };
      })
    );

    // Calculate stats from all filtered pairs
    const stats = {
      total: totalCount,
      highRisk: filteredPairs.filter(p => p.warningLevel === 'HIGH').length,
      mediumRisk: filteredPairs.filter(p => p.warningLevel === 'MEDIUM').length,
      avgScore: totalCount > 0
        ? Math.round(filteredPairs.reduce((sum, p) => sum + p.score, 0) / totalCount)
        : 0,
      period: req.query.period || '7d',
    };

    console.log(`✅ [PRIVACY RISKS] Found ${stats.total} pairs, returning ${resultsWithAddresses.length} (offset=${offset})`);

    res.json({
      success: true,
      transactions: resultsWithAddresses,
      stats,
      pagination: {
        total: totalCount,
        limit,
        offset,
        returned: resultsWithAddresses.length,
        hasMore: offset + limit < totalCount,
      },
    });
  } catch (error) {
    console.error('❌ [PRIVACY RISKS] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch privacy risks',
    });
  }
});

/**
 * GET /api/privacy/common-amounts
 *
 * Get the most common shielding amounts (for privacy education).
 * Users can "blend in" by using popular amounts.
 *
 * Query params:
 *   - period: 24h, 7d, 30d (default 7d)
 *   - limit: number of amounts to return (default 10, max 50)
 */
router.get('/api/privacy/common-amounts', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);

    // Parse period
    const periodMap = {
      '24h': 24 * 3600,
      '7d': 7 * 24 * 3600,
      '30d': 30 * 24 * 3600,
    };
    const periodSeconds = periodMap[req.query.period] || periodMap['7d'];
    const minTime = Math.floor(Date.now() / 1000) - periodSeconds;

    // Minimum amount to consider (0.01 ZEC = 1,000,000 zatoshis)
    // This filters out dust and 0-value transactions
    const MIN_AMOUNT_ZAT = 1000000;

    // Round amounts to 2 decimal places (in ZEC) for grouping
    // This groups 0.501 and 0.502 together as ~0.50
    const result = await pool.query(`
      SELECT
        ROUND(amount_zat / 100000000.0, 2) as amount_zec,
        COUNT(*) as tx_count,
        COUNT(DISTINCT txid) as unique_txs
      FROM shielded_flows
      WHERE block_time > $1
        AND amount_zat >= $2
      GROUP BY ROUND(amount_zat / 100000000.0, 2)
      ORDER BY tx_count DESC
      LIMIT $3
    `, [minTime, MIN_AMOUNT_ZAT, limit]);

    // Get total transactions in period for percentage calculation
    const totalResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM shielded_flows
      WHERE block_time > $1
        AND amount_zat >= $2
    `, [minTime, MIN_AMOUNT_ZAT]);

    const totalTxs = parseInt(totalResult.rows[0]?.total) || 1;

    const commonAmounts = result.rows.map(row => ({
      amountZec: parseFloat(row.amount_zec),
      txCount: parseInt(row.tx_count),
      percentage: ((parseInt(row.tx_count) / totalTxs) * 100).toFixed(1),
      blendingScore: Math.min(100, Math.round((parseInt(row.tx_count) / totalTxs) * 1000)), // Higher = better for privacy
    }));

    console.log(`✅ [COMMON AMOUNTS] Returning ${commonAmounts.length} amounts for period ${req.query.period || '7d'}`);

    res.json({
      success: true,
      period: req.query.period || '7d',
      totalTransactions: totalTxs,
      amounts: commonAmounts,
      tip: 'Using common amounts helps you blend in with other transactions, making linkability analysis harder.',
    });
  } catch (error) {
    console.error('❌ [COMMON AMOUNTS] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch common amounts',
    });
  }
});

module.exports = router;
