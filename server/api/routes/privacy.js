/**
 * Privacy Routes
 *
 * Handles privacy analysis and risk detection endpoints:
 * - GET /api/privacy/risks - Linkable transaction pairs (1:1)
 * - GET /api/privacy/batch-risks - Batch deshield patterns (1:N)
 * - GET /api/privacy/shield/:txid/batch - Check if a shield has batch withdrawals
 * - GET /api/privacy/common-amounts - Common shielding amounts
 */

const express = require('express');
const router = express.Router();

// Dependencies injected via app.locals
let pool;
let calculateLinkabilityScore;
let formatTimeDelta;
let getTransparentAddresses;
let detectBatchDeshields;
let detectBatchForShield;

// Middleware to inject dependencies
router.use((req, res, next) => {
  pool = req.app.locals.pool;
  calculateLinkabilityScore = req.app.locals.calculateLinkabilityScore;
  formatTimeDelta = req.app.locals.formatTimeDelta;
  getTransparentAddresses = req.app.locals.getTransparentAddresses;
  detectBatchDeshields = req.app.locals.detectBatchDeshields;
  detectBatchForShield = req.app.locals.detectBatchForShield;
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
 * GET /api/privacy/batch-risks
 *
 * Detect batch deshield patterns with cursor-based pagination.
 *
 * Query params:
 *   - period: '7d', '30d', '90d' (default 30d)
 *   - riskLevel: 'ALL', 'HIGH', 'MEDIUM' (default ALL)
 *   - sort: 'score', 'recent' (default score)
 *   - limit: Max results per page (default 20, max 50)
 *   - afterScore: Cursor - score of last item seen
 *   - afterAmount: Cursor - amount of last item (for tie-breaking)
 *   - minBatchCount: Minimum identical transactions (default 3)
 *   - minAmount: Minimum ZEC per transaction (default 10)
 */
router.get('/api/privacy/batch-risks', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 50);
    const minBatchCount = Math.max(parseInt(req.query.minBatchCount) || 3, 2);
    const minAmountZec = Math.max(parseFloat(req.query.minAmount) || 10, 1);
    const minAmountZat = Math.round(minAmountZec * 100000000);

    // Parse filters
    const riskLevel = ['ALL', 'HIGH', 'MEDIUM'].includes(req.query.riskLevel)
      ? req.query.riskLevel
      : 'ALL';
    const sortBy = ['score', 'recent'].includes(req.query.sort)
      ? req.query.sort
      : 'score';

    // Parse cursor (for pagination)
    const afterScore = req.query.afterScore ? parseFloat(req.query.afterScore) : null;
    const afterAmount = req.query.afterAmount ? parseFloat(req.query.afterAmount) : null;

    // Parse period
    const periodMap = {
      '7d': 7,
      '30d': 30,
      '90d': 90,
    };
    const timeWindowDays = periodMap[req.query.period] || 30;

    console.log(`🔗 [BATCH RISKS] period=${timeWindowDays}d, risk=${riskLevel}, sort=${sortBy}, limit=${limit}, cursor=${afterScore || 'none'}`);

    // Fetch ALL patterns (no limit in DB query - we paginate after scoring)
    let patterns = await detectBatchDeshields(pool, {
      minBatchCount,
      minAmountZat,
      timeWindowDays,
      limit: 500, // High limit, we'll filter/paginate below
    });

    // Calculate stats BEFORE filtering (for display)
    const totalPatterns = patterns.length;
    const totalHigh = patterns.filter(p => p.warningLevel === 'HIGH').length;
    const totalMedium = patterns.filter(p => p.warningLevel === 'MEDIUM').length;
    const totalZecFlagged = patterns.reduce((sum, p) => sum + p.totalAmountZec, 0);

    // Apply risk level filter
    if (riskLevel === 'HIGH') {
      patterns = patterns.filter(p => p.warningLevel === 'HIGH');
    } else if (riskLevel === 'MEDIUM') {
      patterns = patterns.filter(p => p.warningLevel === 'MEDIUM' || p.warningLevel === 'HIGH');
    }

    // Sort
    if (sortBy === 'score') {
      patterns.sort((a, b) => b.score - a.score || b.perTxAmountZec - a.perTxAmountZec);
    } else {
      patterns.sort((a, b) => b.lastTime - a.lastTime);
    }

    const filteredTotal = patterns.length;

    // Apply cursor-based pagination
    if (afterScore !== null && afterAmount !== null && sortBy === 'score') {
      const cursorIndex = patterns.findIndex(
        p => p.score < afterScore || (p.score === afterScore && p.perTxAmountZec <= afterAmount)
      );
      if (cursorIndex > 0) {
        patterns = patterns.slice(cursorIndex);
      } else if (cursorIndex === -1) {
        patterns = []; // Cursor is past all data
      }
    } else if (afterScore !== null && sortBy === 'recent') {
      // For recent sort, afterScore is actually afterTime
      const afterTime = afterScore;
      const cursorIndex = patterns.findIndex(p => p.lastTime < afterTime);
      if (cursorIndex > 0) {
        patterns = patterns.slice(cursorIndex);
      } else if (cursorIndex === -1) {
        patterns = [];
      }
    }

    // Apply limit
    const hasMore = patterns.length > limit;
    const paginatedPatterns = patterns.slice(0, limit);

    // Generate next cursor
    let nextCursor = null;
    if (hasMore && paginatedPatterns.length > 0) {
      const lastItem = paginatedPatterns[paginatedPatterns.length - 1];
      nextCursor = sortBy === 'score'
        ? { score: lastItem.score, amount: lastItem.perTxAmountZec }
        : { time: lastItem.lastTime };
    }

    console.log(`✅ [BATCH RISKS] Returning ${paginatedPatterns.length}/${filteredTotal} (hasMore: ${hasMore})`);

    res.json({
      success: true,
      patterns: paginatedPatterns,
      pagination: {
        total: filteredTotal,
        returned: paginatedPatterns.length,
        hasMore,
        nextCursor,
      },
      stats: {
        total: totalPatterns,
        highRisk: totalHigh,
        mediumRisk: totalMedium,
        totalZecFlagged,
        period: `${timeWindowDays}d`,
        filteredTotal,
      },
      algorithm: {
        version: '2.0',
        description: 'Cursor-based pagination with server-side filtering',
        factors: [
          'Batch count (more identical = more suspicious)',
          'Round number detection (psychological fingerprint)',
          'Matching shield (sum matches original amount)',
          'Time clustering (all withdrawals close together)',
          'Address reuse analysis',
        ],
      },
    });
  } catch (error) {
    console.error('❌ [BATCH RISKS] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to detect batch patterns',
    });
  }
});

