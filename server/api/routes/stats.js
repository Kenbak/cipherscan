/**
 * Stats Routes
 * 
 * Handles statistics endpoints:
 * - GET /api/privacy-stats - Privacy statistics from pre-calculated table
 * - GET /api/stats/shielded-count - Shielded transaction count since date
 * - GET /api/stats/shielded-daily - Daily shielded counts for date range
 */

const express = require('express');
const router = express.Router();
const { getShieldedCountSince, getShieldedCountSimple, getShieldedCountDaily } = require('../stats-queries');

// Dependencies will be injected via middleware
let pool;

// Middleware to inject dependencies
router.use((req, res, next) => {
  pool = req.app.locals.pool;
  next();
});

/**
 * GET /api/privacy-stats
 * Get privacy statistics (from pre-calculated table)
 */
router.get('/api/privacy-stats', async (req, res) => {
  try {
    // Fetch latest stats from privacy_stats table (ultra fast!)
    const statsResult = await pool.query(`
      SELECT
        total_blocks,
        total_transactions,
        shielded_tx,
        transparent_tx,
        coinbase_tx,
        mixed_tx,
        fully_shielded_tx,
        shielded_pool_size,
        sprout_pool_size,
        sapling_pool_size,
        orchard_pool_size,
        transparent_pool_size,
        chain_supply,
        shielded_percentage,
        privacy_score,
        avg_shielded_per_day,
        adoption_trend,
        last_block_scanned,
        updated_at
      FROM privacy_stats
      ORDER BY updated_at DESC
      LIMIT 1
    `);

    if (statsResult.rows.length === 0) {
      return res.status(503).json({
        error: 'Privacy stats not yet calculated',
        message: 'Please run the calculate-privacy-stats script first',
      });
    }

    const stats = statsResult.rows[0];

    // Get daily trends (last 30 days for better charts)
    const trendsResult = await pool.query(`
      SELECT
        date,
        shielded_count,
        transparent_count,
        shielded_percentage,
        pool_size,
        privacy_score
      FROM privacy_trends_daily
      ORDER BY date DESC
      LIMIT 30
    `);

    // Use the most recent daily privacy score instead of the old global one
    const latestDailyScore = trendsResult.rows.length > 0 ? parseInt(trendsResult.rows[0].privacy_score) || 0 : parseInt(stats.privacy_score);

    res.json({
      totals: {
        blocks: parseInt(stats.total_blocks),
        shieldedTx: parseInt(stats.shielded_tx),
        transparentTx: parseInt(stats.transparent_tx),
        coinbaseTx: parseInt(stats.coinbase_tx),
        totalTx: parseInt(stats.total_transactions),
        mixedTx: parseInt(stats.mixed_tx),
        fullyShieldedTx: parseInt(stats.fully_shielded_tx),
      },
      shieldedPool: {
        currentSize: parseInt(stats.shielded_pool_size) / 100000000, // Convert to ZEC
        sprout: parseInt(stats.sprout_pool_size || 0) / 100000000,
        sapling: parseInt(stats.sapling_pool_size || 0) / 100000000,
        orchard: parseInt(stats.orchard_pool_size || 0) / 100000000,
        transparent: parseInt(stats.transparent_pool_size || 0) / 100000000,
        chainSupply: parseInt(stats.chain_supply || 0) / 100000000,
      },
      metrics: {
        shieldedPercentage: parseFloat(stats.shielded_percentage),
        privacyScore: latestDailyScore, // Use latest daily score
        avgShieldedPerDay: parseFloat(stats.avg_shielded_per_day),
        adoptionTrend: stats.adoption_trend,
      },
      trends: {
        daily: trendsResult.rows.map(row => ({
          date: row.date,
          shielded: parseInt(row.shielded_count),
          transparent: parseInt(row.transparent_count),
          shieldedPercentage: parseFloat(row.shielded_percentage),
          poolSize: parseInt(row.pool_size) / 100000000, // Convert to ZEC
          privacyScore: parseInt(row.privacy_score) || 0,
        })),
      },
      lastUpdated: stats.updated_at.toISOString(),
      lastBlockScanned: parseInt(stats.last_block_scanned),
    });
  } catch (error) {
    console.error('Error fetching privacy stats:', error);
    res.status(500).json({ error: 'Failed to fetch privacy stats' });
  }
});

/**
 * GET /api/stats/shielded-count
 * Get the count of shielded transactions since a specific date.
 *
 * Query params:
 * - since: Required. ISO date string (e.g., "2024-01-01")
 * - detailed: Optional. If "true", returns full breakdown (slower)
 */
router.get('/api/stats/shielded-count', async (req, res) => {
  try {
    const { since, detailed } = req.query;

    if (!since) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: since (e.g., ?since=2024-01-01)',
      });
    }

    let result;
    if (detailed === 'true') {
      result = await getShieldedCountSince(pool, since);
    } else {
      result = await getShieldedCountSimple(pool, since);
    }

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('❌ [STATS] Shielded count error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/stats/shielded-daily
 * Get daily shielded transaction counts for a date range.
 *
 * Query params:
 * - since: Required. Start date (ISO format)
 * - until: Optional. End date (defaults to now)
 */
router.get('/api/stats/shielded-daily', async (req, res) => {
  try {
    const { since, until } = req.query;

    if (!since) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: since (e.g., ?since=2024-01-01)',
      });
    }

    const result = await getShieldedCountDaily(pool, since, until);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('❌ [STATS] Shielded daily error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