/**
 * GET /api/privacy/shield/:txid/batch
 *
 * Check if a specific shield transaction has been followed by batch withdrawals.
 * Useful for analyzing a known "whale" shield.
 *
 * Example: Check if 66e29c07... was split into 12×500 ZEC
 */
router.get('/api/privacy/shield/:txid/batch', async (req, res) => {
  try {
    const { txid } = req.params;

    if (!txid || !/^[a-fA-F0-9]{64}$/.test(txid)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid transaction ID format',
      });
    }

    console.log(`🔍 [BATCH CHECK] Analyzing shield ${txid.slice(0, 8)}... for batch withdrawals`);

    const result = await detectBatchForShield(pool, txid);

    if (result.error) {
      return res.status(404).json({
        success: false,
        error: result.error,
      });
    }

    console.log(`✅ [BATCH CHECK] Found ${result.potentialBatchWithdrawals?.length || 0} potential batch patterns`);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('❌ [BATCH CHECK] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to analyze shield for batch patterns',
    });
  }
});

/**
 * GET /api/privacy/patterns
 *
 * Get stored patterns from the detected_patterns table.
 * These are pre-computed by the background scanner for fast access.
 *
 * Query params:
 *   - type: Pattern type filter (BATCH_DESHIELD, etc.) (optional)
 *   - riskLevel: HIGH, MEDIUM, LOW, or ALL (default ALL)
 *   - limit: Max results (default 20, max 100)
 *   - offset: Pagination offset (default 0)
 */
router.get('/api/privacy/patterns', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const patternType = req.query.type?.toUpperCase();
    const riskLevel = (req.query.riskLevel || 'ALL').toUpperCase();

    // Build query
    let whereClause = 'WHERE expires_at > NOW()';
    const params = [];
    let paramIndex = 1;

    if (patternType) {
      whereClause += ` AND pattern_type = $${paramIndex++}`;
      params.push(patternType);
    }

    if (riskLevel !== 'ALL') {
      whereClause += ` AND warning_level = $${paramIndex++}`;
      params.push(riskLevel);
    }

    // Count total
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM detected_patterns ${whereClause}`,
      params
    );
    const totalCount = parseInt(countResult.rows[0]?.total) || 0;

    // Fetch patterns
    params.push(limit, offset);
    const result = await pool.query(`
      SELECT
        id,
        pattern_type,
        score,
        warning_level,
        shield_txids,
        deshield_txids,
        total_amount_zat / 100000000.0 as total_amount_zec,
        per_tx_amount_zat / 100000000.0 as per_tx_amount_zec,
        batch_count,
        first_tx_time,
        last_tx_time,
        time_span_hours,
        metadata,
        detected_at
      FROM detected_patterns
      ${whereClause}
      ORDER BY score DESC, detected_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `, params);

    const patterns = result.rows.map(row => ({
      id: row.id,
      patternType: row.pattern_type,
      score: row.score,
      warningLevel: row.warning_level,
      shieldTxids: row.shield_txids || [],
      deshieldTxids: row.deshield_txids || [],
      totalAmountZec: parseFloat(row.total_amount_zec),
      perTxAmountZec: parseFloat(row.per_tx_amount_zec),
      batchCount: row.batch_count,
      firstTime: row.first_tx_time,
      lastTime: row.last_tx_time,
      timeSpanHours: parseFloat(row.time_span_hours),
      metadata: row.metadata,
      detectedAt: row.detected_at,
    }));

    // Stats
    const statsResult = await pool.query(`
      SELECT
        warning_level,
        COUNT(*) as count,
        SUM(total_amount_zat) / 100000000.0 as total_zec
      FROM detected_patterns
      WHERE expires_at > NOW()
      GROUP BY warning_level
    `);

    const stats = {
      total: totalCount,
      high: 0,
      medium: 0,
      low: 0,
      totalZecFlagged: 0,
    };

    for (const row of statsResult.rows) {
      const level = row.warning_level.toLowerCase();
      stats[level] = parseInt(row.count);
      stats.totalZecFlagged += parseFloat(row.total_zec) || 0;
    }

    console.log(`✅ [PATTERNS] Returning ${patterns.length} stored patterns`);

    res.json({
      success: true,
      patterns,
      stats,
      pagination: {
        total: totalCount,
        limit,
        offset,
        returned: patterns.length,
        hasMore: offset + limit < totalCount,
      },
      note: 'These patterns are pre-computed by a background scanner running every 10 minutes.',
    });
  } catch (error) {
    // Check if table doesn't exist
    if (error.code === '42P01') {
      return res.json({
        success: true,
        patterns: [],
        stats: { total: 0, high: 0, medium: 0, low: 0, totalZecFlagged: 0 },
        note: 'Pattern detection table not yet initialized. Run the migration.',
      });
    }

    console.error('❌ [PATTERNS] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch patterns',
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
